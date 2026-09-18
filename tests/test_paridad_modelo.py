"""Paridad notebook <-> servicio, para regresion Y clasificacion.

Es el mismo test que tests/test_paridad.py, pero sabe leer el campo 'task' del
contrato. Con un modelo de regresion compara el numero; con uno de
clasificacion compara la etiqueta Y las probabilidades, porque una etiqueta
sola no detecta el error mas comun de esta costura:

    un pipeline que clasifica igual pero con probabilidades corridas sigue
    dando la misma etiqueta en casi todos los casos, y falla justo en los que
    estan cerca del umbral -- que son los que importan.

    notebook                              servicio
    ────────────────────                  ─────────────────────────
    pipeline.predict(ejemplo)             POST /api/predict (example.json)
    pipeline.predict_proba(ejemplo)
             │                                      │
             ▼                                      ▼
    Transportado / 0.6076                 Transportado / 0.6076
             └──────────── ¿iguales? ───────────────┘

Se corre desde la raiz del proyecto:

    ./setup/run test paridad_modelo
"""

import importlib.util
import json
import os
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
VERDE, ROJO, AMARILLO, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[0m"

# Centavos para regresion, y una milesima de punto para las probabilidades.
# En los dos casos es el MISMO modelo, no una aproximacion: cualquier
# diferencia visible significa que algo en la costura no es identico.
TOL_NUMERO = 0.01
TOL_PROBA = 1e-6

fallos = []


def ok(m):
    print(f"  {VERDE}OK{RESET}    {m}")


def falla(m):
    print(f"  {ROJO}FALLA{RESET} {m}")
    fallos.append(m)


def aviso(m):
    print(f"  {AMARILLO}AVISO{RESET} {m}")


def cargar_servicio():
    os.environ.setdefault("DATA_PATH", str(RAIZ / "data" / "train.csv"))
    os.environ.setdefault("MODEL_PATH", str(RAIZ / "artifacts"))
    sys.path.insert(0, str(RAIZ / "backend"))
    spec = importlib.util.spec_from_file_location("app", RAIZ / "backend" / "app.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def comparar_regresion(cuerpo, ejemplo):
    esperado, obtenido = ejemplo["prediction"], cuerpo["prediction"]
    diferencia = abs(obtenido - esperado)
    print()
    print(f"  notebook   {esperado:>16,.2f}")
    print(f"  servicio   {obtenido:>16,.2f}")
    print(f"  diferencia {diferencia:>16,.2f}")
    print()
    if diferencia <= TOL_NUMERO:
        ok("las predicciones coinciden")
    else:
        falla(f"difieren en mas de {TOL_NUMERO}: la costura esta rota")


def comparar_clasificacion(cuerpo, ejemplo):
    esperada, obtenida = ejemplo["prediction"], cuerpo["prediction"]
    print()
    print(f"  notebook   {str(esperada):>16}")
    print(f"  servicio   {str(obtenida):>16}  ({cuerpo.get('prediction_label')})")
    print()

    if obtenida == esperada:
        ok(f"la clase predicha coincide ({cuerpo.get('prediction_label')})")
    else:
        falla(f"el notebook dice {esperada!r} y el servicio {obtenida!r}")

    esperadas = ejemplo.get("probabilities")
    obtenidas = cuerpo.get("probabilities")
    if not esperadas:
        aviso("example.json no trae probabilidades; solo se comparo la clase")
        return
    if not obtenidas:
        falla("el servicio no devolvio probabilidades y el notebook si")
        return
    if len(esperadas) != len(obtenidas):
        falla(
            f"el notebook reporta {len(esperadas)} clases y el servicio "
            f"{len(obtenidas)}"
        )
        return

    peor = 0.0
    for e, o in zip(esperadas, obtenidas):
        if e["class"] != o["class"]:
            falla(
                f"las clases vienen en distinto orden: notebook {e['class']!r}, "
                f"servicio {o['class']!r}. predict_proba() depende del orden."
            )
            return
        peor = max(peor, abs(e["probability"] - o["probability"]))

    for o in obtenidas:
        print(f"    {str(o['class']):>6}  {o['probability']:.4f}   {o['label']}")
    print()
    if peor <= TOL_PROBA:
        ok(f"las probabilidades coinciden (peor diferencia {peor:.2e})")
    else:
        falla(f"las probabilidades difieren hasta {peor:.6f}")


def main():
    ruta_ejemplo = RAIZ / "artifacts" / "example.json"
    if not ruta_ejemplo.exists():
        print("\nNo existe artifacts/example.json.")
        print("Corre el notebook de entrenamiento primero.\n")
        return 1

    ejemplo = json.loads(ruta_ejemplo.read_text())

    print()
    print("Paridad notebook <-> servicio")
    print("=" * 54)

    modulo = cargar_servicio()
    cliente = modulo.app.test_client()

    s2 = sys.modules.get("s2_modelo")
    if s2 is None:
        print("\n  el modulo del modelo no se cargo; no hay nada que comparar.\n")
        return 1

    contrato = s2.contrato
    tarea = contrato.get("task", "regresion")
    print(f"  tarea: {tarea}")

    respuesta = cliente.post("/api/predict", json=ejemplo["input"])
    if respuesta.status_code != 200:
        print(f"\n  El servicio respondio {respuesta.status_code}:")
        print(f"  {respuesta.get_json()}\n")
        print("  Si es un 400, el ejemplo no cumple el contrato: casi siempre")
        print("  es una fila con faltantes. Vuelve a exportar el artefacto.\n")
        return 1

    cuerpo = respuesta.get_json()

    if tarea == "clasificacion":
        comparar_clasificacion(cuerpo, ejemplo)
    else:
        comparar_regresion(cuerpo, ejemplo)

    # --- La version del modelo tiene que viajar con la prediccion ---
    if cuerpo["model_version"] == ejemplo["model_version"]:
        ok(f"la version del modelo coincide ({cuerpo['model_version']})")
    else:
        falla(
            f"el servicio sirve {cuerpo['model_version']} y el ejemplo se genero "
            f"con {ejemplo['model_version']}: no es el mismo artefacto"
        )

    # --- La version de scikit-learn del contrato tiene que ser la instalada ---
    import sklearn

    entrenado_con = contrato["sklearn_version"]
    if entrenado_con == sklearn.__version__:
        ok(f"scikit-learn coincide ({entrenado_con})")
    else:
        falla(
            f"entrenado con scikit-learn {entrenado_con}, "
            f"sirviendo con {sklearn.__version__}"
        )

    # --- El contrato y el pipeline tienen que declarar las MISMAS clases ---
    if tarea == "clasificacion":
        del_contrato = list(contrato.get("classes", []))
        del_pipeline = list(getattr(s2.pipeline, "classes_", []))
        if del_contrato == del_pipeline:
            ok(f"las clases del contrato son las del pipeline ({del_contrato})")
        else:
            falla(
                f"metadata.json dice {del_contrato} y el pipeline {del_pipeline}: "
                "las probabilidades saldrian cambiadas de lugar"
            )

        sin_etiqueta = [
            c for c in del_pipeline if str(c) not in contrato.get("class_labels", {})
        ]
        if sin_etiqueta:
            aviso(
                f"estas clases no tienen nombre legible en class_labels: "
                f"{sin_etiqueta}. La interfaz va a mostrar el valor crudo."
            )
        else:
            ok("cada clase tiene una etiqueta legible")

    # --- El servicio NO debe rehacer el preprocesamiento por su cuenta ---
    #
    # Es el corazon del modulo: toda la transformacion viaja en el artefacto.
    # Si alguno de estos nombres aparece en el backend, alguien movio
    # conocimiento del modelo al codigo que lo consume.
    fuente = (RAIZ / "backend" / "s2_modelo.py").read_text()
    prohibidos = [n for n in ("expm1", "log1p", "OneHotEncoder", "StandardScaler",
                              "RobustScaler", "SimpleImputer") if n in fuente]
    if prohibidos:
        falla(
            f"el servicio menciona {', '.join(prohibidos)}: el preprocesamiento "
            "deberia vivir dentro del pipeline, no aqui"
        )
    else:
        ok("el servicio no transforma la entrada por su cuenta")

    # --- Falta una feature -> 400, no una prediccion silenciosa ---
    if contrato["features"]:
        incompleto = dict(ejemplo["input"])
        quitada = contrato["features"][0]["name"]
        incompleto.pop(quitada, None)
        r = cliente.post("/api/predict", json=incompleto)
        if r.status_code == 400 and quitada in r.get_json().get("error", ""):
            ok(f"una entrada incompleta se rechaza y dice que falta ('{quitada}')")
        else:
            falla(
                f"quitando '{quitada}' el servicio respondio {r.status_code}; "
                "se esperaba 400 nombrando el campo"
            )

    # --- El artefacto no debe arrastrar rutas del entorno de entrenamiento ---
    crudo = (RAIZ / "artifacts" / "pipeline.joblib").read_bytes()
    sucias = [b for b in (b"/Users/", b"/home/", b"/content/", b"C:\\\\") if b in crudo]
    if sucias:
        falla(
            "el artefacto contiene rutas absolutas "
            f"({', '.join(s.decode() for s in sucias)})"
        )
    else:
        ok("el artefacto no contiene rutas absolutas")

    # --- Si el pipeline usa columnas derivadas, su modulo tiene que viajar ---
    if b"derivadas" in crudo:
        if (RAIZ / "artifacts" / "derivadas.py").exists():
            ok("derivadas.py viaja junto al pipeline")
        else:
            falla(
                "el pipeline referencia el modulo 'derivadas' pero "
                "artifacts/derivadas.py no existe: en otra maquina no carga"
            )

    print()
    if fallos:
        print(f"{ROJO}{len(fallos)} FALLAS:{RESET} la costura esta rota.")
        return 1
    print(f"{VERDE}La costura esta sana.{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
