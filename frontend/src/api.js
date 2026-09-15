// La direccion del backend se deriva de donde se cargo esta pagina.
//
// No esta escrita a mano a proposito: la IP publica de la instancia EC2 cambia
// cada vez que el laboratorio la reinicia. Si aqui hubiera una IP literal, la
// aplicacion dejaria de funcionar en cada sesion nueva y el sintoma seria un
// error de red imposible de entender.
//
// Asi funciona igual en la instancia (IP publica) que en local (localhost),
// sin configurar nada.
//
// El puerto SI es distinto: el frontend vive en el 3000 y el backend en el
// 8080. Puertos distintos = origenes distintos = el navegador aplica CORS.
const API_BASE = `http://${window.location.hostname}:8080`;

/**
 * Pide una ruta de la API y devuelve el JSON ya parseado.
 *
 * Los parametros vacios se omiten: mandar ?neighborhood= sin valor haria que
 * el backend filtrara por la cadena vacia y devolviera cero filas.
 *
 * Una respuesta que no sea 200 se convierte en un error con el mensaje que
 * mando el servidor, para que la interfaz pueda mostrar que paso en lugar de
 * quedarse en blanco.
 */
async function get(ruta, params = {}) {
  const url = new URL(ruta, API_BASE);
  for (const [clave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== "") {
      url.searchParams.set(clave, valor);
    }
  }

  let respuesta;
  try {
    respuesta = await fetch(url);
  } catch {
    // fetch solo rechaza si la peticion no llego a completarse: el backend
    // esta caido, el puerto no esta abierto, o CORS bloqueo la respuesta.
    throw new Error(`no se pudo conectar con ${API_BASE}`);
  }

  if (!respuesta.ok) {
    // El backend manda {"error": "..."} cuando puede. Si la respuesta no es
    // JSON -- una pagina de error del servidor, por ejemplo -- nos quedamos
    // con el codigo de estado, que siempre esta.
    let detalle = `HTTP ${respuesta.status}`;
    try {
      const cuerpo = await respuesta.json();
      if (cuerpo?.error) detalle = cuerpo.error;
    } catch {
      // se queda el codigo de estado
    }
    throw new Error(detalle);
  }

  return respuesta.json();
}

/** GET /api/health -> estado del servicio. */
export function getHealth() {
  return get("/api/health");
}

/** GET /api/stats -> agregados del dataset, opcionalmente por colonia. */
export function getStats(neighborhood) {
  return get("/api/stats", { neighborhood });
}

/** GET /api/data -> registros individuales, con filtro y limite opcionales. */
export function getData(neighborhood, limit = 20) {
  return get("/api/data", { neighborhood, limit });
}
