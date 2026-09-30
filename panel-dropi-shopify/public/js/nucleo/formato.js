// Países donde opera Dropi, con su moneda y su prefijo de WhatsApp.
export const PAISES = {
  CO: { nombre: 'Colombia', moneda: 'COP', prefijo: '57', locale: 'es-CO' },
  EC: { nombre: 'Ecuador', moneda: 'USD', prefijo: '593', locale: 'es-EC' },
  PE: { nombre: 'Perú', moneda: 'PEN', prefijo: '51', locale: 'es-PE' },
  CL: { nombre: 'Chile', moneda: 'CLP', prefijo: '56', locale: 'es-CL' },
  MX: { nombre: 'México', moneda: 'MXN', prefijo: '52', locale: 'es-MX' },
  PA: { nombre: 'Panamá', moneda: 'USD', prefijo: '507', locale: 'es-PA' },
  GT: { nombre: 'Guatemala', moneda: 'GTQ', prefijo: '502', locale: 'es-GT' },
  PY: { nombre: 'Paraguay', moneda: 'PYG', prefijo: '595', locale: 'es-PY' },
  AR: { nombre: 'Argentina', moneda: 'ARS', prefijo: '54', locale: 'es-AR' },
  ES: { nombre: 'España', moneda: 'EUR', prefijo: '34', locale: 'es-ES' },
};

// Monedas que se muestran y redondean sin decimales porque sus montos son grandes.
const SIN_DECIMALES = new Set(['COP', 'CLP', 'PYG', 'ARS']);
// Monedas donde el precio "bonito" termina en 9 (349, 1299).
const TERMINA_EN_9 = new Set(['MXN', 'GTQ', 'PEN']);

export function datosPais(codigo) {
  return PAISES[codigo] || PAISES.CO;
}

export function dinero(valor, codigoPais = 'CO') {
  const pais = datosPais(codigoPais);
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  const decimales = SIN_DECIMALES.has(pais.moneda) ? 0 : 2;
  return new Intl.NumberFormat(pais.locale, {
    style: 'currency',
    currency: pais.moneda,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

export function numero(valor, codigoPais = 'CO', decimales = 0) {
  return new Intl.NumberFormat(datosPais(codigoPais).locale, {
    maximumFractionDigits: decimales,
  }).format(valor);
}

// Sube un precio al siguiente valor "de vitrina": 65.516 COP → 65.900; 347 MXN → 349; 19,20 USD → 19,99.
export function redondearPrecio(valor, codigoPais = 'CO') {
  if (!Number.isFinite(valor) || valor <= 0) return null;
  const { moneda } = datosPais(codigoPais);
  if (SIN_DECIMALES.has(moneda)) return Math.ceil((valor + 100) / 1000) * 1000 - 100;
  if (TERMINA_EN_9.has(moneda)) return Math.ceil((valor + 1) / 10) * 10 - 1;
  return Math.round((Math.ceil(valor + 0.01) - 0.01) * 100) / 100;
}

// Convierte un teléfono escrito por el cliente al formato internacional que usa wa.me.
export function telefonoWhatsApp(telefono, codigoPais = 'CO') {
  if (!telefono) return null;
  const texto = String(telefono).trim();
  let digitos = texto.replace(/\D/g, '');
  if (!digitos) return null;
  if (texto.startsWith('+') || texto.startsWith('00')) return digitos.replace(/^00/, '');
  if (digitos.length > 10) return digitos;
  digitos = digitos.replace(/^0+/, '');
  return datosPais(codigoPais).prefijo + digitos;
}

export function linkWhatsApp(telefono, mensaje, codigoPais = 'CO') {
  const numeroWa = telefonoWhatsApp(telefono, codigoPais);
  if (!numeroWa) return null;
  return `https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}`;
}

// Reemplaza {nombre}, {pedido}, etc. Las llaves desconocidas quedan tal cual para que se note el error.
export function llenarPlantilla(plantilla, datos) {
  return String(plantilla || '').replace(/\{(\w+)\}/g, (coincidencia, clave) =>
    datos[clave] !== undefined && datos[clave] !== null ? String(datos[clave]) : coincidencia,
  );
}

export function primerNombre(nombreCompleto) {
  return String(nombreCompleto || '').trim().split(/\s+/)[0] || '';
}

export function sinAcentos(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function fechaLarga(fecha, codigoPais = 'CO') {
  return new Intl.DateTimeFormat(datosPais(codigoPais).locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(fecha));
}

export function fechaCorta(fecha, codigoPais = 'CO') {
  return new Intl.DateTimeFormat(datosPais(codigoPais).locale, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(fecha));
}

export function haceCuanto(fecha, ahora = Date.now()) {
  const minutos = Math.max(0, Math.round((ahora - new Date(fecha).getTime()) / 60000));
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}
