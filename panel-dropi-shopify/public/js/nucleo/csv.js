import { sinAcentos } from './formato.js';

// Lee un CSV exportado desde Excel o Google Sheets (separado por coma, punto y coma o tabulador).
export function leerCSV(texto) {
  const limpio = String(texto || '').replace(/^﻿/, '');
  const primeraLinea = limpio.split(/\r?\n/, 1)[0] || '';
  const candidatos = [';', ',', '\t'];
  const separador = candidatos.reduce((mejor, s) =>
    primeraLinea.split(s).length > primeraLinea.split(mejor).length ? s : mejor,
  );

  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < limpio.length; i += 1) {
    const ch = limpio[i];
    if (entreComillas) {
      if (ch === '"' && limpio[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (ch === '"') entreComillas = false;
      else campo += ch;
    } else if (ch === '"') entreComillas = true;
    else if (ch === separador) {
      fila.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i += 1;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else campo += ch;
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  const utiles = filas.filter((f) => f.some((c) => c.trim() !== ''));
  if (!utiles.length) return { encabezados: [], filas: [] };
  const [encabezados, ...resto] = utiles;
  return { encabezados: encabezados.map((e) => e.trim()), filas: resto.map((f) => f.map((c) => c.trim())) };
}

// Traduce el estado que escribe Dropi al estado de la app. El orden importa: lo más específico primero.
export function estadoDesdeDropi(texto) {
  const t = sinAcentos(texto);
  if (!t) return null;
  if (t.includes('devol') || t.includes('devuelt')) return 'devuelto';
  if (t.includes('cancel')) return 'cancelado';
  if (t.includes('novedad') || t.includes('incidencia')) return 'novedad';
  if (t.includes('entregad')) return 'entregado';
  if (t.includes('pendiente') && t.includes('confirm')) return 'por_confirmar';
  if (['guia', 'transito', 'ruta', 'reparto', 'despach', 'bodega', 'recolect', 'enviad', 'camino'].some((p) => t.includes(p))) {
    return 'enviado';
  }
  if (t.includes('pendiente') || t.includes('confirmad')) return 'confirmado';
  return null;
}

const soloDigitos = (v) => String(v || '').replace(/\D/g, '');
const numeroPedido = (v) => soloDigitos(v).replace(/^0+/, '');

function buscarColumna(encabezados, palabras) {
  const normalizados = encabezados.map(sinAcentos);
  return normalizados.findIndex((e) => palabras.some((p) => e.includes(p)));
}

// Cruza un reporte de Dropi con los pedidos de la tienda.
// Primero busca el número de pedido de Shopify en columnas tipo "orden", "pedido" o "id";
// si no lo encuentra, usa el teléfono del cliente cuando ese teléfono es de un solo pedido.
export function cruzarReporteDropi(textoCSV, pedidos) {
  const { encabezados, filas } = leerCSV(textoCSV);
  if (!encabezados.length) return { error: 'El archivo está vacío o no es un CSV.', actualizaciones: [] };

  const colEstado = buscarColumna(encabezados, ['estado', 'status']);
  const colGuia = buscarColumna(encabezados, ['guia', 'tracking']);
  const colTransportadora = buscarColumna(encabezados, ['transportadora', 'carrier', 'courier']);
  const colTelefono = buscarColumna(encabezados, ['telefono', 'celular', 'phone', 'movil']);
  const colsPedido = encabezados
    .map((e, i) => ({ e: sinAcentos(e), i }))
    .filter(({ e }) => ['orden', 'pedido', 'order', 'id', 'tienda', 'referencia'].some((p) => e.includes(p)) && !e.includes('guia'))
    .map(({ i }) => i);

  const porNumero = new Map(pedidos.map((p) => [numeroPedido(p.numero), p]));
  const porTelefono = new Map();
  for (const p of pedidos) {
    const tel = soloDigitos(p.telefono).slice(-9);
    if (!tel) continue;
    porTelefono.set(tel, porTelefono.has(tel) ? null : p);
  }

  const actualizaciones = [];
  let sinCoincidencia = 0;
  const vistos = new Set();
  for (const fila of filas) {
    let pedido = null;
    for (const i of colsPedido) {
      const candidato = porNumero.get(numeroPedido(fila[i]));
      if (candidato && numeroPedido(fila[i])) {
        pedido = candidato;
        break;
      }
    }
    if (!pedido && colTelefono >= 0) {
      const tel = soloDigitos(fila[colTelefono]).slice(-9);
      if (tel) pedido = porTelefono.get(tel) || null;
    }
    if (!pedido || vistos.has(pedido.id)) {
      if (!pedido) sinCoincidencia += 1;
      continue;
    }
    vistos.add(pedido.id);
    actualizaciones.push({
      id: pedido.id,
      numero: pedido.numero,
      estado: colEstado >= 0 ? estadoDesdeDropi(fila[colEstado]) : null,
      estadoDropi: colEstado >= 0 ? fila[colEstado] : null,
      guia: colGuia >= 0 && fila[colGuia] ? fila[colGuia] : null,
      transportadora: colTransportadora >= 0 && fila[colTransportadora] ? fila[colTransportadora] : null,
    });
  }

  return {
    actualizaciones,
    sinCoincidencia,
    filas: filas.length,
    columnas: {
      estado: encabezados[colEstado] || null,
      guia: encabezados[colGuia] || null,
      telefono: encabezados[colTelefono] || null,
      pedido: colsPedido.map((i) => encabezados[i]),
    },
  };
}

// Aplica el cruce a las marcas guardadas: el pedido queda "visto en Dropi" y toma el estado del reporte.
export function aplicarReporte(marcas, actualizaciones) {
  const nuevas = { ...marcas };
  for (const a of actualizaciones) {
    const previa = nuevas[a.id] || {};
    nuevas[a.id] = {
      ...previa,
      enDropi: true,
      ...(a.estado ? { estado: a.estado } : {}),
      ...(a.guia ? { guia: a.guia } : {}),
      ...(a.transportadora ? { transportadora: a.transportadora } : {}),
    };
  }
  return nuevas;
}
