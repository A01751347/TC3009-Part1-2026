export const meta = { titulo: "Tablero", orden: 1 };

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

const SERIE = "#2a78d6";
const SERIE_APAGADA = "#86b6ef";
const EJE = "#c3c2b7";
const LINEA = "#e1e0d9";
const TINTA_APAGADA = "#898781";
const REFERENCIA = "#b4331f";

const miles = (n) => new Intl.NumberFormat("es-MX").format(n);

const pesos = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

/** El formato del eje lo dice el backend, no esta vista.
 *
 * El mismo componente dibuja precios medios y tasas de transportados. Lo unico
 * que cambia es como se escribe el numero, y eso viaja en la respuesta
 * (value_format) junto con los datos.
 */
function formateador(formato) {
  if (formato === "porcentaje") {
    return {
      completo: (v) => `${(v * 100).toFixed(1)}%`,
      eje: (v) => `${Math.round(v * 100)}%`,
    };
  }
  if (formato === "moneda") {
    return { completo: pesos, eje: (v) => `${Math.round(v / 1000)}k` };
  }
  return { completo: miles, eje: miles };
}

/** Una celda cruda del dataset, escrita para leerse. */
function celda(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return miles(v);
  return String(v);
}

export default function Tablero() {
  const [stats, setStats] = useState(null);
  const [filas, setFilas] = useState(null);
  const [scope, setScope] = useState("");
  const [eje, setEje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Cuantos registros hacen que una barra sea creible.
  //
  // La cubierta T tiene 5 pasajeros y una tasa del 20%. Dibujada igual que una
  // barra de 2794 registros, invita a leer una señal donde solo hay ruido.
  // Se atenua y se marca, en vez de esconderla: sigue siendo un dato.
  const MINIMO_FIABLE = 30;

  // Cada vez que cambia el filtro, se vuelve a preguntar al backend.
  // El filtrado ocurre en el servidor, no en el navegador: el frontend no
  // guarda una copia del dataset.
  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);

    Promise.all([getStats(scope, eje), getData(scope, 20, eje)])
      .then(([s, d]) => {
        if (cancelado) return;
        setStats(s);
        setFilas(d);
      })
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));

    return () => {
      cancelado = true;
    };
  }, [scope, eje]);

  if (error) {
    return (
      <div className="estado error">
        <p>No se pudo hablar con la API: {error}</p>
        <p>
          Revisa que el backend esté corriendo en el puerto 8080 y que la
          consola del navegador no muestre un error de CORS.
        </p>
      </div>
    );
  }

  if (cargando && !stats) {
    return <div className="estado">Cargando datos...</div>;
  }

  const L = stats.labels ?? {};
  const fmt = formateador(stats.value_format);
  // El desplegable ofrece la etiqueta pero filtra por el valor crudo: el
  // backend compara contra la columna, no contra como se escribe.
  const grupos = stats.by_group.map((d) => ({
    valor: String(d.group),
    label: d.label ?? String(d.group),
  }));
  const registro = L.registro ?? "registros";
  const alcance = stats.scope
    ? `${L.group ?? stats.group_by} = ${stats.scope}`
    : `los ${miles(stats.count)} ${registro}`;

  const TooltipValor = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    // La diferencia contra la media del dataset es la lectura util: un 65% no
    // significa nada hasta saber que el promedio es 50%.
    const delta = stats.overall != null ? d.value - stats.overall : null;
    const pocos = d.count < MINIMO_FIABLE;
    return (
      <div className="tooltip">
        <div className="t-titulo">{label}</div>
        <div className="t-linea">
          {L.value ?? "Valor"}: {fmt.completo(d.value)}
        </div>
        {delta != null && (
          <div className="t-linea">
            {delta >= 0 ? "▲" : "▼"} {fmt.completo(Math.abs(delta))} frente a la
            media
          </div>
        )}
        <div className="t-linea">
          {miles(d.count)} {registro}
          {pocos && " — muestra pequeña, poco fiable"}
        </div>
      </div>
    );
  };

  return (
    <>
      <p className="subtitulo-vista">
        {stats.dataset} &middot; {miles(stats.count)} {registro} en el alcance
        actual
      </p>

      {/* Los filtros van en una sola fila, arriba de todo lo que afectan.
          'Desglosar por' cambia la pregunta; 'Filtrar' acota la respuesta. */}
      <div className="filtros">
        <label htmlFor="eje">Desglosar por</label>
        <select
          id="eje"
          value={stats.group_by}
          onChange={(e) => {
            // El scope pertenece al eje anterior: dejarlo puesto filtraria por
            // un valor que la columna nueva no tiene, y la tabla saldria vacia
            // sin que se entienda por que.
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

        <label htmlFor="scope">Filtrar</label>
        <select
          id="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="">Todos</option>
          {grupos.map((g) => (
            <option key={g.valor} value={g.valor}>
              {g.label}
            </option>
          ))}
        </select>
        {scope && <button onClick={() => setScope("")}>Quitar filtro</button>}
      </div>

      {/* Cifras de encabezado: son numeros, no una grafica. */}
      <Encabezado stats={stats} registro={registro} fmt={fmt} />

      {/* Grafica 1: comparacion entre grupos.
          Se mantiene siempre completa; el seleccionado se resalta en lugar de
          esconder los demas. Filtrar no siempre significa ocultar. */}
      <div className="panel">
        <h2>
          {L.value ?? "Valor"} por {(L.group ?? stats.group_by).toLowerCase()}
        </h2>
        <p className="subtitulo">
          {stats.by_group.length} grupos, ordenados de mayor a menor. La línea
          punteada es la media del conjunto ({fmt.completo(stats.overall)}).
          {stats.by_group.some((d) => d.count < MINIMO_FIABLE) &&
            ` Los grupos con menos de ${MINIMO_FIABLE} ${registro} van atenuados.`}
          {stats.scope && ` ${stats.scope} aparece resaltado.`}
        </p>
        {/* Agrupar descarta las filas sin valor en esa columna. Callarlo haría
            que las barras sumaran menos que el total sin explicación. */}
        {stats.excluded > 0 && (
          <p className="subtitulo">
            {miles(stats.excluded)} {registro} no aparecen en ninguna barra:
            les falta el dato de{" "}
            <strong>{(L.group ?? stats.group_by).toLowerCase()}</strong>.
          </p>
        )}
        <ResponsiveContainer
          width="100%"
          height={Math.max(220, stats.by_group.length * 22 + 60)}
        >
          <BarChart
            data={stats.by_group}
            layout="vertical"
            margin={{ top: 4, right: 64, bottom: 4, left: 8 }}
            barCategoryGap={3}
          >
            <CartesianGrid horizontal={false} stroke={LINEA} />
            <XAxis
              type="number"
              tickFormatter={fmt.eje}
              stroke={EJE}
              tick={{ fill: TINTA_APAGADA, fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={92}
              interval={0}
              stroke={EJE}
              tick={{ fill: TINTA_APAGADA, fontSize: 12 }}
              tickLine={false}
            />
            <Tooltip
              content={<TooltipValor />}
              cursor={{ fill: "rgba(11,11,11,0.04)" }}
            />
            {/* La media del conjunto, como linea.
                Es lo que convierte "65%" en "15 puntos por encima". Sin ella
                cada barra se lee sola y no hay comparacion posible. */}
            {stats.overall != null && (
              <ReferenceLine
                x={stats.overall}
                stroke={REFERENCIA}
                strokeDasharray="4 3"
                strokeWidth={1.5}
              />
            )}
            {/* Sin animacion de entrada: en un tablero es ruido, y ademas hace
                que la grafica dependa del tiempo para verse completa. */}
            <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList
                dataKey="count"
                position="right"
                formatter={(v) => `n=${miles(v)}`}
                style={{ fill: TINTA_APAGADA, fontSize: 11 }}
              />
              {stats.by_group.map((d) => (
                <Cell
                  key={String(d.group)}
                  fill={
                    !stats.scope || stats.scope === String(d.group)
                      ? SERIE
                      : SERIE_APAGADA
                  }
                  // Un grupo con pocos registros se dibuja translucido: la
                  // barra sigue ahi, pero deja de competir visualmente con las
                  // que si tienen respaldo.
                  fillOpacity={d.count < MINIMO_FIABLE ? 0.35 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Grafica 2: esta si refleja el filtro, porque el corte secundario
          dentro de un grupo es una pregunta con sentido. */}
      <div className="panel">
        <h2>
          {L.value ?? "Valor"} por{" "}
          {(L.secondary ?? stats.secondary_by).toLowerCase()}
        </h2>
        <p className="subtitulo">Sobre {alcance}.</p>
        {stats.by_secondary.length === 0 ? (
          <div className="vacio">Sin datos para este filtro.</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={stats.by_secondary}
              margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
              barCategoryGap={3}
              maxBarSize={52}
            >
              <CartesianGrid vertical={false} stroke={LINEA} />
              <XAxis
                dataKey="label"
                stroke={EJE}
                tick={{ fill: TINTA_APAGADA, fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmt.eje}
                stroke={EJE}
                tick={{ fill: TINTA_APAGADA, fontSize: 12 }}
                tickLine={false}
              />
              <Tooltip
                content={<TooltipValor />}
                cursor={{ fill: "rgba(11,11,11,0.04)" }}
              />
              {stats.overall != null && (
                <ReferenceLine
                  y={stats.overall}
                  stroke={REFERENCIA}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
              )}
              <Bar
                dataKey="value"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                {stats.by_secondary.map((d) => (
                  <Cell
                    key={String(d.group)}
                    fill={SERIE}
                    fillOpacity={d.count < MINIMO_FIABLE ? 0.35 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* La tabla es tambien la via de acceso accesible a lo que dicen las
          graficas: los mismos datos, en texto. Las columnas las manda el
          backend, asi que cambiar de dataset no se edita aqui. */}
      <div className="panel">
        <h2>Registros</h2>
        <p className="subtitulo">
          {filas.count} de {miles(filas.total_matching)} {registro} que cumplen
          el filtro.
        </p>
        {filas.rows.length === 0 ? (
          <div className="vacio">Ningún registro cumple este filtro.</div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  {filas.columns.map((c) => (
                    <th
                      key={c}
                      className={c === filas.target ? undefined : "txt"}
                      title={c}
                    >
                      {filas.column_labels?.[c] ?? c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.rows.map((f, i) => (
                  <tr key={f[filas.columns[0]] ?? i}>
                    {filas.columns.map((c) => (
                      <td key={c} className="txt">
                        {celda(f[c])}
                      </td>
                    ))}
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

/** Las cifras de arriba. Cambian de forma segun el tipo de target.
 *
 * Un target numerico se resume con min/media/mediana/max. Uno categorico con
 * su distribucion de clases, que es la primera pregunta de cualquier
 * clasificador: si el 95% es de una sola clase, un 95% de accuracy no dice
 * nada.
 */
function Encabezado({ stats, registro, fmt }) {
  if (!stats.target) {
    return (
      <div className="panel vacio">
        No hay {registro} para {stats.scope}.
      </div>
    );
  }

  const t = stats.target;

  if (t.kind === "categorico") {
    return (
      <div className="tarjetas">
        <div className="tarjeta">
          <div className="etiqueta">{registro}</div>
          <div className="valor">{miles(stats.count)}</div>
        </div>
        {t.distribution.map((c) => (
          <div className="tarjeta" key={String(c.class)}>
            <div className="etiqueta">{c.label}</div>
            <div className="valor">{(c.share * 100).toFixed(1)}%</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="tarjetas">
      <div className="tarjeta">
        <div className="etiqueta">{registro}</div>
        <div className="valor">{miles(stats.count)}</div>
      </div>
      <div className="tarjeta">
        <div className="etiqueta">Promedio</div>
        <div className="valor">{fmt.completo(t.mean)}</div>
      </div>
      <div className="tarjeta">
        <div className="etiqueta">Mediana</div>
        <div className="valor">{fmt.completo(t.median)}</div>
      </div>
      <div className="tarjeta">
        <div className="etiqueta">Máximo</div>
        <div className="valor">{fmt.completo(t.max)}</div>
      </div>
    </div>
  );
}
