import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { getHealth } from "./api.js";
import "./styles.css";

// Ensamblador de la interfaz. NO lo edites: cambia solo cuando cambia el curso.
//
// Cada vista vive en su propio archivo dentro de src/vistas/, y esta linea las
// descubre todas sin que haya que registrarlas a mano. Agregar una vista es
// agregar un archivo.
//
// Es el mismo patron que backend/app.py con los modulos de cada sesion, y por
// la misma razon: cuando llega el material de una sesion nueva son archivos
// NUEVOS, y nunca hay que fusionar cambios sobre lo que ya escribiste.
const modulos = import.meta.glob("./vistas/*.jsx", { eager: true });

const vistas = Object.values(modulos)
  .filter((m) => m.default && m.meta)
  .map((m) => ({ Componente: m.default, ...m.meta }))
  .sort((a, b) => a.orden - b.orden);

/** El tema elegido, recordado entre visitas.
 *
 * Tres estados y no dos: "sistema" es distinto de "claro". Si sólo hubiera un
 * interruptor on/off, quien tiene el sistema en oscuro y nunca tocó el botón
 * vería el tema claro, que no es lo que pidió.
 */
// Los valores que van al atributo son los que entiende el CSS: "light" y
// "dark". Se escriben en inglés a propósito, igual que las clases y las
// propiedades: el nombre visible se traduce aparte, en NOMBRE_TEMA.
//
// Tenerlos en español costó un bug que sólo se ve mirando la página: el
// atributo decía data-theme="claro", ninguna regla coincidía, y el botón
// anunciaba "Tema: Claro" mientras la interfaz seguía oscura.
const SIGUIENTE = { auto: "light", light: "dark", dark: "auto" };
const GLIFO_TEMA = { auto: "◐", light: "☀", dark: "☾" };
const NOMBRE_TEMA = { auto: "Sistema", light: "Claro", dark: "Oscuro" };

function useTema() {
  const [tema, setTema] = useState(() => {
    try {
      const guardado = localStorage.getItem("tema");
      return guardado in SIGUIENTE ? guardado : "auto";
    } catch {
      // Un navegador con el almacenamiento bloqueado no puede costarle la
      // página al usuario: se cae al tema del sistema y sigue.
      return "auto";
    }
  });

  useEffect(() => {
    const raiz = document.documentElement;
    if (tema === "auto") raiz.removeAttribute("data-theme");
    else raiz.setAttribute("data-theme", tema);
    try {
      localStorage.setItem("tema", tema);
    } catch {
      /* sin persistencia, pero el tema ya se aplicó */
    }
  }, [tema]);

  return [tema, () => setTema((t) => SIGUIENTE[t])];
}

function App() {
  const [activa, setActiva] = useState(0);
  const [salud, setSalud] = useState(null);
  const [tema, cambiarTema] = useTema();

  // El encabezado y el pie de la barra lateral NO nombran un dataset a mano.
  // /api/health ya sabe qué modelo está cargado; si esta pantalla lo repitiera,
  // podría acabar mintiendo sobre lo que sirve.
  // Se vuelve a pedir al cambiar de vista: el contador de predicciones cambia
  // en cuanto alguien usa el formulario, y un número congelado en la barra
  // lateral es peor que no tenerlo.
  useEffect(() => {
    getHealth().then(setSalud).catch(() => setSalud(null));
  }, [activa]);

  if (vistas.length === 0) {
    return (
      <div className="estado error">
        No hay ninguna vista en <code>src/vistas/</code>.
      </div>
    );
  }

  const Actual = vistas[activa].Componente;
  const degradado = salud && salud.status !== "ok";

  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <span className="marca-nombre">{salud?.dataset ?? "Tablero"}</span>
          <span className="marca-sub">
            {salud ? `${salud.task} · v${salud.model_version}` : "cargando…"}
          </span>
        </div>

        <nav className="nav">
          {vistas.map((v, i) => (
            <button
              key={v.titulo}
              className={i === activa ? "activa" : ""}
              onClick={() => setActiva(i)}
              aria-current={i === activa ? "page" : undefined}
            >
              <span className="nav-glifo" aria-hidden="true">
                {v.glifo ?? "▸"}
              </span>
              {v.titulo}
            </button>
          ))}
        </nav>

        <div className="lateral-pie">
          {salud && (
            <div className="salud">
              <div className="salud-fila">
                <span>
                  <span
                    className={degradado ? "salud-punto mal" : "salud-punto"}
                  />
                  {degradado ? "degradado" : "en servicio"}
                </span>
                <span>api {salud.api_version}</span>
              </div>
              <div className="salud-fila">
                <span>artefacto</span>
                <span className="mono">{salud.artifact_hash}</span>
              </div>
              <div className="salud-fila">
                <span>registros</span>
                <span>{(salud.registros ?? 0).toLocaleString("es-MX")}</span>
              </div>
              <div className="salud-fila">
                <span>predicciones</span>
                <span>
                  {(salud.predicciones_registradas ?? 0).toLocaleString("es-MX")}
                </span>
              </div>
            </div>
          )}

          <button className="tema" onClick={cambiarTema}>
            {GLIFO_TEMA[tema]} Tema: {NOMBRE_TEMA[tema]}
          </button>
        </div>
      </aside>

      <main className="contenido">
        <Actual />
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
