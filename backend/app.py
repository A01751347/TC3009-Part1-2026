"""API del tablero de precios de vivienda.

Sesion 1: sirve agregados y registros del dataset. Todavia no hay modelo.
El contrato que implementa este archivo esta en docs/api-contrato.md.
"""

import os
import re

import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

API_VERSION = "1.0.0"

# Las diez features que va a consumir el modelo en la sesion 2, mas Id y el target.
# El tablero y el predictor hablan del mismo vocabulario desde el dia uno.
FEATURE_COLUMNS = [
    "GrLivArea",
    "OverallQual",
    "YearBuilt",
    "TotalBsmtSF",
    "GarageCars",
    "FullBath",
    "BedroomAbvGr",
    "Neighborhood",
    "LotArea",
    "KitchenQual",
]
TARGET_COLUMN = "SalePrice"
EXPOSED_COLUMNS = ["Id"] + FEATURE_COLUMNS + [TARGET_COLUMN]

DEFAULT_LIMIT = 20
MAX_LIMIT = 200

DATA_PATH = os.environ.get(
    "DATA_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "train.csv"),
)

app = Flask(__name__)

# CORS solo para desarrollo.
#
# El frontend corre en el puerto 3000 y el backend en el 8080: puertos distintos
# son origenes distintos, y el navegador bloquea la peticion si el servidor no
# autoriza explicitamente a quien la hace.
#
# Se autoriza por PATRON y no por direccion literal, porque la IP publica de la
# instancia cambia cada vez que el laboratorio la reinicia. El patron sigue
# rechazando cualquier otro origen: no es "permitir todo".
#
# En produccion esto desaparece: un solo contenedor sirve el frontend construido
# y la API desde el mismo origen, y entonces no hay dos origenes que reconciliar.
# TODO sesion 1: escribe aqui las dos lineas que autorizan al tablero.
#                Sin ellas el tablero no va a poder pedir datos.

# ATAJO-P1: el CSV se carga completo en memoria al arrancar y nunca se recarga.
#           Alcanza para 1460 filas y hace la sesion 1 legible.
#           Parte 2 -> base de datos, consultas, paginacion real.
df = pd.read_csv(DATA_PATH)


@app.get("/api/health")
def health():
    """Estado del servicio.

    En la sesion 2 esta respuesta crece con model_version, sklearn_version y
    artifact_hash, cuando exista un artefacto del que informar.
    """
    return jsonify({"status": "ok", "api_version": API_VERSION})


# TODO sesion 1: GET /api/stats
#
# Devuelve los agregados del dataset. Alimenta las graficas del tablero.
# El contrato exacto esta en docs/api-contrato.md.
#
# Acepta un parametro opcional neighborhood que acota count, target y
# by_overall_qual. by_neighborhood se queda global a proposito: es el eje de
# comparacion, y filtrarlo a una sola colonia lo dejaria sin sentido.


# TODO sesion 1: GET /api/data
#
# Devuelve registros individuales, con filtro opcional por colonia y un limite.
# Un filtro sin coincidencias NO es un error: responde 200 con lista vacia.


if __name__ == "__main__":
    # host="0.0.0.0" escucha en todas las interfaces. Sin esto, la API solo
    # respondaria a la propia instancia y tu navegador veria un timeout.
    #
    # El puerto 8080 tiene que estar abierto en el security group de la
    # instancia; si no, el paquete ni siquiera llega.
    app.run(host="0.0.0.0", port=8080, debug=True)
