export const meta = { titulo: "Model Card", orden: 4, glifo: "◎" };

import { useEffect, useState } from "react";
import { getModel } from "../api.js";
import { claseSerie, columnasNumericas, miles, pct } from "../viz.js";

const ORDEN = ["train", "validation", "test"];
const porOrden = (a, b) => {
  const i = (k) => (ORDEN.indexOf(k) < 0 ? 99 : ORDEN.indexOf(k));
  return i(a[0]) - i(b[0]);
};

const etiquetaDeClase = (c, mapa) => (mapa || {})[String(c)] ?? String(c);

const numero = (v) =>
  typeof v === "number"
    ? v.toLocaleString("es-MX", { maximumFractionDigits: 4 })
    : String(v ?? "—");

/** Las columnas de métricas NO están escritas a mano: un modelo de regresión
 *  reporta rmse/mae/r2 y uno de clasificación accuracy/recall/f1. Se leen las
 *  claves que vengan y la métrica de decisión va primero — Flask las serializa
 *  en orden alfabético, así que sin esto `recall` acaba en cuarta columna como
 *  si todas pesaran igual. */
function columnasDeMetricas(metrics, principal) {
  const vistas = [];
  for (const fila of Object.values(metrics || {}))
    for (const k of Object.keys(fila || {}))
      if (!vistas.includes(k)) vistas.push(k);
  return principal && vistas.includes(principal)
    ? [principal, ...vistas.filter((v) => v !== principal)]
    : vistas;
}

export default function ModelCard() {
  const [c, setC] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getModel().then(setC).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="estado error">{error}</div>;
  if (!c) return <div className="estado">Cargando…</div>;

  const esClasificacion = (c.task ?? "regresion") === "clasificacion";
  const importancias = Object.entries(c.feature_importances ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  // Por debajo del 0.5% una barra es invisible: una lista de treinta en la que
  // veinte no se ven no informa, estorba.
  const derivadas = Object.entries(c.derived_importances ?? {})
    .filter(([, v]) => v >= 0.005)
    .sort((a, b) => b[1] - a[1]);

  const splits = Object.entries(c.splits ?? {}).sort(porOrden);
  const metricas = Object.entries(c.metrics ?? {}).sort(porOrden);
  const columnas = columnasDeMetricas(c.metrics, c.primary_metric);
  const prueba = c.metrics?.test ?? {};
  const etiquetas = Object.fromEntries(
    (c.features ?? []).map((f) => [f.name, f.label ?? f.name]),
  );

  return (
    <>
      <header className="cabecera-vista">
        <h1>Model Card</h1>
        <p>
          Todo lo que hay aquí se lee de <code>metadata.json</code>. Nada está
          escrito a mano: si cambias el modelo, esta página cambia sola.
        </p>
      </header>

      <div className="pila">
        {/* Lo primero que alguien quiere saber: qué tan bien predice, con la
            métrica que se usó para decidir. */}
        <div className="rejilla auto">
          <div className="cifra acento">
            <span className="cifra-etiqueta">
              {c.primary_metric ?? "desempeño"} · prueba
            </span>
            <span className="cifra-valor">
              {numero(prueba[c.primary_metric])}
            </span>
            <span className="cifra-nota">métrica de decisión</span>
          </div>
          {["f1", "accuracy", "roc_auc"]
            .filter((k) => k in prueba && k !== c.primary_metric)
            .map((k) => (
              <div className="cifra" key={k}>
                <span className="cifra-etiqueta">{k} · prueba</span>
                <span className="cifra-valor">{numero(prueba[k])}</span>
              </div>
            ))}
        </div>

        <section className="tarjeta">
          <header>
            <div>
              <h2>Qué modelo es</h2>
              <p className="sub">Rúbrica: configura y entrena el modelo</p>
            </div>
            <span className="insignia ok">{c.task ?? "regresion"}</span>
          </header>
          <div className="cuerpo">
            <dl className="ficha">
              <dt>algoritmo</dt>
              <dd className="mono">{c.algorithm}</dd>
              <dt>versión</dt>
              <dd>{c.model_version}</dd>
              <dt>entrenado</dt>
              <dd>{c.trained_at}</dd>
              <dt>librerías</dt>
              <dd>
                scikit-learn {c.sklearn_version}
                {c.xgboost_version && ` · xgboost ${c.xgboost_version}`}
              </dd>
              <dt>target</dt>
              <dd>
                {c.target}
                {c.target_transform ? ` (${c.target_transform})` : ""}
              </dd>
              {esClasificacion && (
                <>
                  <dt>clases</dt>
                  <dd>
                    {(c.classes ?? [])
                      .map((k) => etiquetaDeClase(k, c.class_labels))
                      .join(" · ")}
                  </dd>
                </>
              )}
            </dl>
          </div>
        </section>

        <div className="rejilla n2">
          <section className="tarjeta">
            <header>
              <div>
                <h2>Con cuántos datos</h2>
                <p className="sub">
                  Rúbrica: separa en entrenamiento, validación y prueba
                </p>
              </div>
            </header>
            <div className="cuerpo">
              <div className="barras">
                {splits.map(([k, v]) => {
                  const total = splits.reduce((a, [, x]) => a + x, 0);
                  return (
                    <div className="barra" key={k}>
                      <span className="barra-nombre">{k}</span>
                      <span className="barra-pista">
                        <span
                          className="barra-relleno"
                          style={{ width: `${(v / total) * 100}%` }}
                        />
                      </span>
                      <span className="barra-valor">{miles(v)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="pie">
              La prueba se toca una sola vez, al final.
            </div>
          </section>

          {esClasificacion && c.class_balance && (
            <section className="tarjeta">
              <header>
                <div>
                  <h2>Balance de clases</h2>
                  <p className="sub">
                    Rúbrica: comprende la distribución del target
                  </p>
                </div>
              </header>
              <div className="cuerpo">
                <div className="barras">
                  {(c.classes ?? []).map((k) => (
                    <div className="barra" key={String(k)}>
                      <span className="barra-nombre">
                        {etiquetaDeClase(k, c.class_labels)}
                      </span>
                      <span className="barra-pista">
                        <span
                          className={`barra-relleno ${claseSerie(k, c)}`}
                          style={{
                            width: `${(c.class_balance[String(k)] ?? 0) * 100}%`,
                          }}
                        />
                      </span>
                      <span className="barra-valor">
                        {pct(c.class_balance[String(k)])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pie">
                Con las clases parejas, accuracy no engaña por desbalance — pero
                sigue sin ser la métrica de decisión.
              </div>
            </section>
          )}
        </div>

        <section className="tarjeta">
          <header>
            <div>
              <h2>Qué tan bien predice</h2>
              <p className="sub">
                Rúbrica: selecciona medidas de desempeño adecuadas
              </p>
            </div>
          </header>
          <div className="cuerpo">
            {columnas.length === 0 ? (
              <div className="vacio">
                Sin datos. Llena <code>metrics</code> en{" "}
                <code>metadata.json</code>.
              </div>
            ) : (
              <div className="tabla-envoltura">
                <table>
                  <thead>
                    <tr>
                      <th className="txt">conjunto</th>
                      {columnas.map((col) => (
                        <th key={col}>
                          {col}
                          {col === c.primary_metric ? " ★" : ""}
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
          </div>
          {(c.primary_metric || c.validation_method) && (
            <div className="pie">
              {c.primary_metric && (
                <>
                  <strong>★ {c.primary_metric}</strong>
                  {c.primary_metric_why ? ` — ${c.primary_metric_why}` : ""}
                </>
              )}
              {/* De dónde sale la fila de validación. Sin esto, "validation"
                  parece un conjunto apartado cuando en realidad es el promedio
                  de los folds. */}
              {c.validation_method && (
                <>
                  <br />
                  validation = {c.validation_method}
                </>
              )}
            </div>
          )}
        </section>

        {esClasificacion && c.confusion_matrix && (
          <MatrizDeConfusion contrato={c} matriz={c.confusion_matrix} />
        )}

        <div className="rejilla n2">
          <section className="tarjeta">
            <header>
              <div>
                <h2>Qué pesa, por campo</h2>
                <p className="sub">
                  Atribuido a los campos del formulario. Es el vocabulario que
                  usan la explicación y el historial.
                </p>
              </div>
            </header>
            <div className="cuerpo">
              <Barras datos={importancias} campo="feature_importances" etiquetas={etiquetas} />
            </div>
          </section>

          {derivadas.length > 0 && (
            <section className="tarjeta">
              <header>
                <div>
                  <h2>Qué columnas usa el modelo</h2>
                  <p className="sub">
                    Las columnas que salen del pipeline, sin repartir. Las que
                    no aparecen al lado son <strong>derivadas</strong>: las
                    construye el artefacto, no el usuario.
                  </p>
                </div>
              </header>
              <div className="cuerpo">
                <Barras datos={derivadas} campo="derived_importances" />
              </div>
              <div className="pie">
                Si una columna derivada carga con medio modelo, la tabla de al
                lado no lo deja ver: reparte su peso y ninguna destaca.
              </div>
            </section>
          )}
        </div>

        <section className="tarjeta">
          <header>
            <div>
              <h2>Modelos comparados</h2>
              <p className="sub">
                Rúbrica: selecciona el modelo adecuado al problema · mismo
                preprocesamiento y mismo split para los tres
              </p>
            </div>
          </header>
          <div className="cuerpo">
            <TablaDeExperimentos
              filas={c.model_comparison}
              campo="model_comparison"
              principal={c.primary_metric}
            />
          </div>
        </section>

        <section className="tarjeta">
          <header>
            <div>
              <h2>Experimentos de hiperparámetros</h2>
              <p className="sub">
                Rúbrica: ajusta los hiperparámetros · un parámetro a la vez
              </p>
            </div>
          </header>
          <div className="cuerpo">
            <TablaDeExperimentos
              filas={c.hyperparameter_experiments}
              campo="hyperparameter_experiments"
              principal={c.primary_metric}
            />
          </div>
        </section>
      </div>
    </>
  );
}

/** La matriz de confusión, leída en voz alta.
 *
 * Cuatro números sueltos no dicen nada. Lo que importa es cuál de los dos
 * errores cuesta más, y ese es el argumento entero de este modelo. La tabla lo
 * tiene que decir, no insinuar. El color va acompañado de la palabra: un color
 * de estado nunca carga el significado solo.
 */
function MatrizDeConfusion({ contrato, matriz }) {
  const etiqueta = (k) => etiquetaDeClase(k, contrato.class_labels);
  const positiva = contrato.positive_class;
  const iPos = matriz.labels.findIndex((l) => l === positiva);
  const binario = matriz.labels.length === 2 && iPos >= 0;
  const iNeg = binario ? 1 - iPos : -1;
  const total = matriz.matrix.flat().reduce((a, b) => a + b, 0);
  const celda = (i, j) => matriz.matrix[i]?.[j] ?? 0;
  const fn = binario ? celda(iPos, iNeg) : null;
  const fp = binario ? celda(iNeg, iPos) : null;

  const papel = (i, j) => {
    if (!binario) return null;
    if (i === j) return ["bien", "acierto"];
    if (i === iPos) return ["grave", "falso negativo"];
    return ["leve", "falso positivo"];
  };

  return (
    <section className="tarjeta">
      <header>
        <div>
          <h2>Qué tipo de error comete</h2>
          <p className="sub">
            Rúbrica: interpreta los errores en el contexto del problema · filas
            = valor real, columnas = predicho · conjunto de prueba
          </p>
        </div>
      </header>
      <div className="cuerpo">
        <div className="tabla-envoltura">
          <table className="matriz">
            <thead>
              <tr>
                <th className="txt">real \ predicho</th>
                {matriz.labels.map((l) => (
                  <th key={String(l)} style={{ textAlign: "center" }}>
                    {etiqueta(l)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matriz.matrix.map((fila, i) => (
                <tr key={String(matriz.labels[i])}>
                  <td className="txt">{etiqueta(matriz.labels[i])}</td>
                  {fila.map((v, j) => {
                    const p = papel(i, j);
                    return (
                      <td key={j} className={`celda ${p ? p[0] : ""}`}>
                        <span className="celda-valor">{miles(v)}</span>
                        <span className="celda-nota">
                          {((v / total) * 100).toFixed(1)}%{p && ` · ${p[1]}`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {binario && (
        <div className="pie">
          Los dos errores no cuestan lo mismo.{" "}
          <strong>{miles(fn)} falsos negativos</strong> son casos reales de{" "}
          <em>{etiqueta(positiva)}</em> que el sistema reporta como{" "}
          <em>{etiqueta(matriz.labels[iNeg])}</em>: nadie actúa sobre ellos. Los{" "}
          <strong>{miles(fp)} falsos positivos</strong> sólo movilizan recursos
          de más.
          {contrato.primary_metric === "recall" &&
            " Por eso se optimizó para recall y no para accuracy: el segundo error se compra barato."}
        </div>
      )}
    </section>
  );
}

/** Una lista de pares nombre/proporción, como barras. */
function Barras({ datos, campo, etiquetas }) {
  if (!datos.length) {
    return (
      <div className="vacio">
        Sin datos. Llena <code>{campo}</code> en <code>metadata.json</code>.
      </div>
    );
  }
  // La barra más larga define la escala: con importancias que rara vez pasan
  // del 50%, escalar a 100% deja todas cortas y no se comparan.
  const maximo = Math.max(...datos.map(([, v]) => v), 0.0001);
  return (
    <div className="barras">
      {datos.map(([nombre, valor]) => (
        <div className="barra" key={nombre}>
          <span className="barra-nombre" title={nombre}>
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

/** Pone las columnas en el orden en que se leen, no en el que llegan. */
function ordenarColumnas(filas, principal) {
  const vistas = [];
  for (const f of filas)
    for (const k of Object.keys(f || {}))
      if (!vistas.includes(k)) vistas.push(k);

  const primero = ["modelo", "model", "nombre", "name"];
  const ultimo = ["hiperparametros", "hyperparameters", "params"];
  const peso = (k) =>
    primero.includes(k) ? 0 : k === principal ? 1 : ultimo.includes(k) ? 3 : 2;

  return vistas
    .map((k, i) => [k, i])
    .sort((a, b) => peso(a[0]) - peso(b[0]) || a[1] - b[1])
    .map(([k]) => k);
}

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
  const numericas = columnasNumericas(filas, columnas);
  const mejor = Math.max(
    ...filas.map((f) => (typeof f[principal] === "number" ? f[principal] : -1)),
  );

  return (
    <div className="tabla-envoltura">
      <table className="ancha">
        <thead>
          <tr>
            {columnas.map((col) => (
              <th key={col} className={numericas.has(col) ? undefined : "txt"}>
                {col}
                {col === principal ? " ★" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              {columnas.map((col) => {
                const destaca = col === principal && f[col] === mejor;
                return (
                  <td key={col} className={numericas.has(col) ? undefined : "txt"}>
                    {destaca ? (
                      <strong>{numero(f[col])}</strong>
                    ) : typeof f[col] === "object" && f[col] !== null ? (
                      JSON.stringify(f[col])
                    ) : (
                      numero(f[col])
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
