# Sesión 3 — El producto

**Dos horas.** Hoy sale del `curl`.

Al terminar la sesión 2 tenías un modelo que responde bien a `/api/predict` — pero solo si
sabes escribir JSON en una terminal. Eso no es un producto, es un endpoint. Hoy alguien que
no sabe qué es un endpoint va a poder usar tu modelo, ver qué predijo, y entender por qué.

La mayor parte de la sesión es **frontend**, y el modelo no se toca: el artefacto que
exportaste en la sesión 2 es exactamente el mismo al terminar hoy.

```
   0:00  qué le falta a esto para ser un producto        8 min
   0:08  traer el material de la sesión                  7 min
   0:15  el backend: memoria y palabras                 35 min
   0:50  la costura: lo que le falta a api.js            8 min
   0:58  el ensamblador del frontend                     7 min
   1:05  el formulario que sale del contrato            30 min
   1:35  el historial                                   12 min
   1:47  la prueba que importa                           8 min
   1:55  cierre                                          5 min
```

---

## Antes de empezar: ¿no estuviste en la sesión 2?

**En la instancia:**

```bash
./setup/run recuperar 2 --si
./setup/run start
```

Eso te deja con las sesiones 1 y 2 completas. Pero **falta tu artefacto**: el curso no
manda `artifacts/pipeline.joblib`, porque cada quien genera el suyo (si el curso enviara
uno, chocaría con el tuyo en cada `git pull`).

Corre el notebook de la sesión 2 en Colab —[notebooks/01-entrenar-y-exportar.ipynb](../notebooks/01-entrenar-y-exportar.ipynb)—,
descarga el zip y descomprímelo en `artifacts/`. Son unos 10 minutos y se pueden hacer en
paralelo mientras sigues esta guía: el backend de hoy no arranca sin artefacto, así que
hazlo antes de llegar a la marca de los 15 minutos.

Después, `git push --force` desde tu computadora para que tu fork quede igual.

---

## 0:00 — Qué le falta a esto para ser un producto (8 min)

Tu API de la sesión 2 sabe predecir. Preguntas que **no** sabe contestar:

| Pregunta | ¿Por qué importa? |
|---|---|
| ¿Cuántas predicciones llevas hoy? | Sin esto no sabes si alguien lo está usando |
| ¿Qué predijiste la semana pasada? | Sin esto no puedes auditar una decisión |
| ¿Los datos que te llegan se parecen a los del entrenamiento? | Sin esto no detectas que el modelo se está quedando viejo |
| ¿Por qué este precio y no otro? | Sin esto nadie va a confiar en el número |

Las cuatro se contestan con **dos cosas que el servicio todavía no tiene**:

```
   MEMORIA    cada predicción queda registrada, y se puede consultar
   PALABRAS   la predicción se explica, no solo se entrega
```

Ninguna de las dos cambia el modelo. Las dos cambian el producto.

Y encima va lo de hoy que más se nota: **una interfaz**. Un formulario para pedir el precio,
una tabla con lo que se ha predicho, y una ficha del modelo.

### Una regla que no se rompe hoy

> El modelo **decide** el número.
> Todo lo que construyas hoy lo **presenta**.
> Nada de lo de hoy lo **cambia**.

Suena obvio y se rompe todo el tiempo: un redondeo en el frontend, un "si sale negativo pon
cero", una explicación que recalcula por su cuenta. En cuanto la capa de presentación
empieza a decidir, ya tienes dos modelos y solo mediste uno.

### Dónde cae esto en la rúbrica de tu reto

El renglón que dice **"genera una interfaz"** es literalmente esta sesión. Pero hay más: la
Model Card que vas a tener al final es la **superficie de evidencia** de casi todos los demás
renglones —qué modelo elegiste, cómo separaste los datos, qué métricas usaste, qué features
pesan— y está hecha de manera que se llena sola desde `metadata.json`. Cuando cambies al
modelo de clasificación de tu reto, la página se actualiza sin que toques el frontend.

---

## 0:08 — Traer el material de la sesión (7 min)

**En la instancia:**

```bash
cd ~/TC3009-Part1-2026
git add -A && git commit -m "cierre de la sesión 2"
./setup/run actualizar 3
```

Lo que llega:

```
    nuevo        backend/s3_producto.py              el módulo de hoy, con 4 TODO
    nuevo        frontend/src/vistas/Tablero.jsx     tu tablero, mudado de casa
    nuevo        frontend/src/vistas/Predecir.jsx    el formulario, con 3 TODO
    nuevo        frontend/src/vistas/Historial.jsx   la tabla, con 2 TODO
    nuevo        frontend/src/vistas/ModelCard.jsx   completa, de regalo
    actualizado  frontend/src/main.jsx               ahora es un ensamblador
    conservado   backend/s2_modelo.py  (ya lo tienes)
    conservado   frontend/src/api.js   (ya lo tienes)
```

Fíjate en las dos últimas líneas: **tu código de las sesiones 1 y 2 no se tocó.** Eso no es
casualidad, está declarado en [setup/archivos-del-curso.txt](../setup/archivos-del-curso.txt).

Y fíjate en `main.jsx`, que sí se sobreescribió. Es el único archivo del frontend que cambia,
y cambia porque **nunca lo escribiste tú**: llegó hecho en la sesión 1. Es un ensamblador,
igual que `backend/app.py`. Los ensambladores son del curso; tu código es tuyo.

Si en `frontend/src/` te queda un `App.jsx` de las sesiones anteriores, ya no se usa: su
contenido —el tablero— vive ahora en `frontend/src/vistas/Tablero.jsx`. Puedes borrarlo.

Ahora arranca lo que ya funciona:

```bash
./setup/run start
./setup/run status
```

⚠ **La página va a salir en blanco.** Es lo esperado, y se arregla a la marca de los 50
minutos. Abre la consola del navegador (F12):

```
The requested module '/src/api.js' does not provide an export named 'getHistory'
```

Las vistas nuevas importan funciones de `api.js` que todavía no escribes. Nota que el
mensaje **dice exactamente qué falta y dónde** — no "algo salió mal". Guárdalo: una pantalla
en blanco con la consola cerrada es el error más caro de todo el módulo, porque no tiene
síntoma. Con la consola abierta tiene nombre y apellido.

Mientras tanto, el backend sí responde:

```bash
curl -s http://localhost:8080/api/health
```

```json
{"api_version":"1.0.0","artifact_hash":"6ff94a85591c","model_version":"1.0.0",
 "sklearn_version":"1.5.2","status":"degradado",
 "modulos_con_falla":{"s3_producto":"no such table: predicciones"}}
```

`status` dice `degradado`, no `ok`, y te nombra el módulo roto. El chequeo de salud **no se
cae entero** porque una parte esté a medias: justo cuando algo está mal es cuando necesitas
que te diga *qué* está mal. Eso lo hace `app.py`, y es el tipo de decisión que vale la pena
copiar en tu reto.

Esa tabla que falta es tu primer TODO.

---

## 0:15 — El backend: memoria y palabras (35 min)

Abre [backend/s3_producto.py](../backend/s3_producto.py).

Antes de escribir nada, **lee el archivo completo**. Hay cuatro TODO, pero lo más importante
del archivo ya está escrito, y es esto:

```python
@bp.after_app_request
def registrar_si_fue_prediccion(respuesta):
```

Párate ahí un momento.

### El gancho: agregar sin modificar

Necesitamos que cada llamada a `/api/predict` quede guardada. Pero `/api/predict` lo
escribiste **tú** en la sesión 2, en `s2_modelo.py`, y no queremos volver a abrir ese
archivo: editarlo obligaría a fusionar cambios sobre código que ya es tuyo, y ahí es donde
aparecen los conflictos.

`@bp.after_app_request` deja mirar —y reaccionar a— **cualquier respuesta de la aplicación**,
venga del módulo que venga:

```python
    if request.path != "/api/predict" or respuesta.status_code != 200:
        return respuesta

    try:
        datos = respuesta.get_json()
        registrar(
            datos["prediction_id"],
            datos["model_version"],
            datos["prediction"],
            request.get_json(silent=True) or {},
        )
    except Exception:  # noqa: BLE001
        # Que falle el registro NO debe tumbar una prediccion que ya salio
        # bien. El usuario ya tiene su numero; el log es cosa nuestra.
        current_app.logger.exception("no se pudo registrar la prediccion")

    return respuesta
```

Tres decisiones en doce líneas:

1. **Un 400 no se registra.** Solo hay predicción cuando hubo predicción. Si registraras los
   errores en la misma tabla, cualquier conteo que hagas después estaría mal.
2. **Se guarda la petición, no solo la respuesta.** `request.get_json()` — el input completo.
   Vuelvo a esto en un momento.
3. **Si el registro truena, la predicción sobrevive.** El usuario ya tiene su número. Que tu
   bitácora falle no es razón para devolverle un 500.

La idea —*agregar comportamiento sin modificar lo que ya funciona*— la vas a reencontrar como
middleware, interceptores o decoradores en casi cualquier framework. Es la que quieres copiar
en tu reto.

### `TODO 1` — la tabla

```python
def crear_esquema():
    with conectar() as con:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS predicciones (
                prediction_id TEXT PRIMARY KEY,
                creado_en     TEXT NOT NULL,
                model_version TEXT NOT NULL,
                prediccion    REAL NOT NULL,
                entrada       TEXT NOT NULL
            )
            """
        )
```

`IF NOT EXISTS` la hace idempotente: se llama en cada arranque y no pasa nada.

La columna que importa es la última. **Se guarda el input completo, no solo el resultado.**

Cuesta lo mismo hoy, y es la que hace posible, más adelante, comparar lo que el modelo está
viendo contra lo que vio al entrenar. Eso es detección de *drift*, y sin los inputs no hay
nada que comparar. Es la diferencia entre "el modelo lleva seis meses en producción" y "el
modelo lleva seis meses en producción y sé que sigue sirviendo".

⚠ Nota de producto: registrar entradas crudas tiene implicaciones de datos personales en un
sistema real. Aquí son casas; en tu reto puede que no.

### `TODO 2` — el INSERT

```python
def registrar(prediction_id, model_version, prediccion, entrada):
    with conectar() as con:
        con.execute(
            "INSERT OR REPLACE INTO predicciones VALUES (?, ?, ?, ?, ?)",
            (
                prediction_id,
                datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                model_version,
                float(prediccion),
                json.dumps(entrada, ensure_ascii=False),
            ),
        )
```

Tres detalles:

- **Los `?` no son opcionales.** Armar el SQL con formato de cadena es inyección de SQL, y da
  igual que esto sea un ejercicio: es el hábito lo que se está formando.
- **La hora la pone el servidor, en UTC.** Nunca el cliente: el reloj del cliente puede estar
  en otra zona, mal puesto, o mentir.
- **`entrada` es un diccionario y la columna es TEXT.** `json.dumps` para entrar,
  `json.loads` para salir.

Reinicia y comprueba que la tabla ya existe:

```bash
./setup/run restart
curl -s http://localhost:8080/api/health
```

Ahora `"status":"ok"` y aparece `"predicciones_registradas":0`.

Predice algo y vuelve a mirar:

```bash
curl -s -X POST http://localhost:8080/api/predict \
  -H 'Content-Type: application/json' \
  -d '{"GrLivArea":1144,"OverallQual":5,"YearBuilt":1963,"TotalBsmtSF":1144,
       "GarageCars":1,"FullBath":1,"BedroomAbvGr":3,"LotArea":9204,
       "Neighborhood":"NAmes","KitchenQual":"TA"}'

curl -s http://localhost:8080/api/health
```

`predicciones_registradas` pasó a 1, y **no tocaste `s2_modelo.py`**. Eso es el gancho
funcionando.

Prueba ahora con una entrada inválida y vuelve a contar: sigue en 1.

### `TODO 3` — el historial

```python
@bp.get("/api/history")
def history():
    try:
        limite = int(request.args.get("limit", 50))
    except ValueError:
        limite = 50
    limite = max(1, min(limite, 500))

    with conectar() as con:
        filas = con.execute(
            "SELECT * FROM predicciones ORDER BY creado_en DESC, rowid DESC LIMIT ?",
            (limite,),
        ).fetchall()

    return jsonify(
        {
            "count": len(filas),
            "rows": [
                {
                    "prediction_id": f["prediction_id"],
                    "created_at": f["creado_en"],
                    "model_version": f["model_version"],
                    "prediction": round(f["prediccion"], 2),
                    "input": json.loads(f["entrada"]),
                }
                for f in filas
            ],
        }
    )
```

Dos cosas que no son decoración:

- **`limite` se acota entre 1 y 500.** Nunca dejes que el cliente pida "todo". Hoy son cuatro
  filas; el día que sean cuatro millones, ese `min()` es lo único que separa tu API de un
  servidor caído.
- **El orden desempata con `rowid`.** Dos predicciones en el mismo segundo tienen el mismo
  `creado_en`, y sin el desempate el orden sería arbitrario entre ejecuciones.

Y un detalle de diseño: el historial se llama `/api/history`, no `/api/predictions`. Es lo
que el **producto** muestra, no la tabla que hay debajo. Si mañana el almacenamiento cambia a
PostgreSQL —que es exactamente lo que pasa en la sesión 4— la URL no se entera.

### `TODO 4` — la explicación

```python
def redactar(entrada, prediccion):
    contrato = s2_modelo.contrato
    importancias = contrato.get("feature_importances", {})
    top = [f for f, _ in sorted(importancias.items(), key=lambda kv: -kv[1])[:3]]

    partes = []
    for nombre in top:
        valor = entrada.get(nombre)
        if valor is None:
            continue
        ficha = next((f for f in contrato["features"] if f["name"] == nombre), None)
        if ficha and ficha["type"] == "num" and "median" in ficha:
            mediana = ficha["median"]
            if valor > mediana * 1.15:
                partes.append(f"{nombre} por encima de lo habitual ({valor:g})")
            elif valor < mediana * 0.85:
                partes.append(f"{nombre} por debajo de lo habitual ({valor:g})")
            else:
                partes.append(f"{nombre} en el rango habitual ({valor:g})")
        else:
            partes.append(f"{nombre} = {valor}")

    detalle = "; ".join(partes) if partes else "los datos proporcionados"
    return (
        f"El modelo estima {prediccion:,.0f} para esta casa. "
        f"Lo que mas pesa en esa estimacion es {detalle}."
    )
```

No hay ningún modelo de lenguaje aquí. Es una plantilla, y sale toda del contrato: las tres
features que más pesan, comparadas contra la mediana que `metadata.json` ya traía.

Mira el endpoint que ya está escrito, `/api/explain`. Lo importante es lo que **no** hace:

```python
    entrada = payload.get("input")
    prediccion = payload.get("prediction")
```

**Recibe la predicción. No la recalcula.** Si esta función corriera el modelo por su cuenta,
podría darte 140,637 mientras el usuario está viendo 140,638 en pantalla —por un redondeo, o
porque entre una llamada y otra se recargó otro artefacto— y entonces la explicación
contradice al producto. La regla del principio de la sesión, aplicada.

En [docs/extras/gemini-explain.md](extras/gemini-explain.md) está documentado cómo cambiar
esto por un modelo de lenguaje de verdad. Fíjate en que el cambio es **reemplazar esta sola
función**: el contrato de `/api/explain` no se mueve.

```bash
./setup/run restart
curl -s -X POST http://localhost:8080/api/explain \
  -H 'Content-Type: application/json' \
  -d '{"input":{"OverallQual":5,"GrLivArea":1144,"TotalBsmtSF":1144},"prediction":140637.5}'
```

```json
{"explanation":"El modelo estima 140,638 para esta casa. Lo que mas pesa en esa estimacion
 es OverallQual por debajo de lo habitual (5); GrLivArea por debajo de lo habitual (1144);
 TotalBsmtSF por encima de lo habitual (1144).","source":"plantilla"}
```

Tres features, tres comparaciones contra la mediana del dataset. Nota que `TotalBsmtSF` con
1144 sale "por encima" apenas: la mediana es 991.5 y el umbral está en 15% arriba. Esos
cortes son una decisión tuya, no del modelo — y como son tuyos, se pueden explicar.

El backend está listo. Ahora la parte visible.

---

## 0:50 — La costura: lo que le falta a `api.js` (8 min)

Abre [frontend/src/api.js](../frontend/src/api.js).

Este archivo es **tuyo** desde la sesión 1 — por eso `actualizar 3` lo dejó intacto, y por eso
hoy no te llega ningún esqueleto que llenar: le vas a **agregar** un bloque al final, debajo
de `getData`.

En la sesión 1 fue **la costura**: el único lugar del frontend que sabe que existe un backend.
Sigue siéndolo, y hoy le faltan cuatro cosas. Dos de ellas son POST, y hasta ahora solo sabe
hacer GET.

### `TODO 5` — el helper y las cuatro funciones

Pega esto al final del archivo:

```javascript
// --- Sesion 3 ---

async function post(path, cuerpo) {
  const respuesta = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    // El backend dice QUE campo esta mal. Ese mensaje es para el usuario,
    // asi que se propaga tal cual en lugar de un "error 400" generico.
    throw new Error(datos.error || `${respuesta.status} al pedir ${path}`);
  }
  return datos;
}

export const getModel = () => get("/api/model");
export const predecir = (entrada) => post("/api/predict", entrada);
export const explicar = (entrada, prediccion) =>
  post("/api/explain", { input: entrada, prediction: prediccion });
export const getHistory = (limit = 50) => get("/api/history", { limit });
```

El detalle que vale la sesión es el `if (!respuesta.ok)`.

En la sesión 2 te tomaste el trabajo de que `/api/predict` dijera *qué* campo está mal:

```
'Neighborhood' no acepta el valor 'Polanco'. Valores validos: Blmngtn, Blueste, ...
```

Ese mensaje está escrito para un humano. Si aquí lo tiraras y lanzaras un `Error("400")`
genérico, todo ese trabajo se pierde exactamente en el punto donde iba a servir. Por eso se
propaga tal cual, y por eso el `.catch(() => ({}))`: si el backend se cayó de verdad y no
devolvió JSON, `datos` queda vacío y cae al mensaje genérico en lugar de reventar.

Guarda. **La página ya no está en blanco.**

---

## 0:58 — El ensamblador del frontend (7 min)

Abre [frontend/src/main.jsx](../frontend/src/main.jsx). Es corto, y no lo vas a editar hoy ni
nunca.

```javascript
const modulos = import.meta.glob("./vistas/*.jsx", { eager: true });

const vistas = Object.values(modulos)
  .filter((m) => m.default && m.meta)
  .map((m) => ({ Componente: m.default, ...m.meta }))
  .sort((a, b) => a.orden - b.orden);
```

Compáralo con lo que ya conoces de `backend/app.py`:

| | backend | frontend |
|---|---|---|
| descubre | `AQUI.glob("s[0-9]_*.py")` | `import.meta.glob("./vistas/*.jsx")` |
| requisito | el módulo expone `bp` | el archivo exporta `default` y `meta` |
| resultado | rutas registradas solas | pestañas, ordenadas por `meta.orden` |

Es el **mismo patrón**, y por la misma razón: cuando llega el material de una sesión nueva son
**archivos nuevos**. Nunca hay que fusionar cambios sobre lo que ya escribiste.

Mira el encabezado de cualquier vista:

```javascript
export const meta = { titulo: "Predecir", orden: 2 };
```

Eso es todo lo que hace falta para que aparezca una pestaña. Agregar una vista en tu reto es
agregar un archivo con esas dos exportaciones — ni registrarla, ni tocar un router, ni
enterar a nadie.

Y nota dónde quedó tu tablero de la sesión 1: en `frontend/src/vistas/Tablero.jsx`, el mismo
código, con tres cambios. Ábrelo y compáralo con lo que tenías:

- gana `export const meta`
- importa de `"../api.js"` en vez de `"./api.js"` — bajó un nivel de carpeta
- soltó el `<div className="page">` y el `<header>`, que ahora son del ensamblador

**Una vista no sabe dónde vive.** No pinta el marco, no pinta el título, no sabe que hay
pestañas. Solo su contenido. Por eso se pudo mudar sin reescribirla.

Abre `http://TU-IP:3000`. Cuatro pestañas. Dos funcionan, dos son tu trabajo de hoy.

---

## 1:05 — El formulario que sale del contrato (30 min)

Abre [frontend/src/vistas/Predecir.jsx](../frontend/src/vistas/Predecir.jsx).

Aquí está la idea central de la sesión, y es la que más se lleva a tu reto:

> El formulario **no tiene una lista de campos escrita a mano.**
> Se construye con lo que dice `/api/model`.

Si escribieras los diez campos a mano, el día que tu modelo gane una feature tienes que
acordarte de venir aquí. Y no te vas a acordar. Lo que va a pasar es que el formulario
mandará nueve campos, el backend responderá `falta la feature 'X'`, y vas a perder media hora
buscándolo en el lugar equivocado.

### `TODO 6` — leer el contrato al montar

```javascript
  useEffect(() => {
    getModel()
      .then((c) => {
        setContrato(c);
        const iniciales = {};
        for (const f of c.features) {
          iniciales[f.name] = f.type === "num" ? f.median : f.allowed[0];
        }
        setValores(iniciales);
      })
      .catch((e) => setError(`No se pudo leer el contrato del modelo: ${e.message}`));
  }, []);
```

Los valores iniciales salen del contrato: la **mediana** si la feature es numérica, el primer
valor permitido si es categórica. El formulario abre con una casa plausible, no con diez
campos vacíos — y eso no lo decidiste tú, lo decidió el dataset.

### `TODO 7` — enviar

```javascript
  async function enviar(evento) {
    evento.preventDefault();
    if (enviando) return; // sin envios duplicados mientras hay uno en curso

    setEnviando(true);
    setError(null);
    setResultado(null);
    setExplicacion(null);
    setReferencia(null);

    try {
      const r = await predecir(valores);
      setResultado(r);

      // Las dos peticiones de contexto van DESPUES y por separado: si
      // cualquiera falla, el usuario se queda con su precio igual.
      explicar(valores, r.prediction)
        .then((e) => setExplicacion(e.explanation))
        .catch(() => setExplicacion(null));

      // Un precio solo no dice nada. Al lado del promedio de su colonia --que
      // es el mismo /api/stats de la sesion 1-- ya es una decision.
      getStats(valores.Neighborhood)
        .then((s) => setReferencia(s))
        .catch(() => setReferencia(null));
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }
```

Fíjate en la última llamada: **`getStats` es de la sesión 1.** No hubo que agregar nada al
backend ni a la costura. Un precio solo no dice nada; el mismo precio al lado del promedio de
su colonia ya es una decisión:

> El promedio en **Blmngtn** es USD 194,871 sobre 17 casas vendidas — esta casa está **9%
> abajo**.

Eso es lo que significa que el módulo de la sesión 1 siga sirviendo: las piezas se combinan,
no se reemplazan.

Cuatro decisiones más, y las cuatro se notan cuando faltan:

- **`preventDefault()`.** Sin esto el navegador recarga la página y pierdes todo. Es el error
  número uno con formularios en React.
- **`if (enviando) return`.** Doble clic = dos predicciones registradas = tu historial
  mintiendo. El botón además se deshabilita, pero el guardia va en la lógica: deshabilitar un
  botón es cosmética, cualquiera puede mandar el submit con Enter.
- **Se limpia el resultado anterior.** Si no, mientras carga la nueva predicción el usuario
  está viendo el precio de la casa pasada. Un número viejo en pantalla es peor que ningún
  número.
- **Los `catch` del contexto no hacen nada.** Es deliberado: si `/api/explain` o `/api/stats`
  fallan, el usuario se queda con su precio igual. Lo secundario no tumba lo principal. Si
  hubieras puesto esos `await` dentro del `try` de arriba, un fallo en la plantilla borraría un
  precio perfectamente bueno.

### `TODO 8` — los campos

```javascript
          <div className="campos">
            {contrato.features.map((f) => (
              <label key={f.name} className="campo">
                <span className="etiqueta-campo">{f.name}</span>

                {f.type === "cat" ? (
                  <select
                    value={valores[f.name] ?? ""}
                    onChange={(e) =>
                      setValores({ ...valores, [f.name]: e.target.value })
                    }
                  >
                    {f.allowed.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    step="any"
                    value={valores[f.name] ?? ""}
                    onChange={(e) =>
                      setValores({ ...valores, [f.name]: e.target.value })
                    }
                  />
                )}

                {f.type === "num" && (
                  <span className="ayuda-campo">
                    entre {f.min.toLocaleString()} y {f.max.toLocaleString()}
                  </span>
                )}
              </label>
            ))}
          </div>
```

Un `.map` sobre `contrato.features`, y de ahí sale todo:

- `f.type === "cat"` → un `<select>` con `f.allowed`. **Es imposible escoger una colonia
  inválida**, porque las opciones son exactamente las que el modelo vio.
- `f.type === "num"` → un `<input type="number">` y debajo `entre f.min y f.max`. El rango se
  muestra pero **no se impone**: puedes escribir 9000 pies cuadrados. Vuelvo a esto al final.

Guarda y prueba. Deberías ver el formulario con diez campos y, al presionar **Estimar
precio**, el número grande con su explicación abajo.

Si algo falla, prueba primero con `curl` el mismo endpoint. Si `curl` funciona y el navegador
no, el problema es CORS o la URL — no tu lógica.

---

## 1:35 — El historial (12 min)

Abre [frontend/src/vistas/Historial.jsx](../frontend/src/vistas/Historial.jsx).

### `TODO 9` — pedir los datos

```javascript
  useEffect(() => {
    getHistory(50).then(setDatos).catch((e) => setError(e.message));
  }, []);
```

Una línea. Es el mismo patrón del tablero de la sesión 1, y a estas alturas debería aburrirte:
eso es exactamente lo que se buscaba.

### `TODO 10` — la tabla

```javascript
        {datos.rows.length === 0 ? (
          <div className="vacio">
            Todavía no hay ninguna. Ve a <strong>Predecir</strong> y estima un
            precio: va a aparecer aquí.
          </div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th className="txt">Cuándo</th>
                  <th className="txt">Colonia</th>
                  <th>Superficie</th>
                  <th>Calidad</th>
                  <th>Estimado</th>
                  <th className="txt">Modelo</th>
                </tr>
              </thead>
              <tbody>
                {datos.rows.map((f) => (
                  <tr key={f.prediction_id}>
                    <td className="txt">{cuando(f.created_at)}</td>
                    <td className="txt">{f.input.Neighborhood}</td>
                    <td>{Number(f.input.GrLivArea).toLocaleString()}</td>
                    <td>{f.input.OverallQual}</td>
                    <td>{pesos(f.prediction)}</td>
                    <td className="txt mono">{f.model_version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
```

El estado vacío no dice "sin datos". **Dice qué hacer.** El usuario que acaba de llegar no
sabe que el historial se llena desde la otra pestaña, y un "sin datos" lo deja mirando una
caja gris. Es media línea de código y es la diferencia entre una pantalla muerta y una que
enseña a usarse.

La columna `model_version` parece de relleno hoy, porque todo dice `1.0.0`. No lo es: el día
que entrenes otra versión, esta columna es la que te deja comparar lo que predecía la vieja
contra lo que predice la nueva **sobre las mismas casas**. Sin ella tienes un montón de
números sin saber quién los dijo.

### Ciérralo

Ve a **Predecir**, estima un precio, y vuelve a **Historial**. Ahí está, hasta arriba.

Ese ciclo —pedir, registrar, consultar— es el producto. Lo demás es presentación.

---

## 1:47 — La prueba que importa (8 min)

Dijimos que el formulario sale del contrato. Vamos a comprobarlo, porque "sale del contrato"
es fácil de decir y fácil de creer sin que sea cierto.

**En la instancia**, edita `artifacts/metadata.json` y busca la entrada de `GrLivArea`. Cambia
su `median` a `3000` y su `max` a `3500`. Luego:

```bash
./setup/run restart
```

Recarga el navegador y mira el formulario. Sin haber tocado **una sola línea de JSX**:

- el campo `GrLivArea` ahora abre en 3000
- la ayuda debajo dice `entre 334 y 3500`

Ahora estima un precio con `GrLivArea` en 4000 y mira la respuesta:

```
⚠ 'GrLivArea' = 4000 esta fuera del rango visto al entrenar (334 a 3500);
  la prediccion es menos confiable
```

La validación que escribiste en la **sesión 2** también salía del contrato. Cambiaste un
archivo de datos y se movieron tres capas a la vez: el formulario, la ayuda y la validación.
Eso es lo que significa que algo esté derivado del contrato, y es exactamente lo que va a
hacer que tu modelo de clasificación entre en este mismo frontend sin reescribirlo.

**Deja `metadata.json` como estaba** — o mejor, vuelve a generar el artefacto en la sesión 4.

### Y de paso, la lección incómoda

Con el `metadata.json` original, pide una predicción para una casa de **9000 pies cuadrados**,
dejando lo demás como viene. Mira el número.

Sale alrededor de **166,000** — *menos* que una casa de 2,600 pies en NoRidge, que da unos
306,000.

No es un bug. Un Random Forest **no extrapola**: nunca vio una casa de 9000 pies, así que la
mete por las ramas que conoce y devuelve un promedio de casas que no se le parecen. Y lo hace
con la misma cara de confianza que cuando acierta.

Por eso existe ese *warning*, y por eso lo muestra la interfaz en vez de tragárselo. Tu modelo
**siempre va a devolver algo**. Que devuelva algo no significa que sepa. En tu reto de
clasificación pasa igual: una probabilidad de 0.97 sobre un caso que no se parece a nada del
entrenamiento sigue siendo 0.97 en pantalla.

---

## 1:55 — Cierre (5 min)

Antes de guardar, corre las pruebas:

```bash
./setup/run test
```

Ahora son dos. La de la sesión 2 sigue comprobando que el notebook y el servicio predicen lo
mismo. La nueva comprueba tres cosas del registro:

```
   12 validas + 5 rechazadas  ->  12 filas en el log

   OK  cada prediccion exitosa dejo exactamente una fila
   OK  cada prediction_id devuelto corresponde a una fila, y solo una
   OK  ninguna peticion rechazada con 400 genero fila
   OK  el historial viene de mas reciente a mas antiguo
   OK  cada fila guarda el input completo (10 campos)
   OK  un limite absurdo se acota en lugar de fallar
```

Son invariantes que **se rompen en silencio**: nada falla, nada avisa, y el día que alguien
audite el historial los números no cuadran. Si un `400` dejara fila, cualquier métrica de uso
estaría inflada. Si una predicción dejara dos, también.

Ese es el tipo de cosa que conviene probar: no la que revienta, la que miente.

Guarda todo:

```bash
git add -A
git commit -m "sesión 3: historial, explicación y las vistas del producto"
git push
```

Lo que tienes ahora:

```
   /api/health     dice si el servicio está sano, y qué módulo falla si no
   /api/stats      cifras y agregados         ← sesión 1
   /api/data       casas del dataset          ← sesión 1
   /api/model      el contrato                ← sesión 2
   /api/predict    predice, valida y avisa    ← sesión 2
   /api/history    lo que ha predicho         ← sesión 3
   /api/explain    por qué ese número         ← sesión 3

   Tablero · Predecir · Historial · Model Card
```

Y una pieza que no escribiste y conviene que abras antes de irte:
[frontend/src/vistas/ModelCard.jsx](../frontend/src/vistas/ModelCard.jsx).

Todo lo que muestra sale de `metadata.json`: el algoritmo, los tamaños de los splits, las
métricas, las importancias. Cada panel lleva escrito **a qué renglón de la rúbrica de tu reto
responde**. Los dos últimos —comparación de modelos y experimentos de hiperparámetros— salen
vacíos hoy a propósito, con un mensaje que te dice qué llenar en `metadata.json` para que
aparezcan solos.

Esa página es la que vas a enseñar cuando te pidan justificar tu modelo. No la escribas de
nuevo: llénale el `metadata.json`.

### Lo que queda para la sesión 4

Hoy tus datos son un CSV en el repositorio y tu historial un archivo SQLite junto al código.
Ninguna de las dos cosas sobrevive a que alguien apague la instancia y levante otra. En la
sesión 4 el origen pasa a ser una base de datos PostgreSQL de verdad, fuera de la máquina — y
vas a ver que los endpoints que escribiste hoy **no se enteran**, porque ninguno de ellos sabe
de dónde salen los datos.

Los comentarios `ATAJO-P1` que has ido viendo en el código marcan exactamente eso: dónde
tomamos el camino corto y qué lo reemplaza después.

---

## Si te quedaste atrás

```bash
./setup/run recuperar 3 --si
```

Te deja con la sesión 3 terminada. Compara contra lo tuyo antes de descartarlo: lo que
escribiste a medias suele estar más cerca de lo que crees.
