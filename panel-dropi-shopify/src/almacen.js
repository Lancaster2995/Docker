import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mezclarConIniciales } from '../public/js/nucleo/datos.js';

// Todo lo que guardas vive en datos/panel.json, en tu computador.
export function crearAlmacen(carpeta) {
  const archivo = path.join(carpeta, 'panel.json');
  let cache = null;
  let cola = Promise.resolve();

  async function leer() {
    if (cache) return cache;
    try {
      cache = mezclarConIniciales(JSON.parse(await readFile(archivo, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`No se pudo leer ${archivo}: ${error.message}`);
      cache = mezclarConIniciales(null);
    }
    return cache;
  }

  // Escribe a un archivo temporal y lo renombra, para no dejar el JSON a medias si se apaga el equipo.
  async function guardar(datos) {
    cache = datos;
    const contenido = JSON.stringify(datos, null, 2);
    cola = cola.then(async () => {
      await mkdir(carpeta, { recursive: true });
      const temporal = `${archivo}.tmp`;
      await writeFile(temporal, contenido, { mode: 0o600 });
      await rename(temporal, archivo);
    });
    return cola;
  }

  async function cambiar(fn) {
    const datos = structuredClone(await leer());
    const resultado = await fn(datos);
    await guardar(datos);
    return resultado ?? datos;
  }

  return { leer, cambiar, archivo };
}
