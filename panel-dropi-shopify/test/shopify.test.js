import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearClienteShopify, normalizarPedido, normalizarTienda } from '../public/js/nucleo/shopify.js';

test('acepta el dominio .myshopify.com en varias formas y rechaza dominios propios', () => {
  assert.equal(normalizarTienda('mitienda'), 'mitienda.myshopify.com');
  assert.equal(normalizarTienda('https://MiTienda.myshopify.com/admin'), 'mitienda.myshopify.com');
  assert.throws(() => normalizarTienda('mitienda.com'), /myshopify\.com/);
  assert.throws(() => normalizarTienda('evil.com/x.myshopify.com'), /myshopify\.com/);
});

function respuesta(estado, cuerpo) {
  return { ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo };
}

test('con Client ID y Secret pide un token una vez y lo reutiliza', async () => {
  const llamadas = [];
  const fetchFalso = async (url, opciones) => {
    llamadas.push({ url, opciones });
    if (url.endsWith('/admin/oauth/access_token')) {
      const cuerpo = new URLSearchParams(opciones.body);
      assert.equal(cuerpo.get('grant_type'), 'client_credentials');
      assert.equal(cuerpo.get('client_id'), 'id-1');
      return respuesta(200, { access_token: 'tok-temporal', expires_in: 86399, scope: 'read_orders' });
    }
    assert.equal(opciones.headers['X-Shopify-Access-Token'], 'tok-temporal');
    return respuesta(200, { data: { shop: { name: 'Mi Tienda', currencyCode: 'COP', myshopifyDomain: 'mi.myshopify.com' } } });
  };
  const cliente = crearClienteShopify({ tienda: 'mi', metodo: 'cliente', clientId: 'id-1', clientSecret: 's', fetchImpl: fetchFalso });
  assert.equal((await cliente.tienda()).nombre, 'Mi Tienda');
  await cliente.tienda();
  assert.equal(llamadas.filter((l) => l.url.endsWith('access_token')).length, 1);
  assert.match(llamadas[1].url, /^https:\/\/mi\.myshopify\.com\/admin\/api\/2026-07\/graphql\.json$/);
});

test('traduce los errores de Shopify a mensajes claros', async () => {
  const cliente = crearClienteShopify({ tienda: 'mi', metodo: 'token', token: 'shpat_x', fetchImpl: async () => respuesta(401, {}) });
  await assert.rejects(cliente.tienda(), /rechazó la clave/);
  const sinRed = crearClienteShopify({ tienda: 'mi', metodo: 'token', token: 'shpat_x', fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  await assert.rejects(sinRed.tienda(), /No hay conexión/);
  const sinPermiso = crearClienteShopify({
    tienda: 'mi',
    metodo: 'token',
    token: 'shpat_x',
    fetchImpl: async () => respuesta(200, { errors: [{ message: 'Access denied for orders field.', extensions: { code: 'ACCESS_DENIED' } }] }),
  });
  await assert.rejects(sinPermiso.tienda(), /read_orders/);
});

test('sin read_inventory muestra los productos sin stock', async () => {
  let intentos = 0;
  const cliente = crearClienteShopify({
    tienda: 'mi',
    metodo: 'token',
    token: 'shpat_x',
    fetchImpl: async (_, opciones) => {
      intentos += 1;
      const { query } = JSON.parse(opciones.body);
      if (query.includes('inventoryQuantity')) return respuesta(200, { errors: [{ message: 'Access denied', extensions: { code: 'ACCESS_DENIED' } }] });
      return respuesta(200, {
        data: { products: { nodes: [{ id: 'gid://shopify/Product/9', title: 'Lámpara', status: 'ACTIVE', variants: { nodes: [{ id: 'v', title: 'Default Title', price: '69900.00' }] } }], pageInfo: { hasNextPage: false } } },
      });
    },
  });
  const [producto] = await cliente.productos();
  assert.equal(intentos, 2);
  assert.equal(producto.precio, 69900);
  assert.equal(producto.stock, null);
});

test('convierte un pedido de Shopify al formato de la app', () => {
  const p = normalizarPedido({
    id: 'gid://shopify/Order/5',
    name: '#1005',
    createdAt: '2026-09-30T12:00:00Z',
    cancelledAt: null,
    displayFinancialStatus: 'PENDING',
    phone: null,
    paymentGatewayNames: ['Cash on Delivery (COD)'],
    totalPriceSet: { shopMoney: { amount: '79900.0', currencyCode: 'COP' } },
    shippingAddress: { name: 'Ana Ruiz', phone: '3001234567', address1: 'Calle 1', address2: 'Apto 2', city: 'Cali', province: 'Valle' },
    lineItems: { nodes: [{ title: 'Corrector', variantTitle: 'Default Title', quantity: 1, product: { id: 'gid://shopify/Product/1' }, originalUnitPriceSet: { shopMoney: { amount: '79900.0' } } }] },
    fulfillments: [{ trackingInfo: [{ number: '240999', company: 'Servientrega' }] }],
  });
  assert.equal(p.total, 79900);
  assert.equal(p.direccion, 'Calle 1, Apto 2');
  assert.equal(p.pagoContraEntrega, true);
  assert.equal(p.guia, '240999');
  assert.equal(p.productos[0].variante, null);
  assert.equal(p.productos[0].productoId, 'gid://shopify/Product/1');
});
