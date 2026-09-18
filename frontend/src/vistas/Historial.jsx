export const meta = { titulo: "Historial", orden: 3 };

import { useEffect, useState } from "react";
import { getHistory, getModel } from "../api.js";

const cuando = (iso) => new Date(iso).toLocaleString("es-MX");

const miles = (n) => new Intl.NumberFormat("es-MX").format(n);

const pesos = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

/** Escribe la predicción con la unidad del problema, no con una elegida aquí. */
function formatearPrediccion(v, contrato) {
  if (v === null || v === undefined) return "—";
  if ((contrato?.task ?? "regresion") === "clasificacion") {
    return (contrato?.class_labels ?? {})[String(v)] ?? String(v);
  }
  if ((contrato?.dashboard?.value_format ?? "moneda") === "moneda") {
    return pesos(v);
  }
  return typeof v === "number" ? miles(v) : String(v);
}

const celda = (v) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return miles(v);
  return String(v);
};

export default function Historial() {
  const [datos, setDatos] = useState(null);
  const [contrato, setContrato] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getHistory(50).then(setDatos).catch((e) => setError(e.message));
    // El contrato es para SABER COMO ESCRIBIR la prediccion, no para obtener
    // los datos. Si falla, el historial se muestra igual con valores crudos:
    // una tabla con etiquetas feas es mejor que una pantalla de error.
    getModel().then(setContrato).catch(() => setContrato(null));
  }, []);

  if (error) return <div className="estado error">{error}</div>;
  if (!datos) return <div className="estado">Cargando...</div>;

  // Que columnas del input mostrar: las tres features que mas pesan en el
  // modelo. No estan escritas a mano, salen de metadata.json, asi que si
  // cambias el modelo la tabla cambia sola.
  //
  // Si no hay contrato, se usan las primeras tres claves del primer registro:
  // el historial guarda el input completo, asi que siempre hay algo que
  // mostrar.
  const importantes = Object.entries(contrato?.feature_importances ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  const columnas =
    importantes.length > 0
      ? importantes
      : Object.keys(datos.rows[0]?.input ?? {}).slice(0, 3);

  return (
    <>
      <p className="subtitulo-vista">
        Lo que este modelo ha estado prediciendo. No es el dataset de
        entrenamiento: es el uso real del producto.
      </p>

      <div className="panel">
        <h2>Predicciones recientes</h2>
        <p className="subtitulo">
          {datos.count} registradas
          {columnas.length > 0 &&
            ` · se muestran las features de mayor importancia`}
        </p>

        {datos.rows.length === 0 ? (
          <div className="vacio">
            Todavía no hay ninguna. Ve a <strong>Predecir</strong> y haz una
            predicción: va a aparecer aquí.
          </div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th className="txt">Cuándo</th>
                  {columnas.map((c) => (
                    <th key={c} className="txt">
                      {c}
                    </th>
                  ))}
                  <th className="txt">Predicción</th>
                  <th className="txt">Modelo</th>
                </tr>
              </thead>
              <tbody>
                {datos.rows.map((f) => (
                  <tr key={f.prediction_id}>
                    <td className="txt">{cuando(f.created_at)}</td>
                    {columnas.map((c) => (
                      <td key={c} className="txt">
                        {celda(f.input[c])}
                      </td>
                    ))}
                    <td className="txt">
                      {formatearPrediccion(f.prediction, contrato)}
                    </td>
                    <td className="txt mono">{f.model_version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
