export const meta = { titulo: "Tablero", orden: 1 };

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Cada vez que cambia el filtro, se vuelve a preguntar al backend.
  // El filtrado ocurre en el servidor, no en el navegador: el frontend no
  // guarda una copia del dataset.
  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);

    Promise.all([getStats(scope), getData(scope, 20)])
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
  }, [scope]);

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
  const grupos = stats.by_group.map((d) => String(d.group)).sort();
  const registro = L.registro ?? "registros";
  const alcance = stats.scope
    ? `${L.group ?? stats.group_by} = ${stats.scope}`
    : `los ${miles(stats.by_group.reduce((a, d) => a + d.count, 0))} ${registro}`;

  const TooltipValor = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="tooltip">
        <div className="t-titulo">{label}</div>
        <div className="t-linea">
          {L.value ?? "Valor"}: {fmt.completo(d.value)}
        </div>
        <div className="t-linea">
          {miles(d.count)} {registro}
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

      {/* Los filtros van en una sola fila, arriba de todo lo que afectan. */}
      <div className="filtros">
        <label htmlFor="scope">{L.group ?? stats.group_by}</label>
        <select
          id="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="">Todos</option>
          {grupos.map((g) => (
            <option key={g} value={g}>
              {g}
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
          {stats.by_group.length} grupos, ordenados de mayor a menor.
          {stats.scope && ` ${stats.scope} aparece resaltado.`}
        </p>
        <ResponsiveContainer
          width="100%"
          height={Math.max(220, stats.by_group.length * 22 + 60)}
        >
          <BarChart
            data={stats.by_group}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
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
              dataKey="group"
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
            {/* Sin animacion de entrada: en un tablero es ruido, y ademas hace
                que la grafica dependa del tiempo para verse completa. */}
            <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {stats.by_group.map((d) => (
                <Cell
                  key={String(d.group)}
                  fill={
                    !stats.scope || stats.scope === String(d.group)
                      ? SERIE
                      : SERIE_APAGADA
                  }
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
                dataKey="group"
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
              <Bar
                dataKey="value"
                fill={SERIE}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
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
                    <th key={c} className={c === filas.target ? undefined : "txt"}>
                      {c}
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
