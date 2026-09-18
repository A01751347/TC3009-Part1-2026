# El contrato, para clasificación

Complemento de [api-contrato.md](api-contrato.md). Ese documento describe el contrato con el
modelo de precios de vivienda; este describe **qué se agregó para que el mismo servicio
sirva un clasificador**, sin bifurcar el código.

La regla del módulo no cambia: **si el contrato no está escrito, no se escribe código.**

> Este archivo **no** es del curso, así que `./setup/run actualizar N` no lo toca. Los que sí
> son del curso están marcados abajo.

---

## La idea en una línea

El contrato gana un campo `task`, y **todo lo demás se deriva de él**.

```
metadata.json
  "task": "regresion"      ──▶  /api/predict devuelve un número
  "task": "clasificacion"  ──▶  /api/predict devuelve una clase + probabilidades
```

Un contrato **sin** `task` se asume `"regresion"`. Por eso el modelo de casas sigue
funcionando sin que su `metadata.json` cambie ni un byte.

---

## Campos nuevos en `metadata.json`

| Campo | Obligatorio | Para qué |
|---|---|---|
| `task` | no (`"regresion"`) | `"regresion"` o `"clasificacion"` |
| `classes` | sí, si clasificas | Las clases **en el orden de `pipeline.classes_`** |
| `class_labels` | recomendado | `{"0": "No transportado", "1": "Transportado"}` |
| `positive_class` | recomendado | Cuál clase es "la que importa" |
| `class_balance` | opcional | `{"0": 0.4963, "1": 0.5037}` — lo pinta la Model Card |
| `confusion_matrix` | opcional | `{"labels": [...], "matrix": [[...], [...]]}` |
| `primary_metric` | opcional | La métrica de decisión, y `primary_metric_why` |
| `dashboard` | opcional | Cómo presentarlo (ver abajo) |

### `classes` y por qué el servicio lo verifica al arrancar

`predict_proba()` devuelve una fila de números **sin nombres**. Lo único que dice a qué clase
corresponde cada columna es el orden de `classes_`.

Si el contrato las declarara al revés, el servicio respondería `200` con la confianza de la
clase equivocada y **nada fallaría**. Por eso `s2_modelo.py` compara las dos fuentes al
cargar el artefacto y avisa en los registros si no coinciden, usando siempre las del pipeline.

`tests/test_paridad_modelo.py` lo comprueba también.

### `dashboard` — cómo se presenta

```json
"dashboard": {
  "group_by": "HomePlanet",
  "value_format": "porcentaje",
  "form_title": "Datos del pasajero"
}
```

| Clave | Qué hace |
|---|---|
| `group_by` | Contra qué compara una predicción la vista *Predecir*. Tiene que ser una feature del contrato |
| `value_format` | `"moneda"`, `"porcentaje"` o nada. Cómo se escriben los números |
| `form_title` | El título del formulario |

Sin `dashboard`, el panel de referencia simplemente no aparece. Es preferible a inventar una
columna que quizá no existe.

---

## Tipo de feature `bool`

Además de `num` y `cat`, una feature puede declararse booleana:

```json
{ "name": "CryoSleep", "type": "bool" }
```

- El formulario la dibuja como un `select` **Sí / No** (no un checkbox: un checkbox no
  distingue "falso" de "no contestado", y el contrato exige las dos opciones explícitas).
- El servicio acepta `true`, `"true"`, `1`, `"1"`, `"si"` y sus contrarios, y los normaliza a
  un booleano de Python antes de pasárselos al pipeline.
- Un valor que no es ninguno de esos es `400`, con el nombre del campo.

---

## `POST /api/predict` cuando `task` es `"clasificacion"`

**Respuesta `200`**

```json
{
  "prediction": 1,
  "prediction_label": "Transportado",
  "probabilities": [
    { "class": 0, "label": "No transportado", "probability": 0.3924 },
    { "class": 1, "label": "Transportado",    "probability": 0.6076 }
  ],
  "confidence": 0.6076,
  "prediction_id": "680126c2-852f-43b4-a27d-a691a2258de7",
  "model_version": "1.0.0",
  "task": "clasificacion",
  "warnings": []
}
```

**`probabilities` es una lista, no un diccionario `{clase: probabilidad}`.** No es
un capricho: las claves de un objeto JSON son texto, y `str(True)` en Python es `"True"`
mientras que `String(true)` en JavaScript es `"true"`. El frontend no podría volver a
encontrar la clase que ganó. Una lista conserva el tipo nativo **y** conserva el orden.

Un clasificador sin `predict_proba` —un `SVC` sin `probability=True`— sigue funcionando:
devuelve la etiqueta, `probabilities: []` y `confidence: null`.

El resto del contrato no cambia: `400` para entrada inválida nombrando el campo, `200` con
`warnings` para un numérico fuera del rango de entrenamiento, `500` genérico.

---

## `GET /api/stats` — la forma genérica

El tablero dejó de hablar de colonias y precios. La respuesta ahora es la misma para los dos
problemas:

```json
{
  "count": 8693,
  "scope": "Europa",
  "dataset": "Spaceship Titanic",
  "group_by": "HomePlanet",
  "secondary_by": "Cabin_Deck",
  "value_format": "porcentaje",
  "labels": { "group": "Planeta de origen", "secondary": "Cubierta de la cabina",
              "value": "Tasa de transportados", "registro": "pasajeros" },
  "target": {
    "name": "Transported",
    "kind": "categorico",
    "distribution": [
      { "class": true, "label": "Transportado", "count": 4378, "share": 0.5037 }
    ],
    "positive_class": true,
    "positive_rate": 0.5037
  },
  "by_group":     [ { "group": "Europa", "count": 2131, "value": 0.6588 } ],
  "by_secondary": [ { "group": "B", "count": 779, "value": 0.7343 } ]
}
```

- `target.kind` es `"numerico"` (con `min`/`mean`/`median`/`max`) o `"categorico"` (con
  `distribution`/`positive_class`/`positive_rate`).
- `value` en `by_group` y `by_secondary` es el promedio del target si es numérico, o la tasa
  de la clase positiva si es categórico. **Es el mismo eje vertical en los dos casos**, y por
  eso la misma gráfica sirve para los dos.
- El parámetro se llama `scope`. `neighborhood` se sigue aceptando por compatibilidad.
- `by_group` se mantiene **global** aunque haya `scope`, igual que antes: es el eje de
  comparación, y reducirlo a una barra lo dejaría sin sentido.

`GET /api/data` gana `columns` y `target`, para que la tabla del tablero no tenga columnas
escritas a mano.

---

## Qué dataset se sirve lo decide el CSV

`backend/s1_tablero.py` tiene arriba una tabla `DATASETS` con una entrada por problema, y
elige la que corresponda **por la columna target que trae `data/train.csv`**:

```python
DATASETS = {
    "spaceship": { "target": "Transported", "target_kind": "categorico", ... },
    "casas":     { "target": "SalePrice",   "target_kind": "numerico",   ... },
}
```

No se usa una variable de entorno a propósito: eso permitiría arrancar con la configuración
equivocada. El CSV es el que sabe qué dataset es. Si no coincide con ninguno, el servicio
falla al arrancar diciendo qué columnas buscó.

Cambiar de dataset es **cambiar datos y una entrada de esa tabla**, no reescribir el módulo.

---

## `artifacts/derivadas.py` — el archivo nuevo del artefacto

El artefacto de casas eran tres archivos. El de clasificación son **cuatro**.

`joblib` no serializa el código de una función: guarda una referencia con su nombre
(`derivadas.derivar`). Si el pipeline lleva un `FunctionTransformer` y ese módulo no se puede
importar al cargarlo, joblib falla con `No module named 'derivadas'`.

```
notebook  ──escribe──▶  artifacts/derivadas.py
                        artifacts/pipeline.joblib   (referencia 'derivadas.derivar')
                                    │
servicio  ──sys.path.insert(MODEL_PATH)──▶  joblib.load()  ✓
```

Dos consecuencias que conviene tener presentes:

1. **Toda la derivación es por fila.** Ni un `groupby`. Tiene que dar lo mismo con 8 693 filas
   al entrenar que con una sola al servir.
2. **Si cambias `derivar()`, hay que volver a exportar el pipeline.** El `artifact_hash` es lo
   que te deja notarlo.

El test de paridad comprueba que, si el pipeline referencia el módulo, el archivo viaje.

---

## Las pruebas

| Archivo | Del curso | Qué mide |
|---|---|---|
| `tests/test_paridad.py` | sí | Paridad, solo regresión |
| `tests/test_registro.py` | sí | Registro, con el dataset de casas escrito a mano |
| `tests/test_paridad_modelo.py` | **no** | Paridad para los dos problemas: clase **y** probabilidades |
| `tests/test_registro_modelo.py` | **no** | Registro, derivando el caso inválido del contrato |

Los dos últimos son los que sirven para el reto. `./setup/run test` corre todos los
`tests/test_*.py`, así que se recogen solos:

```bash
./setup/run test paridad_modelo
./setup/run test registro_modelo
```

Los dos del curso se quedan por si vuelves al modelo de casas; con un clasificador,
`test_registro.py` falla porque manda `Neighborhood="Polanco"` para provocar un `400` y esa
clave ya no existe en el contrato.

---

## Archivos del curso que se tocaron

`./setup/run actualizar N` los sobreescribe con la versión del curso. Si después de
actualizar algo deja de funcionar, empieza por aquí:

| Archivo | Qué se le agregó | Si se pierde |
|---|---|---|
| `backend/requirements.txt` | `xgboost==2.1.3` | El servicio no arranca: `No module named 'xgboost'` |

Todo lo demás vive en archivos `[TUYOS]` o en archivos nuevos, y sobrevive.
