// Cuentas de ganancia para dropshipping contra entrega.
//
// Ganancia esperada por pedido despachado:
//   G = (1 - d) · (P - C - F - c·P) - d·R - A
// P precio de venta, C precio del proveedor, F flete, c comisión de Dropi,
// d tasa de devolución, R pérdida por devolución (flete × veces), A publicidad por pedido.

export const SUPUESTOS_INICIALES = {
  comision: 3, // % del precio que cobra Dropi por pedido
  devolucion: 20, // % de pedidos despachados que vuelven sin venderse
  perdidaDevolucion: 2, // cuántos fletes pierdes por devolución: 1 = solo ida, 2 = ida y vuelta
  fletePromedio: null, // flete que se usa cuando un producto no tiene el suyo
  cpa: 0, // lo que pagas en anuncios por cada pedido
  margenObjetivo: 25, // % del precio que quieres que te quede limpio
};

const num = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : Number(valor);
  return Number.isFinite(n) ? n : null;
};

export function normalizarSupuestos(entrada = {}) {
  const s = { ...SUPUESTOS_INICIALES };
  const acotar = (valor, min, max) => Math.min(max, Math.max(min, valor));
  if (num(entrada.comision) !== null) s.comision = acotar(num(entrada.comision), 0, 50);
  if (num(entrada.devolucion) !== null) s.devolucion = acotar(num(entrada.devolucion), 0, 90);
  if ([1, 2].includes(num(entrada.perdidaDevolucion))) s.perdidaDevolucion = num(entrada.perdidaDevolucion);
  if (entrada.fletePromedio === null || entrada.fletePromedio === '') s.fletePromedio = null;
  else if (num(entrada.fletePromedio) !== null) s.fletePromedio = Math.max(0, num(entrada.fletePromedio));
  if (num(entrada.cpa) !== null) s.cpa = Math.max(0, num(entrada.cpa));
  if (num(entrada.margenObjetivo) !== null) s.margenObjetivo = acotar(num(entrada.margenObjetivo), 0, 80);
  return s;
}

// Devuelve todo lo que la app muestra sobre un precio. Si falta el costo o el flete, marca 'sin-datos'.
export function analizarPrecio({ precio, costo, flete }, supuestosEntrada) {
  const s = normalizarSupuestos(supuestosEntrada);
  const P = num(precio);
  const C = num(costo);
  const F = num(flete) ?? s.fletePromedio;
  const c = s.comision / 100;
  const d = s.devolucion / 100;
  const R = F === null ? null : F * s.perdidaDevolucion;
  const A = s.cpa;
  const m = s.margenObjetivo / 100;

  if (C === null || F === null) {
    return { completo: false, semaforo: 'sin-datos', faltaCosto: C === null, faltaFlete: F === null };
  }

  const precioMinimo = (C + F + (d * R + A) / (1 - d)) / (1 - c);
  const denominador = (1 - d) * (1 - c) - m;
  const precioSugerido = denominador > 0 ? ((1 - d) * (C + F) + d * R + A) / denominador : null;

  const resultado = {
    completo: true,
    costo: C,
    flete: F,
    perdidaPorDevolucion: R,
    precioMinimo,
    precioSugerido,
  };

  if (P === null || P <= 0) return { ...resultado, semaforo: 'sin-precio' };

  const comisionPesos = c * P;
  const gananciaEntregado = P - C - F - comisionPesos;
  const gananciaEsperada = (1 - d) * gananciaEntregado - d * R - A;
  const margen = gananciaEsperada / P;
  let semaforo = 'verde';
  if (gananciaEsperada <= 0) semaforo = 'rojo';
  else if (margen < m) semaforo = 'amarillo';

  return {
    ...resultado,
    precio: P,
    comisionPesos,
    gananciaEntregado,
    gananciaEsperada,
    margen,
    semaforo,
    // Lo mismo contado en 100 pedidos despachados, para explicarlo sin fórmulas.
    cada100: {
      entregados: Math.round(100 * (1 - d)),
      devueltos: 100 - Math.round(100 * (1 - d)),
      ganadoEnEntregas: 100 * (1 - d) * gananciaEntregado,
      perdidoEnDevoluciones: 100 * d * R,
      publicidad: 100 * A,
      total: 100 * gananciaEsperada,
    },
  };
}

// Cuánto cambia la ganancia por pedido si bajaras las devoluciones unos puntos.
export function efectoMenosDevoluciones(entrada, supuestos, puntos = 5) {
  const actual = analizarPrecio(entrada, supuestos);
  const s = normalizarSupuestos(supuestos);
  if (!actual.completo || actual.gananciaEsperada === undefined || s.devolucion < puntos) return null;
  const mejor = analizarPrecio(entrada, { ...s, devolucion: s.devolucion - puntos });
  return { puntos, nuevaTasa: s.devolucion - puntos, diferencia: mejor.gananciaEsperada - actual.gananciaEsperada };
}
