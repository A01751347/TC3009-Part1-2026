# Spaceship Titanic — de un modelo a un producto

Reto de la concentración de Inteligencia Artificial Avanzada y Ciencia de Datos.
Módulo TC3009, Parte 1.

Un clasificador binario entrenado sobre el dataset
[Spaceship Titanic](https://www.kaggle.com/competitions/spaceship-titanic): dado un pasajero,
predice si fue transportado a una dimensión alternativa. Pero el reto no es el modelo — es
**lo otro**: qué pasa entre un notebook que predice bien y algo que otra persona puede usar.

Construido sobre el template del módulo, re-apuntado de la regresión de precios de vivienda a
este problema de clasificación. El material original del curso está archivado en
[docs/curso/](docs/curso/).

---

## Cómo funciona esto

Tu laptop **no** corre la aplicación. La escribe.

```
   Tu laptop              GitHub              Tu instancia EC2
   ─────────────          ──────              ────────────────
   VS Code + git   ─push──▶  tu fork  ─pull──▶  Ubuntu Server
   sólo editar                                  Flask  :8080
                                                Vite   :3000
                                     ◀── terminal desde el navegador
                                         (Session Manager, sin SSH)
```

Nunca edites archivos en la instancia: lo que escribas ahí lo borra el siguiente
`./setup/run sync`.

---

## La idea de fondo

**Nada del dominio está escrito a mano.** Ni en el backend, ni en el frontend.

```
                    ┌──▶ el servicio VALIDA la entrada contra él
   metadata.json ───┼──▶ el formulario se GENERA de él
                    ├──▶ la Model Card se RENDERIZA de él
                    └──▶ la explicación usa sus importancias
```

El formulario no tiene una lista de campos; la pide a `/api/model`. La tabla del tablero no
tiene columnas; las manda `/api/data`. El título de la página no dice "Spaceship Titanic";
lo lee de `/api/health`. Cambiar de modelo es cambiar el artefacto, no editar vistas.

Las dos piezas que lo sostienen:

| Pieza | Qué garantiza |
|---|---|
| **El contrato** — [docs/api-contrato.md](docs/api-contrato.md) | Se escribe antes que el código. Backend y frontend lo implementan; ninguno adivina |
| **El artefacto** — `artifacts/` | Lleva TODO el conocimiento del modelo: derivación, imputación, escalado, codificación. El servicio le pasa datos crudos |

Y la prueba que las amarra: `./setup/run test paridad` comprueba que el notebook y el
servicio devuelven **la misma clase y las mismas probabilidades** para la misma entrada.

---

## Comandos de tu instancia

```bash
./setup/run start     # levanta la API y el tablero en segundo plano
./setup/run restart   # relánzalos con el código nuevo (después de un sync)
./setup/run stop      # detenlos
./setup/run status    # qué está corriendo y en qué puerto
./setup/run logs      # últimas líneas de los dos registros
./setup/run logs api  # sigue el registro de la API en vivo
./setup/run sync      # trae los cambios que empujaste desde tu laptop
./setup/run url       # en qué dirección está tu tablero
./setup/run doctor    # revisa el entorno y dice qué falta
./setup/run test      # corre todas las pruebas
./setup/run test paridad   # solo una: notebook ↔ servicio
```

**Después de un `sync` que cambie `backend/requirements.txt`, instala antes de reiniciar:**

```bash
bash setup/bootstrap-ec2.sh   # idempotente; no borra .venv ni node_modules
./setup/run restart
```

`sync` trae código, **no instala dependencias**. El artefacto lleva un `XGBClassifier`
dentro, así que sin `xgboost` el servicio no arranca y el navegador dice
`ERR_CONNECTION_REFUSED`. Si te pasa, `./setup/run logs api` te lo dice con todas sus letras.

Verifica que la API respira:

```bash
curl http://localhost:8080/api/health
```

---

## Dos reglas que no son negociables

**`git push` al cerrar cada sesión.** Tu código vive en una máquina que puede perderse —un
reset del laboratorio, el presupuesto agotado—. GitHub es la única copia que sobrevive.

**Detener la instancia al terminar, nunca terminarla.** El laboratorio la reinicia con una IP
nueva — por eso nada en el código apunta a una dirección fija.

---

## Cómo está organizado

```
backend/          la API en Flask
  app.py            el ensamblador: descubre los módulos solo. No se edita
  s1_tablero.py     los datos del tablero
  s2_modelo.py      el artefacto, la validación y las predicciones
  s4_producto.py    el historial y las explicaciones
frontend/         el tablero en React + Vite
  src/main.jsx      el ensamblador: descubre las vistas solas. No se edita
  src/api.js        el cliente de la API
  src/vistas/       una vista por archivo
notebooks/
  00-exploracion-y-modelado.ipynb   EDA, preparación, comparación y tuning
  01-entrenar-y-exportar.ipynb      el pipeline completo y el artefacto
artifacts/        el modelo exportado, su contrato y su módulo de derivadas
data/             train.csv y test.csv de Kaggle
tests/            paridad notebook↔servicio, e invariantes del registro
setup/            aprovisionamiento de la instancia
docs/             el contrato de la API y el material del curso
submission.csv    el entregable de la competencia
```

### Los dos ensambladores

`backend/app.py` descubre `s[0-9]_*.py` y registra el que exponga un `bp`.
`frontend/src/main.jsx` descubre `src/vistas/*.jsx` y monta el que exporte `default` y `meta`.

Ninguno de los dos se edita. Agregar funcionalidad es agregar un archivo.

---

## El modelo

`XGBClassifier(n_estimators=100, max_depth=2, learning_rate=0.08, scale_pos_weight=2)`,
elegido por `GridSearchCV` sobre 240 combinaciones con `StratifiedKFold(5)`, optimizando
**recall**.

| Conjunto | recall ★ | f1 | accuracy | precision | specificity | roc_auc |
|---|---|---|---|---|---|---|
| validación | 0.9146 | 0.8163 | 0.7999 | 0.7369 | 0.6836 | 0.8827 |
| prueba | 0.8950 | 0.8071 | 0.7845 | 0.7350 | 0.6723 | 0.8805 |

**Recall es la métrica de decisión, no accuracy.** Un falso negativo es un pasajero
transportado que el sistema reporta a salvo: no se despliega ninguna búsqueda. Un falso
positivo solo moviliza recursos de más. `scale_pos_weight=2` desplaza el punto de operación a
propósito hacia ese lado; por eso el modelo final tiene *menos* accuracy que el anterior
(78.5% contra 80.6%) y aun así es el bueno.

Todo esto —incluida la matriz de confusión, la comparativa de modelos y los 22 experimentos de
hiperparámetros— se renderiza solo en la pestaña **Model Card** del tablero, leído de
`metadata.json`.

Los detalles del pipeline y las decisiones de preparación están en
[docs/modelo.md](docs/modelo.md).

---

## Re-entrenar

En Colab, con `notebooks/01-entrenar-y-exportar.ipynb`:

1. Arrastra la carpeta `data` con el `train.csv` **crudo** de Kaggle.
2. Corre todas las celdas. Al final se descarga `artifacts.zip`.
3. Descomprímelo en la raíz del proyecto.

```bash
git add artifacts/ && git commit -m "artefacto nuevo" && git push
```

Y en la instancia: `./setup/run sync && ./setup/run restart && ./setup/run test paridad`.

> El notebook necesita el CSV **crudo**, no el `train_processed.csv` del primer avance. El
> procesado ya viene codificado (`HomePlanet_Europa`…), y esas columnas son el *resultado* del
> preprocesamiento — que es justo lo que tiene que quedar dentro del artefacto. Un servicio
> que pidiera `HomePlanet_Europa` le estaría pasando al usuario el trabajo del modelo. El
> notebook lo detecta y te lo dice.

---

## Una convención que vas a ver en el código

```python
# ATAJO-P1: el CSV se carga completo en memoria al arrancar.
#           Parte 2 -> base de datos, consultas, paginacion real.
```

Cada vez que simplificamos algo a propósito, queda marcado y dice a dónde lleva. No son
descuidos: son decisiones.

```bash
grep -rn "ATAJO-P1" .
```

---

## Sobre el material del curso

Este repositorio **reemplaza** los archivos del template original con la versión de este
reto. Para que `./setup/run actualizar N` no los pise, la tabla de propiedad en
[setup/archivos-del-curso.txt](setup/archivos-del-curso.txt) los reclama como `[TUYOS]`.

Lo que se archivó sin tocar, en [docs/curso/](docs/curso/):

| Archivo | Qué es |
|---|---|
| `api-contrato-casas.md` | El contrato original, con el modelo de precios de vivienda |
| `s1-guia.md` … `s4-guia.md` | Las guías de las cuatro sesiones del módulo |
| `extras/` | Material opcional (explicación con un LLM) |

Lo que se reemplazó: `README.md`, `docs/api-contrato.md`, `notebooks/`, `tests/`, `data/`,
`artifacts/`, y los módulos de `backend/` y `frontend/`. Todo recuperable con
`git log` o desde el repositorio del curso.
