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

  // Qué columnas del input mostrar. No están escritas a mano: salen del
  // contrato, así que si cambias el modelo la tabla cambia sola.
  //
  // Se ordenan por derived_importances --lo que el modelo usa DE VERDAD-- y no
  // por feature_importances. La diferencia no es cosmética: la segunda reparte
  // el peso de `HasSpent` entre las cinco cuentas de consumo, así que las tres
  // primeras acaban siendo columnas de gasto que son cero en la mayoría de las
  // filas. Una tabla de ceros no deja comparar nada; `CryoSleep` y
  // `HomePlanet` sí.
  //
  // Sólo se conservan los nombres que son features del contrato: las derivadas
  // no están en el input guardado.
  const delInput = new Set(Object.keys(datos.rows[0]?.input ?? {}));

  const porImportancia = (mapa) =>
    Object.entries(mapa ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k)
      .filter((k) => delInput.has(k));

  const columnas = [
    ...new Set([
      ...porImportancia(contrato?.derived_importances),
      ...porImportancia(contrato?.feature_importances),
      ...delInput,
    ]),
  ].slice(0, 3);

  const etiquetaDe = (nombre) =>
    (contrato?.features ?? []).find((f) => f.name === nombre)?.label ?? nombre;

  return (
    <>
      <p className="subtitulo-vista">
        Lo que este modelo ha estado prediciendo. No es el dataset de
        entrenamiento: es el uso real del producto.
      </p>

      <Resumen datos={datos} contrato={contrato} />

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
                    <th key={c} className="txt" title={c}>
                      {etiquetaDe(c)}
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

/** Lo que el producto ha estado prediciendo, contra lo que vio al entrenar.
 *
 * Es la vista que justifica que exista un historial. Un notebook puede
 * reportar métricas sobre un conjunto de prueba; sólo un producto en uso puede
 * contestar "¿el modelo está viendo algo distinto de lo que aprendió?".
 *
 * La comparación es deliberadamente humilde: con veinte predicciones no hay
 * conclusión que sacar, y decirlo es parte de la lectura honesta.
 */
function Resumen({ datos, contrato }) {
  if (!datos.rows.length) return null;

  const esClasificacion = (contrato?.task ?? "regresion") === "clasificacion";
  if (!esClasificacion || contrato?.positive_class === undefined) return null;

  const positiva = contrato.positive_class;
  const n = datos.rows.length;
  const positivas = datos.rows.filter(
    (f) => String(f.prediction) === String(positiva),
  ).length;

  const tasaUso = positivas / n;
  // La tasa base del entrenamiento sale del contrato, no está escrita aquí.
  const tasaBase = Number(
    (contrato.class_balance ?? {})[String(positiva)] ?? NaN,
  );
  const hayBase = Number.isFinite(tasaBase);
  const delta = hayBase ? tasaUso - tasaBase : null;

  // Menos de 30 casos no sostienen ninguna afirmación sobre deriva.
  const SUFICIENTE = 30;
  const bastantes = n >= SUFICIENTE;

  const etiqueta =
    (contrato.class_labels ?? {})[String(positiva)] ?? String(positiva);
  const pct = (v) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="panel">
      <h2>Uso real contra entrenamiento</h2>
      <p className="subtitulo">
        Si el producto empieza a predecir muy distinto de lo que vio al
        entrenar, es la primera señal de que el modelo se está quedando viejo.
      </p>

      <div className="tarjetas sin-margen">
        <div className="tarjeta">
          <div className="etiqueta">predicciones</div>
          <div className="valor">{miles(n)}</div>
        </div>
        <div className="tarjeta">
          <div className="etiqueta">{etiqueta} (uso real)</div>
          <div className="valor">{pct(tasaUso)}</div>
        </div>
        {hayBase && (
          <div className="tarjeta">
            <div className="etiqueta">{etiqueta} (entrenamiento)</div>
            <div className="valor">{pct(tasaBase)}</div>
          </div>
        )}
        {delta != null && (
          <div className="tarjeta">
            <div className="etiqueta">diferencia</div>
            <div className="valor">
              {delta >= 0 ? "+" : "−"}
              {Math.abs(delta * 100).toFixed(1)} pts
            </div>
          </div>
        )}
      </div>

      <p className={bastantes ? "referencia" : "referencia tenue"}>
        {bastantes ? (
          <>
            Con {miles(n)} predicciones, una diferencia de{" "}
            <strong>{Math.abs(delta * 100).toFixed(1)} puntos</strong> ya vale
            la pena mirar. Las causas habituales son dos: el público del
            producto no se parece al del dataset, o el mundo cambió.
          </>
        ) : (
          <>
            Son {miles(n)} predicciones: <strong>demasiado pocas</strong> para
            afirmar nada. Este panel empieza a significar algo a partir de{" "}
            {SUFICIENTE}.
          </>
        )}
      </p>
    </div>
  );
}
