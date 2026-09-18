export const meta = { titulo: "Bitácora", orden: 3, glifo: "◷" };

import { useEffect, useState } from "react";
import { getHistory, getModel } from "../api.js";
import { columnasNumericas, formateador, miles, pct } from "../viz.js";

// Menos de esto no sostiene ninguna afirmación sobre deriva.
const SUFICIENTE = 30;

const cuando = (iso) =>
  new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const celda = (v) => {
  if (v === null || v === undefined) return <span className="tenue">—</span>;
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return miles(v);
  return String(v);
};

export default function Historial({ onNavigate }) {
  const [datos, setDatos] = useState(null);
  const [contrato, setContrato] = useState(null);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    getHistory(50).then(setDatos).catch((e) => setError(e.message));
    // El contrato es para SABER CÓMO ESCRIBIR la predicción, no para obtener
    // los datos. Si falla, la tabla se muestra igual con valores crudos: una
    // tabla con etiquetas feas es mejor que una pantalla de error.
    getModel().then(setContrato).catch(() => setContrato(null));
  }, []);

  if (error) return <div className="estado error">{error}</div>;
  if (!datos) return <div className="estado">Cargando…</div>;

  // Qué columnas del input mostrar. Se ordenan por derived_importances —lo que
  // el modelo usa DE VERDAD— y no por feature_importances: la segunda reparte
  // el peso de `HasSpent` entre las cinco cuentas de consumo, así que las tres
  // primeras acaban siendo columnas que son cero en casi todas las filas. Una
  // tabla de ceros no deja comparar nada.
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
  ].slice(0, 4);

  const etiquetaDe = (n) =>
    (contrato?.features ?? []).find((f) => f.name === n)?.label ?? n;

  const numericas = columnasNumericas(
    datos.rows.map((f) => f.input),
    columnas,
  );
  const fmt = formateador(contrato?.dashboard?.value_format);
  const esClasificacion = (contrato?.task ?? "regresion") === "clasificacion";
  const escribir = (v) => {
    if (v == null) return "—";
    if (esClasificacion)
      return (contrato?.class_labels ?? {})[String(v)] ?? String(v);
    return fmt.completo(v);
  };
  const filasVisibles = (() => {
    const texto = busqueda.trim().toLowerCase();
    return datos.rows.filter((fila) => {
      const coincideClase =
        filtro === "todos" || String(fila.prediction) === String(filtro);
      const coincideTexto =
        !texto ||
        JSON.stringify(fila.input).toLowerCase().includes(texto) ||
        escribir(fila.prediction).toLowerCase().includes(texto) ||
        fila.prediction_id.toLowerCase().includes(texto);
      return coincideClase && coincideTexto;
    });
  })();

  const clasesDisponibles = [
    ...new Set(datos.rows.map((fila) => String(fila.prediction))),
  ];

  return (
    <>
      <header className="cabecera-vista">
        <h1>Bitácora de predicciones</h1>
        <p>
          Lo que este modelo ha estado prediciendo. No es el dataset de
          entrenamiento: es el uso real del producto, y es lo único que un
          notebook no puede contestar.
        </p>
      </header>

      <div className="pila">
        <Deriva datos={datos} contrato={contrato} />

        <section className="tarjeta">
          <header>
            <div>
              <h2>Predicciones recientes</h2>
              <p className="sub">
                {filasVisibles.length} de {datos.count} visibles · se muestran
                las variables de mayor peso en el modelo
              </p>
            </div>
            <button className="b" type="button" onClick={() => onNavigate?.("Simular")}>
              + Nueva predicción
            </button>
          </header>
          <div className="cuerpo">
            {datos.rows.length === 0 ? (
              <div className="vacio">
                Todavía no hay ninguna. Ve a <strong>Simular</strong> y haz una:
                va a aparecer aquí.
              </div>
            ) : (
              <>
                <div className="historial-filtros">
                  <label className="busqueda-historial">
                    <span className="sr-only">Buscar en el historial</span>
                    <input
                      type="search"
                      value={busqueda}
                      placeholder="Buscar planeta, destino, resultado…"
                      onChange={(e) => setBusqueda(e.target.value)}
                    />
                  </label>
                  <div className="filtros-clase" aria-label="Filtrar por resultado">
                    <button className={filtro === "todos" ? "activo" : ""} onClick={() => setFiltro("todos")}>Todos</button>
                    {clasesDisponibles.map((clase) => (
                      <button key={clase} className={filtro === clase ? "activo" : ""} onClick={() => setFiltro(clase)}>
                        {escribir(clase)}
                      </button>
                    ))}
                  </div>
                </div>

                {filasVisibles.length === 0 ? (
                  <div className="vacio">Ninguna predicción coincide con estos filtros.</div>
                ) : (
                  <div className="tabla-envoltura">
                    <table>
                      <thead>
                        <tr>
                          <th className="txt">Cuándo</th>
                          {columnas.map((c) => (
                            <th key={c} className={numericas.has(c) ? undefined : "txt"} title={c}>
                              {etiquetaDe(c)}
                            </th>
                          ))}
                          <th className="txt">Predicción</th>
                          <th className="txt">Modelo</th>
                          <th aria-label="Acciones" />
                        </tr>
                      </thead>
                      <tbody>
                        {filasVisibles.map((f) => (
                          <tr key={f.prediction_id}>
                            <td className="txt tenue">{cuando(f.created_at)}</td>
                            {columnas.map((c) => (
                              <td key={c} className={numericas.has(c) ? undefined : "txt"}>
                                {celda(f.input[c])}
                              </td>
                            ))}
                            <td className="txt"><span className="resultado-tabla">{escribir(f.prediction)}</span></td>
                            <td className="txt mono">{f.model_version}</td>
                            <td>
                              <button
                                type="button"
                                className="repetir-prediccion"
                                onClick={() => onNavigate?.("Simular", { input: f.input, predictionId: f.prediction_id })}
                              >
                                Reutilizar →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

/** Lo que el producto predice, contra lo que vio al entrenar.
 *
 * Es la vista que justifica que exista un historial. Un notebook reporta
 * métricas sobre un conjunto de prueba; sólo un producto en uso contesta
 * "¿el modelo está viendo algo distinto de lo que aprendió?".
 */
function Deriva({ datos, contrato }) {
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
  const tasaBase = Number((contrato.class_balance ?? {})[String(positiva)]);
  const hayBase = Number.isFinite(tasaBase);
  const delta = hayBase ? tasaUso - tasaBase : null;
  const bastantes = n >= SUFICIENTE;

  const etiqueta =
    (contrato.class_labels ?? {})[String(positiva)] ?? String(positiva);

  return (
    <section className="tarjeta">
      <header>
        <div>
          <h2>Uso real contra entrenamiento</h2>
          <p className="sub">
            Si el producto empieza a predecir muy distinto de lo que vio al
            entrenar, es la primera señal de que el modelo se está quedando
            viejo.
          </p>
        </div>
        <span className={bastantes ? "insignia" : "insignia aviso"}>
          {bastantes ? "muestra suficiente" : `faltan ${SUFICIENTE - n}`}
        </span>
      </header>

      <div className="cuerpo">
        <div className="rejilla auto" style={{ marginBottom: "var(--e4)" }}>
          <div className="cifra acento">
            <span className="cifra-etiqueta">predicciones</span>
            <span className="cifra-valor">{miles(n)}</span>
          </div>
          <div className="cifra">
            <span className="cifra-etiqueta">{etiqueta} · uso real</span>
            <span className="cifra-valor">{pct(tasaUso)}</span>
          </div>
          {hayBase && (
            <div className="cifra">
              <span className="cifra-etiqueta">{etiqueta} · entrenamiento</span>
              <span className="cifra-valor">{pct(tasaBase)}</span>
            </div>
          )}
          {delta != null && (
            <div className="cifra">
              <span className="cifra-etiqueta">diferencia</span>
              <span className="cifra-valor">
                {delta >= 0 ? "+" : "−"}
                {Math.abs(delta * 100).toFixed(1)}
                <span className="cifra-nota"> pts</span>
              </span>
            </div>
          )}
        </div>

        {/* Dos barras sobre la misma escala. Es la forma mínima que deja ver
            la diferencia sin leer los dos números y restar. */}
        {hayBase && (
          <div className="barras">
            <div className="barra">
              <span className="barra-nombre">Uso real</span>
              <span className="barra-pista">
                <span
                  className="barra-relleno dos"
                  style={{ width: `${tasaUso * 100}%` }}
                />
              </span>
              <span className="barra-valor">{pct(tasaUso)}</span>
            </div>
            <div className="barra">
              <span className="barra-nombre">Entrenamiento</span>
              <span className="barra-pista">
                <span
                  className="barra-relleno"
                  style={{ width: `${tasaBase * 100}%` }}
                />
              </span>
              <span className="barra-valor">{pct(tasaBase)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="pie">
        {bastantes ? (
          <>
            Con {miles(n)} predicciones, una diferencia de{" "}
            <strong>{Math.abs(delta * 100).toFixed(1)} puntos</strong> ya vale
            la pena mirar. Las causas habituales son dos: el público del
            producto no se parece al del dataset, o el mundo cambió.
          </>
        ) : (
          <>
            Son {miles(n)} predicciones: demasiado pocas para afirmar nada. Este
            panel empieza a significar algo a partir de {SUFICIENTE}.
          </>
        )}
      </div>
    </section>
  );
}
