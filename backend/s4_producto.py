"""Sesion 4: memoria y palabras.

El historial de predicciones y la explicacion en lenguaje natural.
El contrato que implementa este archivo esta en docs/api-contrato.md.
"""

import json
import os
import pathlib
import sqlite3
from datetime import datetime, timezone

import pandas as pd
from flask import Blueprint, jsonify, request

bp = Blueprint("s4_producto", __name__)

RAIZ = pathlib.Path(__file__).resolve().parent.parent

# ATAJO-P1: SQLite en un archivo local, sin migraciones ni pool de conexiones.
#           Alcanza para un taller y se lee de un vistazo.
#           Parte 2 -> un motor de verdad, migraciones, y el historial deja de
#           vivir en el disco de una instancia que puede desaparecer.
#
# La ruta se lee del entorno --igual que DATA_PATH y MODEL_PATH-- porque las
# pruebas corren contra una base temporal. Sin esto, tests/test_registro.py
# escribiria sus 12 predicciones de prueba en TU historial.
DB_PATH = pathlib.Path(os.environ.get("DB_PATH", str(RAIZ / "predicciones.sqlite")))

DEFAULT_LIMIT = 50
MAX_LIMIT = 500


def conectar():
    """Una conexion nueva por uso.

    Flask puede atender peticiones en hilos distintos y una conexion de SQLite
    no se comparte entre hilos. Abrir y cerrar por peticion es lo barato y lo
    correcto aqui.
    """
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


# ATAJO-P1: la prediccion se guarda como JSON en una columna de texto.
#           Un modelo de regresion predice un numero y uno de clasificacion una
#           etiqueta --que puede ser booleana o una cadena--; una columna REAL
#           no puede con los dos, y convertiria True en 1.0 sin avisar.
#           Guardar el JSON conserva el tipo y hace que el historial sirva para
#           cualquier modelo.
#           Parte 2 -> una columna por tipo, o un motor con tipos de verdad.


ESQUEMA = """
    CREATE TABLE IF NOT EXISTS {tabla} (
        prediction_id TEXT PRIMARY KEY,
        created_at    TEXT NOT NULL,
        model_version TEXT NOT NULL,
        prediction    TEXT NOT NULL,
        input_json    TEXT NOT NULL
    )
"""


def crear_tabla():
    with conectar() as con:
        con.execute(ESQUEMA.format(tabla="predicciones"))


def migrar_si_hace_falta():
    """Convierte la columna 'prediction' de REAL a TEXT si viene de antes.

    CREATE TABLE IF NOT EXISTS no toca una tabla que ya existe, asi que una
    base creada cuando la columna era REAL conserva esa AFINIDAD para siempre.
    El efecto es silencioso y desagradable: al guardar json.dumps(1) --la
    cadena "1"-- SQLite ve un numero bien formado y lo convierte a 1.0. El
    historial devuelve 1.0 donde /api/predict devolvio 1.

    Pasa en cualquier instancia que ya habia corrido el modelo anterior, que
    es justo donde nadie lo va a buscar.
    """
    with conectar() as con:
        columnas = con.execute("PRAGMA table_info(predicciones)").fetchall()
        tipo = next(
            (c["type"].upper() for c in columnas if c["name"] == "prediction"), None
        )
        if tipo is None or tipo == "TEXT":
            return  # tabla nueva, o ya migrada

        con.execute(ESQUEMA.format(tabla="predicciones_nueva"))
        # CAST a TEXT conserva lo que habia: un precio 140637.5 se relee como
        # 140637.5, porque _leer_prediccion acepta las dos formas.
        con.execute(
            """
            INSERT OR REPLACE INTO predicciones_nueva
            SELECT prediction_id, created_at, model_version,
                   CAST(prediction AS TEXT), input_json
            FROM predicciones
            """
        )
        con.execute("DROP TABLE predicciones")
        con.execute("ALTER TABLE predicciones_nueva RENAME TO predicciones")
        print(
            f"historial migrado: la columna 'prediction' era {tipo}, ahora es TEXT",
            flush=True,
        )


crear_tabla()
migrar_si_hace_falta()


def registrar_prediccion(prediction_id, entrada, prediccion, model_version):
    """Guarda una prediccion. La llama s2_modelo despues de predecir.

    created_at lo pone el servidor, en UTC. Nunca el cliente: la hora de quien
    pide no es un dato confiable, y el historial tiene que poder ordenarse.

    La entrada se guarda COMPLETA. Es lo que permite despues comparar lo que el
    modelo esta viendo en produccion contra lo que vio al entrenar.
    """
    with conectar() as con:
        con.execute(
            "INSERT INTO predicciones VALUES (?, ?, ?, ?, ?)",
            (
                prediction_id,
                datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                model_version,
                json.dumps(prediccion),
                json.dumps(entrada, default=str),
            ),
        )


def _leer_prediccion(valor):
    """Devuelve la prediccion con el tipo que tenia al guardarse.

    Las filas escritas antes de que esta columna fuera JSON traen un numero
    crudo en lugar de texto. Se aceptan las dos formas en lugar de pedir que
    borres tu historial.
    """
    if isinstance(valor, (int, float)):
        return valor
    try:
        return json.loads(valor)
    except (TypeError, ValueError):
        return valor


def estado():
    """Lo que este modulo aporta a /api/health."""
    with conectar() as con:
        n = con.execute("SELECT COUNT(*) FROM predicciones").fetchone()[0]
    return {"predicciones_registradas": int(n)}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@bp.get("/api/history")
def history():
    """Lo que la aplicacion ha predicho. Mas reciente primero."""
    try:
        limit = int(request.args.get("limit", DEFAULT_LIMIT))
    except ValueError:
        limit = DEFAULT_LIMIT
    # Un limit fuera de rango no es un error: se acota en silencio. El cliente
    # nunca puede pedir "todo".
    limit = max(1, min(limit, MAX_LIMIT))

    with conectar() as con:
        filas = con.execute(
            "SELECT * FROM predicciones ORDER BY created_at DESC, rowid DESC LIMIT ?",
            (limit,),
        ).fetchall()

    return jsonify(
        {
            "count": len(filas),
            "rows": [
                {
                    "prediction_id": f["prediction_id"],
                    "created_at": f["created_at"],
                    "model_version": f["model_version"],
                    "prediction": _leer_prediccion(f["prediction"]),
                    "input": json.loads(f["input_json"]),
                }
                for f in filas
            ],
        }
    )


@bp.post("/api/similar")
def similar():
    """Casos del entrenamiento mas parecidos a una entrada.

    La distancia usa las features crudas que el usuario reconoce, ponderadas
    por ``feature_importances``. No es una segunda prediccion ni una
    explicacion causal: es contexto empirico sobre ejemplos que el modelo vio.
    """
    cuerpo = request.get_json(silent=True)
    if not isinstance(cuerpo, dict) or not isinstance(cuerpo.get("input"), dict):
        return jsonify({"error": "se esperaba {input: {...}, limit?: <numero>}"}), 400

    try:
        limite = int(cuerpo.get("limit", 12))
    except (TypeError, ValueError):
        limite = 12
    limite = max(3, min(limite, 30))

    # Imports locales: este modulo sigue pudiendo existir en una sesion donde
    # el modelo o el tablero todavia no fueron agregados.
    try:
        import s1_tablero
        import s2_modelo
    except ImportError:
        return jsonify({"error": "el contexto de entrenamiento no esta disponible"}), 503

    try:
        entrada, advertencias = s2_modelo.validar(cuerpo["input"])
    except s2_modelo.InputInvalido as e:
        return jsonify({"error": str(e)}), 400

    datos = s1_tablero.df
    consulta = entrada.iloc[0]
    importancias = s2_modelo.contrato.get("feature_importances", {})
    features = [
        f for f in s2_modelo.contrato["features"] if f["name"] in datos.columns
    ]
    if not features:
        return jsonify({"error": "el dataset no comparte features con el modelo"}), 503

    # Acumuladores por fila. Las celdas faltantes no penalizan: simplemente no
    # participan en el denominador de esa fila.
    distancia = pd.Series(0.0, index=datos.index)
    peso_disponible = pd.Series(0.0, index=datos.index)

    for feature in features:
        nombre = feature["name"]
        serie = datos[nombre]
        peso = float(importancias.get(nombre, 1.0))
        if peso <= 0:
            continue
        validos = serie.notna()

        if feature["type"] == "num":
            numerica = pd.to_numeric(serie, errors="coerce")
            validos &= numerica.notna()
            rango = max(float(feature["max"]) - float(feature["min"]), 1.0)
            diferencia = ((numerica - float(consulta[nombre])).abs() / rango).clip(upper=1)
        elif feature["type"] == "bool":
            diferencia = serie.map(_booleano_normalizado).ne(bool(consulta[nombre])).astype(float)
        else:
            diferencia = serie.astype(str).ne(str(consulta[nombre])).astype(float)

        distancia.loc[validos] += diferencia.loc[validos] * peso
        peso_disponible.loc[validos] += peso

    distancia = (distancia / peso_disponible.replace(0, float("nan"))).dropna()
    cercanos = distancia.nsmallest(min(limite, len(distancia)))
    target = s1_tablero.TARGET

    def nativo(valor):
        return valor.item() if hasattr(valor, "item") else valor

    def clase_del_modelo(valor):
        valor = nativo(valor)
        # bool es subclase de int en Python: True == 1. Si se comprobara la
        # pertenencia primero, devolveriamos True aunque el contrato declare 1
        # y el resumen no reconoceria ningun positivo por diferencia de texto.
        if isinstance(valor, bool) and int(valor) in s2_modelo.CLASES:
            return int(valor)
        if valor in s2_modelo.CLASES:
            return valor
        return valor

    filas = []
    for indice, d in cercanos.items():
        resultado_real = clase_del_modelo(datos.at[indice, target])
        filas.append(
            {
                "similarity": round(max(0.0, 1.0 - float(d)), 4),
                "outcome": resultado_real,
                "outcome_label": s2_modelo.etiqueta_de(resultado_real),
            }
        )

    if s1_tablero.ES_CATEGORICO:
        positiva = s2_modelo.contrato.get("positive_class")
        positivos = sum(str(f["outcome"]) == str(positiva) for f in filas)
        resumen_target = {
            "kind": "categorico",
            "positive_class": positiva,
            "positive_label": s2_modelo.etiqueta_de(positiva),
            "positive_rate": round(positivos / len(filas), 4) if filas else None,
        }
    else:
        valores = [float(datos.at[i, target]) for i in cercanos.index]
        resumen_target = {
            "kind": "numerico",
            "mean": round(sum(valores) / len(valores), 2) if valores else None,
            "min": round(min(valores), 2) if valores else None,
            "max": round(max(valores), 2) if valores else None,
        }

    return jsonify(
        {
            "count": len(filas),
            "average_similarity": round(
                sum(f["similarity"] for f in filas) / len(filas), 4
            ) if filas else None,
            "weighted_by": "feature_importances",
            "target": resumen_target,
            "neighbors": filas,
            "warnings": advertencias,
        }
    )


def _booleano_normalizado(valor):
    """Normaliza los booleanos del CSV con las mismas formas que /predict."""
    if valor in (True, 1, "true", "True", "TRUE", "1", "si", "yes"):
        return True
    if valor in (False, 0, "false", "False", "FALSE", "0", "no"):
        return False
    return None


@bp.post("/api/explain")
def explain():
    """Traduce una prediccion a una frase. NO la recalcula.

    Recibir la prediccion en lugar de volver a calcularla no es un ahorro: es
    lo que garantiza que la explicacion hable del mismo numero que el usuario
    tiene en pantalla.
    """
    cuerpo = request.get_json(silent=True)
    esperado = "se esperaba {input: {...}, prediction: <numero o etiqueta>}"

    if not isinstance(cuerpo, dict):
        return jsonify({"error": esperado}), 400

    entrada = cuerpo.get("input")
    prediccion = cuerpo.get("prediction")

    # La prediccion ya no tiene que ser un numero: un clasificador devuelve una
    # etiqueta, que puede ser booleana o una cadena. Lo que si se exige es que
    # venga --None significa que el cliente no mando nada.
    if not isinstance(entrada, dict) or prediccion is None:
        return jsonify({"error": esperado}), 400

    return jsonify(
        {
            "explanation": redactar(entrada, prediccion),
            # Quien redacto. Hoy siempre 'plantilla'. Esta en el contrato desde
            # el principio para que cambiarlo por un modelo de lenguaje no
            # rompa a ningun consumidor.
            "source": "plantilla",
        }
    )


def redactar(entrada, prediccion):
    """Arma la frase con las features que mas pesan en el modelo.

    Las importancias salen de metadata.json, asi que la explicacion habla de lo
    que de verdad mueve a ESTE modelo y no de una lista elegida a mano.

    La frase cambia segun el tipo de problema --un numero estimado o una clase
    predicha-- pero el razonamiento es el mismo: las tres features de mayor
    importancia, comparadas contra lo habitual del entrenamiento.
    """
    # Import local: si la sesion 2 no esta, explicar sigue funcionando con una
    # frase mas corta en lugar de tumbar el modulo entero al importarlo.
    try:
        import s2_modelo

        metadata = s2_modelo.contrato
        etiqueta_de = s2_modelo.etiqueta_de
    except Exception:  # noqa: BLE001
        metadata = None
        etiqueta_de = str

    encabezado = _encabezado(metadata, prediccion, etiqueta_de)

    if not metadata:
        return encabezado

    importancias = metadata.get("feature_importances", {})
    contrato = {f["name"]: f for f in metadata["features"]}

    # La frase la lee una persona, asi que usa el nombre legible que declara el
    # contrato. Decir "CryoSleep si" en vez de "Viaja en criosueño si" es
    # filtrar una variable de codigo hasta la pantalla.
    def legible(nombre):
        return contrato.get(nombre, {}).get("label", nombre)

    # Se miran las OCHO que mas pesan, no las tres, y despues se filtra.
    #
    # La razon: una feature en la que este caso es igual a la mediana del
    # entrenamiento no explica nada. En este dataset la mediana de casi todas
    # las cuentas de consumo es 0 --la mayoria de los pasajeros no gasta-- asi
    # que quedarse con las tres primeras produce "RoomService en lo habitual
    # (0); Spa en lo habitual (0); VRDeck en lo habitual (0)", que es una frase
    # que ocupa espacio y no dice nada.
    #
    # Se prefieren las que DISTINGUEN a este caso, en orden de importancia. Si
    # no hay ninguna --un caso promedio en todo-- se usan las de mayor peso
    # aunque sean tibias, porque quedarse sin explicacion es peor.
    top = sorted(importancias.items(), key=lambda kv: kv[1], reverse=True)[:8]

    distintivas = []
    tibias = []

    for nombre, _ in top:
        if nombre not in entrada or nombre not in contrato:
            continue
        f = contrato[nombre]
        valor = entrada[nombre]
        tipo = f["type"]

        if tipo == "num":
            try:
                v = float(valor)
            except (TypeError, ValueError):
                continue
            # Se compara contra la mediana del entrenamiento: decir "5" no
            # informa, decir "por debajo de lo habitual" si.
            mediana = f["median"]
            if v > mediana:
                distintivas.append(
                    f"{legible(nombre)} por encima de lo habitual ({v:g})"
                )
            elif v < mediana:
                distintivas.append(
                    f"{legible(nombre)} por debajo de lo habitual ({v:g})"
                )
            else:
                tibias.append(f"{legible(nombre)} en lo habitual ({v:g})")
        elif tipo == "bool":
            # Un booleano siempre distingue: no hay un "valor habitual" que
            # vuelva la frase vacia.
            distintivas.append(f"{legible(nombre)}: {'si' if valor else 'no'}")
        else:
            distintivas.append(f"{legible(nombre)} = {valor}")

    piezas = (distintivas + tibias)[:3]

    if not piezas:
        return encabezado

    return f"{encabezado} Lo que mas pesa en esa decision es {'; '.join(piezas)}."


def _encabezado(metadata, prediccion, etiqueta_de):
    """La primera frase: lo que el modelo decidio, en su unidad."""
    tarea = (metadata or {}).get("task", "regresion")

    if tarea == "clasificacion":
        return f"El modelo clasifica este caso como {etiqueta_de(prediccion)}."

    try:
        return f"El modelo estima {float(prediccion):,.0f} para este caso."
    except (TypeError, ValueError):
        return f"El modelo predice {prediccion}."
