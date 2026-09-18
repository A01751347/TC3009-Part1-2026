"""Sesion 1: los datos del tablero.

Sirve agregados y registros del dataset. Este modulo NO sabe nada del modelo:
es la vista del conjunto con el que se entreno.

El contrato que implementa este archivo esta en docs/api-contrato.md y, para
la forma generica, en docs/contrato-clasificacion.md.

POR QUE HAY UNA TABLA DE CONFIGURACION ARRIBA
---------------------------------------------
La version original de este archivo tenia 'Neighborhood', 'SalePrice' y
'OverallQual' escritos a mano por todos lados. Funcionaba, pero significaba
que cambiar de dataset era reescribir el archivo.

Ahora cada dataset se DECLARA en un bloque, y el resto del modulo trabaja con
esa declaracion. La forma de la respuesta es la misma para los dos, asi que el
frontend tampoco cambia. Cambiar de problema es cambiar datos, no codigo: esa
es la idea que el modulo entero esta tratando de enseñar.
"""

import os
import pathlib

import numpy as np
import pandas as pd
from flask import Blueprint, jsonify, request

bp = Blueprint("s1_tablero", __name__)

RAIZ = pathlib.Path(__file__).resolve().parent.parent

DEFAULT_LIMIT = 20
MAX_LIMIT = 200

DATA_PATH = os.environ.get("DATA_PATH", str(RAIZ / "data" / "train.csv"))


# ---------------------------------------------------------------------------
# Que dataset es cada uno
# ---------------------------------------------------------------------------
#
# 'target_kind' es lo que decide casi todo lo demas:
#
#   numerico    -> el resumen es min/media/mediana/max, y cada grupo reporta
#                  el promedio del target
#   categorico  -> el resumen es la distribucion de clases, y cada grupo
#                  reporta la tasa de la clase positiva
#
# 'group_by' es el eje de comparacion del tablero --la grafica grande-- y
# 'secondary' el segundo corte. Los dos tienen que ser columnas del CSV o
# columnas que derive() sepa construir.

DATASETS = {
    "spaceship": {
        "nombre": "Spaceship Titanic",
        "target": "Transported",
        "target_kind": "categorico",
        "positive_class": True,
        "class_labels": {"True": "Transportado", "False": "No transportado"},
        "group_by": "HomePlanet",
        "secondary": "Cabin_Deck",
        "columnas": [
            "PassengerId",
            "HomePlanet",
            "CryoSleep",
            "Cabin_Deck",
            "Cabin_Side",
            "Destination",
            "Age",
            "GroupSize",
            "TotalSpent",
        ],
        "labels": {
            "group": "Planeta de origen",
            "secondary": "Cubierta de la cabina",
            "value": "Tasa de transportados",
            "registro": "pasajeros",
        },
        "value_format": "porcentaje",
    },
    "casas": {
        "nombre": "House Prices (Ames)",
        "target": "SalePrice",
        "target_kind": "numerico",
        "positive_class": None,
        "class_labels": {},
        "group_by": "Neighborhood",
        "secondary": "OverallQual",
        "columnas": [
            "Id",
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
        ],
        "labels": {
            "group": "Colonia",
            "secondary": "Calidad general",
            "value": "Precio medio",
            "registro": "casas",
        },
        "value_format": "moneda",
    },
}

SPEND_COLS = ["RoomService", "FoodCourt", "ShoppingMall", "Spa", "VRDeck"]


def derivar(df):
    """Columnas de conveniencia para el TABLERO, no para el modelo.

    Cabin viene como 'B/0/P' y asi no se puede agrupar; PassengerId como
    '0001_01', donde el prefijo es el grupo de viaje.

    OJO con la frontera: estas columnas son para MIRAR los datos. Las que el
    modelo consume se derivan dentro del pipeline (artifacts/derivadas.py), y
    no se comparten a proposito. Si el tablero y el modelo compartieran esta
    funcion, un cambio pensado para una grafica cambiaria las predicciones sin
    que nadie lo note.
    """
    if "Cabin" in df.columns and "Cabin_Deck" not in df.columns:
        partes = df["Cabin"].str.split("/", expand=True)
        df["Cabin_Deck"] = partes[0]
        df["Cabin_Side"] = partes[2]

    if "PassengerId" in df.columns and "GroupSize" not in df.columns:
        # El PassengerId de Spaceship es '<grupo>_<numero>'. El de casas es un
        # entero, asi que esto solo aplica cuando hay guion bajo.
        if df["PassengerId"].astype(str).str.contains("_").any():
            grupo = df["PassengerId"].astype(str).str.split("_").str[0]
            df["GroupSize"] = grupo.map(grupo.value_counts())

    faltan = [c for c in SPEND_COLS if c not in df.columns]
    if not faltan and "TotalSpent" not in df.columns:
        df["TotalSpent"] = df[SPEND_COLS].sum(axis=1, skipna=True)

    return df


def elegir_config(df):
    """Elige la configuracion por la columna target que trae el CSV.

    No se usa una variable de entorno porque eso permitiria arrancar con la
    configuracion equivocada: el CSV es el que sabe que dataset es. Si no
    coincide con ninguno, se dice QUE columnas se buscaron en lugar de fallar
    con un KeyError a la primera peticion.
    """
    for clave, cfg in DATASETS.items():
        if cfg["target"] in df.columns:
            return clave, cfg
    esperadas = ", ".join(f"{c['target']} ({k})" for k, c in DATASETS.items())
    raise RuntimeError(
        f"{DATA_PATH} no tiene ninguna columna target conocida.\n"
        f"    Busque: {esperadas}\n"
        f"    El CSV trae: {', '.join(df.columns[:12])}..."
    )


# ATAJO-P1: el CSV se carga completo en memoria al arrancar y nunca se recarga.
#           Alcanza para unos miles de filas y hace la sesion 1 legible.
#           Parte 2 -> base de datos, consultas, paginacion real.
df = derivar(pd.read_csv(DATA_PATH))
DATASET, CFG = elegir_config(df)

TARGET = CFG["target"]
ES_CATEGORICO = CFG["target_kind"] == "categorico"
GROUP_BY = CFG["group_by"]
SECONDARY = CFG["secondary"]

# Solo las columnas que existen de verdad: si el CSV no trae una, se omite en
# lugar de tumbar la peticion.
COLUMNAS = [c for c in CFG["columnas"] if c in df.columns]
EXPUESTAS = COLUMNAS + [TARGET]

# Los dos ejes del tablero tienen que existir DE VERDAD.
#
# Sin esto, un CSV que trae el target pero no las columnas del eje --por
# ejemplo el train_processed.csv del avance 1, donde HomePlanet ya se convirtio
# en HomePlanet_Europa-- arranca sin protestar y sirve un tablero vacio. El
# sintoma serian graficas en blanco, que no apuntan a la causa por ningun lado.
_faltan_ejes = [c for c in (GROUP_BY, SECONDARY) if c not in df.columns]
if _faltan_ejes:
    raise RuntimeError(
        f"{DATA_PATH} no tiene las columnas del tablero: {', '.join(_faltan_ejes)}.\n"
        f"    El dataset '{DATASET}' las declara como ejes en DATASETS.\n"
        "    Si estas usando un CSV ya preprocesado, usa el crudo: el tablero\n"
        "    muestra los datos como son, no como los ve el modelo.\n"
        f"    El CSV trae: {', '.join(df.columns[:12])}..."
    )

print(
    f"dataset: {CFG['nombre']} — {len(df)} filas, "
    f"target '{TARGET}' ({CFG['target_kind']})",
    flush=True,
)


def estado():
    """Lo que este modulo aporta a /api/health."""
    return {"dataset": CFG["nombre"], "registros": int(len(df))}


# ---------------------------------------------------------------------------
# Agregacion
# ---------------------------------------------------------------------------


def _nativo(v):
    """numpy -> tipos de Python. Sin esto, jsonify truena con int64/bool_."""
    return v.item() if hasattr(v, "item") else v


def _valor_del_grupo(sub):
    """El numero que representa a un grupo en las graficas.

    Para un target numerico es su promedio; para uno categorico, la proporcion
    de la clase positiva. Es el mismo eje vertical en los dos casos, y por eso
    el frontend puede dibujar las dos con la misma grafica.
    """
    if ES_CATEGORICO:
        return round(float((sub[TARGET] == CFG["positive_class"]).mean()), 4)
    return round(float(sub[TARGET].mean()), 1)


def _agregar_por(columna, alcance, orden_por_valor=True):
    if columna not in alcance.columns or len(alcance) == 0:
        return []
    agrupado = alcance.dropna(subset=[columna]).groupby(columna, dropna=True)
    filas = [
        {
            "group": _nativo(clave),
            "count": int(len(sub)),
            "value": _valor_del_grupo(sub),
        }
        for clave, sub in agrupado
    ]
    if orden_por_valor:
        filas.sort(key=lambda f: f["value"], reverse=True)
    else:
        filas.sort(key=lambda f: str(f["group"]))
    return filas


def _resumen_del_target(alcance):
    if len(alcance) == 0:
        return None

    if not ES_CATEGORICO:
        valores = alcance[TARGET]
        return {
            "name": TARGET,
            "kind": "numerico",
            "min": _nativo(valores.min()),
            "mean": round(float(valores.mean()), 1),
            "median": _nativo(valores.median()),
            "max": _nativo(valores.max()),
        }

    conteo = alcance[TARGET].value_counts(dropna=False)
    total = int(conteo.sum())
    return {
        "name": TARGET,
        "kind": "categorico",
        "distribution": [
            {
                "class": _nativo(clase),
                "label": CFG["class_labels"].get(str(clase), str(clase)),
                "count": int(n),
                "share": round(float(n / total), 4),
            }
            for clase, n in conteo.items()
        ],
        "positive_class": CFG["positive_class"],
        "positive_rate": round(
            float((alcance[TARGET] == CFG["positive_class"]).mean()), 4
        ),
    }


@bp.get("/api/stats")
def stats():
    """Agregados del dataset. Alimenta las graficas del tablero.

    Si llega 'scope', el resumen del target y el corte secundario se calculan
    solo sobre ese grupo. El corte principal se mantiene GLOBAL a proposito:
    es el eje de comparacion del tablero, y filtrarlo a un solo valor lo
    dejaria sin sentido. El frontend resalta el seleccionado en lugar de
    esconder los demas.

    Es una decision de producto, no un descuido: filtrar no siempre significa
    ocultar.
    """
    # 'neighborhood' se sigue aceptando: es como se llamaba este parametro
    # cuando el unico dataset era el de casas, y romper un nombre publico del
    # contrato por cambiar de dataset seria justo lo contrario de lo que este
    # modulo enseña.
    scope = request.args.get("scope") or request.args.get("neighborhood")
    alcance = df[df[GROUP_BY].astype(str) == scope] if scope else df

    # Siempre sobre df completo, nunca sobre el alcance filtrado.
    by_group = _agregar_por(GROUP_BY, df)

    # Un grupo sin registros no es un error: es un resultado vacio.
    return jsonify(
        {
            "count": int(len(alcance)),
            "scope": scope,
            "dataset": CFG["nombre"],
            "group_by": GROUP_BY,
            "secondary_by": SECONDARY,
            "labels": CFG["labels"],
            "value_format": CFG["value_format"],
            "target": _resumen_del_target(alcance),
            "by_group": by_group,
            "by_secondary": _agregar_por(
                SECONDARY, alcance, orden_por_valor=False
            ),
        }
    )


@bp.get("/api/data")
def data():
    """Registros individuales, con filtro opcional por el eje principal."""
    scope = request.args.get("scope") or request.args.get("neighborhood")

    # Un limit que no es un numero no tumba la peticion: se usa el de por
    # defecto. Despues se acota al rango permitido.
    try:
        limit = int(request.args.get("limit", DEFAULT_LIMIT))
    except ValueError:
        limit = DEFAULT_LIMIT
    limit = max(1, min(limit, MAX_LIMIT))

    filtrado = df
    if scope:
        filtrado = filtrado[filtrado[GROUP_BY].astype(str) == scope]

    # count es cuantas filas van en esta respuesta; total_matching cuantas
    # cumplen el filtro en total. La diferencia es la que permite paginar.
    total = int(len(filtrado))
    pagina = filtrado.head(limit)[EXPUESTAS]

    # NaN no existe en JSON: jsonify lo escribe como NaN, que ningun navegador
    # sabe leer, y el sintoma es un error de parseo en el frontend que no
    # apunta a los datos por ningun lado.
    pagina = pagina.replace({np.nan: None})

    # Un filtro sin coincidencias devuelve una lista vacia con 200, no un error.
    # Una busqueda vacia es un resultado legitimo; un error es que algo salio mal.
    return jsonify(
        {
            "count": int(len(pagina)),
            "total_matching": total,
            "columns": EXPUESTAS,
            "target": TARGET,
            "rows": pagina.to_dict(orient="records"),
        }
    )
