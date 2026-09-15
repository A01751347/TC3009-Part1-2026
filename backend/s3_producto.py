"""Sesion 3: memoria y palabras.

El historial de predicciones y la explicacion en lenguaje natural.
El contrato que implementa este archivo esta en docs/api-contrato.md.
"""

import json
import pathlib
import sqlite3
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

bp = Blueprint("s3_producto", __name__)

RAIZ = pathlib.Path(__file__).resolve().parent.parent

# ATAJO-P1: SQLite en un archivo local, sin migraciones ni pool de conexiones.
#           Alcanza para un taller y se lee de un vistazo.
#           Parte 2 -> un motor de verdad, migraciones, y el historial deja de
#           vivir en el disco de una instancia que puede desaparecer.
DB_PATH = RAIZ / "predicciones.sqlite"

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


def crear_tabla():
    with conectar() as con:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS predicciones (
                prediction_id TEXT PRIMARY KEY,
                created_at    TEXT NOT NULL,
                model_version TEXT NOT NULL,
                prediction    REAL NOT NULL,
                input_json    TEXT NOT NULL
            )
            """
        )


crear_tabla()


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
                prediccion,
                json.dumps(entrada),
            ),
        )


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
                    "prediction": f["prediction"],
                    "input": json.loads(f["input_json"]),
                }
                for f in filas
            ],
        }
    )


@bp.post("/api/explain")
def explain():
    """Traduce una prediccion a una frase. NO la recalcula.

    Recibir la prediccion en lugar de volver a calcularla no es un ahorro: es
    lo que garantiza que la explicacion hable del mismo numero que el usuario
    tiene en pantalla.
    """
    cuerpo = request.get_json(silent=True)
    if not isinstance(cuerpo, dict):
        return jsonify({"error": "se esperaba {input: {...}, prediction: numero}"}), 400

    entrada = cuerpo.get("input")
    prediccion = cuerpo.get("prediction")

    if not isinstance(entrada, dict) or not isinstance(prediccion, (int, float)):
        return jsonify({"error": "se esperaba {input: {...}, prediction: numero}"}), 400

    return jsonify(
        {
            "explanation": redactar(entrada, float(prediccion)),
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
    """
    # Import local: si la sesion 2 no esta, explicar sigue funcionando con una
    # frase mas corta en lugar de tumbar el modulo entero al importarlo.
    try:
        import s2_modelo

        metadata = s2_modelo.contrato
    except Exception:  # noqa: BLE001
        metadata = None

    if not metadata:
        return f"El modelo estima {prediccion:,.0f} para esta casa."

    importancias = metadata.get("feature_importances", {})
    contrato = {f["name"]: f for f in metadata["features"]}

    # Las tres que mas pesan, de mayor a menor.
    top = sorted(importancias.items(), key=lambda kv: kv[1], reverse=True)[:3]

    piezas = []
    for nombre, _ in top:
        if nombre not in entrada or nombre not in contrato:
            continue
        f = contrato[nombre]
        valor = entrada[nombre]

        if f["type"] == "num":
            try:
                v = float(valor)
            except (TypeError, ValueError):
                continue
            # Se compara contra la mediana del entrenamiento: decir "5" no
            # informa, decir "por debajo de lo habitual" si.
            mediana = f["median"]
            if v > mediana:
                piezas.append(f"{nombre} por encima de lo habitual ({v:g})")
            elif v < mediana:
                piezas.append(f"{nombre} por debajo de lo habitual ({v:g})")
            else:
                piezas.append(f"{nombre} en lo habitual ({v:g})")
        else:
            piezas.append(f"{nombre} = {valor}")

    if not piezas:
        return f"El modelo estima {prediccion:,.0f} para esta casa."

    return (
        f"El modelo estima {prediccion:,.0f} para esta casa. "
        f"Lo que mas pesa en esa estimacion es {'; '.join(piezas)}."
    )
