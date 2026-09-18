import { useEffect, useState } from "react";

/* Piezas compartidas de las gráficas.
 *
 * Recharts pinta SVG con atributos, no con clases, así que no hereda las
 * variables CSS del tema: hay que leerlas y pasárselas como valores. Este
 * módulo es el único sitio donde eso ocurre, y por eso el modo oscuro no
 * obliga a tocar ninguna vista.
 */

const ROLES = [
  "serie-1",
  "serie-1-suave",
  "serie-2",
  "referencia",
  "linea",
  "eje",
  "texto-1",
  "texto-2",
  "texto-3",
  "superficie",
];

function leerTokens() {
  const estilo = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    ROLES.map((r) => [r, estilo.getPropertyValue(`--${r}`).trim()]),
  );
}

/** Los colores del tema actual, y se vuelven a leer cuando el tema cambia. */
export function useTokens() {
  const [tokens, setTokens] = useState(leerTokens);

  useEffect(() => {
    const releer = () => setTokens(leerTokens());

    // Dos disparadores: el interruptor de la página escribe data-theme en
    // <html>, y el sistema operativo puede cambiar por su cuenta.
    const observador = new MutationObserver(releer);
    observador.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const consulta = window.matchMedia("(prefers-color-scheme: dark)");
    consulta.addEventListener("change", releer);

    return () => {
      observador.disconnect();
      consulta.removeEventListener("change", releer);
    };
  }, []);

  return tokens;
}

/** Ejes discretos: sin línea de marca, tinta apagada, tamaño de nota al pie. */
export const ejeBase = (t) => ({
  stroke: t.eje,
  tick: { fill: t["texto-3"], fontSize: 11.5 },
  tickLine: false,
  axisLine: false,
});

export const rejilla = (t) => ({ stroke: t.linea, strokeWidth: 1 });

/** El cursor del tooltip: un lavado, no un bloque de color. */
export const cursorSuave = { fill: "currentColor", fillOpacity: 0.04 };

export const formatos = {
  porcentaje: {
    completo: (v) => `${(v * 100).toFixed(1)}%`,
    eje: (v) => `${Math.round(v * 100)}%`,
  },
  moneda: {
    completo: (v) =>
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(v),
    eje: (v) => `${Math.round(v / 1000)}k`,
  },
  llano: {
    completo: (v) => new Intl.NumberFormat("es-MX").format(v),
    eje: (v) => new Intl.NumberFormat("es-MX").format(v),
  },
};

export const formateador = (nombre) => formatos[nombre] ?? formatos.llano;

export const miles = (n) => new Intl.NumberFormat("es-MX").format(n ?? 0);
export const pct = (v) => `${((v ?? 0) * 100).toFixed(1)}%`;

/** Qué columnas son numéricas, mirando los datos.
 *
 * Los números se alinean a la derecha para que las unidades queden en columna y
 * se puedan comparar de un vistazo; el texto a la izquierda, que es como se
 * lee. Decidirlo por el contenido y no por la posición evita que "Earth" acabe
 * pegado al borde derecho sólo porque su columna es la tercera.
 */
export function columnasNumericas(filas, columnas) {
  const numerica = (c) => {
    let vistos = 0;
    for (const f of filas) {
      const v = f[c];
      if (v === null || v === undefined || v === "") continue;
      if (typeof v !== "number") return false;
      vistos++;
    }
    return vistos > 0;
  };
  return new Set(columnas.filter(numerica));
}

/** El color de una clase, por su posición en el contrato.
 *
 * Fijo por ENTIDAD, nunca por resultado: si el color dependiera de qué clase
 * gana, quien aprendió "Transportado es naranja" vería otra cosa en la
 * siguiente predicción. Es el mismo mapeo que usa el balance de clases de la
 * Model Card, para que las dos pantallas cuenten lo mismo.
 */
export function claseSerie(clase, contrato) {
  const i = (contrato?.classes ?? []).findIndex((c) => c === clase);
  return i === 1 ? "dos" : "";
}
