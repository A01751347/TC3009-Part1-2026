export const meta = { titulo: "Predecir", orden: 2 };

import { useEffect, useState } from "react";
import { explicar, getModel, getStats, predecir } from "../api.js";

const porcentaje = (p) => `${(p * 100).toFixed(1)}%`;

const numeroCorto = (n) =>
  new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(n);

/** Formatea el valor del target segun lo que diga el contrato, no el dominio.
 *
 * El modelo de precios quiere pesos y el de pasajeros una etiqueta. Si esta
 * vista decidiera el formato, cambiar de problema significaria editarla.
 */
function formatearValor(v, formato) {
  if (v === null || v === undefined) return "—";
  if (formato === "moneda") {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(v);
  }
  if (formato === "porcentaje") return porcentaje(v);
  return typeof v === "number" ? numeroCorto(v) : String(v);
}

const etiquetaDeClase = (c, mapa) => (mapa || {})[String(c)] ?? String(c);

export default function Predecir() {
  const [contrato, setContrato] = useState(null);
  const [valores, setValores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [explicacion, setExplicacion] = useState(null);
  const [referencia, setReferencia] = useState(null);
  const [error, setError] = useState(null);

  // El formulario NO tiene una lista de campos escrita a mano: se construye
  // con lo que dice el contrato del modelo. Si el modelo gana una feature,
  // aqui aparece un campo. Si cambia el rango, cambia la ayuda.
  useEffect(() => {
    getModel()
      .then((c) => {
        setContrato(c);
        const iniciales = {};
        for (const f of c.features) {
          if (f.type === "num") iniciales[f.name] = f.median;
          else if (f.type === "bool") iniciales[f.name] = "false";
          else iniciales[f.name] = f.allowed[0];
        }
        setValores(iniciales);
      })
      .catch((e) => setError(`No se pudo leer el contrato del modelo: ${e.message}`));
  }, []);

  // El eje de comparacion sale del contrato. Si no lo declara, no hay panel de
  // referencia: es preferible a inventar una columna que quiza no existe.
  const ejeComparacion = contrato?.dashboard?.group_by ?? null;

  async function enviar(evento) {
    evento.preventDefault();
    if (enviando) return; // sin envios duplicados mientras hay uno en curso

    setEnviando(true);
    setError(null);
    setResultado(null);
    setExplicacion(null);
    setReferencia(null);

    try {
      const r = await predecir(valores);
      setResultado(r);

      // Las dos peticiones de contexto van DESPUES y por separado: si
      // cualquiera falla, el usuario se queda con su prediccion igual.
      explicar(valores, r.prediction)
        .then((e) => setExplicacion(e.explanation))
        .catch(() => setExplicacion(null));

      // Una prediccion sola no dice nada. Al lado de lo que pasa en su grupo
      // --el mismo /api/stats de la sesion 1-- ya es una decision.
      if (ejeComparacion && valores[ejeComparacion] !== undefined) {
        getStats(valores[ejeComparacion])
          .then((s) => setReferencia(s))
          .catch(() => setReferencia(null));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (error && !contrato) {
    return <div className="estado error">{error}</div>;
  }
  if (!contrato) {
    return <div className="estado">Cargando el contrato del modelo...</div>;
  }

  const esClasificacion = (contrato.task || "regresion") === "clasificacion";

  return (
    <>
      <p className="subtitulo-vista">
        Modelo {contrato.model_version} &middot; entrenado el{" "}
        {contrato.trained_at.slice(0, 10)}
      </p>

      <div className="dos-columnas">
        <form className="panel" onSubmit={enviar}>
          <h2>{contrato.dashboard?.form_title ?? "Datos de entrada"}</h2>
          <p className="subtitulo">
            {contrato.features.length} campos, los que declara el contrato del
            modelo.
          </p>

          <div className="campos">
            {contrato.features.map((f) => (
              <label key={f.name} className="campo">
                <span className="etiqueta-campo">{f.name}</span>

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

                {/* Un booleano se pide con un select y no con un checkbox: un
                    checkbox no distingue "falso" de "no contestado", y aqui el
                    contrato exige las dos opciones explicitas. */}
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

                {f.type === "num" && (
                  <span className="ayuda-campo">
                    entre {f.min.toLocaleString()} y {f.max.toLocaleString()}
                  </span>
                )}
              </label>
            ))}
          </div>

          <button type="submit" className="primario" disabled={enviando}>
            {enviando ? "Consultando el modelo..." : "Predecir"}
          </button>
        </form>

        <div className="panel">
          <h2>{esClasificacion ? "Predicción" : "Estimación"}</h2>

          {error && (
            <div className="aviso-error">
              <strong>No se pudo predecir.</strong>
              <p>{error}</p>
            </div>
          )}

          {!error && !resultado && (
            <p className="vacio">
              Llena el formulario y presiona <em>Predecir</em>.
            </p>
          )}

          {resultado && (
            <>
              <div className="precio">
                {esClasificacion
                  ? resultado.prediction_label ?? String(resultado.prediction)
                  : formatearValor(
                      resultado.prediction,
                      contrato.dashboard?.value_format ?? "moneda",
                    )}
              </div>

              {/* La confianza no es un adorno: una clasificacion al 51% y una
                  al 99% son decisiones distintas, y esconder la diferencia es
                  lo que hace que la gente confie de mas en un modelo. */}
              {esClasificacion && resultado.probabilities?.length > 0 && (
                <div className="barras">
                  {resultado.probabilities.map((p) => (
                    <div className="barra-fila" key={String(p.class)}>
                      <span className="barra-etiqueta">{p.label}</span>
                      <span className="barra-pista">
                        <span
                          className="barra-relleno"
                          style={{ width: `${p.probability * 100}%` }}
                        />
                      </span>
                      <span className="barra-valor">
                        {porcentaje(p.probability)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {resultado.warnings?.length > 0 && (
                <div className="aviso-cuidado">
                  {resultado.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              )}

              <Referencia
                referencia={referencia}
                resultado={resultado}
                contrato={contrato}
                esClasificacion={esClasificacion}
              />

              {explicacion && <p className="explicacion">{explicacion}</p>}

              <dl className="ficha">
                <dt>modelo</dt>
                <dd>{resultado.model_version}</dd>
                <dt>id</dt>
                <dd className="mono">{resultado.prediction_id.slice(0, 8)}</dd>
              </dl>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Pone la predicción al lado de lo que pasó en el entrenamiento.
 *
 * Es el mismo /api/stats del tablero: una predicción sin referencia es un
 * número sin escala.
 */
function Referencia({ referencia, resultado, contrato, esClasificacion }) {
  if (!referencia?.target) return null;
  const t = referencia.target;

  if (esClasificacion) {
    if (t.kind !== "categorico" || t.positive_rate === null) return null;
    const suyo = resultado.probabilities?.find(
      (p) => p.class === t.positive_class,
    );
    return (
      <p className="referencia">
        En <strong>{referencia.scope ?? "el conjunto completo"}</strong>,{" "}
        {porcentaje(t.positive_rate)} de {numeroCorto(referencia.count)} casos
        del entrenamiento fueron{" "}
        {etiquetaDeClase(t.positive_class, contrato.class_labels)}
        {suyo && (
          <>
            {" "}— este caso está en <strong>{porcentaje(suyo.probability)}</strong>
          </>
        )}
        .
      </p>
    );
  }

  if (t.kind === "categorico" || t.mean === undefined) return null;
  const formato = contrato.dashboard?.value_format ?? "moneda";
  const delta = Math.abs(
    Math.round(((resultado.prediction - t.mean) / t.mean) * 100),
  );
  return (
    <p className="referencia">
      El promedio en <strong>{referencia.scope ?? "el conjunto completo"}</strong>{" "}
      es {formatearValor(t.mean, formato)} sobre{" "}
      {numeroCorto(referencia.count)} registros — este caso está{" "}
      <strong>
        {delta}% {resultado.prediction >= t.mean ? "arriba" : "abajo"}
      </strong>
      .
    </p>
  );
}
