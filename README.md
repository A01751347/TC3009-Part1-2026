# TC3009 · Parte 1 — De un modelo a un producto

Módulo nivelador de la concentración de Inteligencia Artificial Avanzada y Ciencia de Datos.

Ya sabes entrenar modelos. Este módulo trata de lo otro: qué pasa entre un notebook que
predice bien y algo que otra persona puede usar. Cuatro sesiones de dos horas, construyendo
en vivo.

Lo que te llevas no es el producto de precios de casas. Es el **template que vas a
re-apuntar a tu reto**, que es un problema de clasificación.

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

Da igual si usas Windows o Mac: el código corre en Ubuntu, igual para todos. Y no necesitas
instalar Python, ni Node, ni Docker en tu computadora.

**Vas a clonar este repositorio dos veces**, con papeles distintos:

| Dónde | Para qué | Con qué |
| ----- | -------- | ------- |
| Tu computadora | **editar** el código | VS Code |
| Tu instancia EC2 | **ejecutar** la aplicación | la terminal del navegador |

Nunca edites archivos en la instancia: lo que escribas ahí lo borra el siguiente
`./setup/run sync`. Y nunca intentes correr la aplicación en tu computadora: no tiene
Python ni Node instalados, a propósito.

---

## Antes de la primera sesión

**[docs/00-setup.md](docs/00-setup.md) es tarea previa.** Son 15 minutos: git, VS Code,
cuenta de GitHub, y hacer fork de este repositorio.

No instales nada más. En serio.

---

## Si te quedas atrás, no te quedes atrás

Pasa, y está previsto. No preguntes, no te disculpes, no intentes alcanzar tecleando más
rápido. Salta al último checkpoint y sigue:

```bash
git reset --hard s2      # el estado al cierre de la sesión 2
git push --force
```

Y en tu instancia: `./setup/run sync`.

⚠ Esto **descarta** lo que llevas sin guardar. Es a propósito: es más rápido volver al punto
bueno que depurar en vivo.

Los checkpoints son `s1`, `s2`, `s3` y `s4`.

---

## Las cuatro sesiones

| # | Tema | Qué construyes |
|---|------|----------------|
| 1 | **La máquina y el contrato** | Tu instancia Ubuntu, la API en Flask, el tablero corriendo. Y CORS |
| 2 | **La costura** | El modelo cruza la frontera: pipeline exportado, contrato, validación, paridad |
| 3 | **El producto** | Formulario de predicción, historial, explicación, Model Card |
| 4 | **El despliegue** | De servidor de desarrollo a contenedor, y el puente a tu reto |

La sesión 2 es la más importante del módulo. Si vas a faltar a una, que no sea esa.

---

## Comandos de tu instancia

```bash
./setup/run start     # levanta la API y el tablero en segundo plano
./setup/run restart   # relánzalos con el código nuevo (después de un sync)
./setup/run stop      # detenlos
./setup/run status    # qué está corriendo y en qué puerto
./setup/run logs      # últimas líneas de los dos registros
./setup/run sync      # trae los cambios que empujaste desde tu laptop
./setup/run url       # en qué dirección está tu tablero
./setup/run doctor    # revisa el entorno y dice qué falta
```

**La consola del navegador es una sola.** Por eso `start` deja los servidores en
segundo plano y te devuelve el prompt: con una consola alcanza para todo. Si necesitas
ver qué está pasando, `./setup/run logs`.

Y no hace falta activar el entorno virtual: el script llama a `.venv/bin/python`
directamente.

Cuando algo no cuadre, empieza por aquí:

```bash
./setup/run doctor
```

Verifica que la API respira:

```bash
curl http://localhost:8080/api/health
```

---

## Dos reglas que no son negociables

**`git push` al cerrar cada sesión.** Tu código vive en una máquina que puede perderse —un
reset del laboratorio, el presupuesto agotado—. GitHub es la única copia que sobrevive.

**Detener la instancia al terminar, nunca terminarla.** Es tu entorno de trabajo de las
cuatro sesiones. El laboratorio la reinicia sola en la siguiente clase, con una IP nueva —
por eso nada en el código apunta a una dirección fija.

---

## Cómo está organizado

```
backend/          la API en Flask
frontend/         el tablero en React + Vite
notebooks/        entrenamiento y exportación del modelo (sesión 2)
artifacts/        el modelo exportado y su contrato (sesión 2)
data/             train.csv del dataset House Prices
tests/            test_paridad.py, el único test que importa
setup/            aprovisionamiento de la instancia
docs/             guías de sesión, contrato de API, material de apoyo
template-clasificacion/   lo que te llevas al reto
```

---

## Documentos que vas a usar

| Documento | Cuándo |
|---|---|
| [docs/00-setup.md](docs/00-setup.md) | Antes de la sesión 1 |
| [docs/api-contrato.md](docs/api-contrato.md) | Todo el tiempo. Es la referencia de la API |
| [docs/s1-guia.md](docs/s1-guia.md) | Durante la sesión 1 |

---

## Una convención que vas a ver en el código

```python
# ATAJO-P1: el CSV se carga completo en memoria al arrancar.
#           Parte 2 -> base de datos, consultas, paginacion real.
```

Cada vez que simplificamos algo a propósito, queda marcado y dice a dónde lleva. No son
descuidos: son decisiones, y la Parte 2 es donde se abren.

```bash
grep -rn "ATAJO-P1" .
```

Esa lista es, casi literalmente, el temario del módulo siguiente.
