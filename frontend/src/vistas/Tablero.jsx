export const meta = { titulo: "Misión", orden: 1, glifo: "▤" };

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getData, getStats } from "../api.js";
import {
  columnasNumericas,
  cursorSuave,
  ejeBase,
  formateador,
  miles,
  rejilla,
  useTokens,
} from "../viz.js";

// Cuántos registros hacen que una barra sea creíble.
//
// La cubierta T tiene 5 pasajeros y una tasa del 20%. Dibujada igual que una
// barra de 2.794, invita a leer una señal donde sólo hay ruido. Se atenúa y se
// marca, en vez de esconderla: sigue siendo un dato.
const MINIMO_FIABLE = 30;

const celda = (v) => {
  if (v === null || v === undefined) return <span className="tenue">—</span>;
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return miles(v);
  return String(v);
};

export default function Tablero({ onNavigate }) {
  const t = useTokens();
  const [stats, setStats] = useState(null);
  const [filas, setFilas] = useState(null);
  const [scope, setScope] = useState("");
  const [eje, setEje] = useState("");
  const [error, setError] = useState(null);

  // Cada vez que cambia un control, se vuelve a preguntar al backend. El
  // filtrado ocurre en el servidor: el frontend no guarda una copia del dataset.
  useEffect(() => {
    let cancelado = false;
    setError(null);
    Promise.all([getStats(scope, eje), getData(scope, 20, eje)])
      .then(([s, d]) => {
        if (cancelado) return;
        setStats(s);
        setFilas(d);
      })
      .catch((e) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [scope, eje]);

  if (error) {
    return (
      <div className="estado error">
        <p>No se pudo hablar con la API: {error}</p>
        <p className="tenue">
          Revisa que el backend esté en el puerto 8080 y que la consola no
          muestre un error de CORS.
        </p>
      </div>
    );
  }
  if (!stats) return <div className="estado">Cargando datos…</div>;

  const L = stats.labels ?? {};
  const fmt = formateador(stats.value_format);
  const registro = L.registro ?? "registros";
  const grupos = stats.by_group.map((d) => ({
    valor: String(d.group),
    label: d.label ?? String(d.group),
  }));
  const hayPocos = stats.by_group.some((d) => d.count < MINIMO_FIABLE);

  const Tip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const delta = stats.overall != null ? d.value - stats.overall : null;
    return (
      <div className="tooltip">
        <div className="tooltip-titulo">{label}</div>
        <div className="tooltip-linea">
          {L.value}: {fmt.completo(d.value)}
        </div>
        {delta != null && (
          <div className="tooltip-linea">
            {delta >= 0 ? "▲" : "▼"} {fmt.completo(Math.abs(delta))} vs. media
          </div>
        )}
        <div className="tooltip-linea">
          {miles(d.count)} {registro}
          {d.count < MINIMO_FIABLE && " · muestra pequeña"}
        </div>
      </div>
    );
  };

  const Leyenda = () => (
    <div className="leyenda">
      <span className="leyenda-item">
        <span className="leyenda-marca" />
        {L.value}
      </span>
      <span className="leyenda-item">
        <span className="leyenda-marca linea" />
        media del conjunto · {fmt.completo(stats.overall)}
      </span>
      {hayPocos && (
        <span className="leyenda-item tenue">
          barra clara = menos de {MINIMO_FIABLE} {registro}
        </span>
      )}
    </div>
  );

  return (
    <>
      <header className="cabecera-vista">
        <h1>Señales de la misión</h1>
        <p>
          Los {miles(stats.by_group.reduce((a, d) => a + d.count, 0) + (stats.excluded ?? 0))}{" "}
          {registro} con los que se entrenó el modelo. Cambia el eje para ver
          qué variable separa de verdad.
        </p>
        <div className="cabecera-acciones">
          <button className="b primaria" type="button" onClick={() => onNavigate?.("Simular")}>
            Probar un pasajero <span aria-hidden="true">→</span>
          </button>
          <span>Convierte una señal en un escenario comprobable.</span>
        </div>
      </header>

      <div className="controles">
        <label className="control">
          <span>Desglosar por</span>
          <select
            value={stats.group_by}
            onChange={(e) => {
              // El filtro pertenece al eje anterior: dejarlo puesto acotaría
              // por un valor que la columna nueva no tiene, y todo saldría
              // vacío sin que se entienda por qué.
              setScope("");
              setEje(e.target.value);
            }}
          >
            {(stats.groupable ?? []).map((g) => (
              <option key={g.name} value={g.name}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label className="control">
          <span>Filtrar</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g.valor} value={g.valor}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        {scope && (
          <button className="b" onClick={() => setScope("")}>
            Quitar filtro
          </button>
        )}
      </div>

      <div className="pila">
        <Cifras stats={stats} registro={registro} fmt={fmt} />

        <section className="tarjeta">
          <header>
            <div>
              <h2>
                {L.value} por {(L.group ?? "").toLowerCase()}
              </h2>
              <p className="sub">
                {stats.by_group.length} grupos, de mayor a menor.
                {stats.scope && ` ${stats.scope} va resaltado.`}
                {stats.excluded > 0 &&
                  ` ${miles(stats.excluded)} ${registro} no aparecen en ninguna barra: les falta el dato.`}
              </p>
            </div>
          </header>
          <div className="cuerpo sin-lados">
            <ResponsiveContainer
              width="100%"
              height={Math.max(180, stats.by_group.length * 34 + 30)}
            >
              <BarChart
                data={stats.by_group}
                layout="vertical"
                margin={{ top: 4, right: 58, bottom: 4, left: 8 }}
                barCategoryGap={6}
              >
                <CartesianGrid horizontal={false} {...rejilla(t)} />
                <XAxis type="number" tickFormatter={fmt.eje} {...ejeBase(t)} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={110}
                  interval={0}
                  {...ejeBase(t)}
                />
                <Tooltip content={<Tip />} cursor={cursorSuave} />
                {/* La media, como referencia. Es lo que convierte "65%" en
                    "15 puntos por encima". Discontinua porque es un umbral,
                    no rejilla. */}
                {stats.overall != null && (
                  <ReferenceLine
                    x={stats.overall}
                    stroke={t.referencia}
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                  />
                )}
                {/* Sin animación: en un tablero es ruido, y hace que la
                    gráfica dependa del tiempo para verse completa. */}
                <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={fmt.completo}
                    style={{ fill: t["texto-2"], fontSize: 12, fontWeight: 500 }}
                  />
                  {stats.by_group.map((d) => (
                    <Cell
                      key={String(d.group)}
                      fill={
                        d.count < MINIMO_FIABLE
                          ? t["serie-1-suave"]
                          : !stats.scope || stats.scope === String(d.group)
                            ? t["serie-1"]
                            : t["serie-1-suave"]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="pie">
            <Leyenda />
          </div>
        </section>

        {stats.by_secondary.length > 0 && (
          <section className="tarjeta">
            <header>
              <div>
                <h2>
                  {L.value} por {(L.secondary ?? "").toLowerCase()}
                </h2>
                <p className="sub">
                  Sobre{" "}
                  {stats.scope
                    ? `${L.group} = ${stats.scope}`
                    : `los ${miles(stats.count)} ${registro}`}
                  .
                </p>
              </div>
            </header>
            <div className="cuerpo sin-lados">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={stats.by_secondary}
                  margin={{ top: 16, right: 12, bottom: 4, left: 4 }}
                  barCategoryGap={8}
                  maxBarSize={56}
                >
                  <CartesianGrid vertical={false} {...rejilla(t)} />
                  <XAxis dataKey="label" {...ejeBase(t)} />
                  <YAxis tickFormatter={fmt.eje} {...ejeBase(t)} />
                  <Tooltip content={<Tip />} cursor={cursorSuave} />
                  {stats.overall != null && (
                    <ReferenceLine
                      y={stats.overall}
                      stroke={t.referencia}
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                    />
                  )}
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {stats.by_secondary.map((d) => (
                      <Cell
                        key={String(d.group)}
                        fill={
                          d.count < MINIMO_FIABLE
                            ? t["serie-1-suave"]
                            : t["serie-1"]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="pie">
              <Leyenda />
            </div>
          </section>
        )}

        <section className="tarjeta">
          <header>
            <div>
              <h2>Registros</h2>
              <p className="sub">
                {filas?.count} de {miles(filas?.total_matching)} {registro} que
                cumplen el filtro. Las columnas las manda la API.
              </p>
            </div>
          </header>
          <div className="cuerpo">
            {!filas?.rows.length ? (
              <div className="vacio">Ningún registro cumple este filtro.</div>
            ) : (
              <TablaRegistros filas={filas} />
            )}
          </div>
        </section>
      </div>
    </>
  );
}

/** Las cifras de encabezado. Cambian de forma según el tipo de target. */
function Cifras({ stats, registro, fmt }) {
  if (!stats.target) {
    return <div className="vacio">No hay {registro} para {stats.scope}.</div>;
  }
  const t = stats.target;

  if (t.kind === "categorico") {
    return (
      <div className="rejilla auto">
        <div className="cifra acento">
          <span className="cifra-etiqueta">{registro}</span>
          <span className="cifra-valor">{miles(stats.count)}</span>
          <span className="cifra-nota">
            {stats.scope ? `filtrado a ${stats.scope}` : "todo el conjunto"}
          </span>
        </div>
        {t.distribution.map((c) => (
          <div className="cifra" key={String(c.class)}>
            <span className="cifra-etiqueta">{c.label}</span>
            <span className="cifra-valor">{(c.share * 100).toFixed(1)}%</span>
            <span className="cifra-nota">{miles(c.count)} {registro}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rejilla auto">
      <div className="cifra acento">
        <span className="cifra-etiqueta">{registro}</span>
        <span className="cifra-valor">{miles(stats.count)}</span>
      </div>
      {[
        ["Promedio", t.mean],
        ["Mediana", t.median],
        ["Máximo", t.max],
      ].map(([k, v]) => (
        <div className="cifra" key={k}>
          <span className="cifra-etiqueta">{k}</span>
          <span className="cifra-valor">{fmt.completo(v)}</span>
        </div>
      ))}
    </div>
  );
}

/** La tabla de registros. Las columnas y sus nombres los manda la API; la
 *  alineación se decide mirando los datos. */
function TablaRegistros({ filas }) {
  const numericas = columnasNumericas(filas.rows, filas.columns);
  return (
    <div className="tabla-envoltura">
      <table>
        <thead>
          <tr>
            {filas.columns.map((c) => (
              <th key={c} className={numericas.has(c) ? undefined : "txt"} title={c}>
                {filas.column_labels?.[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.rows.map((f, i) => (
            <tr key={f[filas.columns[0]] ?? i}>
              {filas.columns.map((c) => (
                <td key={c} className={numericas.has(c) ? undefined : "txt"}>
                  {celda(f[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
