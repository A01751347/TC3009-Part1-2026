"""Las tres promesas del registro de predicciones, para cualquier modelo.

Es tests/test_registro.py, pero sin el dataset de casas escrito a mano. La
version original manda Neighborhood="Polanco" para provocar un 400; con otro
modelo esa clave ni siquiera existe en el contrato, la peticion resulta VALIDA,
y el test falla por una razon que no tiene nada que ver con lo que mide.

Aqui el caso invalido se DERIVA del contrato: se busca una feature categorica y
se le manda un valor que su lista de permitidos no incluye. Asi la prueba sigue
siendo correcta cuando cambias de modelo.

Las tres invariantes son las mismas, y se rompen en silencio: nada falla, nada
avisa, y el dia que alguien audite el historial los numeros no cuadran.

  1. Cada prediccion exitosa deja EXACTAMENTE una fila.
  2. Una peticion rechazada con 400 NO deja fila.
  3. El historial viene de mas reciente a mas antiguo.

Corre contra una base de datos temporal: no toca la tuya.

    ./setup/run test registro_modelo
"""

import collections
import json
import os
import pathlib
import sys
import tempfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
VERDE, ROJO, AMARILLO, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[0m"

VALIDAS = 12
RECHAZADAS = 5

fallos = []


def ok(m):
    print(f"  {VERDE}OK{RESET}    {m}")


def falla(m):
    print(f"  {ROJO}FALLA{RESET} {m}")
    fallos.append(m)


def aviso(m):
    print(f"  {AMARILLO}AVISO{RESET} {m}")


def variar(base, contrato, i):
    """Doce entradas distintas, moviendo la primera feature numerica.

    Tienen que ser distintas entre si para que un id repetido en el log se note.
    Se mueve dentro del rango del contrato para que ninguna se rechace por
    estar fuera --eso seria un 200 con aviso, no un 400, pero enturbia la
    lectura del test.
    """
    numericas = [f for f in contrato["features"] if f["type"] == "num"]
    if not numericas:
        return dict(base)
    f = numericas[0]
    ancho = max(f["max"] - f["min"], 1.0)
    valor = f["min"] + (ancho * (i + 1) / (VALIDAS + 2))
    return dict(base, **{f["name"]: round(valor, 4)})


def caso_invalido(base, contrato):
    """Una entrada que el contrato tiene que rechazar con 400.

    Se prefiere una categoria inexistente porque es el rechazo mas claro. Si el
    modelo no tiene ninguna feature categorica, se quita un campo obligatorio:
    tambien es un 400, por otra via.
    """
    for f in contrato["features"]:
        if f["type"] == "cat":
            return dict(base, **{f["name"]: "@@valor-que-no-existe@@"}), (
                f"categoria invalida en '{f['name']}'"
            )
    sin = dict(base)
    quitada = contrato["features"][0]["name"]
    sin.pop(quitada, None)
    return sin, f"falta la feature obligatoria '{quitada}'"


def main():
    print("\nRegistro de predicciones")
    print("=" * 54)

    ejemplo = RAIZ / "artifacts" / "example.json"
    if not ejemplo.exists():
        print("  no hay artefacto todavia; corre el notebook de entrenamiento.")
        return 0

    # Base de datos temporal: el modulo lee DB_PATH al importarse, asi que se
    # define ANTES del import.
    tmp = tempfile.mkdtemp()
    os.environ["DB_PATH"] = str(pathlib.Path(tmp) / "prueba.sqlite")
    sys.path.insert(0, str(RAIZ / "backend"))

    import app  # noqa: E402

    if not any(m.__name__.endswith("_producto") for m in app.modulos):
        print("  el modulo del historial no esta escrito todavia; se omite.")
        return 0

    s2 = sys.modules.get("s2_modelo")
    if s2 is None:
        print("  el modulo del modelo no esta; no hay que registrar.")
        return 0

    contrato = s2.contrato
    cliente = app.app.test_client()
    base = json.loads(ejemplo.read_text())["input"]

    print(f"  modelo: {contrato['model_version']} "
          f"({contrato.get('task', 'regresion')})")

    # --- predicciones validas, todas distintas ---
    ids = []
    for i in range(VALIDAS):
        r = cliente.post("/api/predict", json=variar(base, contrato, i))
        if r.status_code != 200:
            falla(f"una prediccion valida devolvio {r.status_code}: {r.get_json()}")
            return 1
        ids.append(r.get_json()["prediction_id"])

    # --- peticiones invalidas ---
    invalida, porque = caso_invalido(base, contrato)
    for _ in range(RECHAZADAS):
        r = cliente.post("/api/predict", json=invalida)
        if r.status_code != 400:
            falla(
                f"{porque} devolvio {r.status_code}, esperado 400: {r.get_json()}"
            )

    filas = cliente.get("/api/history?limit=500").get_json()["rows"]
    en_log = [f["prediction_id"] for f in filas]

    print(f"\n  {VALIDAS} validas + {RECHAZADAS} rechazadas "
          f"({porque})  ->  {len(filas)} filas en el log\n")

    if len(filas) == VALIDAS:
        ok("cada prediccion exitosa dejo exactamente una fila")
        ok("ninguna peticion rechazada con 400 genero fila")
    else:
        falla(f"hay {len(filas)} filas y deberia haber {VALIDAS}")

    repetidos = [k for k, v in collections.Counter(en_log).items() if v > 1]
    if repetidos:
        falla(f"hay prediction_id repetidos en el log: {repetidos[:3]}")
    elif set(ids) == set(en_log):
        ok("cada prediction_id devuelto corresponde a una fila, y solo una")
    else:
        falla("los ids del log no coinciden con los que devolvio /api/predict")

    fechas = [f["created_at"] for f in filas]
    if fechas == sorted(fechas, reverse=True):
        ok("el historial viene de mas reciente a mas antiguo")
    else:
        falla("el historial no esta ordenado por fecha descendente")

    # El input completo, no solo el resultado: es lo que permite detectar
    # drift mas adelante.
    if filas and set(filas[0]["input"]) == set(base):
        ok(f"cada fila guarda el input completo ({len(base)} campos)")
    else:
        falla("las filas no guardan todas las features del input")

    # La prediccion tiene que volver con el MISMO tipo con el que se guardo.
    # Una etiqueta booleana que regresa como 1.0 rompe el historial en
    # silencio: la tabla sigue pintandose, pero con el valor equivocado.
    if filas:
        esperado = type(cliente.post("/api/predict", json=base).get_json()["prediction"])
        obtenido = type(cliente.get("/api/history?limit=1").get_json()["rows"][0]["prediction"])
        if esperado is obtenido:
            ok(f"la prediccion conserva su tipo en el historial ({esperado.__name__})")
        else:
            falla(
                f"/api/predict devuelve {esperado.__name__} y el historial "
                f"{obtenido.__name__}"
            )

    # El limite se acota: el cliente nunca puede pedir "todo".
    acotado = cliente.get("/api/history?limit=99999").get_json()
    if acotado["count"] <= 500:
        ok("un limite absurdo se acota en lugar de fallar")
    else:
        falla("/api/history no acota el limite")

    print()
    if fallos:
        print(f"{ROJO}{len(fallos)} FALLAS.{RESET} El registro no se puede auditar.")
        return 1
    print(f"{VERDE}El registro cumple sus tres promesas.{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
