import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { getHealth } from "./api.js";
import "./styles.css";

const modulos = import.meta.glob("./vistas/*.jsx", { eager: true });

const vistas = Object.values(modulos)
  .filter((m) => m.default && m.meta)
  .map((m) => ({ Componente: m.default, ...m.meta }))
  .sort((a, b) => a.orden - b.orden);

const SIGUIENTE = { auto: "light", light: "dark", dark: "auto" };
const NOMBRE_TEMA = { auto: "Sistema", light: "Claro", dark: "Oscuro" };

function useTema() {
  const [tema, setTema] = useState(() => {
    try {
      const guardado = localStorage.getItem("tema");
      return guardado in SIGUIENTE ? guardado : "auto";
    } catch {
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
      /* El tema sigue funcionando aunque el navegador bloquee storage. */
    }
  }, [tema]);

  return [tema, () => setTema((actual) => SIGUIENTE[actual])];
}

function Icono({ nombre, size = 18 }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (nombre === "Explorar")
    return (
      <svg {...props}>
        <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
        <path d="M2 19h20" />
      </svg>
    );
  if (nombre === "Predecir")
    return (
      <svg {...props}>
        <path d="m12 3 1.3 4.2a5 5 0 0 0 3.3 3.3l4.4 1.4-4.4 1.4a5 5 0 0 0-3.3 3.3L12 21l-1.4-4.4a5 5 0 0 0-3.3-3.3L3 12l4.3-1.4a5 5 0 0 0 3.3-3.3L12 3Z" />
      </svg>
    );
  if (nombre === "Historial")
    return (
      <svg {...props}>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </svg>
    );
  if (nombre === "Model Card")
    return (
      <svg {...props}>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M7 9h3M7 13h10M7 16h7" />
      </svg>
    );
  if (nombre === "tema")
    return (
      <svg {...props}>
        <path d="M12 3a9 9 0 1 0 9 9c-5 2-11-4-9-9Z" />
      </svg>
    );
  return null;
}

function MarcaOrbital() {
  return (
    <span className="marca-simbolo" aria-hidden="true">
      <span className="marca-nucleo" />
      <span className="marca-orbita" />
    </span>
  );
}

function App() {
  const [activa, setActiva] = useState(0);
  const [salud, setSalud] = useState(null);
  const [tema, cambiarTema] = useTema();

  useEffect(() => {
    getHealth().then(setSalud).catch(() => setSalud(null));
  }, [activa]);

  useEffect(() => {
    if (vistas[activa]) {
      document.title = `${vistas[activa].titulo} · ${salud?.dataset ?? "Orbit ML"}`;
    }
  }, [activa, salud]);

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
      <header className="lateral">
        <div className="barra-superior">
          <div className="marca">
            <MarcaOrbital />
            <div className="marca-texto">
              <span className="marca-nombre">ORBIT</span>
              <span className="marca-sub">
                {salud?.dataset ?? "Inteligencia de modelo"}
              </span>
            </div>
          </div>

          <div className="lateral-pie">
            <div className={`salud ${degradado ? "degradada" : ""}`}>
              <span className={degradado ? "salud-punto mal" : "salud-punto"} />
              <span>{degradado ? "Servicio degradado" : salud ? "Modelo en línea" : "Conectando"}</span>
              {salud?.model_version && (
                <span className="salud-version">v{salud.model_version}</span>
              )}
            </div>
            <button
              className="tema"
              onClick={cambiarTema}
              aria-label={`Tema: ${NOMBRE_TEMA[tema]}. Cambiar tema`}
              title={`Tema: ${NOMBRE_TEMA[tema]}`}
            >
              <Icono nombre="tema" size={17} />
              <span>{NOMBRE_TEMA[tema]}</span>
            </button>
          </div>
        </div>

        <nav className="nav" aria-label="Navegación principal">
          {vistas.map((vista, i) => (
            <button
              key={vista.titulo}
              className={i === activa ? "activa" : ""}
              onClick={() => setActiva(i)}
              aria-current={i === activa ? "page" : undefined}
            >
              <span className="nav-glifo">
                <Icono nombre={vista.titulo} />
              </span>
              <span className="nav-texto">
                <span className="nav-indice">0{i + 1}</span>
                {vista.titulo}
              </span>
            </button>
          ))}
        </nav>
      </header>

      <main className="contenido" data-vista={vistas[activa].titulo}>
        <div className="contenido-marco">
          <Actual />
        </div>
        <footer className="pie-app">
          <span>Orbit ML Console</span>
          {salud && (
            <span>
              API {salud.api_version} · {(salud.registros ?? 0).toLocaleString("es-MX")} registros ·{" "}
              {(salud.predicciones_registradas ?? 0).toLocaleString("es-MX")} predicciones
            </span>
          )}
        </footer>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
