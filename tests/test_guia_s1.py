"""Verifica que los bloques de codigo de la guia de la sesion 1 sean correctos.

Este test existe porque la guia y el codigo pueden divergir sin que nadie lo
note: alguien corrige un bug en backend/app.py, la guia sigue enseñando la
version vieja, y 30 alumnos teclean codigo que no funciona.

Lo que comprueba:

  1. Los bloques de la guia, pegados en el esqueleto del estado de arranque,
     producen exactamente el archivo final. Byte a byte.
  2. La API resultante responde los valores conocidos del dataset.

Se corre desde la raiz del repositorio del profesor:

    .venv/bin/python tests/test_guia_s1.py
"""

import importlib.util
import os
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
GUIA = RAIZ / "docs" / "s1-guia.md"
S0 = RAIZ / "docs" / "profesor" / "estados" / "s0"

fallos = []


def revisar(nombre, obtenido, esperado):
    if obtenido == esperado:
        print(f"  OK    {nombre}")
        return
    fallos.append(nombre)
    # Para textos largos, un diff acotado: volcar el archivo entero no ayuda.
    if isinstance(obtenido, str) and isinstance(esperado, str) and "\n" in esperado:
        import difflib

        d = list(
            difflib.unified_diff(
                esperado.splitlines(), obtenido.splitlines(),
                fromfile="esperado", tofile="reconstruido", lineterm="", n=1,
            )
        )
        print(f"  FALLA {nombre}  ({len(d)} lineas de diferencia)")
        for linea in d[:20]:
            print(f"        {linea}")
        if len(d) > 20:
            print(f"        ... y {len(d) - 20} lineas mas")
    else:
        print(f"  FALLA {nombre}: {obtenido!r} (esperado {esperado!r})")


def bloque_que_empieza_con(bloques, inicio):
    for b in bloques:
        if b.lstrip().startswith(inicio):
            return b.rstrip()
    raise AssertionError(f"la guia no tiene ningun bloque que empiece con {inicio!r}")


def main():
    guia = GUIA.read_text()
    py = re.findall(r"```python\n(.*?)```", guia, re.S)
    js = re.findall(r"```javascript\n(.*?)```", guia, re.S)

    cors = bloque_que_empieza_con(py, "ORIGEN_DESARROLLO")
    stats = bloque_que_empieza_con(py, '@app.get("/api/stats")')
    data = bloque_que_empieza_con(py, '@app.get("/api/data")')
    apijs = bloque_que_empieza_con(js, "async function get(")

    print("\n1. Los bloques de la guia reconstruyen el archivo final")
    print("-------------------------------------------------------")

    # --- backend/app.py ---
    armado = (S0 / "backend" / "app.py").read_text()
    armado = re.sub(
        r"# TODO sesion 1: escribe aqui las dos lineas.*\n(#.*\n)*", cors + "\n", armado
    )
    armado = re.sub(r"# TODO sesion 1: GET /api/stats\n(#.*\n)*", stats + "\n", armado)
    armado = re.sub(r"# TODO sesion 1: GET /api/data\n(#.*\n)*", data + "\n", armado)
    revisar("no quedan TODO en app.py", "TODO sesion 1" in armado, False)

    final_py = (RAIZ / "backend" / "app.py").read_text()
    revisar("app.py reconstruido == backend/app.py", armado.strip(), final_py.strip())

    # --- frontend/src/api.js ---
    armado_js = (S0 / "frontend" / "src" / "api.js").read_text()
    armado_js = re.sub(
        r"// -+\n// ESTADO DE ARRANQUE.*?\n// -+\n\n", "", armado_js, flags=re.S
    )
    armado_js = re.sub(r"// TODO sesion 1: la funcion get\(\)\n(//.*\n|\n)*", apijs + "\n", armado_js)
    armado_js = re.sub(r"// TODO sesion 1: las tres funciones.*\n(//.*\n)*", "", armado_js)
    revisar("no quedan TODO en api.js", "TODO sesion 1" in armado_js, False)

    final_js = (RAIZ / "frontend" / "src" / "api.js").read_text()
    revisar("api.js reconstruido == frontend/src/api.js", armado_js.strip(), final_js.strip())

    print("\n2. La API resultante devuelve los valores conocidos del dataset")
    print("---------------------------------------------------------------")

    tmp = RAIZ / ".run" / "app_desde_guia.py"
    tmp.parent.mkdir(exist_ok=True)
    tmp.write_text(armado)
    os.environ["DATA_PATH"] = str(RAIZ / "data" / "train.csv")

    spec = importlib.util.spec_from_file_location("app_guia", tmp)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    c = modulo.app.test_client()

    g = c.get("/api/stats").get_json()
    f = c.get("/api/stats?neighborhood=NAmes").get_json()
    d = c.get("/api/data?neighborhood=NAmes").get_json()
    v = c.get("/api/data?neighborhood=NoExiste")

    revisar("health", c.get("/api/health").get_json()["status"], "ok")
    revisar("registros totales", g["count"], 1460)
    revisar("precio medio", g["target"]["mean"], 180921.2)
    revisar("mediana", g["target"]["median"], 163000)
    revisar("colonias", len(g["by_neighborhood"]), 25)
    revisar("colonia mas cara", g["by_neighborhood"][0]["neighborhood"], "NoRidge")
    revisar("media de la mas cara", g["by_neighborhood"][0]["mean_price"], 335295.3)
    revisar("niveles de calidad", len(g["by_overall_qual"]), 10)
    revisar("NAmes: registros", f["count"], 225)
    revisar("NAmes: media", f["target"]["mean"], 145847.1)
    revisar("NAmes: eje de comparacion sigue global", len(f["by_neighborhood"]), 25)
    revisar("NAmes: total en /api/data", d["total_matching"], 225)
    revisar("filtro sin coincidencias: codigo", v.status_code, 200)
    revisar("filtro sin coincidencias: filas", v.get_json()["rows"], [])
    revisar("limite acotado a 200", c.get("/api/data?limit=999").get_json()["count"], 200)

    tmp.unlink(missing_ok=True)

    print()
    if fallos:
        print(f"{len(fallos)} FALLAS: " + ", ".join(fallos))
        return 1
    print("Todo pasa: la guia enseña exactamente el codigo que funciona.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
