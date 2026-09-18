export const meta = { titulo: "Model Card", orden: 4 };

import { useEffect, useState } from "react";
import { getModel } from "../api.js";

// Los conjuntos se muestran en el orden en que se usan, no en el que vienen.
const ORDEN = ["train", "validation", "test"];
const porOrden = (a, b) => {
  const ia = ORDEN.indexOf(a[0]);
  const ib = ORDEN.indexOf(b[0]);
  // Un conjunto que no esta en la lista va al final, no al principio.
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
};

// Las metricas NO estan escritas a mano.
//
// Un modelo de regresion reporta rmse/mae/r2 y uno de clasificacion
// accuracy/precision/recall/f1. Si esta vista nombrara las columnas, cambiar
// de problema significaria editarla. En vez de eso se leen las claves que
// vengan en metrics y se arma la tabla con ellas.
function columnasDeMetricas(metrics) {
  const vistas = [];
  for (const fila of Object.values(metrics || {})) {
    for (const clave of Object.keys(fila || {})) {
      if (!vistas.includes(clave)) vistas.push(clave);
    }
  }
  return vistas;
}

const numero = (v) =>
  typeof v === "number"
    ? v.toLocaleString("es-MX", { maximumFractionDigits: 4 })
    : String(v ?? "—");

const etiquetaDeClase = (c, mapa) => (mapa || {})[String(c)] ?? String(c);

export default function ModelCard() {
  const [c, setC] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getModel().then(setC).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="estado error">{error}</div>;
  if (!c) return <div className="estado">Cargando...</div>;

  const tarea = c.task || "regresion";
  const esClasificacion = tarea === "clasificacion";

  // De mayor a menor: la pregunta es "que pesa mas", asi que el orden
  // alfabetico que trae el JSON no sirve.
  const importancias = Object.entries(c.feature_importances || {}).sort(
    (a, b) => b[1] - a[1],
  );
  // Las derivadas se filtran por debajo del 0.5%: una lista de treinta barras
  // de las que veinte son invisibles no informa, estorba.
  const derivadas = Object.entries(c.derived_importances || {})
    .filter(([, v]) => v >= 0.005)
    .sort((a, b) => b[1] - a[1]);

  const splits = Object.entries(c.splits || {}).sort(porOrden);
  const metricas = Object.entries(c.metrics || {}).sort(porOrden);
  const columnas = columnasDeMetricas(c.metrics);

  const matriz = c.confusion_matrix;

  return (
    <>
      <p className="subtitulo-vista">
        Todo lo que hay aquí se lee de <code>metadata.json</code>. Nada está
        escrito a mano: si cambias el modelo, esta página cambia sola.
      </p>

      <div className="panel">
        <h2>Qué modelo es</h2>
        <p className="subtitulo">Rúbrica: configura y entrena el modelo</p>
        <dl className="ficha ancha">
          <dt>algoritmo</dt><dd>{c.algorithm}</dd>
          <dt>problema</dt><dd>{tarea}</dd>
          <dt>versión</dt><dd>{c.model_version}</dd>
          <dt>entrenado</dt><dd>{c.trained_at}</dd>
          <dt>scikit-learn</dt><dd>{c.sklearn_version}</dd>
          <dt>target</dt>
          <dd>
            {c.target}
            {c.target_transform ? ` (transformado con ${c.target_transform})` : ""}
          </dd>
          {esClasificacion && (
            <>
              <dt>clases</dt>
              <dd>
                {(c.classes || [])
                  .map((k) => etiquetaDeClase(k, c.class_labels))
                  .join(" · ")}
              </dd>
            </>
          )}
        </dl>
      </div>

      {/* El balance de clases es de las primeras cosas que hay que mirar en un
          clasificador: un 95/5 hace que "95% de accuracy" no signifique nada. */}
      {esClasificacion && c.class_balance && (
        <div className="panel">
          <h2>Balance de clases</h2>
          <p className="subtitulo">
            Rúbrica: comprende la distribución del target
          </p>
          <div className="barras">
            {(c.classes || []).map((k) => {
              const p = c.class_balance[String(k)] ?? 0;
              return (
                <div className="barra-fila" key={String(k)}>
                  <span className="barra-etiqueta">
                    {etiquetaDeClase(k, c.class_labels)}
                  </span>
                  <span className="barra-pista">
                    <span
                      className="barra-relleno"
                      style={{ width: `${p * 100}%` }}
                    />
                  </span>
                  <span className="barra-valor">{(p * 100).toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Con cuántos datos</h2>
        <p className="subtitulo">Rúbrica: separa en entrenamiento, validación y prueba</p>
        <div className="tarjetas sin-margen">
          {splits.map(([k, v]) => (
            <div className="tarjeta" key={k}>
              <div className="etiqueta">{k}</div>
              <div className="valor">{v.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Qué tan bien predice</h2>
        <p className="subtitulo">Rúbrica: selecciona medidas de desempeño adecuadas</p>
        {columnas.length === 0 ? (
          <div className="vacio">
            Sin datos. Llena <code>metrics</code> en <code>metadata.json</code>.
          </div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th className="txt">conjunto</th>
                  {columnas.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricas.map(([nombre, m]) => (
                  <tr key={nombre}>
                    <td className="txt">{nombre}</td>
                    {columnas.map((col) => (
                      <td key={col}>{numero(m[col])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {c.primary_metric && (
          <p className="subtitulo">
            Métrica de decisión: <strong>{c.primary_metric}</strong>
            {c.primary_metric_why ? ` — ${c.primary_metric_why}` : ""}
          </p>
        )}
      </div>

      {/* La matriz de confusion dice QUE tipo de error comete el modelo, que es
          una pregunta distinta de cuanto se equivoca. Un falso negativo y un
          falso positivo casi nunca cuestan lo mismo. */}
      {esClasificacion && matriz && (
        <div className="panel">
          <h2>Qué tipo de error comete</h2>
          <p className="subtitulo">
            Rúbrica: interpreta los errores en el contexto del problema · filas
            = valor real, columnas = predicho
          </p>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th className="txt">real \ predicho</th>
                  {matriz.labels.map((l) => (
                    <th key={String(l)}>{etiquetaDeClase(l, c.class_labels)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matriz.matrix.map((fila, i) => (
                  <tr key={String(matriz.labels[i])}>
                    <td className="txt">
                      {etiquetaDeClase(matriz.labels[i], c.class_labels)}
                    </td>
                    {fila.map((v, j) => (
                      <td key={j}>{v.toLocaleString()}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Qué pesa en la predicción</h2>
        <p className="subtitulo">
          Rúbrica: interpreta los resultados del modelo · atribuido a los campos
          del formulario
        </p>
        <Barras datos={importancias} campo="feature_importances" />
      </div>

      {/* La misma información sin repartir.
          Si una columna derivada carga con medio modelo, la tabla de arriba lo
          esconde: reparte su peso entre las features que la originan y ninguna
          destaca. Esta dice qué columnas usa el modelo de verdad. */}
      {derivadas.length > 0 && (
        <div className="panel">
          <h2>Qué columnas usa el modelo</h2>
          <p className="subtitulo">
            Las columnas que salen del pipeline, sin repartir entre los campos
            del formulario. Las que llevan sufijo o no aparecen arriba son{" "}
            <strong>derivadas</strong>: las construye el artefacto, no el usuario.
          </p>
          <Barras datos={derivadas} campo="derived_importances" />
        </div>
      )}

      <div className="panel">
        <h2>Modelos comparados</h2>
        <p className="subtitulo">Rúbrica: selecciona el modelo adecuado al problema</p>
        <TablaDeExperimentos filas={c.model_comparison} campo="model_comparison" />
      </div>

      <div className="panel">
        <h2>Experimentos de hiperparámetros</h2>
        <p className="subtitulo">Rúbrica: ajusta los hiperparámetros</p>
        <TablaDeExperimentos
          filas={c.hyperparameter_experiments}
          campo="hyperparameter_experiments"
        />
      </div>
    </>
  );
}

/** Una lista de objetos planos, como tabla. Las columnas salen de los datos.
 *
 * Antes esto era un <pre> con el JSON crudo. Un JSON crudo en una Model Card
 * es una forma de decir "no decidi como mostrarlo": la tabla comparativa es
 * justo la evidencia que pide la rúbrica, y se lee de un vistazo.
 */
function TablaDeExperimentos({ filas, campo }) {
  if (!Array.isArray(filas) || filas.length === 0) {
    return (
      <div className="vacio">
        Sin datos. Llena <code>{campo}</code> en <code>metadata.json</code> con
        lo que probaste y esta tabla aparece sola.
      </div>
    );
  }

  const columnas = [];
  for (const f of filas) {
    for (const k of Object.keys(f || {})) {
      if (!columnas.includes(k)) columnas.push(k);
    }
  }

  return (
    <div className="scroll-x">
      <table>
        <thead>
          <tr>
            {columnas.map((col, i) => (
              <th key={col} className={i === 0 ? "txt" : undefined}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              {columnas.map((col, j) => (
                <td key={col} className={j === 0 ? "txt" : undefined}>
                  {typeof f[col] === "object" && f[col] !== null
                    ? JSON.stringify(f[col])
                    : numero(f[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Una lista de pares nombre/proporción, como barras. */
function Barras({ datos, campo }) {
  if (datos.length === 0) {
    return (
      <div className="vacio">
        Sin datos. Llena <code>{campo}</code> en <code>metadata.json</code>.
      </div>
    );
  }
  // La barra más larga define la escala: con importancias que rara vez pasan
  // del 50%, escalar a 100% deja todas las barras cortas y no se comparan.
  const maximo = Math.max(...datos.map(([, v]) => v), 0.0001);
  return (
    <div className="barras">
      {datos.map(([nombre, valor]) => (
        <div className="barra-fila" key={nombre}>
          <span className="barra-etiqueta">{nombre}</span>
          <span className="barra-pista">
            <span
              className="barra-relleno"
              style={{ width: `${(valor / maximo) * 100}%` }}
            />
          </span>
          <span className="barra-valor">{(valor * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}
