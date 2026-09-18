export const meta = { titulo: "Predecir", orden: 2, glifo: "◈" };

import { useEffect, useMemo, useRef, useState } from "react";
import { explicar, getModel, getSimilares, getStats, predecir } from "../api.js";
import { claseSerie, formateador, miles, pct } from "../viz.js";

const etiquetaDeClase = (clase, mapa) =>
  (mapa || {})[String(clase)] ?? String(clase);

function tipicos(contrato) {
  return Object.fromEntries(
    contrato.features.map((f) => {
      if (f.type === "num") return [f.name, f.median];
      if (f.type === "bool") return [f.name, "false"];
      return [f.name, f.allowed[0]];
    }),
  );
}

function booleanoComoTexto(valor) {
  return valor === true || valor === 1 || ["true", "1", "si", "yes"].includes(String(valor).toLowerCase())
    ? "true"
    : "false";
}

/** Convierte los valores de HTML a los tipos que espera el API.
 *
 * Es especialmente importante para /api/explain: ese endpoint no vuelve a
 * validar el input. Enviar la cadena "false" haría que Python la leyera como
 * verdadera al redactar la explicación.
 */
function entradaParaApi(valores, contrato) {
  return Object.fromEntries(
    contrato.features.map((f) => {
      const valor = valores[f.name];
      if (f.type === "num") return [f.name, Number(valor)];
      if (f.type === "bool") return [f.name, String(valor) === "true"];
      return [f.name, valor];
    }),
  );
}

function validarLocal(valores, contrato) {
  const errores = {};
  for (const f of contrato.features) {
    const valor = valores[f.name];
    if (valor === "" || valor === null || valor === undefined) {
      errores[f.name] = "Completa este campo";
    } else if (f.type === "num" && !Number.isFinite(Number(valor))) {
      errores[f.name] = "Escribe un número válido";
    }
  }

  return errores;
}

function cuantosCambiados(valores, contrato) {
  const base = tipicos(contrato);
  return contrato.features.filter(
    (f) => String(valores[f.name] ?? "") !== String(base[f.name] ?? ""),
  ).length;
}

function mismaEntrada(valores, entrada, contrato) {
  if (!entrada) return false;
  const actual = entradaParaApi(valores, contrato);
  return contrato.features.every(
    (f) => String(actual[f.name]) === String(entrada[f.name]),
  );
}

/** Agrupa leyendo nombres y ayudas del contrato. Si otro modelo no declara
 * vocabulario de viaje, cae en una sola sección genérica. */
function seccionesDelFormulario(contrato) {
  const grupos = { perfil: [], viaje: [], consumo: [] };
  for (const f of contrato.features) {
    const texto = `${f.name} ${f.label ?? ""} ${f.help ?? ""}`.toLowerCase();
    if (f.name === "CryoSleep" || texto.includes("gasto a bordo")) {
      grupos.consumo.push(f);
    } else if (/homeplanet|destination|cabin_/.test(f.name.toLowerCase())) {
      grupos.viaje.push(f);
    } else {
      grupos.perfil.push(f);
    }
  }

  const prioridad = {
    HomePlanet: 1,
    Destination: 2,
    Cabin_Deck: 3,
    Cabin_Side: 4,
    Cabin_Num: 5,
    CryoSleep: 1,
    RoomService: 2,
    FoodCourt: 3,
    ShoppingMall: 4,
    Spa: 5,
    VRDeck: 6,
  };
  grupos.viaje.sort((a, b) => (prioridad[a.name] ?? 99) - (prioridad[b.name] ?? 99));
  grupos.consumo.sort((a, b) => (prioridad[a.name] ?? 99) - (prioridad[b.name] ?? 99));

  const esFormularioDeViaje = grupos.viaje.length > 0 || grupos.consumo.length > 0;
  return [
    {
      key: "perfil",
      titulo: esFormularioDeViaje ? "Perfil del pasajero" : "Datos del caso",
      descripcion: esFormularioDeViaje
        ? "Información básica del pasajero y su grupo."
        : "Valores que recibirá el modelo.",
      campos: grupos.perfil,
    },
    {
      key: "viaje",
      titulo: "Trayecto y cabina",
      descripcion: "Origen, destino y ubicación dentro de la nave.",
      campos: grupos.viaje,
    },
    {
      key: "consumo",
      titulo: "Consumo a bordo",
      descripcion: "Criosueño y créditos consumidos durante el viaje.",
      campos: grupos.consumo,
    },
  ].filter((seccion) => seccion.campos.length > 0);
}

export default function Predecir({ contextoNavegacion, onContextoConsumido }) {
  const [contrato, setContrato] = useState(null);
  const [valores, setValores] = useState({});
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [cargandoContexto, setCargandoContexto] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [entradaResultado, setEntradaResultado] = useState(null);
  const [explicacion, setExplicacion] = useState(null);
  const [referencia, setReferencia] = useState(null);
  const [similares, setSimilares] = useState(null);
  const [escenarios, setEscenarios] = useState([]);
  const [avisoFormulario, setAvisoFormulario] = useState(null);
  const [error, setError] = useState(null);
  const solicitudActual = useRef(0);

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

  useEffect(() => {
    if (!contrato || !contextoNavegacion?.input) return;
    const preparados = {};
    for (const f of contrato.features) {
      const valor = contextoNavegacion.input[f.name];
      preparados[f.name] = f.type === "bool" ? booleanoComoTexto(valor) : valor;
    }
    setValores(preparados);
    setErrores({});
    setError(null);
    setAvisoFormulario("Recuperamos esta entrada desde el historial. Revísala y genera una nueva predicción para compararla.");
    onContextoConsumido?.();
  }, [contrato, contextoNavegacion, onContextoConsumido]);

  const secciones = useMemo(
    () => (contrato ? seccionesDelFormulario(contrato) : []),
    [contrato],
  );

  if (error && !contrato) return <div className="estado error">{error}</div>;
  if (!contrato) return <div className="estado">Cargando el contrato…</div>;

  const esClasificacion = (contrato.task ?? "regresion") === "clasificacion";
  const ejeComparacion = contrato.dashboard?.group_by ?? null;
  const cambiados = cuantosCambiados(valores, contrato);
  const completos = contrato.features.filter((f) => {
    const v = valores[f.name];
    return v !== "" && v !== null && v !== undefined;
  }).length;
  const resultadoVigente = mismaEntrada(valores, entradaResultado, contrato);

  const camposDeGasto = contrato.features.filter((f) =>
    (f.help ?? "").toLowerCase().includes("gasto a bordo"),
  );
  const gastoTotal = camposDeGasto.reduce(
    (total, f) => total + (Number(valores[f.name]) || 0),
    0,
  );
  const enCrio = String(valores.CryoSleep) === "true";

  function actualizarCampo(campo, valor) {
    setValores((actuales) => {
      const siguientes = { ...actuales, [campo.name]: valor };
      if (campo.name === "CryoSleep" && String(valor) === "true") {
        for (const gasto of camposDeGasto) siguientes[gasto.name] = 0;
      }
      return siguientes;
    });
    setErrores((actuales) => ({ ...actuales, [campo.name]: undefined }));
    setError(null);
    if (campo.name === "CryoSleep" && String(valor) === "true" && gastoTotal > 0) {
      setAvisoFormulario("Activaste el criosueño; ajustamos los consumos a 0 para mantener un caso coherente.");
    } else {
      setAvisoFormulario(null);
    }
  }

  function cargarValores(nuevos, mensaje) {
    const preparados = {};
    for (const f of contrato.features) {
      const valor = nuevos[f.name];
      preparados[f.name] = f.type === "bool" ? booleanoComoTexto(valor) : valor;
    }
    setValores(preparados);
    setErrores({});
    setError(null);
    setAvisoFormulario(mensaje);
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (enviando) return;

    const erroresNuevos = validarLocal(valores, contrato);
    setErrores(erroresNuevos);
    if (Object.keys(erroresNuevos).length > 0) {
      requestAnimationFrame(() =>
        document.querySelector(".campo.invalido")?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      );
      return;
    }

    const entrada = entradaParaApi(valores, contrato);
    const idSolicitud = ++solicitudActual.current;
    setEnviando(true);
    setCargandoContexto(false);
    setResultado(null);
    setEntradaResultado(null);
    setExplicacion(null);
    setReferencia(null);
    setSimilares(null);
    setError(null);

    try {
      const respuesta = await predecir(entrada);
      if (idSolicitud !== solicitudActual.current) return;
      setResultado(respuesta);
      setEntradaResultado(entrada);
      setEnviando(false);
      setCargandoContexto(true);

      const peticiones = [
        explicar(entrada, respuesta.prediction),
        getSimilares(entrada, 12),
      ];
      if (ejeComparacion && entrada[ejeComparacion] !== undefined) {
        peticiones.push(getStats(entrada[ejeComparacion], ejeComparacion));
      }

      const [detalle, cohorte, contexto] = await Promise.allSettled(peticiones);
      if (idSolicitud !== solicitudActual.current) return;
      if (detalle.status === "fulfilled") setExplicacion(detalle.value);
      if (cohorte.status === "fulfilled") setSimilares(cohorte.value);
      if (contexto?.status === "fulfilled") setReferencia(contexto.value);
    } catch (e) {
      if (idSolicitud === solicitudActual.current) setError(e.message);
    } finally {
      if (idSolicitud === solicitudActual.current) {
        setEnviando(false);
        setCargandoContexto(false);
      }
    }
  }

  function guardarEscenario() {
    if (!resultado || !entradaResultado) return;
    setEscenarios((actuales) => {
      if (actuales.some((e) => e.resultado.prediction_id === resultado.prediction_id)) {
        return actuales;
      }
      const nombresUsados = new Set(actuales.map((e) => e.nombre));
      const letra = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find(
        (c) => !nombresUsados.has(`Escenario ${c}`),
      ) ?? "Z";
      return [
        ...actuales.slice(-2),
        {
          nombre: `Escenario ${letra}`,
          entrada: entradaResultado,
          resultado,
        },
      ];
    });
  }

  return (
    <>
      <header className="cabecera-vista">
        <h1>Simular un pasajero</h1>
        <p>
          Completa el perfil y obtén una probabilidad acompañada de contexto.
          El formulario se genera desde el contrato del modelo {contrato.model_version}.
        </p>
      </header>

      <div className="predict-layout">
        <form className="tarjeta formulario-prediccion" onSubmit={enviar} noValidate>
          <header>
            <div>
              <span className="sobrelinea">Entrada del modelo</span>
              <h2>{contrato.dashboard?.form_title ?? "Datos de entrada"}</h2>
              <p className="sub">
                {completos}/{contrato.features.length} campos completos · {cambiados} modificados
              </p>
            </div>
            <div className="progreso-formulario" aria-label={`${completos} de ${contrato.features.length} campos completos`}>
              <span style={{ width: `${(completos / contrato.features.length) * 100}%` }} />
            </div>
          </header>

          <div className="presets">
            <span>Comenzar con</span>
            <button
              type="button"
              className="preset"
              onClick={() => cargarValores(tipicos(contrato), "Cargamos los valores típicos del entrenamiento.")}
            >
              Valores típicos
            </button>
            {contrato.example && (
              <button
                type="button"
                className="preset"
                onClick={() => cargarValores(contrato.example, "Cargamos el caso verificado contra el notebook.")}
              >
                Caso verificado
              </button>
            )}
          </div>

          <div className="cuerpo formulario-cuerpo">
            {avisoFormulario && (
              <div className="nota formulario-aviso" role="status">{avisoFormulario}</div>
            )}

            {secciones.map((seccion, indice) => (
              <section className="seccion-formulario" key={seccion.key}>
                <div className="seccion-titulo">
                  <span>0{indice + 1}</span>
                  <div>
                    <h3>{seccion.titulo}</h3>
                    <p>{seccion.descripcion}</p>
                  </div>
                </div>
                <div className="campos">
                  {seccion.campos.map((f) => (
                    <Campo
                      key={f.name}
                      campo={f}
                      valor={valores[f.name]}
                      error={errores[f.name]}
                      deshabilitado={enCrio && camposDeGasto.some((g) => g.name === f.name)}
                      onChange={(valor) => actualizarCampo(f, valor)}
                    />
                  ))}
                </div>
                {seccion.key === "consumo" && camposDeGasto.length > 0 && (
                  <div className="resumen-consumo">
                    <span>Gasto total del caso</span>
                    <strong>{miles(gastoTotal)} créditos</strong>
                    {enCrio && <small>Criosueño activo · consumos bloqueados</small>}
                  </div>
                )}
              </section>
            ))}
          </div>

          <div className="pie pie-formulario">
            <div>
              <span className="pie-estado">{completos === contrato.features.length ? "Listo para calcular" : "Faltan campos"}</span>
              <small>Los valores fuera del rango se aceptan, pero el API los marca como menos confiables.</small>
            </div>
            <button type="submit" className="b primaria boton-predecir" disabled={enviando}>
              {enviando ? <><span className="spinner" /> Calculando…</> : resultado && !resultadoVigente ? "Actualizar predicción" : "Generar predicción"}
            </button>
          </div>
        </form>

        <Resultado
          contrato={contrato}
          resultado={resultado}
          explicacion={explicacion}
          referencia={referencia}
          similares={similares}
          escenarios={escenarios}
          entradaResultado={entradaResultado}
          error={error}
          enviando={enviando}
          cargandoContexto={cargandoContexto}
          vigente={resultadoVigente}
          esClasificacion={esClasificacion}
          onGuardarEscenario={guardarEscenario}
          onCargarEscenario={(escenario) =>
            cargarValores(
              escenario.entrada,
              `Cargamos ${escenario.nombre}. Ajusta lo necesario y vuelve a calcular.`,
            )
          }
          onEliminarEscenario={(predictionId) =>
            setEscenarios((actuales) =>
              actuales.filter((e) => e.resultado.prediction_id !== predictionId),
            )
          }
        />
      </div>
    </>
  );
}

function Campo({ campo, valor, error, deshabilitado, onChange }) {
  const id = `campo-${campo.name}`;
  const numero = Number(valor);
  const fueraDeRango =
    campo.type === "num" &&
    Number.isFinite(numero) &&
    (numero < campo.min || numero > campo.max);
  const ayudaId = `${id}-ayuda`;

  return (
    <div className={`campo ${error ? "invalido" : ""} ${deshabilitado ? "deshabilitado" : ""}`}>
      <label htmlFor={id} title={campo.name}>{campo.label ?? campo.name}</label>

      {campo.type === "cat" && (
        <select id={id} value={valor ?? ""} onChange={(e) => onChange(e.target.value)} aria-describedby={ayudaId}>
          {campo.allowed.map((opcion) => <option key={String(opcion)} value={opcion}>{opcion}</option>)}
        </select>
      )}

      {campo.type === "bool" && (
        <div id={id} className="selector-binario" role="group" aria-labelledby={`${id}-label`}>
          <span id={`${id}-label`} className="sr-only">{campo.label ?? campo.name}</span>
          <button type="button" className={String(valor) === "false" ? "activo" : ""} onClick={() => onChange("false")}>No</button>
          <button type="button" className={String(valor) === "true" ? "activo" : ""} onClick={() => onChange("true")}>Sí</button>
        </div>
      )}

      {campo.type === "num" && (
        <div className="entrada-numero">
          <input
            id={id}
            type="number"
            step="any"
            inputMode="decimal"
            value={valor ?? ""}
            disabled={deshabilitado}
            aria-invalid={Boolean(error)}
            aria-describedby={ayudaId}
            onChange={(e) => onChange(e.target.value)}
          />
          {campo.help?.includes("créditos") && <span>cr</span>}
        </div>
      )}

      <span id={ayudaId} className={`ayuda ${fueraDeRango ? "fuera-rango" : ""}`}>
        {error ? error : fueraDeRango ? `Fuera del rango de entrenamiento (${miles(campo.min)}–${miles(campo.max)})` : <>{campo.type === "num" && `${miles(campo.min)}–${miles(campo.max)}`}{campo.type === "num" && campo.help && " · "}{campo.help}</>}
      </span>
    </div>
  );
}

function Resultado({
  contrato,
  resultado,
  explicacion,
  referencia,
  similares,
  escenarios,
  entradaResultado,
  error,
  enviando,
  cargandoContexto,
  vigente,
  esClasificacion,
  onGuardarEscenario,
  onCargarEscenario,
  onEliminarEscenario,
}) {
  const fmt = formateador(contrato.dashboard?.value_format);
  const confianza = resultado?.confidence;

  return (
    <section className="tarjeta panel-resultado" aria-live="polite" aria-busy={enviando}>
      <header>
        <div>
          <span className="sobrelinea">Salida del modelo</span>
          <h2>{esClasificacion ? "Resultado" : "Estimación"}</h2>
          <p className="sub">Predicción, probabilidad y contexto para decidir.</p>
        </div>
        {resultado && <span className={vigente ? "insignia ok" : "insignia aviso"}>{vigente ? `v${resultado.model_version}` : "Sin actualizar"}</span>}
      </header>

      <div className="cuerpo resultado-cuerpo">
        {error && <div className="nota critico"><strong>No se pudo predecir.</strong><br />{error}</div>}

        {enviando && (
          <div className="resultado-cargando">
            <span className="orbita-cargando"><i /></span>
            <strong>Calculando el resultado</strong>
            <span>Validando los campos y consultando el modelo…</span>
          </div>
        )}

        {!error && !enviando && !resultado && (
          <div className="resultado-vacio">
            <span className="resultado-vacio-icono">✦</span>
            <h3>Aquí aparecerá el resultado</h3>
            <p>La respuesta incluirá la clase predicha, su probabilidad, una comparación con el entrenamiento y los factores que más pesan.</p>
            <ol>
              <li><span>01</span> Revisa el perfil</li>
              <li><span>02</span> Genera la predicción</li>
              <li><span>03</span> Interpreta el contexto</li>
            </ol>
          </div>
        )}

        {resultado && !enviando && (
          <div className="resultado-contenido">
            {!vigente && <div className="nota aviso">Modificaste el formulario. Este resultado corresponde a los valores anteriores; actualízalo antes de usarlo.</div>}

            <div className="veredicto">
              <div>
                <span className="veredicto-kicker">El modelo predice</span>
                <span className="veredicto-clase">{esClasificacion ? (resultado.prediction_label ?? String(resultado.prediction)) : fmt.completo(resultado.prediction)}</span>
                {confianza != null && <span className="veredicto-conf">Probabilidad estimada para esta clase</span>}
              </div>
              {confianza != null && (
                <div className="resultado-orbe" style={{ "--probabilidad": `${confianza * 360}deg` }}>
                  <span>{pct(confianza)}</span>
                </div>
              )}
            </div>

            {esClasificacion && resultado.probabilities?.length > 0 && (
              <div className="bloque-resultado">
                <h3>Distribución de probabilidad</h3>
                <div className="barras probabilidades">
                  {resultado.probabilities.map((p) => (
                    <div className="barra" key={String(p.class)}>
                      <span className="barra-nombre">{p.label}</span>
                      <span className="barra-pista">
                        <span className={`barra-relleno ${claseSerie(p.class, contrato)}`} style={{ width: `${p.probability * 100}%`, opacity: p.class === resultado.prediction ? 1 : 0.42 }} />
                      </span>
                      <span className="barra-valor">{pct(p.probability)}</span>
                    </div>
                  ))}
                </div>
                <Margen resultado={resultado} />
              </div>
            )}

            {resultado.warnings?.length > 0 && (
              <div className="nota aviso advertencias-api">
                <strong>El API generó {resultado.warnings.length === 1 ? "una advertencia" : `${resultado.warnings.length} advertencias`}:</strong>
                {resultado.warnings.map((warning) => <span key={warning}>{warning}</span>)}
              </div>
            )}

            <Referencia referencia={referencia} resultado={resultado} contrato={contrato} esClasificacion={esClasificacion} fmt={fmt} />

            <CasosSimilares similares={similares} contrato={contrato} />

            {explicacion ? (
              <section className="explicacion">
                <span className="sobrelinea">Factores principales</span>
                <p>{explicacion.explanation}</p>
                <small>Explicación generada por {explicacion.source === "plantilla" ? "reglas del modelo" : explicacion.source}.</small>
              </section>
            ) : cargandoContexto ? (
              <div className="contexto-cargando"><span className="spinner" /> Preparando la explicación y el contexto…</div>
            ) : null}

            <ComparadorEscenarios
              escenarios={escenarios}
              resultado={resultado}
              entrada={entradaResultado}
              contrato={contrato}
              onGuardar={onGuardarEscenario}
              onCargar={onCargarEscenario}
              onEliminar={onEliminarEscenario}
            />

            <details className="detalle-tecnico">
              <summary>Detalles técnicos</summary>
              <dl className="ficha">
                <dt>identificador</dt><dd className="mono">{resultado.prediction_id}</dd>
                <dt>modelo</dt><dd>{resultado.model_version}</dd>
                <dt>tarea</dt><dd>{resultado.task}</dd>
              </dl>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}

function CasosSimilares({ similares, contrato }) {
  if (!similares?.count) return null;
  const target = similares.target;
  return (
    <section className="similares">
      <div className="similares-cabecera">
        <div>
          <span className="sobrelinea">Evidencia del entrenamiento</span>
          <h3>Casos parecidos</h3>
        </div>
        <span className="insignia">{similares.count} vecinos</span>
      </div>
      <div className="similares-resumen">
        <div>
          <span>Similitud media</span>
          <strong>{pct(similares.average_similarity)}</strong>
        </div>
        {target.kind === "categorico" ? (
          <div>
            <span>{target.positive_label}</span>
            <strong>{pct(target.positive_rate)}</strong>
          </div>
        ) : (
          <div>
            <span>Promedio observado</span>
            <strong>{new Intl.NumberFormat("es-MX").format(target.mean)}</strong>
          </div>
        )}
      </div>
      <div className="vecinos" aria-label="Resultados reales de los casos similares">
        {similares.neighbors.map((vecino, indice) => (
          <span
            key={indice}
            className={`vecino ${claseSerie(vecino.outcome, contrato)}`}
            title={`${vecino.outcome_label} · ${pct(vecino.similarity)} similar`}
          />
        ))}
      </div>
      <p>
        Cada punto es un caso real del entrenamiento. La cercanía pondera las
        variables por su importancia en el modelo; es contexto descriptivo, no
        una relación causal.
      </p>
    </section>
  );
}

function ComparadorEscenarios({ escenarios, resultado, entrada, contrato, onGuardar, onCargar, onEliminar }) {
  if (!resultado) return null;
  const yaGuardado = escenarios.some(
    (escenario) => escenario.resultado.prediction_id === resultado.prediction_id,
  );
  const positiva = contrato.positive_class;

  const valorComparable = (r) => {
    const probabilidad = r.probabilities?.find(
      (p) => String(p.class) === String(positiva),
    );
    return probabilidad ? pct(probabilidad.probability) : String(r.prediction_label ?? r.prediction);
  };

  const cambiosContraActual = (escenario) =>
    contrato.features.filter(
      (f) => String(escenario.entrada[f.name]) !== String(entrada?.[f.name]),
    ).length;

  return (
    <section className="comparador-escenarios">
      <div className="comparador-cabecera">
        <div>
          <span className="sobrelinea">Laboratorio what-if</span>
          <h3>Comparar escenarios</h3>
        </div>
        <button className="b compacta" type="button" onClick={onGuardar} disabled={yaGuardado}>
          {yaGuardado ? "Escenario guardado" : "+ Guardar actual"}
        </button>
      </div>
      <p className="comparador-ayuda">
        Guarda este resultado, cambia algunos campos y vuelve a calcular. Compara
        cómo responde el modelo sin interpretar el cambio como causal.
      </p>
      {escenarios.length > 0 && (
        <div className="lista-escenarios">
          {escenarios.map((escenario) => (
            <div className="escenario" key={escenario.resultado.prediction_id}>
              <div>
                <strong>{escenario.nombre}</strong>
                <span>{escenario.resultado.prediction_label ?? escenario.resultado.prediction}</span>
              </div>
              <div className="escenario-valor">
                <strong>{valorComparable(escenario.resultado)}</strong>
                <span>{cambiosContraActual(escenario)} campos distintos</span>
              </div>
              <button type="button" onClick={() => onCargar(escenario)}>Cargar</button>
              <button type="button" className="eliminar" aria-label={`Eliminar ${escenario.nombre}`} onClick={() => onEliminar(escenario.resultado.prediction_id)}>×</button>
            </div>
          ))}
          {!yaGuardado && (
            <div className="escenario actual">
              <div><strong>Actual</strong><span>{resultado.prediction_label ?? resultado.prediction}</span></div>
              <div className="escenario-valor"><strong>{valorComparable(resultado)}</strong><span>resultado en pantalla</span></div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Margen({ resultado }) {
  if (!resultado.probabilities || resultado.probabilities.length < 2) return null;
  const ordenadas = [...resultado.probabilities].sort((a, b) => b.probability - a.probability);
  const margen = ordenadas[0].probability - ordenadas[1].probability;
  const nivel = margen < 0.1 ? "ajustada" : margen < 0.3 ? "moderada" : "clara";
  return (
    <p className={`lectura-margen ${nivel === "ajustada" ? "ajustada" : ""}`}>
      <strong>Decisión {nivel}.</strong> Las dos clases principales están separadas por {(margen * 100).toFixed(1)} puntos.
    </p>
  );
}

function Referencia({ referencia, resultado, contrato, esClasificacion, fmt }) {
  if (!referencia?.target) return null;
  const target = referencia.target;

  if (esClasificacion) {
    if (target.kind !== "categorico" || target.positive_rate == null) return null;
    const clase = contrato.positive_class ?? target.positive_class;
    const probabilidad = resultado.probabilities?.find((p) => String(p.class) === String(clase));
    return (
      <section className="referencia-resultado">
        <div><span>Grupo comparable</span><strong>{referencia.scope ?? "Conjunto completo"}</strong><small>{miles(referencia.count)} casos de entrenamiento</small></div>
        <div><span>Tasa histórica</span><strong>{pct(target.positive_rate)}</strong><small>{etiquetaDeClase(clase, contrato.class_labels)}</small></div>
        {probabilidad && <div><span>Este caso</span><strong>{pct(probabilidad.probability)}</strong><small>probabilidad estimada</small></div>}
      </section>
    );
  }

  if (target.kind === "categorico" || target.mean == null) return null;
  const delta = target.mean === 0 ? null : ((resultado.prediction - target.mean) / Math.abs(target.mean)) * 100;
  return (
    <section className="referencia-resultado">
      <div><span>Grupo comparable</span><strong>{referencia.scope ?? "Conjunto completo"}</strong><small>{miles(referencia.count)} registros</small></div>
      <div><span>Promedio histórico</span><strong>{fmt.completo(target.mean)}</strong></div>
      {delta != null && <div><span>Diferencia</span><strong>{delta >= 0 ? "+" : ""}{delta.toFixed(0)}%</strong><small>contra el promedio</small></div>}
    </section>
  );
}
