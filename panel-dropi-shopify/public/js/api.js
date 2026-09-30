import { mezclarConIniciales } from './nucleo/datos.js';
import { crearServicio } from './nucleo/servicio.js';

// La app habla con el servidor local (npm start). Si no hay servidor, por ejemplo al abrirla
// como vista previa en internet, usa la misma lógica dentro del navegador con datos de ejemplo.
let modo = null;
let local = null;

const CLAVE_LOCAL = 'panel-dropi-v1';

function almacenNavegador() {
  let cache = null;
  async function leer() {
    if (cache) return cache;
    let guardado = null;
    try {
      guardado = JSON.parse(localStorage.getItem(CLAVE_LOCAL) || 'null');
    } catch {
      guardado = null;
    }
    cache = mezclarConIniciales(guardado);
    return cache;
  }
  async function cambiar(fn) {
    const datos = structuredClone(await leer());
    const resultado = await fn(datos);
    cache = datos;
    try {
      localStorage.setItem(CLAVE_LOCAL, JSON.stringify(datos));
    } catch {
      // Sin almacenamiento (ventana privada): los cambios duran hasta recargar.
    }
    return resultado ?? datos;
  }
  return { leer, cambiar };
}

async function servidor(metodo, ruta, cuerpo) {
  const respuesta = await fetch(ruta, {
    method: metodo,
    headers: { Accept: 'application/json', ...(cuerpo !== undefined ? { 'Content-Type': 'application/json', 'X-Panel': '1' } : {}) },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }
  if (!respuesta.ok) throw new Error(datos?.error || `Error ${respuesta.status}`);
  return datos;
}

export async function iniciarApi() {
  // La copia publicada como vista previa no tiene servidor: ni lo busca.
  if (globalThis.PANEL_VISTA_PREVIA) {
    modo = 'local';
    local = crearServicio(almacenNavegador());
    return modo;
  }
  try {
    const respuesta = await fetch('api/estado', { headers: { Accept: 'application/json' } });
    if (respuesta.ok && (respuesta.headers.get('content-type') || '').includes('json')) {
      const datos = await respuesta.json();
      if (datos?.app === 'panel-dropi') {
        modo = 'servidor';
        return modo;
      }
    }
  } catch {
    // Sin servidor: seguimos en el navegador.
  }
  modo = 'local';
  local = crearServicio(almacenNavegador());
  return modo;
}

export const hayServidor = () => modo === 'servidor';

const llamar = (metodoServidor, ruta, metodoLocal) => async (cuerpo) => {
  if (modo === 'servidor') return servidor(metodoServidor, ruta(cuerpo), metodoServidor === 'GET' ? undefined : cuerpo ?? {});
  return metodoLocal(cuerpo);
};

export const api = {
  estado: llamar('GET', () => 'api/estado', async () => ({ ...(await local.estado()), servidor: false })),
  guardarAjustes: llamar('POST', () => 'api/ajustes', async (c) => ({ ...(await local.guardarAjustes(c)), servidor: false })),
  conectarShopify: llamar('POST', () => 'api/shopify/conectar', async () => {
    throw new Error('En la vista previa no se puede conectar una tienda. Instala la app en tu computador (ver "Aprende").');
  }),
  desconectarShopify: llamar('POST', () => 'api/shopify/desconectar', async () => ({ ...(await local.desconectarShopify()), servidor: false })),
  pedidos: llamar('GET', (o) => `api/pedidos${o?.fresco ? '?fresco=1' : ''}`, (o) => local.pedidos(o)),
  productos: llamar('GET', (o) => `api/productos${o?.fresco ? '?fresco=1' : ''}`, (o) => local.productos(o)),
  marcarPedido: llamar('POST', () => 'api/pedidos/marcar', (c) => local.marcarPedido(c)),
  guardarCosto: llamar('POST', () => 'api/productos/costo', (c) => local.guardarCosto(c)),
  marcarChecklist: llamar('POST', () => 'api/checklist', (c) => local.marcarChecklist(c)),
  importarDropi: llamar('POST', () => 'api/importar-dropi', (c) => local.importarDropi(c)),
  reiniciarDemo: llamar('POST', () => 'api/demo/reiniciar', () => local.reiniciarDemo()),
};
