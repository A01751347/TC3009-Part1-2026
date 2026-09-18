"""Sesion 2: el modelo cruza la frontera.

Aqui vive TODO lo que el servicio necesita saber del modelo: cargar el
artefacto, verificar que sea compatible, validar la entrada contra el contrato,
y predecir.

Fijate en lo que este archivo NO hace: no imputa, no escala, no codifica, no
deriva columnas y no invierte la transformacion del target. Todo eso viaja
dentro de pipeline.joblib. Si este archivo tuviera que saber algo de eso, la
exportacion estaria mal hecha.

REGRESION Y CLASIFICACION
-------------------------
El contrato declara que tipo de problema resuelve el modelo:

    "task": "regresion"      -> predict() devuelve un numero
    "task": "clasificacion"  -> predict() devuelve una etiqueta, y ademas se
                                reportan las probabilidades de cada clase

Un contrato SIN campo 'task' se asume regresion, para que el modelo de precios
de vivienda siga funcionando sin tocar su metadata.json. La rama de
clasificacion no es un archivo aparte: es el mismo servicio leyendo un contrato
distinto. Ese es el punto del modulo.
"""

import json
import os
import pathlib
import sys
import uuid

import joblib
import pandas as pd
import sklearn
from flask import Blueprint, current_app, jsonify, request

bp = Blueprint("s2_modelo", __name__)

RAIZ = pathlib.Path(__file__).resolve().parent.parent

# ATAJO-P1: el artefacto vive dentro del repositorio, junto al codigo.
#           Alcanza para un modelo de pocos megabytes y hace que desplegar
#           sea copiar una carpeta.
#           Parte 2 -> model registry con versionado y rollback.
#
# La ruta se lee de una variable de entorno y no esta escrita a mano: asi,
# cuando el artefacto se mueva a S3 en la Parte 2, no hay que tocar esta
# logica de carga.
MODEL_DIR = pathlib.Path(os.environ.get("MODEL_PATH", str(RAIZ / "artifacts")))

TAREAS_VALIDAS = ("regresion", "clasificacion")


def cargar_artefacto():
    """Carga el pipeline y su contrato, y verifica que sean compatibles.

    La verificacion de version no es paranoia: joblib no es un formato estable.
    Un artefacto exportado con una version de scikit-learn y cargado con otra
    puede fallar al deserializar o --peor-- cargar y devolver numeros distintos
    sin avisar de nada.
    """
    ruta_contrato = MODEL_DIR / "metadata.json"
    ruta_pipeline = MODEL_DIR / "pipeline.joblib"

    if not ruta_contrato.exists() or not ruta_pipeline.exists():
        raise FileNotFoundError(
            f"no encuentro el artefacto en {MODEL_DIR}.\n"
            "    Corre el notebook de entrenamiento para generarlo."
        )

    contrato = json.loads(ruta_contrato.read_text())

    # El caso de referencia viaja con el contrato.
    #
    # Sin esto, probar el modelo significa llenar trece campos a mano antes de
    # ver un solo numero. Es el ejemplo que el notebook exporto y contra el que
    # corre la prueba de paridad, asi que es el mismo caso del que se puede
    # afirmar que notebook y servicio coinciden.
    ruta_ejemplo = MODEL_DIR / "example.json"
    if ruta_ejemplo.exists():
        try:
            contrato["example"] = json.loads(ruta_ejemplo.read_text())["input"]
        except (ValueError, KeyError):
            # Un example.json corrupto no puede impedir que el modelo cargue:
            # el formulario sigue funcionando con las medianas del contrato.
            print("AVISO: example.json ilegible; se omite el caso de ejemplo", flush=True)

    # El artefacto puede traer su propio modulo de columnas derivadas.
    #
    # joblib NO serializa el codigo de una funcion: guarda una REFERENCIA
    # ('derivadas.derivar'). Si el pipeline lleva un FunctionTransformer, al
    # cargarlo Python tiene que poder importar ese modulo o truena con
    # "No module named 'derivadas'".
    #
    # Por eso el notebook exporta derivadas.py JUNTO al pipeline, y aqui se
    # pone la carpeta del artefacto en el path antes de deserializar. El
    # artefacto sigue siendo autocontenido: es una carpeta, no un archivo.
    if str(MODEL_DIR) not in sys.path:
        sys.path.insert(0, str(MODEL_DIR))

    try:
        pipeline = joblib.load(ruta_pipeline)
    except ModuleNotFoundError as e:
        # El fallo mas caro de diagnosticar del modulo, y el que mas veces pasa.
        #
        # joblib guarda REFERENCIAS a las clases del pipeline, no su codigo. Si
        # el artefacto lleva un XGBClassifier dentro y la maquina que lo sirve
        # no tiene xgboost, joblib truena con "No module named 'xgboost'" --un
        # error que no menciona ni el modelo ni el artefacto por ningun lado--.
        #
        # Y como app.py importa este modulo al arrancar, el proceso entero
        # muere: el sintoma que ve el alumno es un ERR_CONNECTION_REFUSED en el
        # navegador, a tres capas de distancia de la causa.
        #
        # Pasa tipicamente despues de un './setup/run sync': sync trae el
        # codigo nuevo, pero NO instala dependencias.
        raise RuntimeError(
            f"no se pudo cargar {ruta_pipeline.name}: falta el modulo "
            f"'{e.name}'.\n\n"
            "    El artefacto lleva ese paquete dentro; joblib guarda una\n"
            "    referencia a la clase, no su codigo, asi que la maquina que\n"
            "    sirve el modelo necesita tenerlo instalado.\n\n"
            "    Instala las dependencias y vuelve a arrancar:\n\n"
            "        bash setup/bootstrap-ec2.sh\n"
            "        ./setup/run restart\n"
        ) from e

    tarea = contrato.get("task", "regresion")
    if tarea not in TAREAS_VALIDAS:
        raise ValueError(
            f"el contrato declara task='{tarea}', que no conozco. "
            f"Valores validos: {', '.join(TAREAS_VALIDAS)}"
        )

    entrenado_con = contrato["sklearn_version"]
    if entrenado_con != sklearn.__version__:
        print(
            "\n*** AVISO DE COMPATIBILIDAD ***\n"
            f"    El artefacto se entreno con scikit-learn {entrenado_con}\n"
            f"    y este servicio tiene instalada la {sklearn.__version__}.\n"
            "    Las predicciones pueden ser incorrectas sin dar ningun error.\n"
            "    Revisa backend/requirements.txt.\n",
            flush=True,
        )
    else:
        print(
            f"artefacto {contrato['model_version']} cargado "
            f"({tarea}, scikit-learn {entrenado_con})",
            flush=True,
        )

    return pipeline, contrato


try:
    pipeline, contrato = cargar_artefacto()
except Exception as e:
    # app.py importa este modulo al arrancar, asi que un fallo aqui tumba el
    # servicio entero. Se imprime antes de propagar para que el mensaje quede
    # ARRIBA en './setup/run logs api', y no al final de un traceback largo.
    print(f"\n*** EL MODELO NO SE PUDO CARGAR ***\n\n    {e}\n", flush=True)
    raise


TAREA = contrato.get("task", "regresion")
ES_CLASIFICACION = TAREA == "clasificacion"


def clases_del_contrato():
    """Las clases, en el MISMO orden en que el pipeline las devuelve.

    Ese orden importa: predict_proba() entrega una fila de probabilidades sin
    nombres, y lo unico que dice a que clase corresponde cada columna es el
    orden de classes_. Si el contrato las declara en otro orden, las
    probabilidades quedarian cambiadas de lugar y NADA fallaria: el servicio
    respondaria 200 con la confianza de la clase equivocada.

    Por eso se comparan las dos fuentes al arrancar en lugar de confiar en una.
    """
    del_contrato = contrato.get("classes")
    del_pipeline = getattr(pipeline, "classes_", None)

    if del_pipeline is None:
        return del_contrato or []

    # Los tipos de numpy no son serializables a JSON: se normalizan a tipos
    # nativos con .tolist(), que convierte np.bool_ -> bool, np.int64 -> int.
    nativas = del_pipeline.tolist()

    if del_contrato is not None and list(del_contrato) != nativas:
        print(
            "\n*** AVISO: las clases del contrato no coinciden con las del "
            "pipeline ***\n"
            f"    metadata.json : {del_contrato}\n"
            f"    pipeline      : {nativas}\n"
            "    Se usan las del pipeline. Vuelve a exportar el artefacto.\n",
            flush=True,
        )
    return nativas


CLASES = clases_del_contrato() if ES_CLASIFICACION else []

# Etiqueta legible por clase. Es opcional: si el contrato no la trae, se usa
# el valor de la clase tal cual. El servicio nunca inventa nombres.
ETIQUETAS = contrato.get("class_labels", {})


def etiqueta_de(clase):
    return ETIQUETAS.get(str(clase), str(clase))


def estado():
    """Lo que este modulo aporta a /api/health.

    Que el estado del servicio diga QUE modelo esta sirviendo no es un detalle:
    es lo que permite saber, mirando una URL, si un despliegue quedo con el
    artefacto que esperabas. En la Parte 2 es lo que hace posible un rollback.
    """
    return {
        "model_version": contrato["model_version"],
        "task": TAREA,
        "sklearn_version": sklearn.__version__,
        "artifact_hash": contrato["artifact_hash"],
    }


class InputInvalido(Exception):
    """El cliente mando algo que el contrato no acepta."""


# Lo que se acepta como verdadero y como falso en una feature booleana.
#
# El formulario manda "true" (una cadena, porque HTML no tiene booleanos), el
# test manda True, y un cliente en otro lenguaje puede mandar 1. Los tres
# quieren decir lo mismo, y rechazar dos de ellos seria un mal producto.
VERDADEROS = {True, 1, "true", "True", "TRUE", "1", "si", "yes"}
FALSOS = {False, 0, "false", "False", "FALSE", "0", "no"}


def validar(payload):
    """Valida la entrada CONTRA EL CONTRATO, no contra reglas escritas a mano.

    Esto es lo que hace que el servicio siga siendo correcto cuando el modelo
    cambia: si el contrato gana una feature, la validacion la exige sola.

    Devuelve el DataFrame de una fila listo para el pipeline, y la lista de
    advertencias que no invalidan la peticion.
    """
    if not isinstance(payload, dict):
        raise InputInvalido("el cuerpo de la peticion debe ser un objeto JSON")

    fila = {}
    advertencias = []

    for f in contrato["features"]:
        nombre = f["name"]
        if nombre not in payload:
            raise InputInvalido(f"falta la feature '{nombre}'")
        valor = payload[nombre]

        tipo = f["type"]

        if tipo == "num":
            try:
                valor = float(valor)
            except (TypeError, ValueError):
                raise InputInvalido(f"'{nombre}' debe ser un numero, llego {valor!r}")
            # Fuera de rango NO es un error: es un caso legitimo que el modelo
            # no vio al entrenar. Rechazarlo seria un mal producto; predecir sin
            # avisar seria deshonesto. Se predice Y se avisa.
            if valor < f["min"] or valor > f["max"]:
                advertencias.append(
                    f"'{nombre}' = {valor:g} esta fuera del rango visto al "
                    f"entrenar ({f['min']:g} a {f['max']:g}); la prediccion es "
                    "menos confiable"
                )

        elif tipo == "bool":
            # Se normaliza a bool de Python. El pipeline espera un booleano,
            # no la cadena "true": si llegara la cadena, el imputador la
            # trataria como categoria y el modelo veria otra cosa.
            if valor in VERDADEROS:
                valor = True
            elif valor in FALSOS:
                valor = False
            else:
                raise InputInvalido(
                    f"'{nombre}' debe ser verdadero o falso, llego {valor!r}"
                )

        else:  # cat
            if valor not in f["allowed"]:
                raise InputInvalido(
                    f"'{nombre}' no acepta el valor {valor!r}. "
                    f"Valores validos: {', '.join(map(str, f['allowed']))}"
                )

        fila[nombre] = valor

    return pd.DataFrame([fila]), advertencias


@bp.get("/api/model")
def model():
    """El contrato del modelo, tal cual. Alimenta el formulario y la Model Card.

    El frontend no tiene una lista de features escrita a mano: la pide aqui. Si
    el modelo cambia, el formulario cambia solo.
    """
    return jsonify(contrato)


def _predecir_regresion(entrada):
    """Un numero, redondeado a dos decimales."""
    # El pipeline recibe el DataFrame CRUDO. Toda la transformacion --y la
    # inversion del logaritmo del target-- viaja dentro del artefacto.
    return {"prediction": round(float(pipeline.predict(entrada)[0]), 2)}


def _predecir_clasificacion(entrada):
    """Una etiqueta, y la probabilidad de CADA clase.

    Las probabilidades van en una LISTA de objetos y no en un diccionario
    {clase: probabilidad} a proposito. Un diccionario JSON solo admite claves
    de texto, y str(True) en Python es "True" mientras que String(true) en
    JavaScript es "true": el frontend no podria volver a encontrar la clase que
    gano. Una lista conserva el tipo nativo y ademas conserva el orden.

    Un clasificador sin predict_proba --un SVC sin probability=True, por
    ejemplo-- sigue funcionando: devuelve la etiqueta y una lista vacia.
    """
    etiqueta = pipeline.predict(entrada)[0]
    # .item() convierte np.bool_ / np.int64 al tipo nativo de Python. Sin esto
    # el servidor truena con "Object of type bool_ is not JSON serializable".
    etiqueta = etiqueta.item() if hasattr(etiqueta, "item") else etiqueta

    respuesta = {
        "prediction": etiqueta,
        "prediction_label": etiqueta_de(etiqueta),
        "probabilities": [],
        "confidence": None,
    }

    if not hasattr(pipeline, "predict_proba"):
        return respuesta

    fila = pipeline.predict_proba(entrada)[0]
    respuesta["probabilities"] = [
        {
            "class": clase,
            "label": etiqueta_de(clase),
            "probability": round(float(p), 4),
        }
        for clase, p in zip(CLASES, fila)
    ]
    ganadora = next(
        (p for p in respuesta["probabilities"] if p["class"] == etiqueta), None
    )
    if ganadora:
        respuesta["confidence"] = ganadora["probability"]
    return respuesta


@bp.post("/api/predict")
def predict():
    """Una fila entra, una prediccion sale."""
    try:
        entrada, advertencias = validar(request.get_json(silent=True))
    except InputInvalido as e:
        # 400: el cliente mando algo invalido, y se le dice QUE fue.
        return jsonify({"error": str(e)}), 400

    try:
        nucleo = (
            _predecir_clasificacion(entrada)
            if ES_CLASIFICACION
            else _predecir_regresion(entrada)
        )
    except Exception:
        # 500: fallamos nosotros. El detalle va a los registros del servidor, no
        # a la respuesta: al cliente no se le entrega el interior de la casa.
        current_app.logger.exception("fallo la prediccion")
        return jsonify({"error": "no se pudo generar la prediccion"}), 500

    respuesta = {
        "prediction_id": str(uuid.uuid4()),
        "model_version": contrato["model_version"],
        "task": TAREA,
        "warnings": advertencias,
        **nucleo,
    }

    # El historial es de la sesion 4. El import va AQUI dentro y no arriba a
    # proposito: si s4_producto.py no existe todavia --porque no has traido el
    # material de esa sesion-- predecir sigue funcionando igual.
    try:
        import s4_producto

        s4_producto.registrar_prediccion(
            respuesta["prediction_id"],
            entrada.iloc[0].to_dict(),
            respuesta["prediction"],
            contrato["model_version"],
        )
    except ImportError:
        pass  # la sesion 4 no esta; no hay donde registrar
    except Exception:  # noqa: BLE001
        # Que falle el registro no puede costarle la prediccion al usuario.
        current_app.logger.exception("no se pudo registrar la prediccion")

    return jsonify(respuesta)
