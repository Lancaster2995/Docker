import { normalizarSupuestos } from './calculo.js';
import { aplicarReporte, cruzarReporteDropi } from './csv.js';
import { pedidosDemo, productosDemo } from './demo.js';
import { PAISES, datosPais } from './formato.js';
import { ESTADO_POR_CLAVE, combinarPedidos, combinarProductos } from './pedidos.js';
import { ErrorShopify, crearClienteShopify, normalizarTienda } from './shopify.js';

export class ErrorUsuario extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const CACHE_MS = 60 * 1000;

// La lógica de la app, separada del servidor HTTP para poder probarla sola.
export function crearServicio(almacen, { fabricaShopify = crearClienteShopify } = {}) {
  let cliente = null;
  let firmaCliente = '';
  const cache = new Map();

  function clienteShopify(config) {
    const firma = JSON.stringify(config);
    if (!cliente || firma !== firmaCliente) {
      cliente = fabricaShopify(config);
      firmaCliente = firma;
      cache.clear();
    }
    return cliente;
  }

  async function conCache(clave, fresco, fn) {
    const guardado = cache.get(clave);
    if (!fresco && guardado && Date.now() - guardado.cuando < CACHE_MS) return guardado.valor;
    const valor = await fn();
    cache.set(clave, { valor, cuando: Date.now() });
    return valor;
  }

  function enModoShopify(datos) {
    return datos.modo === 'shopify' && datos.shopify;
  }

  async function fuentePedidos(datos, fresco) {
    if (!enModoShopify(datos)) return pedidosDemo(datosPais(datos.pais).moneda);
    return conCache('pedidos', fresco, () => clienteShopify(datos.shopify).pedidos());
  }

  async function fuenteProductos(datos, fresco) {
    if (!enModoShopify(datos)) return productosDemo(datosPais(datos.pais).moneda);
    return conCache('productos', fresco, () => clienteShopify(datos.shopify).productos());
  }

  function traducirError(error) {
    if (error instanceof ErrorShopify) {
      // Un dato mal escrito es culpa de la entrada (400); lo demás viene de Shopify (502).
      return new ErrorUsuario(error.message, ['dominio', 'faltan_datos'].includes(error.codigo) ? 400 : 502);
    }
    return error;
  }

  return {
    async estado() {
      const datos = await almacen.leer();
      return {
        app: 'panel-dropi',
        servidor: true,
        modo: enModoShopify(datos) ? 'shopify' : 'demo',
        pais: datos.pais,
        nombreTienda: datos.nombreTienda,
        supuestos: normalizarSupuestos(datos.supuestos),
        plantillas: datos.plantillas,
        gastoAnuncios: datos.gastoAnuncios,
        checklist: datos.checklist,
        shopify: datos.shopify
          ? { tienda: datos.shopify.tienda, metodo: datos.shopify.metodo, nombre: datos.shopify.nombre || '' }
          : null,
      };
    },

    async guardarAjustes(cambios = {}) {
      await almacen.cambiar((datos) => {
        if (cambios.pais !== undefined) {
          if (!PAISES[cambios.pais]) throw new ErrorUsuario('Ese país no está en la lista.');
          datos.pais = cambios.pais;
          cache.clear();
        }
        if (cambios.nombreTienda !== undefined) datos.nombreTienda = String(cambios.nombreTienda).slice(0, 80);
        if (cambios.supuestos) datos.supuestos = normalizarSupuestos({ ...datos.supuestos, ...cambios.supuestos });
        if (cambios.plantillas) {
          for (const clave of ['confirmacion', 'novedad']) {
            if (typeof cambios.plantillas[clave] === 'string') datos.plantillas[clave] = cambios.plantillas[clave].slice(0, 1000);
          }
        }
        if (cambios.gastoAnuncios) {
          const { mes, valor } = cambios.gastoAnuncios;
          if (!/^\d{4}-\d{2}$/.test(mes || '')) throw new ErrorUsuario('Mes inválido.');
          const n = Number(valor);
          datos.gastoAnuncios[mes] = Number.isFinite(n) && n >= 0 ? n : 0;
        }
        if (cambios.modo !== undefined) {
          if (cambios.modo === 'shopify' && !datos.shopify) throw new ErrorUsuario('Primero conecta tu tienda Shopify.');
          if (!['demo', 'shopify'].includes(cambios.modo)) throw new ErrorUsuario('Modo inválido.');
          datos.modo = cambios.modo;
        }
      });
      return this.estado();
    },

    // Prueba la conexión antes de guardar: si Shopify no responde bien, no se guarda nada.
    async conectarShopify(entrada = {}) {
      let config;
      try {
        const metodo = entrada.metodo === 'token' ? 'token' : 'cliente';
        config = { tienda: normalizarTienda(entrada.tienda), metodo };
        if (metodo === 'token') {
          const token = String(entrada.token || '').trim();
          if (!/^shp(at|ca|pa)_[A-Za-z0-9]+$/.test(token)) {
            throw new ErrorUsuario('El token debe empezar con shpat_ y no llevar espacios.');
          }
          config.token = token;
        } else {
          const clientId = String(entrada.clientId || '').trim();
          const clientSecret = String(entrada.clientSecret || '').trim();
          if (!clientId || !clientSecret) throw new ErrorUsuario('Pega el Client ID y el Client Secret.');
          config.clientId = clientId;
          config.clientSecret = clientSecret;
        }
        const tienda = await fabricaShopify(config).tienda();
        config.nombre = tienda.nombre;
      } catch (error) {
        throw traducirError(error);
      }
      await almacen.cambiar((datos) => {
        datos.shopify = config;
        datos.modo = 'shopify';
        if (!datos.nombreTienda) datos.nombreTienda = config.nombre;
      });
      cliente = null;
      cache.clear();
      return this.estado();
    },

    async desconectarShopify() {
      await almacen.cambiar((datos) => {
        datos.shopify = null;
        datos.modo = 'demo';
      });
      cliente = null;
      cache.clear();
      return this.estado();
    },

    async pedidos({ fresco = false } = {}) {
      const datos = await almacen.leer();
      try {
        const fuente = await fuentePedidos(datos, fresco);
        return { pedidos: combinarPedidos(fuente, datos.marcas), actualizado: new Date().toISOString() };
      } catch (error) {
        throw traducirError(error);
      }
    },

    async productos({ fresco = false } = {}) {
      const datos = await almacen.leer();
      try {
        const fuente = await fuenteProductos(datos, fresco);
        return { productos: combinarProductos(fuente, datos.costos) };
      } catch (error) {
        throw traducirError(error);
      }
    },

    async marcarPedido({ id, estado, nota, enDropi } = {}) {
      if (typeof id !== 'string' || !id || id.length > 200) throw new ErrorUsuario('Pedido inválido.');
      if (estado !== undefined && estado !== null && !ESTADO_POR_CLAVE[estado]) throw new ErrorUsuario('Estado inválido.');
      await almacen.cambiar((datos) => {
        const marca = { ...(datos.marcas[id] || {}) };
        if (estado === null) delete marca.estado;
        else if (estado !== undefined) marca.estado = estado;
        if (nota !== undefined) marca.nota = String(nota).slice(0, 500);
        if (enDropi !== undefined) marca.enDropi = Boolean(enDropi);
        marca.actualizado = new Date().toISOString();
        datos.marcas[id] = marca;
      });
      return { ok: true };
    },

    async guardarCosto({ id, costo, flete } = {}) {
      if (typeof id !== 'string' || !id || id.length > 200) throw new ErrorUsuario('Producto inválido.');
      const limpiar = (valor) => {
        if (valor === null || valor === '' || valor === undefined) return null;
        const n = Number(valor);
        if (!Number.isFinite(n) || n < 0) throw new ErrorUsuario('Escribe un número positivo, sin puntos ni signos.');
        return n;
      };
      await almacen.cambiar((datos) => {
        const actual = { ...(datos.costos[id] || {}) };
        if (costo !== undefined) actual.costo = limpiar(costo);
        if (flete !== undefined) actual.flete = limpiar(flete);
        datos.costos[id] = actual;
      });
      return { ok: true };
    },

    async marcarChecklist({ clave, hecho } = {}) {
      if (!/^[a-z0-9-]{1,40}$/.test(clave || '')) throw new ErrorUsuario('Paso inválido.');
      await almacen.cambiar((datos) => {
        datos.checklist[clave] = Boolean(hecho);
      });
      return { ok: true };
    },

    async importarDropi({ csv } = {}) {
      if (typeof csv !== 'string' || !csv.trim()) throw new ErrorUsuario('El archivo está vacío.');
      const { pedidos } = await this.pedidos();
      const cruce = cruzarReporteDropi(csv, pedidos);
      if (cruce.error) throw new ErrorUsuario(cruce.error);
      await almacen.cambiar((datos) => {
        datos.marcas = aplicarReporte(datos.marcas, cruce.actualizaciones);
      });
      return cruce;
    },

    async reiniciarDemo() {
      await almacen.cambiar((datos) => {
        for (const mapa of [datos.marcas, datos.costos]) {
          for (const clave of Object.keys(mapa)) if (clave.startsWith('demo-')) delete mapa[clave];
        }
      });
      return { ok: true };
    },

    // Copia de tus datos sin las claves de Shopify.
    async respaldo() {
      const datos = structuredClone(await almacen.leer());
      if (datos.shopify) datos.shopify = { tienda: datos.shopify.tienda, metodo: datos.shopify.metodo };
      return datos;
    },
  };
}
