"""Sesion 1: los datos del tablero.

Sirve agregados y registros del dataset. Todavia no hay modelo.
El contrato que implementa este archivo esta en docs/api-contrato.md.
"""

import os
import pathlib

import pandas as pd
from flask import Blueprint, jsonify, request

bp = Blueprint("s1_tablero", __name__)

RAIZ = pathlib.Path(__file__).resolve().parent.parent

# Las diez features que consume el modelo desde la sesion 2, mas Id y el target.
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

DATA_PATH = os.environ.get("DATA_PATH", str(RAIZ / "data" / "train.csv"))

# ATAJO-P1: el CSV se carga completo en memoria al arrancar y nunca se recarga.
#           Alcanza para 1460 filas y hace la sesion 1 legible.
#           Parte 2 -> base de datos, consultas, paginacion real.
df = pd.read_csv(DATA_PATH)


@bp.get("/api/stats")
def stats():
    """Agregados del dataset. Alimenta las graficas del tablero.

    Si llega el parametro neighborhood, las estadisticas del target y el
    desglose por calidad se calculan solo sobre esa colonia. El desglose por
    colonia se mantiene global a proposito: es el eje de comparacion del
    tablero, y filtrarlo a una sola colonia lo dejaria sin sentido. El frontend
    resalta la seleccionada en lugar de esconder las demas.
    """
    neighborhood = request.args.get("neighborhood")
    alcance = df[df["Neighborhood"] == neighborhood] if neighborhood else df

    # Siempre sobre df completo, nunca sobre el alcance filtrado.
    por_colonia = (
        df.groupby("Neighborhood")[TARGET_COLUMN]
        .agg(["count", "mean"])
        .reset_index()
        .sort_values("mean", ascending=False)
    )
    by_neighborhood = [
        {
            "neighborhood": fila["Neighborhood"],
            "count": int(fila["count"]),
            "mean_price": round(float(fila["mean"]), 1),
        }
        for _, fila in por_colonia.iterrows()
    ]

    # Una colonia sin registros no es un error: es un resultado vacio.
    if len(alcance) == 0:
        return jsonify(
            {
                "count": 0,
                "scope": neighborhood,
                "target": None,
                "by_neighborhood": by_neighborhood,
                "by_overall_qual": [],
            }
        )

    precios = alcance[TARGET_COLUMN]
    por_calidad = (
        alcance.groupby("OverallQual")[TARGET_COLUMN]
        .agg(["count", "mean"])
        .reset_index()
        .sort_values("OverallQual")
    )

    # Los tipos de numpy no son serializables a JSON: int() y float() no son
    # adorno. Sin ellos el servidor truena con
    # "Object of type int64 is not JSON serializable".
    return jsonify(
        {
            "count": int(len(alcance)),
            "scope": neighborhood,
            "target": {
                "name": TARGET_COLUMN,
                "min": int(precios.min()),
                "mean": round(float(precios.mean()), 1),
                "median": int(precios.median()),
                "max": int(precios.max()),
            },
            "by_neighborhood": by_neighborhood,
            "by_overall_qual": [
                {
                    "overall_qual": int(fila["OverallQual"]),
                    "count": int(fila["count"]),
                    "mean_price": round(float(fila["mean"]), 1),
                }
                for _, fila in por_calidad.iterrows()
            ],
        }
    )


@bp.get("/api/data")
def data():
    """Registros individuales, con filtro opcional por colonia."""
    neighborhood = request.args.get("neighborhood")

    # Un limit que no es un numero no tumba la peticion: se usa el de por
    # defecto. Despues se acota al rango permitido.
    try:
        limit = int(request.args.get("limit", DEFAULT_LIMIT))
    except ValueError:
        limit = DEFAULT_LIMIT
    limit = max(1, min(limit, MAX_LIMIT))

    filtrado = df
    if neighborhood:
        filtrado = filtrado[filtrado["Neighborhood"] == neighborhood]

    # count es cuantas filas van en esta respuesta; total_matching cuantas
    # cumplen el filtro en total. La diferencia es la que permite paginar.
    total = int(len(filtrado))
    pagina = filtrado.head(limit)[EXPOSED_COLUMNS]

    # Un filtro sin coincidencias devuelve una lista vacia con 200, no un error.
    # Una busqueda vacia es un resultado legitimo; un error es que algo salio mal.
    return jsonify(
        {
            "count": int(len(pagina)),
            "total_matching": total,
            "rows": pagina.to_dict(orient="records"),
        }
    )
