import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analizarPrecio, efectoMenosDevoluciones, normalizarSupuestos } from '../public/js/nucleo/calculo.js';
import { redondearPrecio } from '../public/js/nucleo/formato.js';

// Mismo ejemplo que la guía: proveedor 25.000, flete 15.700, comisión 3 %, devoluciones 20 %,
// ida y vuelta, anuncios 12.000 por pedido.
const SUPUESTOS_GUIA = { comision: 3, devolucion: 20, perdidaDevolucion: 2, cpa: 12000, margenObjetivo: 25 };

test('reproduce el ejemplo de la guía', () => {
  const a = analizarPrecio({ precio: 79900, costo: 25000, flete: 15700 }, SUPUESTOS_GUIA);
  assert.equal(a.completo, true);
  assert.ok(Math.abs(a.gananciaEntregado - 36803) < 0.01);
  assert.ok(Math.abs(a.gananciaEsperada - 11162.4) < 0.01);
  assert.equal(Math.ceil(a.precioMinimo), 65516);
  assert.equal(a.semaforo, 'amarillo');
});

test('a precio mínimo la ganancia esperada es cero', () => {
  const base = analizarPrecio({ precio: 1, costo: 25000, flete: 15700 }, SUPUESTOS_GUIA);
  const enMinimo = analizarPrecio({ precio: base.precioMinimo, costo: 25000, flete: 15700 }, SUPUESTOS_GUIA);
  assert.ok(Math.abs(enMinimo.gananciaEsperada) < 1e-6);
});

test('el precio sugerido cumple la meta de ganancia', () => {
  const base = analizarPrecio({ precio: 1, costo: 25000, flete: 15700 }, SUPUESTOS_GUIA);
  const sugerido = analizarPrecio({ precio: base.precioSugerido, costo: 25000, flete: 15700 }, SUPUESTOS_GUIA);
  assert.ok(Math.abs(sugerido.margen - 0.25) < 1e-9);
});

test('la regla de ×2,5 pierde dinero en el ejemplo', () => {
  const a = analizarPrecio({ precio: 62500, costo: 25000, flete: 15700 }, SUPUESTOS_GUIA);
  assert.equal(a.semaforo, 'rojo');
  assert.ok(a.gananciaEsperada < 0);
});

test('100 pedidos suman lo mismo que 100 veces la ganancia esperada', () => {
  const a = analizarPrecio({ precio: 79900, costo: 25000, flete: 15700 }, SUPUESTOS_GUIA);
  const k = a.cada100;
  assert.ok(Math.abs(k.ganadoEnEntregas - k.perdidoEnDevoluciones - k.publicidad - k.total) < 1e-6);
  assert.equal(k.entregados + k.devueltos, 100);
});

test('sin costo o sin flete no inventa números', () => {
  assert.equal(analizarPrecio({ precio: 79900, costo: null, flete: 15700 }, SUPUESTOS_GUIA).semaforo, 'sin-datos');
  const sinFlete = analizarPrecio({ precio: 79900, costo: 25000, flete: null }, SUPUESTOS_GUIA);
  assert.equal(sinFlete.faltaFlete, true);
  const conPromedio = analizarPrecio({ precio: 79900, costo: 25000, flete: null }, { ...SUPUESTOS_GUIA, fletePromedio: 15700 });
  assert.equal(conPromedio.completo, true);
});

test('normaliza supuestos fuera de rango', () => {
  const s = normalizarSupuestos({ comision: '4,5', devolucion: 150, perdidaDevolucion: 3, cpa: -5 });
  assert.equal(s.comision, 4.5);
  assert.equal(s.devolucion, 90);
  assert.equal(s.perdidaDevolucion, 2);
  assert.equal(s.cpa, 0);
});

test('bajar devoluciones sube la ganancia', () => {
  const efecto = efectoMenosDevoluciones({ precio: 79900, costo: 25000, flete: 15700 }, SUPUESTOS_GUIA);
  assert.equal(efecto.nuevaTasa, 15);
  assert.ok(efecto.diferencia > 0);
});

test('redondea a precios de vitrina según la moneda', () => {
  assert.equal(redondearPrecio(65516, 'CO'), 65900);
  assert.equal(redondearPrecio(65950, 'CO'), 66900);
  assert.equal(redondearPrecio(347.2, 'MX'), 349);
  assert.equal(redondearPrecio(19.2, 'EC'), 19.99);
  assert.equal(redondearPrecio(0, 'CO'), null);
});
