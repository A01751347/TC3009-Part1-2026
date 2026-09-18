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
function columnasDeMetricas(metrics, principal) {
  const vistas = [];
  for (const fila of Object.values(metrics || {})) {
    for (const clave of Object.keys(fila || {})) {
      if (!vistas.includes(clave)) vistas.push(clave);
    }
  }
  // La métrica de decisión va primero.
  //
  // Flask ordena las claves del JSON alfabéticamente, así que sin esto `recall`
  // aparece en cuarta columna, entre `precision` y `roc_auc`, como si fueran
  // todas equivalentes. No lo son: el contrato declara cuál se usó para elegir
  // el modelo, y la tabla debería leerse en ese orden.
  if (principal && vistas.includes(principal)) {
    return [principal, ...vistas.filter((v) => v !== principal)];
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
  const columnas = columnasDeMetricas(c.metrics, c.primary_metric);

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
                    <th key={col}>
                      {col}
                      {col === c.primary_metric ? " \u2605" : ""}
                    </th>
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
            ★ Métrica de decisión: <strong>{c.primary_metric}</strong>
            {c.primary_metric_why ? ` — ${c.primary_metric_why}` : ""}
          </p>
        )}
      </div>

      {/* La matriz de confusion dice QUE tipo de error comete el modelo, que es
          una pregunta distinta de cuanto se equivoca. Un falso negativo y un
          falso positivo casi nunca cuestan lo mismo. */}
      {esClasificacion && matriz && (
        <MatrizDeConfusion contrato={c} matriz={matriz} />
      )}

      <div className="panel">
        <h2>Qué pesa en la predicción</h2>
        <p className="subtitulo">
          Rúbrica: interpreta los resultados del modelo · atribuido a los campos
          del formulario
        </p>
        <Barras
          datos={importancias}
          campo="feature_importances"
          etiquetas={Object.fromEntries(
            (c.features ?? []).map((f) => [f.name, f.label ?? f.name]),
          )}
        />
        <p className="subtitulo">
          Si una columna derivada carga con buena parte del modelo, aquí no se
          nota: su peso se reparte. El panel de abajo lo dice sin repartir.
        </p>
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
        <TablaDeExperimentos
          filas={c.model_comparison}
          campo="model_comparison"
          principal={c.primary_metric}
        />
      </div>

      <div className="panel">
        <h2>Experimentos de hiperparámetros</h2>
        <p className="subtitulo">Rúbrica: ajusta los hiperparámetros</p>
        <TablaDeExperimentos
          filas={c.hyperparameter_experiments}
          campo="hyperparameter_experiments"
          principal={c.primary_metric}
        />
      </div>
    </>
  );
}

/** Pone las columnas en el orden en que se leen, no en el que llegan.
 *
 * Flask serializa los diccionarios con las claves ordenadas alfabéticamente,
 * así que sin esto la tabla empieza por `FN, FP, accuracy…` y el nombre del
 * modelo —lo único que identifica la fila— acaba en la última columna, fuera
 * de la pantalla.
 *
 * El orden que sí se lee: qué es la fila, la métrica con la que se decidió, el
 * resto de métricas, y al final los hiperparámetros, que son la columna más
 * ancha y la que menos se compara de un vistazo.
 */
function ordenarColumnas(filas, principal) {
  const vistas = [];
  for (const f of filas) {
    for (const k of Object.keys(f || {})) {
      if (!vistas.includes(k)) vistas.push(k);
    }
  }
  const primero = ["modelo", "model", "nombre", "name"];
  const ultimo = ["hiperparametros", "hyperparameters", "params"];

  const peso = (k) => {
    if (primero.includes(k)) return 0;
    if (k === principal) return 1;
    if (ultimo.includes(k)) return 3;
    return 2;
  };
  // Estable dentro de cada grupo: se conserva el orden en que llegaron.
  return vistas
    .map((k, i) => [k, i])
    .sort((a, b) => peso(a[0]) - peso(b[0]) || a[1] - b[1])
    .map(([k]) => k);
}

/** Una lista de objetos planos, como tabla. Las columnas salen de los datos.
 *
 * Antes esto era un <pre> con el JSON crudo. Un JSON crudo en una Model Card
 * es una forma de decir "no decidi como mostrarlo": la tabla comparativa es
 * justo la evidencia que pide la rúbrica, y se lee de un vistazo.
 */
function TablaDeExperimentos({ filas, campo, principal }) {
  if (!Array.isArray(filas) || filas.length === 0) {
    return (
      <div className="vacio">
        Sin datos. Llena <code>{campo}</code> en <code>metadata.json</code> con
        lo que probaste y esta tabla aparece sola.
      </div>
    );
  }

  const columnas = ordenarColumnas(filas, principal);

  return (
    <div className="scroll-x">
      <table className="experimentos">
        <thead>
          <tr>
            {columnas.map((col, i) => (
              <th key={col} className={i === 0 ? "txt" : undefined}>
                {col}
                {col === principal ? " \u2605" : ""}
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
function Barras({ datos, campo, etiquetas }) {
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
          <span className="barra-etiqueta" title={nombre}>
            {(etiquetas ?? {})[nombre] ?? nombre}
          </span>
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

/** La matriz de confusión, leída en voz alta.
 *
 * Cuatro números sueltos no dicen nada. Lo que importa es cuál de los dos
 * errores cuesta más, y ese es el argumento entero de este modelo: se eligió
 * maximizar recall porque un falso negativo y un falso positivo no valen lo
 * mismo. La tabla lo tiene que decir, no insinuar.
 */
function MatrizDeConfusion({ contrato, matriz }) {
  const etiqueta = (k) => etiquetaDeClase(k, contrato.class_labels);
  const positiva = contrato.positive_class;
  const iPos = matriz.labels.findIndex((l) => l === positiva);

  const total = matriz.matrix.flat().reduce((a, b) => a + b, 0);
  const celda = (i, j) => matriz.matrix[i]?.[j] ?? 0;

  // Sólo tiene sentido nombrar los cuatro cuadrantes en binario.
  const binario = matriz.labels.length === 2 && iPos >= 0;
  const iNeg = binario ? 1 - iPos : -1;
  const fn = binario ? celda(iPos, iNeg) : null; // real positivo, predicho negativo
  const fp = binario ? celda(iNeg, iPos) : null;

  const rol = (i, j) => {
    if (!binario) return "";
    if (i === iPos && j === iPos) return "acierto";
    if (i === iNeg && j === iNeg) return "acierto";
    if (i === iPos && j === iNeg) return "falso negativo";
    return "falso positivo";
  };

  return (
    <div className="panel">
      <h2>Qué tipo de error comete</h2>
      <p className="subtitulo">
        Rúbrica: interpreta los errores en el contexto del problema · filas =
        valor real, columnas = predicho · sobre el conjunto de prueba
      </p>
      <div className="scroll-x">
        <table className="matriz">
          <thead>
            <tr>
              <th className="txt">real \ predicho</th>
              {matriz.labels.map((l) => (
                <th key={String(l)}>{etiqueta(l)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matriz.matrix.map((fila, i) => (
              <tr key={String(matriz.labels[i])}>
                <td className="txt">{etiqueta(matriz.labels[i])}</td>
                {fila.map((v, j) => {
                  const r = rol(i, j);
                  const critico = r === "falso negativo";
                  return (
                    <td
                      key={j}
                      className={
                        r === "acierto"
                          ? "celda acierto"
                          : critico
                            ? "celda critica"
                            : "celda error"
                      }
                    >
                      <span className="celda-valor">{v.toLocaleString()}</span>
                      <span className="celda-nota">
                        {((v / total) * 100).toFixed(1)}%{r && ` · ${r}`}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {binario && (
        <p className="referencia">
          Los dos errores no cuestan lo mismo.{" "}
          <strong>{fn.toLocaleString()} falsos negativos</strong> son casos
          reales de <em>{etiqueta(positiva)}</em> que el sistema reporta como{" "}
          <em>{etiqueta(matriz.labels[iNeg])}</em>: nadie actúa sobre ellos.
          Los <strong>{fp.toLocaleString()} falsos positivos</strong> sólo
          movilizan recursos de más.
          {contrato.primary_metric === "recall" &&
            " Por eso el modelo se optimizó para recall y no para accuracy: el segundo error se compra barato."}
        </p>
      )}
    </div>
  );
}
