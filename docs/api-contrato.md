# Contrato de la API

Este documento se escribe **antes** que el código. Define qué recibe y qué devuelve cada
endpoint. El backend implementa este contrato y el frontend lo consume; ninguno de los dos
adivina.

La regla del módulo: **si el contrato no está escrito, no se escribe código.**

Base de desarrollo: `http://localhost:8080` desde la propia instancia, o
`http://TU-IP-PUBLICA:8080` desde tu navegador.

> **Por qué el 8080 y no el 5000.** Porque tiene que estar abierto en el security group de la
> instancia, y 8080 es el puerto que ya abriste al crearla. Si cambias de puerto, cambia
> también la regla de entrada — si no, el paquete ni siquiera llega y el síntoma es un
> timeout, no un error.
>
> El frontend vive en el **3000**. Puertos distintos son orígenes distintos, y de ahí sale
> todo lo que vas a ver de CORS.

Este servicio sirve un **clasificador binario** sobre el dataset Spaceship Titanic: dado un
pasajero, predice si fue transportado a la dimensión alternativa. El contrato está escrito
para que el mismo código sirva también un modelo de regresión — el campo `task` es el que
decide. La versión original de este documento, con el modelo de precios de vivienda, está en
[curso/api-contrato-casas.md](curso/api-contrato-casas.md).

---

## `GET /api/health`

Estado del servicio. Es el primer endpoint que se escribe y el último que se consulta cuando
algo falla.

```json
{
  "status": "ok",
  "api_version": "1.0.0",
  "dataset": "Spaceship Titanic",
  "registros": 8693,
  "task": "clasificacion",
  "model_version": "1.0.0",
  "sklearn_version": "1.5.2",
  "artifact_hash": "13b0395daa67",
  "predicciones_registradas": 7
}
```

Cada módulo del backend aporta sus campos: `s1_tablero` los del dataset, `s2_modelo` los del
artefacto, `s4_producto` el conteo del historial. `app.py` no sabe nada de ellos.

`status` es `"ok"` o `"degradado"`. Un módulo roto **no** tumba el chequeo de los demás:

```json
{
  "status": "degradado",
  "modulos_con_falla": { "s4_producto": "no such table: predicciones" }
}
```

Justo cuando algo falla es cuando necesitas saber qué falla.

**El encabezado del tablero sale de aquí.** No hay ningún nombre de dataset escrito a mano en
el frontend: si cambias el modelo, el título cambia solo.

---

## `GET /api/stats`

Agregados del dataset. Alimenta las gráficas del tablero.

**Parámetros**

| Nombre  | Tipo   | Obligatorio | Descripción                                             |
| ------- | ------ | ----------- | ------------------------------------------------------- |
| `by`    | string | no          | Columna del eje principal. Por defecto, la del dataset  |
| `scope` | string | no          | Acota los agregados a ese valor de `by`                 |

`by` es lo que convierte el tablero en algo explorable en vez de un reporte fijo. Sólo se
aceptan las columnas que la respuesta lista en `groupable`; cualquier otra es `400`:

```json
{ "error": "no se puede agrupar por 'Cabin_Num'. Valores validos: HomePlanet, CryoSleep, ..." }
```

No es paranoia: agrupar por una columna con 1 894 valores distintos no produce una gráfica,
produce una tabla mal dibujada — y pedir una columna que no existe sería un `500`.

> `neighborhood` se sigue aceptando como alias de `scope`. Así se llamaba cuando el dataset
> era el de casas, y romper un nombre público del contrato por cambiar de datos sería lo
> contrario de lo que este módulo enseña.

**Respuesta**

```json
{
  "count": 8693,
  "scope": null,
  "dataset": "Spaceship Titanic",
  "group_by": "HomePlanet",
  "secondary_by": "Cabin_Deck",
  "groupable": [
    { "name": "HomePlanet", "label": "Planeta de origen" },
    { "name": "CryoSleep",  "label": "Criosueño" }
  ],
  "overall": 0.5036,
  "excluded": 201,
  "value_format": "porcentaje",
  "labels": {
    "group": "Planeta de origen",
    "secondary": "Cubierta de la cabina",
    "value": "Tasa de transportados",
    "registro": "pasajeros"
  },
  "target": {
    "name": "Transported",
    "kind": "categorico",
    "distribution": [
      { "class": true,  "label": "Transportado",    "count": 4378, "share": 0.5036 },
      { "class": false, "label": "No transportado", "count": 4315, "share": 0.4964 }
    ],
    "positive_class": true,
    "positive_rate": 0.5036
  },
  "by_group": [
    { "group": "Europa", "label": "Europa", "count": 2131, "value": 0.6588 }
  ],
  "by_secondary": [
    { "group": "B", "label": "B", "count": 779, "value": 0.7343 }
  ]
}
```

`group` conserva el tipo nativo —el frontend lo usa para comparar— y `label` es cómo se
dibuja. Sin `label`, una columna booleana produce un eje con las etiquetas en blanco: `true`
no se pinta como texto.

`overall` es el valor sobre el dataset completo. El tablero lo dibuja como línea punteada, y
es lo que convierte un "65%" en "15 puntos por encima de la media": sin referencia, cada barra
se lee sola y no hay comparación posible.

**`excluded` son los registros que no caen en ninguna barra** porque les falta el valor de la
columna del eje. Agrupar los descarta en silencio, y entonces las barras suman menos que
`count` sin que nada lo explique. Decirlo es la diferencia entre una gráfica y una gráfica
honesta.

`scope` es el valor aplicado, o `null` si no hay filtro.

`by_group` viene ordenado por `value` descendente. `by_secondary` viene ordenado por nombre.

**`target.kind` decide la forma del resumen.** Con `"categorico"` trae `distribution`,
`positive_class` y `positive_rate`; con `"numerico"` trae `min`, `mean`, `median` y `max`.

**`value` es el mismo eje en los dos casos:** el promedio del target si es numérico, la
proporción de la clase positiva si es categórico. Por eso la misma gráfica sirve para los dos
problemas sin una sola condición en el frontend.

**Qué se filtra y qué no.** Cuando llega `scope`, se acotan `count`, `target` y
`by_secondary`. **`by_group` se mantiene global a propósito**: es el eje de comparación del
tablero, y reducirlo a una sola barra lo dejaría sin sentido. El frontend resalta el valor
seleccionado en lugar de esconder los demás.

Es una decisión de producto, no un descuido: filtrar no siempre significa ocultar.

Si el `scope` no existe, la respuesta es `200` con `count: 0`, `target: null` y
`by_secondary: []`.

---

## `GET /api/data`

Registros individuales, con filtro opcional.

**Parámetros**

| Nombre  | Tipo   | Obligatorio | Por defecto | Descripción                       |
| ------- | ------ | ----------- | ----------- | --------------------------------- |
| `scope` | string | no          | —           | Filtra por `group_by` (exacto)    |
| `limit` | entero | no          | `20`        | Máximo de filas. Entre 1 y 200    |

**Respuesta**

```json
{
  "count": 20,
  "total_matching": 8693,
  "columns": ["PassengerId", "HomePlanet", "CryoSleep", "Cabin_Deck", "Cabin_Side",
              "Destination", "Age", "GroupSize", "TotalSpent", "Transported"],
  "column_labels": { "PassengerId": "Pasajero", "CryoSleep": "En criosueño" },
  "target": "Transported",
  "rows": [
    {
      "PassengerId": "0001_01", "HomePlanet": "Europa", "CryoSleep": false,
      "Cabin_Deck": "B", "Cabin_Side": "P", "Destination": "TRAPPIST-1e",
      "Age": 39.0, "GroupSize": 1, "TotalSpent": 0.0, "Transported": false
    }
  ]
}
```

`count` es cuántas filas vienen en esta respuesta. `total_matching` es cuántas cumplen el
filtro en total. No son lo mismo, y la diferencia importa para paginar.

`columns` viene en la respuesta para que **la tabla del tablero no tenga columnas escritas a
mano**, y `column_labels` para que los encabezados no digan `CABIN_DECK`: eso no es un
encabezado, es una variable de código que se escapó a la interfaz. El nombre técnico queda en
el `title` de la celda.

Acepta los mismos `by` y `scope` que `/api/stats`, para que la tabla siga al filtro.

`Cabin_Deck`, `Cabin_Side`, `GroupSize` y `TotalSpent` no están en el CSV: las deriva el
backend para poder agrupar. Son columnas **para mirar los datos**, distintas de las que
consume el modelo — ver la sección del artefacto más abajo.

**Un `null` en una celda es un dato faltante, no un error.** El dataset tiene ~2% de
faltantes en casi todas sus columnas y se exponen tal cual; el frontend los dibuja como `—`.

**Un filtro sin coincidencias no es un error.** Devuelve `200` con `rows: []` y
`total_matching: 0`. Un error es que algo salió mal; una búsqueda vacía es un resultado
legítimo.

---

## `GET /api/model`

El **contrato del modelo**: qué espera recibir y qué tan bien predice. Sale entero de
`metadata.json`, el archivo que el notebook exporta junto al pipeline.

Es el endpoint más importante del módulo. De él salen, sin escribir nada a mano: la
validación del backend, el formulario del frontend y la Model Card.

**Respuesta `200`**

```json
{
  "model_version": "1.0.0",
  "task": "clasificacion",
  "algorithm": "XGBClassifier(n_estimators=100, max_depth=2, learning_rate=0.08, min_child_weight=1, subsample=0.8, scale_pos_weight=2)",
  "trained_at": "2026-09-18T01:35:00Z",
  "sklearn_version": "1.5.2",
  "xgboost_version": "2.1.3",
  "artifact_hash": "13b0395daa67",
  "target": "Transported",
  "target_transform": null,
  "classes": [0, 1],
  "class_labels": { "0": "No transportado", "1": "Transportado" },
  "positive_class": 1,
  "class_balance": { "0": 0.4964, "1": 0.5036 },
  "primary_metric": "recall",
  "primary_metric_why": "un falso negativo es un pasajero transportado que el sistema reporta a salvo...",
  "features": [
    { "name": "Age", "type": "num", "min": 0.0, "max": 79.0, "median": 27.0, "label": "Edad" },
    { "name": "HomePlanet", "type": "cat", "allowed": ["Earth", "Europa", "Mars"], "label": "Planeta de origen" },
    { "name": "CryoSleep", "type": "bool", "label": "Viaja en criosueño",
      "help": "en criosueño no se puede consumir nada a bordo" }
  ],
  "example": { "Age": 9.0, "HomePlanet": "Earth", "CryoSleep": false, "...": "..." },
  "splits": { "train": 6954, "test": 1739 },
  "validation_method": "StratifiedKFold(5) sobre el conjunto de entrenamiento",
  "metrics": {
    "validation": { "recall": 0.9020, "f1": 0.8054, "accuracy": 0.7804, "precision": 0.7274, "roc_auc": 0.8773 },
    "test":       { "recall": 0.9030, "f1": 0.8092, "accuracy": 0.7855, "precision": 0.7331, "specificity": 0.6663, "roc_auc": 0.8836 }
  },
  "confusion_matrix": { "labels": [0, 1], "matrix": [[575, 288], [85, 791]] },
  "feature_importances": { "RoomService": 0.1535, "...": 0.0 },
  "derived_importances": { "HasSpent": 0.5321, "CryoSleep": 0.1207, "...": 0.0 },
  "dashboard": { "group_by": "HomePlanet", "value_format": "porcentaje", "form_title": "Datos del pasajero" },
  "model_comparison": [],
  "hyperparameter_experiments": []
}
```

### Los campos, y para qué sirve cada uno

| Campo | Quién lo consume |
|---|---|
| `task` | El servicio: decide si devolver un número o una clase. Sin él se asume `"regresion"` |
| `features` | La validación del backend **y** el formulario del frontend |
| `classes` | El orden de `predict_proba()`. El servicio lo verifica al arrancar |
| `class_labels` | Que la interfaz diga *Transportado* y no *1* |
| `positive_class` | Cuál clase importa, para el recall y para el panel de referencia |
| `class_balance` | La Model Card: con 95/5, un 95% de accuracy no significa nada |
| `primary_metric` | Qué columna de métricas mirar primero. Va marcada con ★ |
| `validation_method` | De dónde sale la fila `validation`. Sin esto parecería un conjunto apartado |
| `confusion_matrix` | Qué tipo de error comete, que es distinto de cuánto se equivoca |
| `feature_importances` | La explicación y el historial, en vocabulario del formulario |
| `derived_importances` | La Model Card: qué columnas usa el modelo de verdad |
| `dashboard` | Contra qué comparar una predicción y cómo escribir los números |
| `label`, `help` | El nombre y la ayuda de cada campo del formulario |
| `example` | Un caso válido de partida, para no llenar trece campos a mano |

### Tipos de feature

| `type` | Declara | El formulario dibuja |
|---|---|---|
| `num` | `min`, `max`, `median` | Un campo numérico con su rango de ayuda |
| `cat` | `allowed` | Un desplegable con esos valores |
| `bool` | — | Un desplegable **Sí / No** |

Todas declaran además `label` —cómo se llama en pantalla— y opcionalmente `help`. Van en el
contrato y no en el código del formulario por la misma razón que las features: si estuvieran
en el frontend, cambiar de modelo obligaría a editar una vista para que dejara de decir
`Cabin_Num`.

`example` es el mismo input de `example.json` contra el que corre la prueba de paridad, así
que es el único caso del que se puede afirmar que el notebook y el servicio coinciden.

Un booleano se pide con un desplegable y no con una casilla: una casilla no distingue *falso*
de *no contestado*, y el contrato exige las dos opciones explícitas.

### Por qué las clases son `0` y `1` y no `false` y `true`

Porque el estimador es XGBoost, y **XGBoost no conserva las etiquetas**. Exige clases
`0..n-1` y rechaza cualquier otra cosa:

```
ValueError: Invalid classes inferred from unique values of `y`.
            Expected: [0 1], got ['No transportado' 'Transportado']
```

Con un estimador de scikit-learn, entrenar con booleanos devuelve booleanos. Aquí no, así que
el nombre legible viaja aparte en `class_labels`.

**Y el orden de `classes` importa más de lo que parece.** `predict_proba()` devuelve una fila
de números sin nombres; lo único que dice a qué clase corresponde cada columna es ese orden.
Si el contrato lo declarara al revés, el servicio respondería `200` con la confianza de la
clase equivocada y **nada fallaría**. Por eso el servicio compara `classes` contra
`pipeline.classes_` al arrancar, y la prueba de paridad lo comprueba.

### `feature_importances` y `derived_importances`

Dos vistas del mismo modelo, y hacen falta las dos.

`feature_importances` habla el **vocabulario del formulario**: devuelve el peso de cada
columna derivada a las features que la originan, para que la explicación y el historial
puedan nombrar campos que el usuario reconoce.

`derived_importances` dice **qué columnas usa el modelo**, sin repartir. Hace falta porque la
otra vista puede esconder lo importante: en este modelo `HasSpent` —una sola columna
derivada— es el **53%** del total. Repartirlo entre las cinco cuentas de consumo hace que la
tabla diga *"RoomService, 15%"* cuando lo que el modelo usa es *"gastó algo o no"*.

---

## `POST /api/predict`

**Cuerpo:** un objeto con **todas** las features de `/api/model`, con sus nombres exactos.

```json
{
  "Age": 24.0, "RoomService": 0.0, "FoodCourt": 0.0, "ShoppingMall": 0.0,
  "Spa": 0.0, "VRDeck": 0.0, "Cabin_Num": 82.0, "GroupSize": 6.0,
  "HomePlanet": "Earth", "Destination": "TRAPPIST-1e",
  "Cabin_Deck": "E", "Cabin_Side": "P", "CryoSleep": false
}
```

Una feature `bool` acepta `true`, `"true"`, `1`, `"1"`, `"si"` y sus contrarios. Las tres
formas quieren decir lo mismo y rechazar dos de ellas sería un mal producto.

**Respuesta `200`**

```json
{
  "prediction": 1,
  "prediction_label": "Transportado",
  "probabilities": [
    { "class": 0, "label": "No transportado", "probability": 0.2903 },
    { "class": 1, "label": "Transportado",    "probability": 0.7097 }
  ],
  "confidence": 0.7097,
  "prediction_id": "680126c2-852f-43b4-a27d-a691a2258de7",
  "model_version": "1.0.0",
  "task": "clasificacion",
  "warnings": []
}
```

`prediction_id` identifica esa predicción para siempre: es la llave con la que el historial la
vuelve a encontrar.

**`probabilities` es una lista, no un diccionario `{clase: probabilidad}`.** Las claves de un
objeto JSON son texto, y `str(True)` en Python es `"True"` mientras que `String(true)` en
JavaScript es `"true"`: el frontend no podría volver a encontrar la clase que ganó. Una lista
conserva el tipo nativo **y** conserva el orden.

Un clasificador sin `predict_proba` —un `SVC` sin `probability=True`— sigue funcionando:
devuelve la etiqueta, `probabilities: []` y `confidence: null`.

**Un valor fuera de rango NO es un error.** Devuelve `200` con aviso:

```json
{
  "prediction": 1,
  "warnings": ["'Age' = 200 esta fuera del rango visto al entrenar (0 a 79); la prediccion es menos confiable"]
}
```

El modelo puede predecir; lo que no puede es garantizar. Rechazarlo sería mentir en la otra
dirección.

**Respuesta `400`** — falta un campo, el tipo no corresponde, o la categoría no existe:

```json
{ "error": "'HomePlanet' no acepta el valor 'Neptuno'. Valores validos: Earth, Europa, Mars" }
```

El mensaje nombra **el campo** y, cuando aplica, los valores válidos. Está escrito para que
llegue tal cual a la pantalla del usuario.

**Respuesta `500`** — genérica a propósito. El detalle va al log del servidor, no al cliente.

---

## `GET /api/history`

Lo que la aplicación ha predicho. **No** es el dataset de entrenamiento: es el uso real del
producto.

**Parámetros**

| Nombre  | Tipo | Obligatorio | Por defecto | Notas                  |
| ------- | ---- | ----------- | ----------- | ---------------------- |
| `limit` | int  | no          | `50`        | Se acota entre 1 y 500 |

Un `limit` fuera de rango no es un error: se acota en silencio. El cliente nunca puede pedir
"todo".

**Respuesta `200`**

```json
{
  "count": 2,
  "rows": [
    {
      "prediction_id": "bfe04608-8142-4c00-86ce-481f6ab200ed",
      "created_at": "2026-09-18T01:50:07Z",
      "model_version": "1.0.0",
      "prediction": 1,
      "input": { "Age": 24.0, "HomePlanet": "Earth", "...": "..." }
    }
  ]
}
```

Más reciente primero. `input` trae la entrada **completa** con la que se hizo esa predicción:
es lo que permite, después, comparar lo que el modelo está viendo contra lo que vio al
entrenar.

`created_at` es siempre UTC en formato ISO-8601, puesto por el servidor. Nunca por el cliente.

**`prediction` conserva el tipo con el que salió de `/api/predict`.** Se guarda como JSON en
una columna de texto: un modelo de regresión predice un número y uno de clasificación una
etiqueta, y una columna `REAL` convertiría `1` en `1.0` sin avisar. Una base creada antes de
este cambio se migra sola al arrancar.

---

## `POST /api/explain`

Traduce una predicción a una frase. **No la recalcula.**

**Cuerpo**

```json
{
  "input": { "Age": 24.0, "HomePlanet": "Earth", "...": "..." },
  "prediction": 1
}
```

Recibir la predicción en lugar de volver a calcularla no es un ahorro: es lo que garantiza que
la explicación hable del mismo resultado que el usuario tiene en pantalla.

`prediction` no tiene que ser un número: puede ser una etiqueta.

**Respuesta `200`**

```json
{
  "explanation": "El modelo clasifica este caso como Transportado. Lo que mas pesa en esa decision es CryoSleep si; HomePlanet = Europa; Cabin_Deck = E.",
  "source": "plantilla"
}
```

La frase se arma con las features de mayor importancia **que distinguen a este caso**. Una
feature en la que el caso es igual a la mediana del entrenamiento no explica nada: en este
dataset la mediana de casi todas las cuentas de consumo es `0`, así que quedarse con las tres
primeras produciría *"RoomService en lo habitual (0); Spa en lo habitual (0)…"*, que ocupa
espacio y no dice nada.

`source` dice quién redactó. Hoy siempre `"plantilla"`. Está en el contrato desde el principio
para que cambiarlo por un modelo de lenguaje —ver
[curso/extras/gemini-explain.md](curso/extras/gemini-explain.md)— no rompa a ningún consumidor.

**Respuesta `400`**

```json
{ "error": "se esperaba {input: {...}, prediction: <numero o etiqueta>}" }
```

---

## `POST /api/similar`

Busca casos parecidos dentro del conjunto de entrenamiento para dar contexto a una
predicción. No genera ni registra otra predicción.

**Cuerpo**

```json
{
  "input": { "Age": 24.0, "HomePlanet": "Earth", "...": "..." },
  "limit": 12
}
```

`input` obedece el mismo contrato que `/api/predict`. `limit` es opcional y se acota entre
3 y 30.

La distancia mezcla variables numéricas y categóricas y pondera cada una con
`feature_importances`. Los valores faltantes del dataset no penalizan la similitud: se
omiten del denominador de esa fila.

**Respuesta `200`**

```json
{
  "count": 12,
  "average_similarity": 0.9973,
  "weighted_by": "feature_importances",
  "target": {
    "kind": "categorico",
    "positive_class": 1,
    "positive_label": "Transportado",
    "positive_rate": 0.4167
  },
  "neighbors": [
    { "similarity": 0.9998, "outcome": 1, "outcome_label": "Transportado" }
  ],
  "warnings": []
}
```

Los resultados de los vecinos son observaciones reales, no predicciones. La similitud es
contexto descriptivo y **no implica causalidad**.

Una entrada inválida devuelve el mismo `400` legible que `/api/predict`.

---

## El artefacto

`/api/model` y `/api/predict` se sirven de una carpeta, no de un archivo:

```
artifacts/
├── pipeline.joblib     el Pipeline COMPLETO: derivación + preprocesamiento + clasificador
├── derivadas.py        el módulo con las columnas derivadas
├── metadata.json       este contrato, en texto legible
└── example.json        un input válido, su clase y sus probabilidades
```

**`derivadas.py` viaja con el artefacto y no es opcional.** `joblib` no serializa el código de
una función: guarda una referencia con su nombre (`derivadas.derivar`). Si el pipeline lleva
un `FunctionTransformer` y ese módulo no se puede importar al cargarlo, joblib falla con
`No module named 'derivadas'`. El servicio pone `MODEL_PATH` en `sys.path` antes de
deserializar.

De ahí sale una regla dura: **toda la derivación es por fila.** Ni un `groupby`. Tiene que dar
el mismo resultado con 8 693 filas al entrenar que con una sola al servir.

El servicio **no** imputa, no escala, no codifica y no deriva. Si tuviera que hacerlo, la
exportación estaría mal hecha — y `tests/test_paridad.py` lo comprueba buscando esos nombres
en el código del backend.

---

## Convenciones

- Todas las rutas viven bajo `/api/`. Lo que no empieza con `/api/` es frontend.
- Los nombres de campos van en inglés, igual que las columnas del dataset.
- Los códigos de estado significan lo de siempre: `200` salió bien, `400` el cliente mandó
  algo inválido, `500` el servidor falló. Un `500` nunca expone el detalle interno al cliente.
- Nada del dominio se escribe a mano en el frontend. Si una vista nombra una columna, es un
  error: el nombre tiene que venir del contrato.
