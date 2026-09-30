import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pedidosDemo, productosDemo } from '../public/js/nucleo/demo.js';
import { linkWhatsApp, llenarPlantilla, telefonoWhatsApp } from '../public/js/nucleo/formato.js';
import {
  combinarPedidos,
  combinarProductos,
  cuentasPedido,
  datosMensaje,
  estadoBase,
  filtrarPedidos,
  resumen,
  tareasDeHoy,
} from '../public/js/nucleo/pedidos.js';

const AHORA = Date.parse('2026-09-30T15:00:00Z');
const SUPUESTOS = { comision: 3, devolucion: 20, perdidaDevolucion: 2, cpa: 0, margenObjetivo: 25 };

test('deduce el estado desde Shopify', () => {
  assert.equal(estadoBase({ cancelado: true }), 'cancelado');
  assert.equal(estadoBase({ guia: '123' }), 'enviado');
  assert.equal(estadoBase({}), 'por_confirmar');
  assert.equal(estadoBase({ estadoFuente: 'novedad', guia: '1' }), 'novedad');
});

test('lo que marcas en la app manda sobre lo automático', () => {
  const fuente = [{ id: 'a', numero: '#1', fecha: '2026-09-29T10:00:00Z', productos: [], guia: null }];
  const [p] = combinarPedidos(fuente, { a: { estado: 'confirmado', nota: 'llamar', enDropi: true } });
  assert.equal(p.estado, 'confirmado');
  assert.equal(p.estadoMarcado, true);
  assert.equal(p.nota, 'llamar');
  assert.equal(p.enDropi, true);
  const [sinMarca] = combinarPedidos(fuente, { a: { estado: 'inventado' } });
  assert.equal(sinMarca.estado, 'por_confirmar');
});

test('los datos de ejemplo son estables y completos', () => {
  const pedidos = pedidosDemo('COP', AHORA);
  assert.equal(pedidos.length, 24);
  assert.deepEqual(pedidosDemo('COP', AHORA), pedidos);
  assert.ok(pedidos.every((p) => p.id.startsWith('demo-') && p.productos.length));
  const usd = productosDemo('USD');
  assert.ok(usd[0].precio < 100);
});

test('calcula la ganancia de un pedido entregado y la pérdida de uno devuelto', () => {
  const productos = combinarProductos([{ id: 'p1', precio: 79900, costoEjemplo: 25000, fleteEjemplo: 15700 }]);
  const porId = { p1: productos[0] };
  const base = { total: 79900, productos: [{ productoId: 'p1', cantidad: 1 }] };
  const entregado = cuentasPedido({ ...base, estado: 'entregado' }, porId, SUPUESTOS);
  assert.ok(Math.abs(entregado.ganancia - 36803) < 0.01);
  const devuelto = cuentasPedido({ ...base, estado: 'devuelto' }, porId, SUPUESTOS);
  assert.equal(devuelto.ganancia, -31400);
  const sinCosto = cuentasPedido({ ...base, productos: [{ productoId: 'otro', cantidad: 1 }], estado: 'entregado' }, porId, SUPUESTOS);
  assert.equal(sinCosto.completo, false);
});

test('el resumen y las tareas del día salen de los pedidos', () => {
  const pedidos = combinarPedidos(pedidosDemo('COP', AHORA));
  const productos = combinarProductos(productosDemo('COP'));
  const r = resumen(pedidos, productos, SUPUESTOS, { ahora: AHORA, gastoAnuncios: 100000 });
  assert.equal(r.conteo.por_confirmar, 4);
  assert.equal(r.conteo.novedad, 2);
  assert.equal(r.productosSinCosto, 1);
  assert.equal(r.porConfirmarViejos, 1);
  assert.equal(r.gananciaNetaMes, r.gananciaMes - 100000);
  const tareas = tareasDeHoy(r);
  assert.equal(tareas[0].clave, 'novedad');
  assert.ok(tareas.some((t) => t.clave === 'por_confirmar' && t.urgente));
});

test('filtra por estado, por "sin revisar en Dropi" y por búsqueda', () => {
  const pedidos = combinarPedidos(pedidosDemo('COP', AHORA));
  assert.equal(filtrarPedidos(pedidos, 'novedad').length, 2);
  assert.ok(filtrarPedidos(pedidos, 'sin_dropi').every((p) => !p.enDropi));
  assert.ok(filtrarPedidos(pedidos, 'todos', 'bogotá').every((p) => p.ciudad === 'Bogotá'));
});

test('arma el enlace de WhatsApp con el prefijo del país', () => {
  assert.equal(telefonoWhatsApp('300 123 4567', 'CO'), '573001234567');
  assert.equal(telefonoWhatsApp('+57 300 123 4567', 'CO'), '573001234567');
  assert.equal(telefonoWhatsApp('0987654321', 'EC'), '593987654321');
  assert.equal(telefonoWhatsApp('', 'CO'), null);
  const pedido = combinarPedidos(pedidosDemo('COP', AHORA))[0];
  const texto = llenarPlantilla('Hola {nombre}, pedido {pedido} por {total}. {desconocida}', datosMensaje(pedido, { nombreTienda: 'Mi tienda', pais: 'CO' }));
  assert.match(texto, /^Hola Laura, pedido #1024 por \$\s?59\.900\. \{desconocida\}$/);
  assert.match(linkWhatsApp('3001234567', 'Hola ¿sí?', 'CO'), /^https:\/\/wa\.me\/573001234567\?text=Hola%20%C2%BFs%C3%AD%3F$/);
});
