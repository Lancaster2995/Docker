import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aplicarReporte, cruzarReporteDropi, estadoDesdeDropi, leerCSV } from '../public/js/nucleo/csv.js';

test('lee CSV de Excel en español (punto y coma, comillas, BOM)', () => {
  const { encabezados, filas } = leerCSV('﻿ID;Cliente;Nota\r\n1;"Pérez; Ana";"dijo ""sí"""\r\n\r\n2;Luis;\r\n');
  assert.deepEqual(encabezados, ['ID', 'Cliente', 'Nota']);
  assert.deepEqual(filas, [
    ['1', 'Pérez; Ana', 'dijo "sí"'],
    ['2', 'Luis', ''],
  ]);
});

test('traduce los estados de Dropi', () => {
  assert.equal(estadoDesdeDropi('PENDIENTE CONFIRMACION'), 'por_confirmar');
  assert.equal(estadoDesdeDropi('PENDIENTE'), 'confirmado');
  assert.equal(estadoDesdeDropi('GUIA_GENERADA'), 'enviado');
  assert.equal(estadoDesdeDropi('En tránsito'), 'enviado');
  assert.equal(estadoDesdeDropi('NOVEDAD'), 'novedad');
  assert.equal(estadoDesdeDropi('ENTREGADO'), 'entregado');
  assert.equal(estadoDesdeDropi('DEVOLUCION'), 'devuelto');
  assert.equal(estadoDesdeDropi('CANCELADO'), 'cancelado');
  assert.equal(estadoDesdeDropi('algo raro'), null);
});

const PEDIDOS = [
  { id: 'gid://shopify/Order/1', numero: '#1001', telefono: '+57 300 111 2222' },
  { id: 'gid://shopify/Order/2', numero: '#1002', telefono: '3003334444' },
  { id: 'gid://shopify/Order/3', numero: '#1003', telefono: '3003334444' },
];

test('cruza por número de pedido y, si no hay, por teléfono único', () => {
  const csv = [
    'ID Dropi,Orden tienda,Teléfono,Estado,Número de guía,Transportadora',
    '88001,#1001,3001112222,ENTREGADO,240111,Servientrega',
    '88002,,3003334444,NOVEDAD,240222,Envía',
    '88003,,573001112222,EN RUTA,,',
    '88004,9999,3110000000,PENDIENTE,,',
  ].join('\n');
  const r = cruzarReporteDropi(csv, PEDIDOS);
  assert.equal(r.actualizaciones.length, 1);
  assert.deepEqual(r.actualizaciones[0], {
    id: 'gid://shopify/Order/1',
    numero: '#1001',
    estado: 'entregado',
    estadoDropi: 'ENTREGADO',
    guia: '240111',
    transportadora: 'Servientrega',
  });
  // El teléfono 3003334444 es de dos pedidos: no se adivina. El de la fila 3 es del pedido ya cruzado.
  assert.equal(r.sinCoincidencia, 2);
  assert.equal(r.columnas.estado, 'Estado');
});

test('aplicar el reporte marca el pedido como visto en Dropi', () => {
  const marcas = aplicarReporte({ 'gid://shopify/Order/1': { nota: 'ok' } }, [
    { id: 'gid://shopify/Order/1', estado: 'enviado', guia: '240111', transportadora: null },
  ]);
  assert.deepEqual(marcas['gid://shopify/Order/1'], { nota: 'ok', enDropi: true, estado: 'enviado', guia: '240111' });
});

test('un archivo vacío devuelve un error claro', () => {
  assert.match(cruzarReporteDropi('', PEDIDOS).error, /vacío/);
});
