import { SUPUESTOS_INICIALES } from './calculo.js';

// Lo que la app guarda: en el servidor va a datos/panel.json; en la vista previa, al navegador.
export const PLANTILLA_CONFIRMACION =
  'Hola {nombre}, te escribimos de {tienda}. Recibimos tu pedido {pedido}: {producto}. ' +
  'Pagas {total} en efectivo cuando lo recibas en {direccion}, {ciudad}. ' +
  '¿Nos confirmas con un SÍ para despacharlo hoy?';

export const PLANTILLA_NOVEDAD =
  'Hola {nombre}, la transportadora nos avisa que no pudo entregar tu pedido {pedido} ({producto}). ' +
  '¿Nos confirmas tu dirección completa y un horario en que puedas recibir? Así lo reprogramamos hoy mismo.';

export function datosIniciales() {
  return {
    version: 1,
    modo: 'demo',
    pais: 'CO',
    nombreTienda: '',
    supuestos: { ...SUPUESTOS_INICIALES },
    plantillas: { confirmacion: PLANTILLA_CONFIRMACION, novedad: PLANTILLA_NOVEDAD },
    gastoAnuncios: {},
    shopify: null,
    marcas: {},
    costos: {},
    checklist: {},
  };
}

// Completa lo guardado con los valores nuevos que traiga una versión más reciente de la app.
export function mezclarConIniciales(guardado) {
  const base = datosIniciales();
  if (!guardado || typeof guardado !== 'object') return base;
  return {
    ...base,
    ...guardado,
    supuestos: { ...base.supuestos, ...guardado.supuestos },
    plantillas: { ...base.plantillas, ...guardado.plantillas },
  };
}
