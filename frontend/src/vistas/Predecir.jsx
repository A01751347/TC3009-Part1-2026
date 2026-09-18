export const meta = { titulo: "Predecir", orden: 2, glifo: "◈" };

import { useEffect, useState } from "react";
import { explicar, getModel, getStats, predecir } from "../api.js";
import { claseSerie, formateador, miles, pct } from "../viz.js";

const etiquetaDeClase = (c, mapa) => (mapa || {})[String(c)] ?? String(c);

/** El caso "promedio" que declara el contrato: mediana o primera categoría. */
function tipicos(contrato) {
  const v = {};
  for (const f of contrato.features) {
    if (f.type === "num") v[f.name] = f.median;
    else if (f.type === "bool") v[f.name] = "false";
    else v[f.name] = f.allowed[0];
  }
  return v;
}

/** Cuántos campos se apartan del caso típico. Es contexto, no adorno: una
 *  predicción sobre un caso idéntico a la mediana dice poco. */
function cuantosCambiados(valores, contrato) {
  const base = tipicos(contrato);
  return Object.keys(base).filter(
    (k) => String(valores[k] ?? "") !== String(base[k] ?? ""),
  ).length;
}

export default function Predecir() {
  const [contrato, setContrato] = useState(null);
  const [valores, setValores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [explicacion, setExplicacion] = useState(null);
  const [referencia, setReferencia] = useState(null);
  const [error, setError] = useState(null);

  // El formulario NO tiene una lista de campos escrita a mano: se construye con
  // lo que dice el contrato. Si el modelo gana una feature, aquí aparece un
  // campo; si cambia el rango, cambia la ayuda.
  useEffect(() => {
    getModel()
      .then((c) => {
        setContrato(c);
        setValores(tipicos(c));
      })
      .catch((e) =>
        setError(`No se pudo leer el contrato del modelo: ${e.message}`),
      );
  }, []);

  const ejeComparacion = contrato?.dashboard?.group_by ?? null;

  function limpiar() {
    setResultado(null);
    setExplicacion(null);
    setReferencia(null);
    setError(null);
  }

  /** El caso de referencia: el mismo example.json contra el que corre la
   *  prueba de paridad, así que es el único del que se puede afirmar que el
   *  notebook y el servicio devuelven lo mismo. */
  function cargarEjemplo() {
    if (!contrato?.example) return;
    const v = {};
    for (const f of contrato.features) {
      const valor = contrato.example[f.name];
      v[f.name] = f.type === "bool" ? String(Boolean(valor)) : valor;
    }
    setValores(v);
    limpiar();
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (enviando) return; // sin envíos duplicados mientras hay uno en curso
    setEnviando(true);
    limpiar();

    try {
      const r = await predecir(valores);
      setResultado(r);

      // Las dos peticiones de contexto van DESPUÉS y por separado: si
      // cualquiera falla, el usuario se queda con su predicción igual.
      explicar(valores, r.prediction)
        .then((e) => setExplicacion(e.explanation))
        .catch(() => setExplicacion(null));

      if (ejeComparacion && valores[ejeComparacion] !== undefined) {
        getStats(valores[ejeComparacion])
          .then(setReferencia)
          .catch(() => setReferencia(null));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (error && !contrato) return <div className="estado error">{error}</div>;
  if (!contrato) return <div className="estado">Cargando el contrato…</div>;

  const esClasificacion = (contrato.task ?? "regresion") === "clasificacion";
  const cambiados = cuantosCambiados(valores, contrato);

  return (
    <>
      <header className="cabecera-vista">
        <h1>Predecir un caso</h1>
        <p>
          Los {contrato.features.length} campos salen del contrato del modelo,
          no de esta pantalla. Modelo {contrato.model_version}, entrenado el{" "}
          {contrato.trained_at.slice(0, 10)}.
        </p>
      </header>

      <div className="rejilla n2">
        <form className="tarjeta" onSubmit={enviar}>
          <header>
            <div>
              <h2>{contrato.dashboard?.form_title ?? "Datos de entrada"}</h2>
              <p className="sub">
                {cambiados === 0
                  ? "Todos los campos están en su valor típico."
                  : `${cambiados} de ${contrato.features.length} campos se apartan del caso típico.`}
              </p>
            </div>
          </header>

          <div className="cuerpo">
            <div className="campos">
              {contrato.features.map((f) => (
                <label key={f.name} className="campo">
                  {/* El nombre legible sale del contrato. Si no lo trae, se usa
                      el técnico: es feo, pero nunca queda vacío. */}
                  <span title={f.name}>{f.label ?? f.name}</span>

                  {f.type === "cat" && (
                    <select
                      value={valores[f.name] ?? ""}
                      onChange={(e) =>
                        setValores({ ...valores, [f.name]: e.target.value })
                      }
                    >
                      {f.allowed.map((v) => (
                        <option key={String(v)} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Un booleano se pide con un desplegable y no con una
                      casilla: una casilla no distingue "falso" de "no
                      contestado". */}
                  {f.type === "bool" && (
                    <select
                      value={valores[f.name] ?? "false"}
                      onChange={(e) =>
                        setValores({ ...valores, [f.name]: e.target.value })
                      }
                    >
                      <option value="false">No</option>
                      <option value="true">Sí</option>
                    </select>
                  )}

                  {f.type === "num" && (
                    <input
                      type="number"
                      step="any"
                      value={valores[f.name] ?? ""}
                      onChange={(e) =>
                        setValores({ ...valores, [f.name]: e.target.value })
                      }
                    />
                  )}

                  <span className="ayuda">
                    {f.type === "num" &&
                      `${f.min.toLocaleString()} – ${f.max.toLocaleString()}`}
                    {f.type === "num" && f.help && " · "}
                    {f.help}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="pie">
            <div className="acciones">
              <button type="submit" className="b primaria" disabled={enviando}>
                {enviando ? "Consultando…" : "Predecir"}
              </button>
              {contrato.example && (
                <button type="button" className="b" onClick={cargarEjemplo}>
                  Caso de ejemplo
                </button>
              )}
              <button
                type="button"
                className="b"
                onClick={() => {
                  setValores(tipicos(contrato));
                  limpiar();
                }}
              >
                Valores típicos
              </button>
            </div>
          </div>
        </form>

        <Resultado
          contrato={contrato}
          resultado={resultado}
          explicacion={explicacion}
          referencia={referencia}
          error={error}
          esClasificacion={esClasificacion}
        />
      </div>
    </>
  );
}

function Resultado({
  contrato,
  resultado,
  explicacion,
  referencia,
  error,
  esClasificacion,
}) {
  const fmt = formateador(contrato.dashboard?.value_format);

  return (
    <section className="tarjeta">
      <header>
        <div>
          <h2>{esClasificacion ? "Predicción" : "Estimación"}</h2>
          <p className="sub">Lo que el modelo responde para este caso.</p>
        </div>
        {resultado && (
          <span className="insignia">v{resultado.model_version}</span>
        )}
      </header>

      <div className="cuerpo">
        {error && (
          <div className="nota critico">
            <strong>No se pudo predecir.</strong>
            <br />
            {error}
          </div>
        )}

        {!error && !resultado && (
          <div className="vacio">
            Llena el formulario y presiona <strong>Predecir</strong>.
          </div>
        )}

        {resultado && (
          <div className="pila" style={{ gap: "var(--e4)" }}>
            <div className="veredicto">
              <span className="veredicto-clase">
                {esClasificacion
                  ? (resultado.prediction_label ?? String(resultado.prediction))
                  : fmt.completo(resultado.prediction)}
              </span>
              {resultado.confidence != null && (
                <span className="veredicto-conf">
                  {pct(resultado.confidence)} de confianza
                </span>
              )}
            </div>

            {/* La confianza no es un adorno: una clasificación al 51% y una al
                99% son decisiones distintas, y esconder la diferencia es lo que
                hace que la gente confíe de más en un modelo. */}
            {esClasificacion && resultado.probabilities?.length > 0 && (
              <div className="barras">
                {resultado.probabilities.map((p) => (
                  <div className="barra" key={String(p.class)}>
                    <span className="barra-nombre">{p.label}</span>
                    <span className="barra-pista">
                      <span
                        // El color es de la CLASE, siempre el mismo. La que no
                        // ganó se apaga con opacidad, no cambiando de tono.
                        className={`barra-relleno ${claseSerie(p.class, contrato)}`}
                        style={{
                          width: `${p.probability * 100}%`,
                          opacity: p.class === resultado.prediction ? 1 : 0.4,
                        }}
                      />
                      {/* El umbral, dibujado. Dos barras se comparan bien,
                          pero sin la marca del 50% no se ve CUÁNTO margen hay
                          sobre la decisión. */}
                      <span className="barra-umbral" style={{ left: "50%" }} />
                    </span>
                    <span className="barra-valor">{pct(p.probability)}</span>
                  </div>
                ))}
              </div>
            )}

            <Margen resultado={resultado} />

            {resultado.warnings?.length > 0 && (
              <div className="nota aviso">
                {resultado.warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            )}

            <Referencia
              referencia={referencia}
              resultado={resultado}
              contrato={contrato}
              esClasificacion={esClasificacion}
              fmt={fmt}
            />

            {explicacion && <p className="nota">{explicacion}</p>}

            <dl className="ficha">
              <dt>identificador</dt>
              <dd className="mono">{resultado.prediction_id}</dd>
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}

/** Cuánto margen tiene la decisión sobre el umbral, y qué significa.
 *
 * El modelo se entrenó con scale_pos_weight=2: está desplazado a propósito
 * hacia el recall. Decirlo aquí, junto al número, es la diferencia entre una
 * predicción y una predicción que se puede usar para decidir.
 */
function Margen({ resultado }) {
  if (resultado.confidence == null) return null;
  const margen = resultado.confidence - 0.5;
  const ajustada = margen < 0.1;
  return (
    <div className={ajustada ? "nota aviso" : "nota"}>
      <strong>
        {ajustada ? "Decisión ajustada" : "Decisión holgada"}:{" "}
        {(margen * 100).toFixed(1)} puntos
      </strong>{" "}
      por encima del umbral del 50%.
      {ajustada &&
        " Un caso así cae cerca de la frontera, donde el modelo se equivoca más."}
    </div>
  );
}

/** Pone la predicción al lado de lo que pasó en el entrenamiento. Es el mismo
 *  /api/stats del tablero: una predicción sin referencia es un número sin
 *  escala. */
function Referencia({ referencia, resultado, contrato, esClasificacion, fmt }) {
  if (!referencia?.target) return null;
  const t = referencia.target;

  if (esClasificacion) {
    if (t.kind !== "categorico" || t.positive_rate == null) return null;
    // La clase se nombra desde el CONTRATO, no desde el tablero: el tablero lee
    // la columna del CSV --donde es booleana-- y el contrato declara 0 y 1.
    const clase = contrato.positive_class ?? t.positive_class;
    const suyo = resultado.probabilities?.find((p) => p.class === clase);
    return (
      <p className="nota">
        En <strong>{referencia.scope ?? "el conjunto completo"}</strong>,{" "}
        {pct(t.positive_rate)} de {miles(referencia.count)} casos del
        entrenamiento fueron{" "}
        <strong>{etiquetaDeClase(clase, contrato.class_labels)}</strong>
        {suyo && <> — este caso está en <strong>{pct(suyo.probability)}</strong></>}.
      </p>
    );
  }

  if (t.kind === "categorico" || t.mean == null) return null;
  const delta = Math.abs(
    Math.round(((resultado.prediction - t.mean) / t.mean) * 100),
  );
  return (
    <p className="nota">
      El promedio en{" "}
      <strong>{referencia.scope ?? "el conjunto completo"}</strong> es{" "}
      {fmt.completo(t.mean)} sobre {miles(referencia.count)} registros — este
      caso está{" "}
      <strong>
        {delta}% {resultado.prediction >= t.mean ? "arriba" : "abajo"}
      </strong>
      .
    </p>
  );
}
