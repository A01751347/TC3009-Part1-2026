"""Columnas derivadas del modelo de Spaceship Titanic.

ESTE ARCHIVO VIAJA CON EL ARTEFACTO, y no es un capricho.

joblib no serializa el CODIGO de una funcion: guarda una referencia con su
nombre completo ('derivadas.derivar'). Si el pipeline lleva dentro un
FunctionTransformer y este modulo no se puede importar al cargarlo, joblib
truena con "No module named 'derivadas'".

Por eso el notebook lo escribe dentro de artifacts/ junto a pipeline.joblib, y
el servicio pone esa carpeta en sys.path antes de deserializar. El artefacto
sigue siendo autocontenido: es una carpeta, no un archivo suelto.

Y por eso NADA de aqui vive en backend/. Toda la transformacion que el modelo
necesita viaja con el modelo. El servicio le pasa un DataFrame crudo --las
features del contrato, tal como las escribio el usuario-- y no sabe que estas
columnas existen.
"""

import numpy as np
import pandas as pd

# Las cinco cuentas de consumo a bordo.
GASTOS = ["RoomService", "FoodCourt", "ShoppingMall", "Spa", "VRDeck"]

# Las que se comprimen con log1p: tienen sesgo de entre 6 y 12 en crudo.
# log1p mapea el 0 a 0 --y aqui hay muchisimos ceros, por el criosueño--
# conserva el orden y comprime la cola sin borrar los extremos.
A_COMPRIMIR = GASTOS + ["TotalSpent"]

# Cubiertas de la nave. La T tiene un puñado de registros en el dataset real:
# dejarla sola invita al modelo a aprender una relacion espuria sobre cinco
# filas, asi que se funde con la D, su vecina.
DECK_RARA, DECK_DESTINO = "T", "D"


def _a_binaria(serie):
    """Lleva a 1.0 / 0.0 / NaN una columna que puede llegar de varias formas.

    Al entrenar, pandas lee la columna del CSV como objeto con True, False y
    NaN mezclados. Al servir, el backend ya la normalizo a bool de Python. Y
    un cliente escrito en otro lenguaje puede mandar "true" o 1.

    Las cuatro formas quieren decir lo mismo. Normalizar aqui --y no en el
    servicio-- es lo que hace que el mismo pipeline sirva para las dos rutas.
    """
    mapa = {
        True: 1.0, False: 0.0,
        "True": 1.0, "False": 0.0,
        "true": 1.0, "false": 0.0,
        "1": 1.0, "0": 0.0,
    }
    # True, 1 y 1.0 tienen el mismo hash en Python, asi que las tres formas
    # numericas caen en la misma entrada del diccionario sin listarlas todas.
    return pd.Series(
        [mapa.get(v, np.nan) for v in serie], index=serie.index, dtype=float
    )


def derivar(X):
    """Agrega las columnas que el modelo necesita y que el usuario no escribe.

    Recibe las features del contrato en crudo; devuelve un DataFrame con esas
    mismas columnas mas las derivadas. No imputa ni escala: eso es trabajo del
    ColumnTransformer que viene despues. Aqui solo se construyen columnas.

    Tiene que funcionar igual con 8693 filas al entrenar y con UNA sola al
    servir. Por eso no hay ni un groupby: toda la derivacion es por fila.
    """
    X = pd.DataFrame(X).copy()

    # --- CryoSleep -------------------------------------------------------
    # Faltante informativo: un pasajero en criosueño no puede gastar. Si
    # CryoSleep falta pero hay gasto registrado, CryoSleep era False.
    X["CryoSleep"] = _a_binaria(X["CryoSleep"])
    gasto_conocido = X[GASTOS].sum(axis=1, skipna=True) > 0
    X.loc[X["CryoSleep"].isna() & gasto_conocido, "CryoSleep"] = 0.0

    # Y al reves: si esta en criosueño, un gasto faltante es un cero, no un
    # desconocido. Imputar la mediana ahi seria inventar consumo.
    en_cryo = X["CryoSleep"] == 1.0
    for c in GASTOS:
        X.loc[en_cryo & X[c].isna(), c] = 0.0

    # --- Gasto total y si gasto algo -------------------------------------
    X["TotalSpent"] = X[GASTOS].sum(axis=1, skipna=True)
    X["HasSpent"] = (X["TotalSpent"] > 0).astype(float)

    # --- Señales de contexto ---------------------------------------------
    X["IsChild"] = (pd.to_numeric(X["Age"], errors="coerce") < 15).astype(float)
    X["IsAlone"] = (pd.to_numeric(X["GroupSize"], errors="coerce") == 1).astype(float)

    # --- Cubierta rara ----------------------------------------------------
    X["Cabin_Deck"] = X["Cabin_Deck"].replace(DECK_RARA, DECK_DESTINO)

    # --- Compresion del sesgo --------------------------------------------
    for c in A_COMPRIMIR:
        X[f"{c}_log"] = np.log1p(pd.to_numeric(X[c], errors="coerce").clip(lower=0))

    return X.drop(columns=A_COMPRIMIR)


# Las columnas que salen de derivar(), agrupadas por como hay que tratarlas.
# El ColumnTransformer del pipeline se construye con estas listas.
CONTINUAS = [f"{c}_log" for c in A_COMPRIMIR] + ["Age", "Cabin_Num", "GroupSize"]
NOMINALES = ["HomePlanet", "Destination", "Cabin_Deck", "Cabin_Side"]
BINARIAS = ["CryoSleep", "HasSpent", "IsChild", "IsAlone"]

# De que feature del contrato salio cada columna derivada.
#
# Sirve para una sola cosa, y es importante: devolver las importancias del
# modelo al vocabulario del usuario. El modelo ve 'TotalSpent_log' y
# 'HomePlanet_Europa'; la Model Card tiene que hablar de 'RoomService' y
# 'HomePlanet', que son los campos que la persona llena.
#
# Una columna que resume varias features se reparte entre todas ellas.
# Las que no aparecen aqui se atribuyen a la feature de su mismo nombre.
ORIGEN = {
    **{f"{c}_log": [c] for c in GASTOS},
    "TotalSpent_log": GASTOS,
    "HasSpent": GASTOS,
    "IsChild": ["Age"],
    "IsAlone": ["GroupSize"],
}
