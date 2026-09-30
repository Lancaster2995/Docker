import { api, hayServidor, iniciarApi } from './api.js';
import { analizarPrecio, efectoMenosDevoluciones } from './nucleo/calculo.js';
import { convertir } from './nucleo/demo.js';
import {
  PAISES,
  datosPais,
  dinero,
  fechaCorta,
  fechaLarga,
  haceCuanto,
  linkWhatsApp,
  llenarPlantilla,
  numero,
  redondearPrecio,
} from './nucleo/formato.js';
import {
  ESTADOS,
  ESTADO_POR_CLAVE,
  cuentasPedido,
  datosMensaje,
  estadoBase,
  filtrarPedidos,
  pedidosPorDia,
  resumen,
  tareasDeHoy,
} from './nucleo/pedidos.js';

const GUIA_URL = 'https://claude.ai/code/artifact/7161731f-943c-401b-a882-e22f090b5c99';
const VISTAS = ['hoy', 'pedidos', 'productos', 'calculadora', 'aprende', 'ajustes'];

// Estado de la pantalla.
const E = {
  info: null,
  pedidos: [],
  productos: [],
  cargando: true,
  error: null,
  vista: 'hoy',
  filtro: 'todos',
  busqueda: '',
  calc: null,
  confirmarReinicio: false,
};

const $ = (selector) => document.querySelector(selector);
const esc = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const idDom = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '-');
const pais = () => E.info?.pais || 'CO';
const plata = (valor) => dinero(valor, pais());
const supuestos = () => E.info.supuestos;
const moneda = () => datosPais(pais()).moneda;
const porcentaje = (valor) => `${numero(valor * 100, pais(), 0)} %`;
const leerNumero = (valor) => (valor === '' || valor === null || valor === undefined ? null : Number(valor));

function mesActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

const ICONO = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6A8 8 0 1 1 21 12z"/></svg>',
  recargar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></svg>',
  subir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
};

// ---------- Avisos ----------

let temporizadorAviso;
function avisar(texto) {
  const toast = $('#toast');
  toast.textContent = texto;
  toast.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => {
    toast.hidden = true;
  }, 3600);
}

async function intentar(fn) {
  try {
    await fn();
  } catch (error) {
    avisar(error.message || 'Algo salió mal. Intenta de nuevo.');
  }
}

// ---------- Datos ----------

async function cargarTodo({ fresco = false } = {}) {
  E.error = null;
  try {
    E.info = await api.estado();
    const [datosPedidos, datosProductos] = await Promise.all([api.pedidos({ fresco }), api.productos({ fresco })]);
    E.pedidos = datosPedidos.pedidos;
    E.productos = datosProductos.productos;
  } catch (error) {
    E.error = error.message;
    E.pedidos = [];
    E.productos = [];
  }
  E.cargando = false;
  pintar();
}

async function guardarAjustes(cambios, { mensaje = 'Guardado', repintar = false } = {}) {
  E.info = await api.guardarAjustes(cambios);
  if (mensaje) avisar(mensaje);
  if (repintar) pintar();
}

// ---------- Rutas ----------

function leerRuta() {
  const [vista, ...resto] = location.hash.replace('#', '').split('-');
  E.vista = VISTAS.includes(vista) ? vista : 'hoy';
  if (E.vista === 'pedidos') E.filtro = resto.length ? resto.join('-') : 'todos';
}

function pintar() {
  for (const enlace of document.querySelectorAll('.nav a')) {
    if (enlace.dataset.vista === E.vista) enlace.setAttribute('aria-current', 'page');
    else enlace.removeAttribute('aria-current');
  }
  const contenedor = $('#vista');
  if (E.cargando || !E.info) {
    contenedor.innerHTML = '<p class="cargando">Cargando tu tienda…</p>';
    return;
  }
  const pendientes = E.pedidos.filter((p) => ['por_confirmar', 'novedad'].includes(p.estado)).length;
  const burbuja = $('#burbuja-pedidos');
  burbuja.hidden = pendientes === 0;
  burbuja.textContent = pendientes;
  $('#riel-pie').textContent = !E.info.servidor
    ? 'Vista previa con datos de ejemplo.'
    : E.info.modo === 'shopify'
      ? `Conectado a ${E.info.shopify?.nombre || E.info.shopify?.tienda}.`
      : 'Usando datos de ejemplo.';

  const vistas = { hoy: vistaHoy, pedidos: vistaPedidos, productos: vistaProductos, calculadora: vistaCalculadora, aprende: vistaAprende, ajustes: vistaAjustes };
  contenedor.innerHTML = avisoModo() + avisoError() + vistas[E.vista]();
}

function avisoModo() {
  if (!E.info.servidor) {
    return `<div class="aviso-modo"><p><strong>Vista previa.</strong> Estos son datos de ejemplo y lo que cambies se guarda solo en este navegador. Para usar tu tienda real, instala la app en tu computador.</p>
      <a class="btn btn-sec btn-chico" href="#aprende">Cómo instalarla</a></div>`;
  }
  if (E.info.modo === 'demo') {
    return `<div class="aviso-modo"><p><strong>Datos de ejemplo.</strong> Nada de esto es de tu tienda todavía; explora con calma.</p>
      <a class="btn btn-chico" href="#ajustes">Conectar mi tienda</a></div>`;
  }
  return '';
}

function avisoError() {
  if (!E.error) return '';
  return `<div class="error" role="alert"><p><strong>No pudimos traer tus datos de Shopify.</strong> ${esc(E.error)}</p>
    <div class="botones" style="margin-top:10px">
      <button class="btn btn-chico" data-accion="reintentar">Intentar de nuevo</button>
      <button class="btn btn-sec btn-chico" data-accion="usar-ejemplo">Ver datos de ejemplo mientras tanto</button>
    </div></div>`;
}

// ---------- Hoy ----------

function vistaHoy() {
  const s = supuestos();
  const gasto = E.info.gastoAnuncios?.[mesActual()] || 0;
  const r = resumen(E.pedidos, E.productos, s, { gastoAnuncios: gasto });
  const enRojo = E.productos.filter((p) => analizarPrecio(p, s).semaforo === 'rojo').length;
  const tareas = tareasDeHoy(r, enRojo);
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = E.info.nombreTienda ? `, ${esc(E.info.nombreTienda)}` : '';

  const bienvenida = E.info.checklist?.bienvenida
    ? ''
    : `<section class="bienvenida" aria-labelledby="t-bienvenida">
        <div>
          <h2 id="t-bienvenida">Esta app te dice qué hacer cada día con tu tienda</h2>
          <ol>
            <li>Mira los pedidos de ejemplo y toca los botones: no se rompe nada.</li>
            <li>En <a href="#ajustes">Ajustes</a> elige tu país y escribe tus números (comisión, devoluciones, anuncios).</li>
            <li>Cuando tengas tu tienda lista, conéctala en <a href="#ajustes">Ajustes</a>. Si aún no la tienes, sigue la lista de <a href="#aprende">Aprende</a>.</li>
          </ol>
        </div>
        <button class="btn btn-sec" data-accion="cerrar-bienvenida">Entendido</button>
      </section>`;

  const listaTareas = tareas.length
    ? `<ul class="tareas">${tareas
        .map(
          (t) => `<li class="tarea" data-urgente="${t.urgente}">
            <span class="tarea-num">${t.cantidad}</span>
            <div class="tarea-texto"><h3>${esc(t.titulo)}</h3><p>${esc(t.detalle)}</p></div>
            <a class="btn ${t.urgente ? '' : 'btn-sec'}" href="#${t.ir}">${t.urgente ? 'Resolver' : 'Ver'}</a>
          </li>`,
        )
        .join('')}</ul>`
    : `<div class="al-dia">${ICONO.ok}<div><h3>Todo al día</h3><p class="suave">No hay pedidos por confirmar ni novedades. Buen momento para revisar tus anuncios.</p></div></div>`;

  const signo = r.gananciaNetaMes < 0 ? 'negativo' : 'positivo';
  const cifras = `<div class="cifras">
      <div class="cifra"><span class="eyebrow">Entregado este mes</span><span class="cifra-valor">${plata(r.ventasMes)}</span>
        <p>${r.entregadosMes} ${r.entregadosMes === 1 ? 'pedido entregado y pagado' : 'pedidos entregados y pagados'}.</p></div>
      <div class="cifra"><span class="eyebrow">Ganancia estimada</span><span class="cifra-valor" data-signo="${signo}">${plata(r.gananciaNetaMes)}</span>
        <p>${gasto ? `Ya descontados ${plata(gasto)} de anuncios.` : 'Todavía sin descontar anuncios.'}${
          r.pedidosSinCosto ? ` ${r.pedidosSinCosto} ${r.pedidosSinCosto === 1 ? 'entrega no suma' : 'entregas no suman'}: falta el costo.` : ''
        }</p>
        <label class="campo"><span class="ayuda">¿Cuánto gastaste en anuncios este mes?</span>
          <input type="number" id="gasto-anuncios" min="0" inputmode="decimal" placeholder="0" value="${gasto || ''}" data-cambio="gasto"></label></div>
      <div class="cifra"><span class="eyebrow">Tasa de entrega</span><span class="cifra-valor">${r.tasaEntrega === null ? '—' : porcentaje(r.tasaEntrega)}</span>
        <p>${
          r.tasaEntrega === null
            ? 'Aún no hay pedidos entregados o devueltos este mes.'
            : `De cada 10 pedidos que salen, ${Math.round(r.tasaEntrega * 10)} se entregan y se pagan.`
        }</p></div>
      <div class="cifra"><span class="eyebrow">Pedidos del mes</span><span class="cifra-valor">${r.pedidosMes}</span><p>Sin contar los cancelados.</p></div>
    </div>`;

  const parada = (clave, quien, color) => `<button class="parada" data-accion="filtro" data-filtro="${clave}" style="--color-parada: var(${color})">
      <span class="parada-num">${r.conteo[clave]}</span><span class="parada-nombre">${ESTADO_POR_CLAVE[clave].nombre}</span><span class="parada-quien">${quien}</span></button>`;
  const desvio = (clave) => `<button class="desvio" data-accion="filtro" data-filtro="${clave}">
      <span class="chip" data-tono="${ESTADO_POR_CLAVE[clave].tono}">${ESTADO_POR_CLAVE[clave].nombre}</span><strong>${r.conteo[clave]}</strong></button>`;

  return `
    <header class="cabecera"><div><p class="eyebrow">${esc(fechaLarga(Date.now(), pais()))}</p><h1>${saludo}${nombre}</h1></div></header>
    ${bienvenida}
    <section class="seccion" aria-labelledby="t-tareas"><div class="seccion-cab"><h2 id="t-tareas">Para hacer hoy</h2><span class="suave">Lo urgente va primero</span></div>${listaTareas}</section>
    <section class="seccion" aria-labelledby="t-mes"><div class="seccion-cab"><h2 id="t-mes">Tu mes</h2><span class="suave">Cuentas estimadas con tus costos</span></div>${cifras}</section>
    <section class="seccion" aria-labelledby="t-recorrido"><div class="seccion-cab"><h2 id="t-recorrido">Dónde están tus pedidos</h2><span class="suave">Toca una etapa para ver sus pedidos</span></div>
      <div class="recorrido">
        ${parada('por_confirmar', 'Te toca a ti, por WhatsApp', '--acento')}
        ${parada('confirmado', 'Dropi y el proveedor lo preparan', '--info')}
        ${parada('enviado', 'La transportadora lo lleva', '--info')}
        ${parada('entregado', 'Cobrado: ganancia a tu billetera', '--bien')}
      </div>
      <div class="desvios">${desvio('novedad')}${desvio('devuelto')}${desvio('cancelado')}</div>
    </section>
    <section class="seccion" aria-labelledby="t-grafica"><div class="seccion-cab"><h2 id="t-grafica">Pedidos por día</h2><span class="suave">Últimos 14 días, sin cancelados</span></div>
      <div class="panel">${graficaPedidos()}</div></section>`;
}

function graficaPedidos() {
  const serie = pedidosPorDia(E.pedidos, 14);
  const W = 640;
  const H = 190;
  const m = { izq: 30, der: 8, arr: 18, aba: 30 };
  const maximo = Math.max(2, ...serie.map((d) => d.total));
  const tope = Math.ceil(maximo / 2) * 2;
  const ancho = (W - m.izq - m.der) / serie.length;
  const y = (v) => H - m.aba - (v / tope) * (H - m.arr - m.aba);
  const etiquetaDia = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
  const lineas = [0, tope / 2, tope]
    .map((v) => `<line class="rejilla" x1="${m.izq}" x2="${W - m.der}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.izq - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`)
    .join('');
  const barras = serie
    .map((d, i) => {
      const x = m.izq + i * ancho + ancho * 0.18;
      const w = ancho * 0.64;
      const hoy = i === serie.length - 1;
      const alto = Math.max(0, y(0) - y(d.total));
      const etiqueta = i === 0 || i === serie.length - 1 || i === Math.floor(serie.length / 2);
      return `<rect class="${hoy ? 'barra-hoy' : 'barra'}" x="${x}" y="${y(d.total)}" width="${w}" height="${alto}" rx="3"><title>${etiquetaDia(d.fecha)}: ${d.total} pedidos</title></rect>
        ${d.total ? `<text class="valor" x="${x + w / 2}" y="${y(d.total) - 5}" text-anchor="middle">${d.total}</text>` : ''}
        ${etiqueta ? `<text x="${x + w / 2}" y="${H - 10}" text-anchor="middle">${hoy ? 'hoy' : etiquetaDia(d.fecha)}</text>` : ''}`;
    })
    .join('');
  const total = serie.reduce((suma, d) => suma + d.total, 0);
  return `<svg class="grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pedidos por día en los últimos 14 días: ${total} en total">${lineas}${barras}</svg>`;
}

// ---------- Pedidos ----------

function vistaPedidos() {
  const conteo = Object.fromEntries(ESTADOS.map((e) => [e.clave, 0]));
  for (const p of E.pedidos) conteo[p.estado] += 1;
  const sinDropi = filtrarPedidos(E.pedidos, 'sin_dropi').length;
  const filtros = [
    ['todos', 'Todos', E.pedidos.length],
    ...ESTADOS.map((e) => [e.clave, e.nombre, conteo[e.clave]]),
    ['sin_dropi', 'Sin revisar en Dropi', sinDropi],
  ];
  const ayuda =
    E.filtro === 'sin_dropi'
      ? 'Pedidos que aún no marcas como vistos en Dropi. Búscalos en Dropi → Mis pedidos. Si no están, revisa la app Dropify en Shopify.'
      : ESTADO_POR_CLAVE[E.filtro]?.ayuda || 'Todos los pedidos de los últimos 45 días, del más nuevo al más viejo.';

  return `
    <header class="cabecera"><div><h1>Pedidos</h1>
      <p class="intro">Cada tarjeta es un pedido. El botón verde abre WhatsApp con el mensaje listo; tú solo lo envías.</p></div>
      <div class="botones">
        ${E.info.modo === 'shopify' ? `<button class="btn btn-sec" data-accion="actualizar">${ICONO.recargar}Traer pedidos nuevos</button>` : ''}
        <label class="btn btn-sec">${ICONO.subir}Subir reporte de Dropi
          <input type="file" id="archivo-dropi" class="solo-lector" accept=".csv,text/csv" data-cambio="importar"></label>
      </div>
    </header>
    <div class="filtros" role="group" aria-label="Filtrar pedidos">${filtros
      .map(
        ([clave, nombre, cantidad]) =>
          `<button class="filtro" data-accion="filtro" data-filtro="${clave}" aria-pressed="${E.filtro === clave}">${nombre} <span class="dato">${cantidad}</span></button>`,
      )
      .join('')}</div>
    <div class="barra-herramientas">
      <input type="search" id="buscar" placeholder="Buscar por nombre, número, ciudad, teléfono o guía" value="${esc(E.busqueda)}" data-entrada="buscar" aria-label="Buscar pedidos">
    </div>
    <p class="ayuda-filtro">${esc(ayuda)}</p>
    <div class="lista-guias" id="lista-pedidos">${htmlListaPedidos()}</div>`;
}

function htmlListaPedidos() {
  const lista = filtrarPedidos(E.pedidos, E.filtro, E.busqueda);
  if (!lista.length) {
    return `<p class="vacio">${E.busqueda ? 'Ningún pedido coincide con tu búsqueda.' : 'No hay pedidos en esta etapa. ¡Bien!'}</p>`;
  }
  const productosPorId = Object.fromEntries(E.productos.map((p) => [p.id, p]));
  return lista.map((p) => tarjetaPedido(p, productosPorId)).join('');
}

function tarjetaPedido(p, productosPorId) {
  const estado = ESTADO_POR_CLAVE[p.estado];
  const cuentas = cuentasPedido(p, productosPorId, supuestos());
  const datos = datosMensaje(p, { nombreTienda: E.info.nombreTienda, pais: pais() });
  const waConfirmar = linkWhatsApp(p.telefono, llenarPlantilla(E.info.plantillas.confirmacion, datos), pais());
  const waNovedad = linkWhatsApp(p.telefono, llenarPlantilla(E.info.plantillas.novedad, datos), pais());
  const id = esc(p.id);
  const dom = idDom(p.id);

  const boton = (clave, texto, clase = 'btn-sec') =>
    `<button class="btn btn-chico ${clase}" data-accion="estado" data-id="${id}" data-estado="${clave}">${texto}</button>`;
  const whatsapp = (href, texto) =>
    href
      ? `<a class="btn btn-chico btn-wa" href="${esc(href)}" target="_blank" rel="noopener">${ICONO.chat}${texto}</a>`
      : '<span class="suave">Este pedido no tiene teléfono.</span>';

  const acciones = {
    por_confirmar: whatsapp(waConfirmar, 'Pedir confirmación') + boton('confirmado', 'El cliente confirmó', '') + boton('cancelado', 'Cancelar'),
    confirmado: boton('enviado', 'Ya tiene guía: en camino', '') + boton('cancelado', 'Cancelar'),
    enviado: boton('entregado', 'Se entregó', '') + boton('novedad', 'Tiene novedad') + boton('devuelto', 'Se devolvió'),
    novedad: whatsapp(waNovedad, 'Resolver con el cliente') + boton('entregado', 'Se entregó', '') + boton('devuelto', 'Se devolvió'),
  }[p.estado];

  let linea = '';
  if (!cuentas.completo && p.estado !== 'cancelado') linea = 'Falta el costo del producto para calcular tu ganancia.';
  else if (p.estado === 'entregado') linea = `Ganaste ${plata(cuentas.ganancia)}`;
  else if (p.estado === 'devuelto') linea = `Perdiste ${plata(-cuentas.ganancia)} en fletes`;
  else if (p.estado !== 'cancelado' && cuentas.gananciaSiSeEntrega !== null) linea = `Si se entrega ganas ${plata(cuentas.gananciaSiSeEntrega)}`;

  const opciones = ESTADOS.filter((e) => e.clave !== p.estado)
    .map((e) => `<option value="${e.clave}">${e.nombre}</option>`)
    .join('');

  return `<article class="guia" data-estado="${p.estado}">
    <header class="guia-cab">
      <span class="guia-num">${esc(p.numero)}</span>
      <span class="chip" data-tono="${estado.tono}">${estado.nombre}</span>
      ${p.ejemplo ? '<span class="chip" data-tono="ejemplo">Ejemplo</span>' : ''}
      <time datetime="${esc(p.fecha)}" title="${esc(fechaCorta(p.fecha, pais()))}">${haceCuanto(p.fecha)}</time>
    </header>
    <div class="guia-cuerpo">
      <div class="guia-cliente">
        <strong>${esc(p.cliente || 'Cliente sin nombre')}</strong>
        <span>${esc([p.ciudad, p.departamento].filter(Boolean).join(', '))}</span>
        <span>${esc(p.direccion)}</span>
        ${p.telefono ? `<span class="mono">${esc(p.telefono)}</span>` : ''}
      </div>
      <div class="guia-total"><span class="eyebrow">${p.estado === 'entregado' ? 'Cobrado' : 'Cobra al entregar'}</span><strong>${plata(p.total)}</strong>${
        linea ? `<small>${esc(linea)}</small>` : ''
      }</div>
      <ul class="guia-productos">${p.productos
        .map((l) => `<li>${l.cantidad} × ${esc(l.titulo)}${l.variante ? ` <span class="suave">(${esc(l.variante)})</span>` : ''}</li>`)
        .join('')}</ul>
      ${p.guia ? `<p class="guia-envio">Guía <span class="mono">${esc(p.guia)}</span>${p.transportadora ? ` · ${esc(p.transportadora)}` : ''}</p>` : ''}
    </div>
    ${acciones ? `<p class="guia-paso"><strong>Siguiente paso:</strong> ${esc(estado.ayuda)}</p><div class="guia-acciones">${acciones}</div>` : ''}
    <div class="guia-pie">
      <label class="check"><input type="checkbox" id="dropi-${dom}" data-cambio="en-dropi" data-id="${id}" ${p.enDropi ? 'checked' : ''}> Lo vi en Dropi</label>
      <label><span class="solo-lector">Cambiar estado del pedido ${esc(p.numero)}</span>
        <select id="estado-${dom}" data-cambio="estado" data-id="${id}"><option value="">Cambiar estado a…</option>${opciones}${
          p.estadoMarcado ? '<option value="__auto">Volver al estado automático</option>' : ''
        }</select></label>
    </div>
    <details ${p.nota ? 'open' : ''}><summary>${p.nota ? 'Nota' : 'Agregar una nota'}</summary>
      <textarea id="nota-${dom}" data-cambio="nota" data-id="${id}" aria-label="Nota del pedido ${esc(p.numero)}" placeholder="Ej: llamar después de las 6 p. m.">${esc(p.nota)}</textarea></details>
  </article>`;
}

async function cambiarEstado(id, estado) {
  const pedido = E.pedidos.find((p) => p.id === id);
  if (!pedido) return;
  await api.marcarPedido({ id, estado });
  pedido.estadoMarcado = estado !== null;
  pedido.estado = estado ?? estadoBase(pedido);
  pintar();
  avisar(`Pedido ${pedido.numero}: ${ESTADO_POR_CLAVE[pedido.estado].nombre}`);
}

async function importarReporte(input) {
  const archivo = input.files?.[0];
  if (!archivo) return;
  const texto = await archivo.text();
  input.value = '';
  const resultado = await api.importarDropi({ csv: texto });
  await cargarTodo();
  const n = resultado.actualizaciones.length;
  if (!n) {
    avisar(`No encontramos tus pedidos en el archivo (${resultado.filas} filas). Revisa que sea el reporte de pedidos de Dropi en CSV.`);
    return;
  }
  avisar(
    `Listo: ${n} ${n === 1 ? 'pedido actualizado' : 'pedidos actualizados'} desde Dropi${
      resultado.sinCoincidencia ? `; ${resultado.sinCoincidencia} filas no coincidieron` : ''
    }.`,
  );
}

// ---------- Productos ----------

function vistaProductos() {
  const s = supuestos();
  const lista = E.productos.length
    ? E.productos.map(filaProducto).join('')
    : '<p class="vacio">Tu tienda aún no tiene productos. Impórtalos desde Dropify (Paso 4 de la guía).</p>';
  return `
    <header class="cabecera"><div><h1>Productos</h1>
      <p class="intro">Escribe cuánto te cobra Dropi por cada producto y cuánto cuesta el envío. Así sabemos si tu precio te deja ganancia.</p></div>
      <div class="botones">
        ${E.info.modo === 'shopify' ? `<button class="btn btn-sec" data-accion="actualizar">${ICONO.recargar}Actualizar productos</button>` : ''}
        <a class="btn btn-sec" href="#ajustes">Cambiar mis números</a>
      </div>
    </header>
    ${
      s.cpa
        ? ''
        : '<p class="aviso-modo"><span><strong>Aún no cuentas los anuncios.</strong> Si pagas publicidad, escribe en Ajustes cuánto te cuesta cada pedido; si no, tus ganancias se ven más altas de lo que son.</span></p>'
    }
    <p class="supuestos-linea">Cuentas con: comisión Dropi ${numero(s.comision, pais(), 1)} %, devoluciones ${numero(s.devolucion, pais(), 1)} %,
      ${s.perdidaDevolucion === 2 ? 'pierdes flete de ida y vuelta' : 'pierdes solo el flete de ida'} en cada devolución,
      ${plata(s.cpa)} de anuncios por pedido y meta de ganancia del ${numero(s.margenObjetivo, pais(), 0)} %.</p>
    <div class="lista-productos">${lista}</div>`;
}

function filaProducto(p) {
  const s = supuestos();
  const dom = idDom(p.id);
  const imagen = p.imagen
    ? `<img class="producto-img" src="${esc(p.imagen)}" alt="" loading="lazy">`
    : `<div class="producto-img" aria-hidden="true">${esc(p.titulo.slice(0, 2).toUpperCase())}</div>`;
  const detalles = [
    p.precio !== null ? `Precio en tu tienda: <strong>${plata(p.precio)}</strong>` : 'Sin precio en la tienda',
    p.stock !== null && p.stock !== undefined ? `Stock ${numero(p.stock, pais())}` : null,
    p.variantes > 1 ? `${p.variantes} variantes` : null,
  ].filter(Boolean);
  return `<article class="producto">
    ${imagen}
    <div class="producto-info"><h3>${esc(p.titulo)}</h3><p>${detalles.join(' · ')}</p>${p.ejemplo ? '<span class="chip" data-tono="ejemplo">Ejemplo</span>' : ''}</div>
    <div class="producto-campos">
      <label class="campo"><span>Precio del proveedor en Dropi</span>
        <input type="number" id="costo-${dom}" min="0" inputmode="decimal" value="${p.costo ?? ''}" placeholder="Ej: ${convertir(25000, moneda())}" data-cambio="costo" data-campo="costo" data-id="${esc(p.id)}"></label>
      <label class="campo"><span>Flete</span>
        <input type="number" id="flete-${dom}" min="0" inputmode="decimal" value="${p.flete ?? ''}" placeholder="${s.fletePromedio ? `Promedio: ${s.fletePromedio}` : `Ej: ${convertir(15700, moneda())}`}" data-cambio="costo" data-campo="flete" data-id="${esc(p.id)}"></label>
    </div>
    <div class="producto-resultado" id="res-${dom}">${htmlResultadoProducto(p)}</div>
  </article>`;
}

function htmlResultadoProducto(p) {
  const a = analizarPrecio(p, supuestos());
  if (!a.completo) {
    return `<span class="chip">Faltan datos</span><p class="suave">${
      a.faltaCosto ? 'Escribe el precio del proveedor.' : 'Escribe el flete o un flete promedio en Ajustes.'
    }</p>`;
  }
  const sugerido = a.precioSugerido ? plata(redondearPrecio(a.precioSugerido, pais())) : '—';
  const minimo = plata(Math.ceil(a.precioMinimo));
  if (a.semaforo === 'sin-precio') {
    return `<span class="chip">Sin precio</span><p>Mínimo ${minimo} · Sugerido ${sugerido}</p>`;
  }
  const texto = { verde: 'Buen precio', amarillo: 'Margen bajo', rojo: 'Pierdes dinero' }[a.semaforo];
  return `<span class="chip" data-tono="${a.semaforo}">${texto}</span>
    <span class="grande">${plata(a.gananciaEsperada)} <span class="suave" style="font-size:var(--t-s);font-weight:400">por pedido</span></span>
    <span class="suave">Mínimo ${minimo} · Sugerido ${sugerido}</span>
    <button class="btn btn-sec btn-chico" data-accion="ver-calculo" data-id="${esc(p.id)}">Ver el cálculo</button>`;
}

async function guardarCostoProducto(input) {
  const { id, campo } = input.dataset;
  const valor = leerNumero(input.value);
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
    avisar('Escribe solo números, sin puntos ni signos de pesos.');
    return;
  }
  await api.guardarCosto({ id, [campo]: valor });
  const producto = E.productos.find((p) => p.id === id);
  if (producto) producto[campo] = valor;
  const destino = document.getElementById(`res-${idDom(id)}`);
  if (destino && producto) destino.innerHTML = htmlResultadoProducto(producto);
  avisar('Costo guardado');
}

// ---------- Calculadora ----------

function calcInicial(producto) {
  const s = supuestos();
  const m = moneda();
  const conDatos = producto && analizarPrecio(producto, s).completo ? producto : null;
  return {
    productoId: conDatos?.id || null,
    titulo: conDatos?.titulo || null,
    precio: conDatos?.precio ?? convertir(79900, m),
    costo: conDatos?.costo ?? convertir(25000, m),
    flete: conDatos?.flete ?? s.fletePromedio ?? convertir(15700, m),
    comision: s.comision,
    devolucion: s.devolucion,
    perdidaDevolucion: s.perdidaDevolucion,
    cpa: s.cpa,
    margenObjetivo: s.margenObjetivo,
  };
}

function vistaCalculadora() {
  if (!E.calc) E.calc = calcInicial(E.productos.find((p) => analizarPrecio(p, supuestos()).completo));
  const c = E.calc;
  const campo = (clave, etiqueta, ayuda, { sufijo = '', paso = 'any' } = {}) => `
    <label class="campo"><span>${etiqueta}</span>
      <span class="con-sufijo" data-sufijo="${sufijo}"><input type="number" id="calc-${clave}" min="0" step="${paso}" inputmode="decimal" value="${c[clave] ?? ''}" data-entrada="calc" data-campo="${clave}"></span>
      <span class="ayuda">${ayuda}</span></label>`;
  return `
    <header class="cabecera"><div><h1>Calculadora de ganancia</h1>
      <p class="intro">Cambia cualquier número y mira al instante cuánto te queda. En contra entrega no todos los pedidos se entregan: por eso se cuentan las devoluciones y los anuncios.</p></div>
      <div class="botones"><button class="btn btn-sec" data-accion="calc-ejemplo">Empezar de nuevo</button></div>
    </header>
    ${c.titulo ? `<p class="supuestos-linea">Calculando: <strong>${esc(c.titulo)}</strong></p>` : ''}
    <div class="calculadora">
      <form class="panel calc-campos" id="form-calc" autocomplete="off">
        ${campo('precio', 'Tu precio de venta', 'Lo que paga el cliente al recibir.')}
        ${campo('costo', 'Precio del proveedor en Dropi', 'Lo que Dropi te descuenta por el producto.')}
        ${campo('flete', 'Flete', 'Lo que cobra la transportadora por llevarlo.')}
        ${campo('comision', 'Comisión de Dropi', 'Entre 2 y 5 % según el país.', { sufijo: '%' })}
        ${campo('devolucion', 'Devoluciones', 'De cada 100 pedidos despachados, cuántos vuelven. Si no sabes, usa 20.', { sufijo: '%' })}
        <fieldset class="campo opciones-campo" style="border:0;padding:0;margin:0"><legend>En cada devolución pierdes</legend>
          <div class="opciones">
            <label class="opcion"><input type="radio" name="calc-perdida" id="calc-perdida-1" value="1" data-entrada="calc" data-campo="perdidaDevolucion" ${c.perdidaDevolucion === 1 ? 'checked' : ''}> Solo el flete de ida</label>
            <label class="opcion"><input type="radio" name="calc-perdida" id="calc-perdida-2" value="2" data-entrada="calc" data-campo="perdidaDevolucion" ${c.perdidaDevolucion === 2 ? 'checked' : ''}> Ida y vuelta</label>
          </div><span class="ayuda">Si no sabes, elige ida y vuelta: es el caso más caro.</span></fieldset>
        ${campo('cpa', 'Anuncios por pedido', 'Lo que gastas en Facebook o TikTok dividido entre los pedidos que llegan.')}
        ${campo('margenObjetivo', 'Tu meta de ganancia', 'Qué parte del precio quieres que te quede limpia. Se recomienda 25 % o más.', { sufijo: '%' })}
        <div class="botones">
          <button type="button" class="btn btn-sec btn-chico" data-accion="calc-guardar-supuestos">Usar estos números en toda la app</button>
          ${c.productoId ? '<button type="button" class="btn btn-sec btn-chico" data-accion="calc-guardar-producto">Guardar costo y flete en el producto</button>' : ''}
        </div>
      </form>
      <div class="calc-resultado" id="calc-resultado" aria-live="polite">${htmlResultadoCalc()}</div>
    </div>`;
}

function supuestosCalc() {
  const c = E.calc;
  return { comision: c.comision, devolucion: c.devolucion, perdidaDevolucion: c.perdidaDevolucion, cpa: c.cpa ?? 0, margenObjetivo: c.margenObjetivo, fletePromedio: null };
}

function htmlResultadoCalc() {
  const c = E.calc;
  const s = supuestosCalc();
  const a = analizarPrecio({ precio: c.precio, costo: c.costo, flete: c.flete }, s);
  if (!a.completo) return '<div class="veredicto"><p>Escribe el precio del proveedor y el flete para ver tu ganancia.</p></div>';
  const minimo = plata(Math.ceil(a.precioMinimo));
  const sugerido = a.precioSugerido ? plata(redondearPrecio(a.precioSugerido, pais())) : 'no alcanzable';
  const precios = `<div class="precios">
      <div><span>Precio mínimo para no perder</span><strong>${minimo}</strong></div>
      <div><span>Precio sugerido para tu meta del ${numero(s.margenObjetivo, pais(), 0)} %</span><strong>${sugerido}</strong></div></div>`;
  if (a.semaforo === 'sin-precio') return `<div class="veredicto"><p>Escribe tu precio de venta para ver cuánto ganas.</p></div>${precios}`;

  const frase = {
    verde: `Buen precio: te queda el ${porcentaje(a.margen)} de cada venta.`,
    amarillo: `Ganas, pero poco: ${porcentaje(a.margen)} de cada venta. Tu meta es ${numero(s.margenObjetivo, pais(), 0)} %.`,
    rojo: `Con este precio pierdes dinero. Súbelo al menos a ${minimo} o baja tus costos.`,
  }[a.semaforo];
  const k = a.cada100;
  const cuadros = Array.from({ length: 100 }, (_, i) => `<i class="${i < k.entregados ? '' : 'vuelve'}"></i>`).join('');
  const mejora = efectoMenosDevoluciones({ precio: c.precio, costo: c.costo, flete: c.flete }, s);

  return `
    <div class="veredicto" data-semaforo="${a.semaforo}">
      <span class="eyebrow">Ganancia por pedido despachado</span>
      <span class="grande">${plata(a.gananciaEsperada)}</span>
      <p>${frase}</p>
    </div>
    ${precios}
    <div class="panel seccion">
      <h3>Así se ve con 100 pedidos despachados</h3>
      <div class="cien" role="img" aria-label="${k.entregados} de 100 pedidos se entregan y ${k.devueltos} se devuelven">${cuadros}</div>
      <div class="leyenda"><span><i></i>${k.entregados} se entregan y pagan</span><span><i class="vuelve"></i>${k.devueltos} se devuelven</span></div>
      <table class="cuenta">
        <tr><td>Cada entrega te deja<br><span class="suave">${plata(a.precio)} − ${plata(a.costo)} proveedor − ${plata(a.flete)} flete − ${plata(a.comisionPesos)} comisión</span></td><td>${plata(a.gananciaEntregado)}</td></tr>
        <tr><td>${numero(100 * (1 - s.devolucion / 100), pais(), 1)} entregas</td><td>+${plata(k.ganadoEnEntregas)}</td></tr>
        <tr><td>${numero(s.devolucion, pais(), 1)} devoluciones × ${plata(a.perdidaPorDevolucion)}</td><td>−${plata(k.perdidoEnDevoluciones)}</td></tr>
        <tr><td>Anuncios: 100 × ${plata(s.cpa)}</td><td>−${plata(k.publicidad)}</td></tr>
        <tr class="total"><td>Te quedan</td><td>${plata(k.total)}</td></tr>
      </table>
    </div>
    ${
      mejora && mejora.diferencia > 0
        ? `<p class="consejo">Si confirmas mejor tus pedidos y bajas las devoluciones de ${numero(s.devolucion, pais(), 1)} % a ${numero(mejora.nuevaTasa, pais(), 1)} %, ganarías ${plata(mejora.diferencia)} más por pedido.</p>`
        : ''
    }`;
}

// ---------- Aprende ----------

const PASOS_INICIO = [
  ['shopify-tienda', 'Crear tu tienda Shopify y elegir plan', 'Plan Basic. Hoy la prueba cuesta 1 USD al mes durante 3 meses.'],
  ['shopify-cod', 'Activar el pago contra entrega en Shopify', 'Configuración → Pagos → Métodos de pago manuales.'],
  ['shopify-telefono', 'Hacer obligatorio el teléfono', 'Configuración → Finalizar compra. Sin teléfono, Dropi no crea el pedido.'],
  ['dropi-cuenta', 'Crear tu cuenta de Dropi como dropshipper', 'En el sitio de Dropi de tu país, por ejemplo dropi.co.'],
  ['dropi-banco', 'Configurar cómo recibes tu dinero', 'Dropi → Configuración → Datos bancarios → Agregar.'],
  ['dropi-token', 'Crear la integración y copiar el token', 'Dropi → Mis Integraciones → Agregar → tipo Shopify.'],
  ['dropify', 'Instalar Dropify en Shopify y pegar el token', 'Activa "Sincronizar órdenes automáticamente" y da permisos de dominio.'],
  ['pedido-prueba', 'Hacer un pedido de prueba y verlo en Dropi', 'Tarda de 5 a 10 minutos en aparecer. Luego cancélalo.'],
  ['producto', 'Importar tu primer producto con un buen precio', 'Usa la calculadora antes de publicarlo.'],
  ['formulario', 'Instalar un formulario contra entrega', 'Por ejemplo Releasit o EasySell.'],
  ['app-conectada', 'Conectar este panel a tu tienda', 'Ajustes → Conectar Shopify.'],
];

const COMO_FUNCIONA = [
  ['Llega un cliente', 'Ve tu anuncio y entra a tu tienda Shopify.'],
  ['Hace el pedido', 'Llena el formulario y elige pagar en efectivo al recibir.'],
  ['Pasa a Dropi solo', 'Dropify copia el pedido a Dropi en 5 a 10 minutos.'],
  ['Tú confirmas', 'Le escribes por WhatsApp. Si dice que sí, lo confirmas en Dropi.'],
  ['Sale el paquete', 'El proveedor lo empaca y la transportadora genera la guía.'],
  ['Se cobra', 'La transportadora entrega y recibe el efectivo.'],
  ['Te pagan', 'Dropi descuenta producto, flete y comisión, y deja tu ganancia en la billetera.'],
];

const GLOSARIO = [
  ['Contra entrega', 'El cliente paga en efectivo cuando recibe el paquete.'],
  ['Dropshipper', 'Tú: quien vende y pone el precio final, sin tener inventario.'],
  ['Proveedor', 'Quien tiene el producto en bodega y lo despacha.'],
  ['Guía', 'El número de envío para rastrear el paquete.'],
  ['Flete', 'Lo que cuesta enviar el paquete.'],
  ['Novedad', 'Un problema en la entrega que debes resolver ese mismo día.'],
  ['Devolución', 'El paquete vuelve sin venderse y pierdes el flete.'],
  ['Token', 'Clave secreta que conecta Dropi con tu tienda. No la compartas.'],
  ['Billetera', 'Tu saldo en Dropi, desde donde retiras tu ganancia.'],
  ['CPA', 'Lo que pagas en anuncios por cada pedido que llega.'],
  ['Tasa de entrega', 'De cada 100 pedidos que salen, cuántos se entregan y se pagan.'],
];

function vistaAprende() {
  const hechos = PASOS_INICIO.filter(([clave]) => E.info.checklist?.[clave]).length;
  return `
    <header class="cabecera"><div><h1>Aprende</h1>
      <p class="intro">Todo lo básico para vender con Dropi y Shopify, en palabras simples. La explicación completa, con fuentes, está en la <a href="${GUIA_URL}" target="_blank" rel="noopener">guía paso a paso</a>.</p></div></header>
    <section class="seccion" aria-labelledby="t-como"><h2 id="t-como">Cómo viaja un pedido</h2>
      <ol class="pasos">${COMO_FUNCIONA.map(([t, d]) => `<li><strong>${t}</strong>${d}</li>`).join('')}</ol></section>
    <div class="dos-columnas">
      <section class="panel seccion" aria-labelledby="t-lista">
        <div class="seccion-cab"><h2 id="t-lista">Tu lista para arrancar</h2><span class="dato suave">${hechos} de ${PASOS_INICIO.length}</span></div>
        <div class="progreso" aria-hidden="true"><span style="width:${(hechos / PASOS_INICIO.length) * 100}%"></span></div>
        <ul class="lista-check">${PASOS_INICIO.map(
          ([clave, titulo, detalle]) => `<li><label class="check"><input type="checkbox" id="paso-${clave}" data-cambio="checklist" data-clave="${clave}" ${
            E.info.checklist?.[clave] ? 'checked' : ''
          }><span>${titulo}<small>${detalle}</small></span></label></li>`,
        ).join('')}</ul>
      </section>
      <div class="seccion">
        <section class="panel seccion" aria-labelledby="t-instalar"><h2 id="t-instalar">Usar esta app con tu tienda real</h2>
          <ol class="pasos-conexion">
            <li>Instala <strong>Node.js</strong> (versión LTS) desde nodejs.org.</li>
            <li>Descarga la carpeta <code>panel-dropi-shopify</code> del repositorio.</li>
            <li>Doble clic en <code>iniciar-windows.bat</code> (Windows) o ejecuta <code>./iniciar-mac-linux.sh</code> (Mac o Linux).</li>
            <li>Se abre <code>http://localhost:3000</code>. Entra a Ajustes y conecta tu tienda.</li>
          </ol>
          <p class="suave" style="font-size:var(--t-s)">Tus claves y datos se guardan solo en tu computador, en la carpeta <code>datos</code>. La app solo lee tu tienda: no puede cambiar ni borrar nada.</p>
        </section>
        <section class="panel seccion" aria-labelledby="t-glosario"><h2 id="t-glosario">Palabras que vas a oír</h2>
          <dl class="glosario">${GLOSARIO.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl></section>
      </div>
    </div>`;
}

// ---------- Ajustes ----------

function vistaAjustes() {
  const s = supuestos();
  const ejemplo = E.pedidos.find((p) => p.estado === 'por_confirmar') || E.pedidos[0];
  const vistaMensaje = (clave) =>
    ejemplo ? esc(llenarPlantilla(E.info.plantillas[clave], datosMensaje(ejemplo, { nombreTienda: E.info.nombreTienda, pais: pais() }))) : '';
  const numeroCampo = (clave, etiqueta, ayuda, sufijo = '') => `
    <label class="campo"><span>${etiqueta}</span>
      <span class="con-sufijo" data-sufijo="${sufijo}"><input type="number" id="aj-${clave}" min="0" step="any" inputmode="decimal" value="${s[clave] ?? ''}" data-cambio="supuesto" data-campo="${clave}"></span>
      <span class="ayuda">${ayuda}</span></label>`;

  return `
    <header class="cabecera"><div><h1>Ajustes</h1><p class="intro">Tus números, tus mensajes y la conexión con tu tienda. Todo se guarda solo.</p></div></header>

    <section class="panel seccion" aria-labelledby="t-tienda"><h2 id="t-tienda">Tu tienda</h2>
      <div class="rejilla-campos">
        <label class="campo"><span>País donde vendes</span>
          <select id="aj-pais" data-cambio="pais">${Object.entries(PAISES)
            .map(([codigo, p]) => `<option value="${codigo}" ${codigo === pais() ? 'selected' : ''}>${p.nombre} (${p.moneda})</option>`)
            .join('')}</select>
          <span class="ayuda">Define la moneda y el prefijo de WhatsApp.</span></label>
        <label class="campo"><span>Nombre de tu tienda</span>
          <input type="text" id="aj-nombre" maxlength="80" value="${esc(E.info.nombreTienda)}" placeholder="Ej: Bienestar en Casa" data-cambio="nombre">
          <span class="ayuda">Aparece en tus mensajes de WhatsApp.</span></label>
      </div>
    </section>

    <section class="panel seccion" aria-labelledby="t-numeros"><h2 id="t-numeros">Tus números</h2>
      <p class="suave">Se usan para calcular ganancias en toda la app. Si no sabes alguno, deja el valor que viene.</p>
      <div class="rejilla-campos">
        ${numeroCampo('comision', 'Comisión de Dropi', 'Entre 2 y 5 % según el país.', '%')}
        ${numeroCampo('devolucion', 'Devoluciones', 'De cada 100 pedidos despachados, cuántos vuelven.', '%')}
        ${numeroCampo('fletePromedio', 'Flete promedio', 'Se usa cuando un producto no tiene su flete.')}
        ${numeroCampo('cpa', 'Anuncios por pedido', 'Gasto en anuncios dividido entre pedidos.')}
        ${numeroCampo('margenObjetivo', 'Meta de ganancia', 'Parte del precio que quieres que te quede.', '%')}
        <fieldset class="campo" style="border:0;padding:0;margin:0"><legend>En cada devolución pierdes</legend>
          <div class="opciones">
            <label class="opcion"><input type="radio" name="aj-perdida" id="aj-perdida-1" value="1" data-cambio="supuesto" data-campo="perdidaDevolucion" ${s.perdidaDevolucion === 1 ? 'checked' : ''}> Solo ida</label>
            <label class="opcion"><input type="radio" name="aj-perdida" id="aj-perdida-2" value="2" data-cambio="supuesto" data-campo="perdidaDevolucion" ${s.perdidaDevolucion === 2 ? 'checked' : ''}> Ida y vuelta</label>
          </div></fieldset>
      </div>
    </section>

    <section class="panel seccion" aria-labelledby="t-mensajes"><h2 id="t-mensajes">Mensajes de WhatsApp</h2>
      <p class="suave">Palabras entre llaves que se reemplazan solas:</p>
      <p class="variables">${['nombre', 'pedido', 'producto', 'total', 'direccion', 'ciudad', 'tienda', 'guia'].map((v) => `<code>{${v}}</code>`).join('')}</p>
      <div class="dos-columnas">
        <label class="campo"><span>Para confirmar un pedido nuevo</span>
          <textarea rows="6" id="aj-msg-confirmacion" data-cambio="plantilla" data-entrada="plantilla" data-campo="confirmacion">${esc(E.info.plantillas.confirmacion)}</textarea></label>
        <div class="campo"><span>Así lo verá tu cliente</span><p class="vista-mensaje" id="vista-confirmacion">${vistaMensaje('confirmacion')}</p></div>
        <label class="campo"><span>Para resolver una novedad</span>
          <textarea rows="6" id="aj-msg-novedad" data-cambio="plantilla" data-entrada="plantilla" data-campo="novedad">${esc(E.info.plantillas.novedad)}</textarea></label>
        <div class="campo"><span>Así lo verá tu cliente</span><p class="vista-mensaje" id="vista-novedad">${vistaMensaje('novedad')}</p></div>
      </div>
    </section>

    ${seccionShopify()}

    <section class="panel seccion" aria-labelledby="t-datos"><h2 id="t-datos">Tus datos</h2>
      <div class="botones">
        <button class="btn btn-peligro" data-accion="reiniciar-demo">${E.confirmarReinicio ? 'Toca otra vez para confirmar' : 'Volver a empezar los datos de ejemplo'}</button>
        ${E.info.servidor ? '<a class="btn btn-sec" href="api/respaldo" download>Descargar respaldo</a>' : ''}
      </div>
      <p class="suave" style="font-size:var(--t-s)">El respaldo guarda tus costos, estados y notas; no incluye tus claves de Shopify.</p>
    </section>`;
}

function seccionShopify() {
  const titulo = '<h2 id="t-shopify">Conectar Shopify</h2>';
  if (!E.info.servidor) {
    return `<section class="panel seccion" aria-labelledby="t-shopify">${titulo}
      <p>En la vista previa no se puede conectar una tienda, porque tus claves nunca deben quedar en internet. Instala la app en tu computador (mira <a href="#aprende">Aprende</a>) y conéctala desde ahí.</p></section>`;
  }
  const conectado = E.info.shopify;
  const estado = conectado
    ? `<div class="estado-conexion"><span class="chip" data-tono="bien">Conectado</span>
        <span><strong>${esc(conectado.nombre || conectado.tienda)}</strong> <span class="suave mono">${esc(conectado.tienda)}</span></span>
        <div class="botones">
          ${
            E.info.modo === 'shopify'
              ? `<button class="btn btn-sec btn-chico" data-accion="actualizar">${ICONO.recargar}Traer datos ahora</button><button class="btn btn-sec btn-chico" data-accion="usar-ejemplo">Ver datos de ejemplo</button>`
              : '<button class="btn btn-chico" data-accion="usar-tienda">Usar mi tienda</button>'
          }
          <button class="btn btn-peligro btn-chico" data-accion="desconectar">Desconectar</button>
        </div></div>`
    : '<p>Conecta tu tienda para ver tus pedidos y productos reales. La app <strong>solo lee</strong>: no puede cambiar ni borrar nada en Shopify.</p>';

  return `<section class="panel seccion" aria-labelledby="t-shopify">${titulo}${estado}
    <details ${conectado ? '' : 'open'}><summary>${conectado ? 'Cambiar la conexión' : 'Cómo conectarla'}</summary>
    <form class="formulario" id="form-shopify" autocomplete="off" style="margin-top:14px">
      <fieldset class="campo" style="border:0;padding:0;margin:0"><legend>¿Qué tienes?</legend>
        <div class="opciones">
          <label class="opcion"><input type="radio" name="metodo" id="metodo-cliente" value="cliente" checked data-cambio="metodo"> Client ID y Client Secret (apps nuevas)</label>
          <label class="opcion"><input type="radio" name="metodo" id="metodo-token" value="token" data-cambio="metodo"> Un token shpat_ (apps de antes de 2026)</label>
        </div></fieldset>
      <div id="pasos-cliente">
        <ol class="pasos-conexion">
          <li>Entra a <strong>dev.shopify.com</strong> con tu cuenta de Shopify y crea una app (ponle un nombre como "Mi panel").</li>
          <li>En la configuración de la versión, en permisos de la Admin API, marca <code>read_orders</code>, <code>read_products</code> y <code>read_inventory</code>. Publica la versión.</li>
          <li>Instala la app en tu tienda.</li>
          <li>En la configuración de la app copia el <strong>Client ID</strong> y el <strong>Client Secret</strong> y pégalos aquí.</li>
          <li>Si los pedidos llegan sin nombre ni teléfono, en la app pide acceso a los datos protegidos del cliente (nombre, teléfono y dirección).</li>
        </ol>
        <p class="suave" style="font-size:var(--t-s);margin-top:8px">Desde el 1 de enero de 2026 Shopify ya no deja crear apps personalizadas desde el panel de la tienda; por eso se usa dev.shopify.com. Los nombres de los botones pueden cambiar un poco.</p>
      </div>
      <div id="pasos-token" hidden>
        <ol class="pasos-conexion">
          <li>En tu panel de Shopify ve a Configuración → Apps y canales de venta → Desarrollar apps.</li>
          <li>Abre tu app personalizada y revisa que tenga <code>read_orders</code>, <code>read_products</code> y <code>read_inventory</code>.</li>
          <li>Copia el token de acceso de la Admin API (empieza con <code>shpat_</code>).</li>
        </ol>
      </div>
      <div class="rejilla-campos">
        <label class="campo"><span>Dominio de tu tienda</span>
          <input type="text" id="sh-tienda" name="tienda" placeholder="mitienda.myshopify.com" value="${esc(conectado?.tienda || '')}" required spellcheck="false">
          <span class="ayuda">Lo ves en Configuración → Dominios.</span></label>
        <label class="campo" data-metodo="cliente"><span>Client ID</span><input type="text" id="sh-client-id" name="clientId" spellcheck="false"></label>
        <label class="campo" data-metodo="cliente"><span>Client Secret</span><input type="password" id="sh-client-secret" name="clientSecret" spellcheck="false"></label>
        <label class="campo" data-metodo="token" hidden><span>Token de acceso</span><input type="password" id="sh-token" name="token" placeholder="shpat_…" spellcheck="false"></label>
      </div>
      <div id="error-conexion" class="error" role="alert" hidden></div>
      <div class="botones"><button class="btn" type="submit" id="btn-conectar">Probar y guardar</button></div>
    </form></details></section>`;
}

function cambiarMetodo(metodo) {
  $('#pasos-cliente').hidden = metodo !== 'cliente';
  $('#pasos-token').hidden = metodo !== 'token';
  for (const campo of document.querySelectorAll('[data-metodo]')) campo.hidden = campo.dataset.metodo !== metodo;
}

async function conectarShopify(form) {
  const boton = $('#btn-conectar');
  const error = $('#error-conexion');
  const datos = Object.fromEntries(new FormData(form));
  boton.disabled = true;
  boton.textContent = 'Probando la conexión…';
  error.hidden = true;
  try {
    E.info = await api.conectarShopify(datos);
    avisar(`Conectado a ${E.info.shopify?.nombre || E.info.shopify?.tienda}. Trayendo tus pedidos…`);
    E.calc = null;
    await cargarTodo({ fresco: true });
  } catch (e) {
    error.textContent = e.message;
    error.hidden = false;
    boton.disabled = false;
    boton.textContent = 'Probar y guardar';
  }
}

// ---------- Eventos ----------

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-accion]');
  if (!el) return;
  const { accion, id } = el.dataset;
  if (accion !== 'reiniciar-demo') E.confirmarReinicio = false;
  switch (accion) {
    case 'estado':
      intentar(() => cambiarEstado(id, el.dataset.estado));
      break;
    case 'filtro':
      location.hash = el.dataset.filtro === 'todos' ? 'pedidos' : `pedidos-${el.dataset.filtro}`;
      break;
    case 'actualizar':
      intentar(async () => {
        el.disabled = true;
        await cargarTodo({ fresco: true });
        avisar('Datos actualizados');
      });
      break;
    case 'reintentar':
      intentar(() => cargarTodo({ fresco: true }));
      break;
    case 'usar-ejemplo':
      intentar(async () => {
        await guardarAjustes({ modo: 'demo' }, { mensaje: 'Mostrando datos de ejemplo' });
        await cargarTodo();
      });
      break;
    case 'usar-tienda':
      intentar(async () => {
        await guardarAjustes({ modo: 'shopify' }, { mensaje: 'Mostrando tu tienda' });
        await cargarTodo({ fresco: true });
      });
      break;
    case 'desconectar':
      intentar(async () => {
        E.info = await api.desconectarShopify();
        avisar('Tienda desconectada. Tus claves se borraron de este computador.');
        await cargarTodo();
      });
      break;
    case 'ver-calculo':
      E.calc = calcInicial(E.productos.find((p) => p.id === id));
      location.hash = 'calculadora';
      break;
    case 'calc-ejemplo':
      E.calc = calcInicial(null);
      pintar();
      break;
    case 'calc-guardar-supuestos':
      intentar(() =>
        guardarAjustes(
          { supuestos: { comision: E.calc.comision, devolucion: E.calc.devolucion, perdidaDevolucion: E.calc.perdidaDevolucion, cpa: E.calc.cpa, margenObjetivo: E.calc.margenObjetivo } },
          { mensaje: 'Guardados como tus números' },
        ),
      );
      break;
    case 'calc-guardar-producto':
      intentar(async () => {
        await api.guardarCosto({ id: E.calc.productoId, costo: E.calc.costo, flete: E.calc.flete });
        const producto = E.productos.find((p) => p.id === E.calc.productoId);
        if (producto) Object.assign(producto, { costo: E.calc.costo, flete: E.calc.flete });
        avisar('Costo y flete guardados en el producto');
      });
      break;
    case 'cerrar-bienvenida':
      intentar(async () => {
        await api.marcarChecklist({ clave: 'bienvenida', hecho: true });
        E.info.checklist = { ...E.info.checklist, bienvenida: true };
        pintar();
      });
      break;
    case 'reiniciar-demo':
      if (!E.confirmarReinicio) {
        E.confirmarReinicio = true;
        el.textContent = 'Toca otra vez para confirmar';
        return;
      }
      E.confirmarReinicio = false;
      intentar(async () => {
        await api.reiniciarDemo();
        E.calc = null;
        await cargarTodo();
        avisar('Datos de ejemplo como nuevos');
      });
      break;
    default:
      break;
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  const { cambio, id, campo } = el.dataset;
  if (!cambio) return;
  switch (cambio) {
    case 'estado':
      if (!el.value) return;
      intentar(() => cambiarEstado(id, el.value === '__auto' ? null : el.value));
      break;
    case 'en-dropi':
      intentar(async () => {
        await api.marcarPedido({ id, enDropi: el.checked });
        const pedido = E.pedidos.find((p) => p.id === id);
        if (pedido) pedido.enDropi = el.checked;
        avisar(el.checked ? 'Marcado como visto en Dropi' : 'Desmarcado');
      });
      break;
    case 'nota':
      intentar(async () => {
        await api.marcarPedido({ id, nota: el.value });
        const pedido = E.pedidos.find((p) => p.id === id);
        if (pedido) pedido.nota = el.value;
        avisar('Nota guardada');
      });
      break;
    case 'importar':
      intentar(() => importarReporte(el));
      break;
    case 'costo':
      intentar(() => guardarCostoProducto(el));
      break;
    case 'gasto':
      intentar(() => guardarAjustes({ gastoAnuncios: { mes: mesActual(), valor: leerNumero(el.value) ?? 0 } }, { repintar: true }));
      break;
    case 'pais':
      intentar(async () => {
        await guardarAjustes({ pais: el.value }, { mensaje: `País: ${PAISES[el.value].nombre}` });
        E.calc = null;
        await cargarTodo();
      });
      break;
    case 'nombre':
      intentar(() => guardarAjustes({ nombreTienda: el.value.trim() }));
      break;
    case 'supuesto':
      intentar(() => guardarAjustes({ supuestos: { [campo]: leerNumero(el.value) } }));
      break;
    case 'plantilla':
      intentar(() => guardarAjustes({ plantillas: { [campo]: el.value } }, { mensaje: 'Mensaje guardado' }));
      break;
    case 'checklist':
      intentar(async () => {
        await api.marcarChecklist({ clave: el.dataset.clave, hecho: el.checked });
        E.info.checklist = { ...E.info.checklist, [el.dataset.clave]: el.checked };
        pintar();
      });
      break;
    case 'metodo':
      cambiarMetodo(el.value);
      break;
    default:
      break;
  }
});

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.entrada === 'buscar') {
    E.busqueda = el.value;
    $('#lista-pedidos').innerHTML = htmlListaPedidos();
  } else if (el.dataset.entrada === 'calc') {
    E.calc[el.dataset.campo] = leerNumero(el.value);
    $('#calc-resultado').innerHTML = htmlResultadoCalc();
  } else if (el.dataset.entrada === 'plantilla') {
    const ejemplo = E.pedidos.find((p) => p.estado === 'por_confirmar') || E.pedidos[0];
    const destino = $(`#vista-${el.dataset.campo}`);
    if (ejemplo && destino) destino.textContent = llenarPlantilla(el.value, datosMensaje(ejemplo, { nombreTienda: E.info.nombreTienda, pais: pais() }));
  }
});

document.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (ev.target.id === 'form-shopify') conectarShopify(ev.target);
});

window.addEventListener('hashchange', () => {
  leerRuta();
  pintar();
  window.scrollTo(0, 0);
});

// ---------- Inicio ----------

leerRuta();
await iniciarApi();
if (!hayServidor()) document.documentElement.dataset.vistaPrevia = 'si';
await cargarTodo();
