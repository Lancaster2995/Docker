// Cliente mínimo de la Admin API de Shopify (GraphQL). Solo lee: nunca cambia nada en tu tienda.
//
// Dos formas de conectarse:
//  - 'cliente': Client ID + Client Secret de una app creada en el Dev Dashboard (la forma actual desde 2026).
//    Se cambian por un token que dura 24 horas; la app lo renueva sola.
//  - 'token': un token shpat_ de una app personalizada antigua creada en el admin antes de 2026.

export const VERSION_API = '2026-07';

export class ErrorShopify extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// Acepta "mitienda", "mitienda.myshopify.com" o "https://mitienda.myshopify.com/admin".
export function normalizarTienda(entrada) {
  let t = String(entrada || '').trim().toLowerCase();
  t = t.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (t && !t.includes('.')) t = `${t}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(t)) {
    throw new ErrorShopify(
      'Escribe el dominio que termina en .myshopify.com (lo ves en Shopify → Configuración → Dominios). Tu dominio propio, como mitienda.com, no sirve aquí.',
      'dominio',
    );
  }
  return t;
}

const MENSAJES_HTTP = {
  401: 'Shopify rechazó la clave. Revisa que la copiaste completa y que la app sigue instalada en tu tienda.',
  402: 'Tu tienda está pausada o no tiene un plan activo.',
  403: 'La app no tiene permiso para leer esto. Activa los permisos read_orders, read_products y read_inventory y vuelve a instalarla.',
  404: 'No existe una tienda con ese dominio. Revisa que termine en .myshopify.com.',
  423: 'Shopify bloqueó esta tienda temporalmente.',
  429: 'Shopify pidió esperar un momento. Intenta de nuevo en un minuto.',
};

function errorHttp(estado) {
  if (MENSAJES_HTTP[estado]) return new ErrorShopify(MENSAJES_HTTP[estado], `http_${estado}`);
  if (estado >= 500) return new ErrorShopify('Shopify tiene problemas en este momento. Intenta más tarde.', 'http_5xx');
  return new ErrorShopify(`Shopify respondió con un error (${estado}).`, `http_${estado}`);
}

const CONSULTA_TIENDA = `{ shop { name currencyCode myshopifyDomain } }`;

const CAMPOS_PEDIDO = `
  id name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
  tags note phone paymentGatewayNames
  totalPriceSet { shopMoney { amount currencyCode } }
  shippingAddress { name phone address1 address2 city province }
  lineItems(first: 20) { nodes { title variantTitle quantity product { id } originalUnitPriceSet { shopMoney { amount } } } }
  fulfillments(first: 5) { trackingInfo(first: 3) { number company } }
`;

const CONSULTA_PEDIDOS = `query Pedidos($filtro: String!, $despues: String) {
  orders(first: 100, after: $despues, query: $filtro, sortKey: CREATED_AT, reverse: true) {
    nodes { ${CAMPOS_PEDIDO} }
    pageInfo { hasNextPage endCursor }
  }
}`;

const consultaProductos = (conStock) => `query Productos($despues: String) {
  products(first: 100, after: $despues, sortKey: TITLE) {
    nodes {
      id title status
      featuredMedia { preview { image { url } } }
      variants(first: 20) { nodes { id title price ${conStock ? 'inventoryQuantity' : ''} } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export function normalizarPedido(nodo) {
  const envio = nodo.shippingAddress || {};
  const guias = (nodo.fulfillments || []).flatMap((f) => f.trackingInfo || []).filter((t) => t.number);
  const pasarelas = (nodo.paymentGatewayNames || []).join(' ').toLowerCase();
  return {
    id: nodo.id,
    numero: nodo.name,
    fecha: nodo.createdAt,
    cliente: envio.name || '',
    telefono: envio.phone || nodo.phone || '',
    ciudad: envio.city || '',
    departamento: envio.province || '',
    direccion: [envio.address1, envio.address2].filter(Boolean).join(', '),
    total: Number(nodo.totalPriceSet?.shopMoney?.amount || 0),
    productos: (nodo.lineItems?.nodes || []).map((l) => ({
      productoId: l.product?.id || null,
      titulo: l.title,
      variante: l.variantTitle && l.variantTitle !== 'Default Title' ? l.variantTitle : null,
      cantidad: l.quantity,
      precio: Number(l.originalUnitPriceSet?.shopMoney?.amount || 0),
    })),
    pagoContraEntrega: /cash|cod|contra|efectivo|manual/.test(pasarelas),
    cancelado: Boolean(nodo.cancelledAt),
    pagado: nodo.displayFinancialStatus === 'PAID',
    guia: guias[0]?.number || null,
    transportadora: guias[0]?.company || null,
    etiquetas: nodo.tags || [],
  };
}

export function normalizarProducto(nodo) {
  const variantes = nodo.variants?.nodes || [];
  const precios = variantes.map((v) => Number(v.price)).filter(Number.isFinite);
  const conStock = variantes.filter((v) => typeof v.inventoryQuantity === 'number');
  return {
    id: nodo.id,
    titulo: nodo.title,
    estadoTienda: nodo.status,
    precio: precios.length ? Math.min(...precios) : null,
    imagen: nodo.featuredMedia?.preview?.image?.url || null,
    stock: conStock.length ? conStock.reduce((suma, v) => suma + v.inventoryQuantity, 0) : null,
    variantes: variantes.length,
  };
}

export function crearClienteShopify({ tienda, metodo, token, clientId, clientSecret, version = VERSION_API, fetchImpl = fetch }) {
  const dominio = normalizarTienda(tienda);
  let tokenTemporal = null;
  let venceEn = 0;

  async function pedir(url, opciones) {
    try {
      return await fetchImpl(url, opciones);
    } catch {
      throw new ErrorShopify('No hay conexión con Shopify. Revisa tu internet e intenta de nuevo.', 'red');
    }
  }

  async function obtenerToken() {
    if (metodo === 'token') {
      if (!token) throw new ErrorShopify('Falta el token de acceso.', 'faltan_datos');
      return token;
    }
    if (!clientId || !clientSecret) throw new ErrorShopify('Faltan el Client ID o el Client Secret.', 'faltan_datos');
    if (tokenTemporal && Date.now() < venceEn - 5 * 60 * 1000) return tokenTemporal;
    const respuesta = await pedir(`https://${dominio}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    });
    if (!respuesta.ok) {
      if ([400, 401, 403].includes(respuesta.status)) {
        throw new ErrorShopify(
          'Shopify no aceptó el Client ID y el Client Secret. Revisa que los copiaste bien y que la app está instalada en esta tienda.',
          'credenciales',
        );
      }
      throw errorHttp(respuesta.status);
    }
    const datos = await respuesta.json();
    if (!datos.access_token) throw new ErrorShopify('Shopify no entregó un token de acceso.', 'credenciales');
    tokenTemporal = datos.access_token;
    venceEn = Date.now() + (Number(datos.expires_in) || 86400) * 1000;
    return tokenTemporal;
  }

  async function graphql(consulta, variables = {}, intento = 0) {
    const accessToken = await obtenerToken();
    const respuesta = await pedir(`https://${dominio}/admin/api/${version}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
      body: JSON.stringify({ query: consulta, variables }),
    });
    if (respuesta.status === 429 && intento < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (intento + 1)));
      return graphql(consulta, variables, intento + 1);
    }
    if (!respuesta.ok) throw errorHttp(respuesta.status);
    const datos = await respuesta.json();
    if (datos.errors?.length) {
      const texto = datos.errors.map((e) => e.message).join(' ');
      const codigos = datos.errors.map((e) => e.extensions?.code).join(' ');
      if (codigos.includes('THROTTLED') && intento < 2) {
        await new Promise((r) => setTimeout(r, 2000 * (intento + 1)));
        return graphql(consulta, variables, intento + 1);
      }
      if (codigos.includes('ACCESS_DENIED') || /access denied|scope/i.test(texto)) {
        throw new ErrorShopify(`${MENSAJES_HTTP[403]} (Detalle: ${texto})`, 'permisos');
      }
      throw new ErrorShopify(`Shopify devolvió un error: ${texto}`, 'graphql');
    }
    return datos.data;
  }

  async function paginar(consulta, clave, variables, maxPaginas) {
    const nodos = [];
    let despues = null;
    for (let pagina = 0; pagina < maxPaginas; pagina += 1) {
      const datos = await graphql(consulta, { ...variables, despues });
      const conexion = datos[clave];
      nodos.push(...conexion.nodes);
      if (!conexion.pageInfo.hasNextPage) break;
      despues = conexion.pageInfo.endCursor;
    }
    return nodos;
  }

  return {
    dominio,
    async tienda() {
      const datos = await graphql(CONSULTA_TIENDA);
      return { nombre: datos.shop.name, moneda: datos.shop.currencyCode, dominio: datos.shop.myshopifyDomain };
    },
    async pedidos({ dias = 45 } = {}) {
      const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const nodos = await paginar(CONSULTA_PEDIDOS, 'orders', { filtro: `created_at:>=${desde}` }, 5);
      return nodos.map(normalizarPedido);
    },
    async productos() {
      try {
        return (await paginar(consultaProductos(true), 'products', {}, 3)).map(normalizarProducto);
      } catch (error) {
        // Sin el permiso read_inventory, se muestran los productos sin stock.
        if (error.codigo !== 'permisos') throw error;
        return (await paginar(consultaProductos(false), 'products', {}, 3)).map(normalizarProducto);
      }
    },
  };
}
