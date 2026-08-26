# Contrato de la API

Este documento se escribe **antes** que el código. Define qué recibe y qué devuelve cada
endpoint. El backend implementa este contrato y el frontend lo consume; ninguno de los dos
adivina.

La regla del módulo: **si el contrato no está escrito, no se escribe código.**

Base de desarrollo: `http://localhost:5001`

> **Por qué el puerto 5001 y no el 5000.** En macOS, el puerto 5000 lo ocupa el receptor de
> AirPlay. Si usas 5000 vas a ver respuestas `403` que no vienen de tu aplicación y vas a
> perder veinte minutos buscando el error en tu código.

---

## Sesión 1

### `GET /api/health`

Estado del servicio. Es el primer endpoint que se escribe y el último que se consulta cuando
algo falla.

```json
{
  "status": "ok",
  "api_version": "1.0.0"
}
```

> Este endpoint **crece en la sesión 2**: cuando exista el artefacto del modelo, la respuesta
> incorpora `model_version`, `sklearn_version` y `artifact_hash`. Hoy no hay modelo, así que
> no hay nada que reportar sobre él.

---

### `GET /api/stats`

Agregados del dataset. Alimenta las gráficas del tablero.

**Parámetros**

| Nombre         | Tipo   | Obligatorio | Descripción                          |
| -------------- | ------ | ----------- | ------------------------------------ |
| `neighborhood` | string | no          | Acota los agregados a esa colonia    |

**Respuesta**

```json
{
  "count": 1460,
  "scope": null,
  "target": {
    "name": "SalePrice",
    "min": 34900,
    "mean": 180921.2,
    "median": 163000,
    "max": 755000
  },
  "by_neighborhood": [
    { "neighborhood": "NoRidge", "count": 41, "mean_price": 335295.3 }
  ],
  "by_overall_qual": [
    { "overall_qual": 5, "count": 397, "mean_price": 133523.3 }
  ]
}
```

`scope` es la colonia aplicada, o `null` si no hay filtro.

`by_neighborhood` viene ordenado por precio medio descendente.
`by_overall_qual` viene ordenado por calidad ascendente.

**Qué se filtra y qué no.** Cuando llega `neighborhood`, se acotan `count`, `target` y
`by_overall_qual`. **`by_neighborhood` se mantiene global a propósito**: es el eje de
comparación del tablero, y reducirlo a una sola barra lo dejaría sin sentido. El frontend
resalta la colonia seleccionada en lugar de esconder las demás.

Es una decisión de producto, no un descuido: filtrar no siempre significa ocultar.

Si la colonia no existe, la respuesta es `200` con `count: 0`, `target: null` y
`by_overall_qual: []`.

---

### `GET /api/data`

Registros individuales, con filtro opcional.

**Parámetros**

| Nombre         | Tipo   | Obligatorio | Por defecto | Descripción                        |
| -------------- | ------ | ----------- | ----------- | ---------------------------------- |
| `neighborhood` | string | no          | —           | Filtra por colonia (coincide exacto)|
| `limit`        | entero | no          | `20`        | Máximo de filas. Entre 1 y 200      |

**Respuesta**

```json
{
  "count": 20,
  "total_matching": 225,
  "rows": [
    {
      "Id": 1,
      "Neighborhood": "CollgCr",
      "GrLivArea": 1710,
      "OverallQual": 7,
      "YearBuilt": 2003,
      "TotalBsmtSF": 856,
      "GarageCars": 2,
      "FullBath": 2,
      "BedroomAbvGr": 3,
      "LotArea": 8450,
      "KitchenQual": "Gd",
      "SalePrice": 208500
    }
  ]
}
```

`count` es cuántas filas vienen en esta respuesta. `total_matching` es cuántas cumplen el
filtro en total. No son lo mismo, y la diferencia importa para paginar.

**Un filtro sin coincidencias no es un error.** Devuelve `200` con `rows: []` y
`total_matching: 0`. Un error es que algo salió mal; una búsqueda vacía es un resultado
legítimo.

Las columnas expuestas son las diez features que va a usar el modelo en la sesión 2, más
`Id` y `SalePrice`. No es casualidad: el tablero y el predictor hablan del mismo vocabulario.

---

## Sesiones siguientes

Estos endpoints se agregan más adelante y se documentan aquí cuando toque.

| Endpoint            | Sesión | Qué hace                                      |
| ------------------- | ------ | --------------------------------------------- |
| `POST /api/predict` | 2      | Recibe una casa, devuelve un precio estimado   |
| `GET /api/history`  | 3      | Predicciones que la aplicación ha producido    |
| `POST /api/explain` | 3      | Explica una predicción en lenguaje natural     |

---

## Convenciones

- Todas las rutas viven bajo `/api/`. Lo que no empieza con `/api/` es frontend.
- Los nombres de campos van en inglés, igual que las columnas del dataset.
- Los códigos de estado significan lo de siempre: `200` salió bien, `400` el cliente mandó
  algo inválido, `500` el servidor falló. Un `500` nunca expone el detalle interno al cliente.
