"""Contrato del contexto por vecinos del conjunto de entrenamiento."""

import json
import os
import pathlib
import sys
import tempfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent


def main():
    print("\nContexto de casos similares")
    print("=" * 54)

    tmp = tempfile.mkdtemp()
    os.environ["DB_PATH"] = str(pathlib.Path(tmp) / "prueba.sqlite")
    sys.path.insert(0, str(RAIZ / "backend"))

    import app  # noqa: E402

    cliente = app.app.test_client()
    ejemplo = json.loads((RAIZ / "artifacts" / "example.json").read_text())["input"]

    respuesta = cliente.post("/api/similar", json={"input": ejemplo, "limit": 8})
    assert respuesta.status_code == 200, respuesta.get_json()
    cuerpo = respuesta.get_json()
    assert cuerpo["count"] == 8
    assert len(cuerpo["neighbors"]) == 8
    assert 0 <= cuerpo["average_similarity"] <= 1
    assert all(0 <= fila["similarity"] <= 1 for fila in cuerpo["neighbors"])
    assert cuerpo["neighbors"] == sorted(
        cuerpo["neighbors"], key=lambda fila: fila["similarity"], reverse=True
    )
    clases = cliente.get("/api/model").get_json().get("classes", [])
    assert all(
        str(fila["outcome"]) in {str(clase) for clase in clases}
        for fila in cuerpo["neighbors"]
    )

    target = cuerpo["target"]
    assert target["kind"] in ("categorico", "numerico")
    if target["kind"] == "categorico":
        assert 0 <= target["positive_rate"] <= 1
    else:
        assert target["min"] <= target["mean"] <= target["max"]

    incompleto = dict(ejemplo)
    incompleto.pop(next(iter(incompleto)))
    invalida = cliente.post("/api/similar", json={"input": incompleto})
    assert invalida.status_code == 400
    assert "falta la feature" in invalida.get_json()["error"]

    print(f"  OK    devolvio {cuerpo['count']} vecinos ordenados por similitud")
    print(f"  OK    similitud media valida ({cuerpo['average_similarity']:.1%})")
    print("  OK    resume el target y rechaza entradas incompletas")
    print("\nEl contexto de entrenamiento esta sano.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
