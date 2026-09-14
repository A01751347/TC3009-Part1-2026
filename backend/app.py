"""Ensamblador de la API.

Este archivo NO cambia de una sesion a otra, y eso es a proposito.

Cada sesion agrega un modulo propio --s1_tablero.py, s2_modelo.py...-- y este
ensamblador los descubre y los registra solo. Asi, cuando traes el material de
la sesion siguiente llegan archivos NUEVOS: nunca hay que fusionar cambios
sobre codigo que ya escribiste, y no hay conflictos con tu version.

    backend/
    ├── app.py           esto. el ensamblador. no lo edites
    ├── s1_tablero.py    sesion 1: stats y data
    ├── s2_modelo.py     sesion 2: el modelo y las predicciones  (*)
    └── s3_producto.py   sesion 3: historial y explicaciones     (*)

(*) Los modulos marcados NO existen todavia: cada uno llega al empezar su
    sesion, cuando corres

        ./setup/run actualizar 2      (y luego 3, y luego 4)

    Si buscas s2_modelo.py y no esta, no falta nada: es que no has traido el
    material de esa sesion. Mientras tanto, la aplicacion funciona con los
    modulos que si existen.

Para correrlo:  ./setup/run start
"""

import importlib
import pathlib
import re
import sys

from flask import Flask, jsonify
from flask_cors import CORS

API_VERSION = "1.0.0"

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

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
ORIGEN_DESARROLLO = re.compile(r"^http://[A-Za-z0-9.\-]+:3000$")
CORS(app, origins=[ORIGEN_DESARROLLO])


# ---------------------------------------------------------------------------
# Descubrimiento de los modulos de cada sesion
# ---------------------------------------------------------------------------

modulos = []

for archivo in sorted(AQUI.glob("s[0-9]_*.py")):
    modulo = importlib.import_module(archivo.stem)
    if hasattr(modulo, "bp"):
        app.register_blueprint(modulo.bp)
        modulos.append(modulo)
        print(f"modulo cargado: {archivo.stem}", flush=True)
    else:
        print(f"AVISO: {archivo.stem} no expone un blueprint 'bp'; se omite", flush=True)

if not modulos:
    print(
        "\nAVISO: no se cargo ningun modulo de sesion.\n"
        "       ¿Ya escribiste backend/s1_tablero.py?\n",
        flush=True,
    )


# ---------------------------------------------------------------------------
# El unico endpoint que vive aqui
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    """Estado del servicio.

    Cada modulo puede aportar informacion definiendo una funcion estado().
    Asi, cuando la sesion 2 agrega el modelo, este endpoint empieza a reportar
    la version del artefacto sin que haya que tocar este archivo.

    Si el estado() de un modulo falla, se reporta ese modulo como roto y los
    demas siguen respondiendo. Un chequeo de salud que se cae entero porque
    una parte esta a medias no sirve para nada: justo cuando algo esta mal es
    cuando necesitas que te diga QUE esta mal.
    """
    respuesta = {"status": "ok", "api_version": API_VERSION}
    for modulo in modulos:
        if not hasattr(modulo, "estado"):
            continue
        try:
            respuesta.update(modulo.estado())
        except Exception as e:  # noqa: BLE001
            respuesta["status"] = "degradado"
            respuesta.setdefault("modulos_con_falla", {})[modulo.__name__] = str(e)
    return jsonify(respuesta)


if __name__ == "__main__":
    # host="0.0.0.0" escucha en todas las interfaces. Sin esto, la API solo
    # respondaria a la propia instancia y tu navegador veria un timeout.
    #
    # El puerto 8080 tiene que estar abierto en el security group de la
    # instancia; si no, el paquete ni siquiera llega.
    app.run(host="0.0.0.0", port=8080, debug=True)
