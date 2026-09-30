import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAlmacen } from './src/almacen.js';
import { ErrorUsuario, crearServicio } from './public/js/nucleo/servicio.js';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(RAIZ, 'public');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const LIMITE_CUERPO = 6 * 1024 * 1024;

function responderJSON(res, estado, cuerpo, extras = {}) {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extras });
  res.end(JSON.stringify(cuerpo));
}

async function leerCuerpo(req) {
  const partes = [];
  let tamano = 0;
  for await (const parte of req) {
    tamano += parte.length;
    if (tamano > LIMITE_CUERPO) throw new ErrorUsuario('El archivo es demasiado grande (máximo 6 MB).', 413);
    partes.push(parte);
  }
  if (!partes.length) return {};
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8'));
  } catch {
    throw new ErrorUsuario('No se entendió la solicitud.');
  }
}

async function servirArchivo(res, rutaUrl) {
  const relativa = decodeURIComponent(rutaUrl === '/' ? '/index.html' : rutaUrl);
  const destino = path.resolve(PUBLICO, `.${relativa}`);
  if (!destino.startsWith(PUBLICO + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(destino);
    if (!info.isFile()) throw new Error('no es archivo');
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(destino)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(await readFile(destino));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}

export function crearApp({ carpetaDatos, hostsPermitidos = [], fabricaShopify } = {}) {
  const servicio = crearServicio(crearAlmacen(carpetaDatos), fabricaShopify ? { fabricaShopify } : {});
  const permitidos = new Set(['localhost', '127.0.0.1', '[::1]', ...hostsPermitidos]);

  const rutas = {
    'GET /api/estado': () => servicio.estado(),
    'POST /api/ajustes': (cuerpo) => servicio.guardarAjustes(cuerpo),
    'POST /api/shopify/conectar': (cuerpo) => servicio.conectarShopify(cuerpo),
    'POST /api/shopify/desconectar': () => servicio.desconectarShopify(),
    'GET /api/pedidos': (_, url) => servicio.pedidos({ fresco: url.searchParams.get('fresco') === '1' }),
    'POST /api/pedidos/marcar': (cuerpo) => servicio.marcarPedido(cuerpo),
    'GET /api/productos': (_, url) => servicio.productos({ fresco: url.searchParams.get('fresco') === '1' }),
    'POST /api/productos/costo': (cuerpo) => servicio.guardarCosto(cuerpo),
    'POST /api/checklist': (cuerpo) => servicio.marcarChecklist(cuerpo),
    'POST /api/importar-dropi': (cuerpo) => servicio.importarDropi(cuerpo),
    'POST /api/demo/reiniciar': () => servicio.reiniciarDemo(),
  };

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      // Solo responde a direcciones locales: evita que una página web ajena use tu panel (DNS rebinding).
      const host = (req.headers.host || '').replace(/:\d+$/, '');
      if (!permitidos.has(host)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Host no permitido');
        return;
      }

      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405).end();
          return;
        }
        await servirArchivo(res, url.pathname);
        return;
      }

      // Las escrituras exigen un encabezado propio: un formulario de otro sitio no puede enviarlo.
      if (req.method !== 'GET' && req.headers['x-panel'] !== '1') {
        responderJSON(res, 403, { error: 'Solicitud no permitida.' });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/respaldo') {
        const fecha = new Date().toISOString().slice(0, 10);
        responderJSON(res, 200, await servicio.respaldo(), {
          'Content-Disposition': `attachment; filename="respaldo-panel-${fecha}.json"`,
        });
        return;
      }

      const manejador = rutas[`${req.method} ${url.pathname}`];
      if (!manejador) {
        responderJSON(res, 404, { error: 'Ruta no encontrada.' });
        return;
      }
      const cuerpo = req.method === 'POST' ? await leerCuerpo(req) : null;
      responderJSON(res, 200, await manejador(cuerpo, url));
    } catch (error) {
      if (error instanceof ErrorUsuario) {
        responderJSON(res, error.estado, { error: error.message });
        return;
      }
      console.error(error);
      responderJSON(res, 500, { error: 'Algo falló dentro de la app. Revisa la ventana negra (terminal) para ver el detalle.' });
    }
  });
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const puerto = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  const app = crearApp({
    carpetaDatos: process.env.DATA_DIR || path.join(RAIZ, 'datos'),
    hostsPermitidos: (process.env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean),
  });
  app.listen(puerto, host, () => {
    console.log('');
    console.log('  Panel Dropi Fácil está listo.');
    console.log(`  Ábrelo en tu navegador: http://localhost:${puerto}`);
    console.log('  Para apagarlo, cierra esta ventana o presiona Ctrl + C.');
    console.log('');
  });
}
