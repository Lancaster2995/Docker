import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { crearApp } from '../server.js';

let servidor;
let base;
let carpeta;

// Una tienda Shopify falsa para probar sin internet.
const tiendaFalsa = (config) => ({
  async tienda() {
    if (config.clientSecret === 'malo') {
      const error = new Error('Shopify no aceptó el Client ID y el Client Secret.');
      error.codigo = 'credenciales';
      Object.setPrototypeOf(error, (await import('../public/js/nucleo/shopify.js')).ErrorShopify.prototype);
      throw error;
    }
    return { nombre: 'Tienda Real', moneda: 'COP', dominio: config.tienda };
  },
  async pedidos() {
    return [
      {
        id: 'gid://shopify/Order/77',
        numero: '#1077',
        fecha: new Date().toISOString(),
        cliente: 'Ana Ruiz',
        telefono: '3001234567',
        ciudad: 'Cali',
        departamento: 'Valle',
        direccion: 'Calle 1',
        total: 79900,
        productos: [{ productoId: 'gid://shopify/Product/1', titulo: 'Corrector', variante: null, cantidad: 1, precio: 79900 }],
        cancelado: false,
        guia: null,
      },
    ];
  },
  async productos() {
    return [{ id: 'gid://shopify/Product/1', titulo: 'Corrector', precio: 79900, imagen: null, stock: 10, variantes: 1 }];
  },
});

before(async () => {
  carpeta = await mkdtemp(path.join(tmpdir(), 'panel-dropi-'));
  servidor = crearApp({ carpetaDatos: carpeta, fabricaShopify: tiendaFalsa });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  base = `http://localhost:${servidor.address().port}`;
});

after(async () => {
  await new Promise((resolve) => servidor.close(resolve));
  await rm(carpeta, { recursive: true, force: true });
});

const post = (ruta, cuerpo, encabezados = { 'X-Panel': '1' }) =>
  fetch(base + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', ...encabezados }, body: JSON.stringify(cuerpo) });

test('arranca en modo ejemplo y sirve la página', async () => {
  const estado = await (await fetch(`${base}/api/estado`)).json();
  assert.equal(estado.app, 'panel-dropi');
  assert.equal(estado.modo, 'demo');
  const pagina = await fetch(`${base}/`);
  assert.equal(pagina.status, 200);
  assert.match(await pagina.text(), /Panel Dropi Fácil/);
  const { pedidos } = await (await fetch(`${base}/api/pedidos`)).json();
  assert.equal(pedidos.length, 24);
});

test('rechaza escrituras sin el encabezado propio y hosts ajenos', async () => {
  assert.equal((await post('/api/ajustes', { pais: 'PE' }, {})).status, 403);
  // fetch no deja cambiar el encabezado Host, así que se usa http directamente.
  const estadoAjeno = await new Promise((resolve, reject) => {
    const pedido = http.request(`${base}/api/estado`, { headers: { Host: 'atacante.com' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    pedido.on('error', reject);
    pedido.end();
  });
  assert.equal(estadoAjeno, 403);
  const fuera = await fetch(`${base}/%2e%2e/server.js`);
  assert.notEqual(fuera.status, 200);
});

test('guarda estados, notas y costos en el archivo de datos', async () => {
  assert.equal((await post('/api/pedidos/marcar', { id: 'demo-1024', estado: 'confirmado', nota: 'Llamar tarde' })).status, 200);
  assert.equal((await post('/api/pedidos/marcar', { id: 'demo-1024', estado: 'volando' })).status, 400);
  assert.equal((await post('/api/productos/costo', { id: 'demo-p5', costo: 90000, flete: 15700 })).status, 200);
  const { pedidos } = await (await fetch(`${base}/api/pedidos`)).json();
  const pedido = pedidos.find((p) => p.id === 'demo-1024');
  assert.equal(pedido.estado, 'confirmado');
  assert.equal(pedido.nota, 'Llamar tarde');
  const { productos } = await (await fetch(`${base}/api/productos`)).json();
  assert.equal(productos.find((p) => p.id === 'demo-p5').costo, 90000);
  const archivo = JSON.parse(await readFile(path.join(carpeta, 'panel.json'), 'utf8'));
  assert.equal(archivo.marcas['demo-1024'].estado, 'confirmado');
});

test('importa un reporte CSV de Dropi', async () => {
  const csv = 'Orden;Estado;Guía\n#1020;GUIA GENERADA;240555\n#9999;ENTREGADO;1';
  const r = await (await post('/api/importar-dropi', { csv })).json();
  assert.equal(r.actualizaciones.length, 1);
  assert.equal(r.sinCoincidencia, 1);
  const { pedidos } = await (await fetch(`${base}/api/pedidos`)).json();
  const pedido = pedidos.find((p) => p.numero === '#1020');
  assert.equal(pedido.estado, 'enviado');
  assert.equal(pedido.enDropi, true);
});

test('no guarda una conexión que Shopify rechaza', async () => {
  const r = await post('/api/shopify/conectar', { tienda: 'mitienda', metodo: 'cliente', clientId: 'a', clientSecret: 'malo' });
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /Client Secret/);
  const dominio = await post('/api/shopify/conectar', { tienda: 'mitienda.com', metodo: 'cliente', clientId: 'a', clientSecret: 'b' });
  assert.equal(dominio.status, 400);
  const token = await post('/api/shopify/conectar', { tienda: 'mitienda', metodo: 'token', token: 'abc' });
  assert.equal(token.status, 400);
  const estado = await (await fetch(`${base}/api/estado`)).json();
  assert.equal(estado.shopify, null);
});

test('conecta la tienda, trae sus pedidos y nunca devuelve las claves', async () => {
  const r = await post('/api/shopify/conectar', { tienda: 'MiTienda.myshopify.com', metodo: 'cliente', clientId: 'id-1', clientSecret: 'secreto-1' });
  assert.equal(r.status, 200);
  const estado = await r.json();
  assert.equal(estado.modo, 'shopify');
  assert.deepEqual(estado.shopify, { tienda: 'mitienda.myshopify.com', metodo: 'cliente', nombre: 'Tienda Real' });
  const { pedidos } = await (await fetch(`${base}/api/pedidos`)).json();
  assert.deepEqual(pedidos.map((p) => p.numero), ['#1077']);
  assert.equal(pedidos[0].estado, 'por_confirmar');
  const respaldo = await (await fetch(`${base}/api/respaldo`)).text();
  assert.doesNotMatch(respaldo, /secreto-1/);
  assert.doesNotMatch(JSON.stringify(await (await fetch(`${base}/api/estado`)).json()), /secreto-1/);
  await post('/api/shopify/desconectar', {});
  const archivo = await readFile(path.join(carpeta, 'panel.json'), 'utf8');
  assert.doesNotMatch(archivo, /secreto-1/);
});
