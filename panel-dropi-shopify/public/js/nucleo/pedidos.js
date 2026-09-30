import { normalizarSupuestos } from './calculo.js';
import { primerNombre, dinero } from './formato.js';

// El recorrido de un pedido contra entrega, en palabras simples.
export const ESTADOS = [
  {
    clave: 'por_confirmar',
    nombre: 'Por confirmar',
    tono: 'accion',
    ayuda: 'Pedido nuevo. Escríbele al cliente por WhatsApp y confirma antes de despachar.',
  },
  {
    clave: 'confirmado',
    nombre: 'Confirmado',
    tono: 'info',
    ayuda: 'El cliente dijo que sí. Confírmalo también en Dropi para que el proveedor lo despache.',
  },
  {
    clave: 'enviado',
    nombre: 'En camino',
    tono: 'info',
    ayuda: 'Ya tiene guía y la transportadora lo lleva. Solo espera la entrega.',
  },
  {
    clave: 'novedad',
    nombre: 'Novedad',
    tono: 'critico',
    ayuda: 'La transportadora tuvo un problema para entregar. Resuélvelo hoy o el paquete se devuelve.',
  },
  {
    clave: 'entregado',
    nombre: 'Entregado',
    tono: 'bien',
    ayuda: 'El cliente recibió y pagó. Tu ganancia llega a la billetera de Dropi.',
  },
  {
    clave: 'devuelto',
    nombre: 'Devuelto',
    tono: 'mal',
    ayuda: 'El paquete volvió sin venderse. Se pierde el flete.',
  },
  {
    clave: 'cancelado',
    nombre: 'Cancelado',
    tono: 'neutro',
    ayuda: 'No se despachó, así que no cuesta flete.',
  },
];

export const ESTADO_POR_CLAVE = Object.fromEntries(ESTADOS.map((e) => [e.clave, e]));
export const ESTADOS_ABIERTOS = ['por_confirmar', 'confirmado', 'enviado', 'novedad'];

// Estado que se deduce de la tienda cuando todavía no lo has marcado tú.
export function estadoBase(pedido) {
  if (pedido.estadoFuente && ESTADO_POR_CLAVE[pedido.estadoFuente]) return pedido.estadoFuente;
  if (pedido.cancelado) return 'cancelado';
  if (pedido.guia) return 'enviado';
  return 'por_confirmar';
}

// Une los pedidos que vienen de Shopify (o del ejemplo) con lo que marcaste en la app.
export function combinarPedidos(fuente, marcas = {}) {
  return fuente
    .map((pedido) => {
      const marca = marcas[pedido.id] || {};
      const estado = ESTADO_POR_CLAVE[marca.estado] ? marca.estado : estadoBase(pedido);
      return {
        ...pedido,
        estado,
        estadoMarcado: Boolean(marca.estado),
        nota: marca.nota || '',
        enDropi: Boolean(marca.enDropi ?? pedido.enDropiFuente),
        guia: pedido.guia || marca.guia || null,
        transportadora: pedido.transportadora || marca.transportadora || null,
      };
    })
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

export function combinarProductos(fuente, costos = {}) {
  return fuente.map((producto) => {
    const guardado = costos[producto.id] || {};
    const valor = (clave, ejemplo) => (guardado[clave] !== undefined ? guardado[clave] : ejemplo ?? null);
    return {
      ...producto,
      costo: valor('costo', producto.costoEjemplo),
      flete: valor('flete', producto.fleteEjemplo),
    };
  });
}

// Costo y ganancia real de un pedido según el estado en que terminó.
export function cuentasPedido(pedido, productosPorId, supuestosEntrada) {
  const s = normalizarSupuestos(supuestosEntrada);
  let costoProductos = 0;
  let flete = null;
  let faltanCostos = false;
  for (const linea of pedido.productos) {
    const producto = productosPorId[linea.productoId];
    if (!producto || producto.costo === null || producto.costo === undefined) {
      faltanCostos = true;
      continue;
    }
    costoProductos += Number(producto.costo) * linea.cantidad;
    const fleteProducto = producto.flete ?? s.fletePromedio;
    if (fleteProducto !== null && fleteProducto !== undefined) flete = Math.max(flete ?? 0, Number(fleteProducto));
  }
  if (flete === null) flete = s.fletePromedio;
  const comision = (s.comision / 100) * pedido.total;
  const completo = !faltanCostos && flete !== null;

  let ganancia = null;
  if (completo && pedido.estado === 'entregado') ganancia = pedido.total - costoProductos - flete - comision;
  if (flete !== null && pedido.estado === 'devuelto') ganancia = -flete * s.perdidaDevolucion;
  if (pedido.estado === 'cancelado') ganancia = 0;

  const gananciaSiSeEntrega = completo ? pedido.total - costoProductos - flete - comision : null;
  return { costoProductos, flete, comision, completo, ganancia, gananciaSiSeEntrega };
}

const DIA = 24 * 60 * 60 * 1000;

export function inicioDeMes(ahora = new Date()) {
  const fecha = new Date(ahora);
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1).getTime();
}

// Los números del panel "Hoy".
export function resumen(pedidos, productos, supuestos, { ahora = Date.now(), gastoAnuncios = 0 } = {}) {
  const productosPorId = Object.fromEntries(productos.map((p) => [p.id, p]));
  const conteo = Object.fromEntries(ESTADOS.map((e) => [e.clave, 0]));
  const desdeMes = inicioDeMes(ahora);
  let ventasMes = 0;
  let pedidosMes = 0;
  let entregadosMes = 0;
  let devueltosMes = 0;
  let gananciaMes = 0;
  let pedidosSinCosto = 0;
  let porConfirmarViejos = 0;
  let sinVerificarEnDropi = 0;

  for (const pedido of pedidos) {
    conteo[pedido.estado] += 1;
    const fecha = new Date(pedido.fecha).getTime();
    const edad = ahora - fecha;
    if (pedido.estado === 'por_confirmar' && edad > DIA) porConfirmarViejos += 1;
    if (['por_confirmar', 'confirmado'].includes(pedido.estado) && !pedido.enDropi && edad > 15 * 60 * 1000) {
      sinVerificarEnDropi += 1;
    }
    if (fecha < desdeMes) continue;
    if (pedido.estado !== 'cancelado') pedidosMes += 1;
    const cuentas = cuentasPedido(pedido, productosPorId, supuestos);
    if (pedido.estado === 'entregado') {
      entregadosMes += 1;
      ventasMes += pedido.total;
      if (cuentas.completo) gananciaMes += cuentas.ganancia;
      else pedidosSinCosto += 1;
    }
    if (pedido.estado === 'devuelto') {
      devueltosMes += 1;
      if (cuentas.ganancia !== null) gananciaMes += cuentas.ganancia;
    }
  }

  const cerradosMes = entregadosMes + devueltosMes;
  return {
    conteo,
    ventasMes,
    pedidosMes,
    entregadosMes,
    devueltosMes,
    tasaEntrega: cerradosMes ? entregadosMes / cerradosMes : null,
    gananciaMes,
    gananciaNetaMes: gananciaMes - (Number(gastoAnuncios) || 0),
    pedidosSinCosto,
    porConfirmarViejos,
    sinVerificarEnDropi,
    productosSinCosto: productos.filter((p) => p.costo === null || p.costo === undefined).length,
  };
}

// Pedidos por día de los últimos `dias` días, para la gráfica del panel.
export function pedidosPorDia(pedidos, dias = 14, ahora = Date.now()) {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const serie = [];
  for (let i = dias - 1; i >= 0; i -= 1) {
    const inicio = new Date(hoy.getTime() - i * DIA);
    const fin = inicio.getTime() + DIA;
    const delDia = pedidos.filter((p) => {
      const t = new Date(p.fecha).getTime();
      return t >= inicio.getTime() && t < fin && p.estado !== 'cancelado';
    });
    serie.push({ fecha: inicio.toISOString().slice(0, 10), total: delDia.length });
  }
  return serie;
}

// La lista "Para hacer hoy": lo urgente primero.
export function tareasDeHoy(datosResumen, productosEnRojo = 0) {
  const r = datosResumen;
  const tareas = [];
  if (r.conteo.novedad) {
    tareas.push({
      clave: 'novedad',
      cantidad: r.conteo.novedad,
      urgente: true,
      titulo: r.conteo.novedad === 1 ? 'Resuelve 1 novedad' : `Resuelve ${r.conteo.novedad} novedades`,
      detalle: 'Si no respondes hoy, la transportadora devuelve el paquete y pierdes el flete.',
      ir: 'pedidos-novedad',
    });
  }
  if (r.conteo.por_confirmar) {
    tareas.push({
      clave: 'por_confirmar',
      cantidad: r.conteo.por_confirmar,
      urgente: r.porConfirmarViejos > 0,
      titulo:
        r.conteo.por_confirmar === 1
          ? 'Confirma 1 pedido por WhatsApp'
          : `Confirma ${r.conteo.por_confirmar} pedidos por WhatsApp`,
      detalle:
        r.porConfirmarViejos > 0
          ? `${r.porConfirmarViejos === 1 ? '1 lleva' : `${r.porConfirmarViejos} llevan`} más de un día esperando. Si no responden, cancélalos.`
          : 'Confirmar antes de despachar es lo que más baja las devoluciones.',
      ir: 'pedidos-por_confirmar',
    });
  }
  if (r.sinVerificarEnDropi) {
    tareas.push({
      clave: 'dropi',
      cantidad: r.sinVerificarEnDropi,
      urgente: false,
      titulo:
        r.sinVerificarEnDropi === 1 ? 'Revisa que 1 pedido llegó a Dropi' : `Revisa que ${r.sinVerificarEnDropi} pedidos llegaron a Dropi`,
      detalle: 'Dropify pasa los pedidos cada 5 a 10 minutos. Si uno no aparece en Dropi, nadie lo despacha.',
      ir: 'pedidos-sin_dropi',
    });
  }
  if (r.conteo.confirmado) {
    tareas.push({
      clave: 'confirmado',
      cantidad: r.conteo.confirmado,
      urgente: false,
      titulo:
        r.conteo.confirmado === 1 ? '1 pedido confirmado espera guía' : `${r.conteo.confirmado} pedidos confirmados esperan guía`,
      detalle: 'Cuando Dropi genere la guía, márcalos como "En camino".',
      ir: 'pedidos-confirmado',
    });
  }
  if (r.productosSinCosto) {
    tareas.push({
      clave: 'costos',
      cantidad: r.productosSinCosto,
      urgente: false,
      titulo:
        r.productosSinCosto === 1 ? 'Escribe el costo de 1 producto' : `Escribe el costo de ${r.productosSinCosto} productos`,
      detalle: 'Sin el precio del proveedor no podemos decirte cuánto ganas.',
      ir: 'productos',
    });
  }
  if (productosEnRojo) {
    tareas.push({
      clave: 'rojo',
      cantidad: productosEnRojo,
      urgente: true,
      titulo: productosEnRojo === 1 ? '1 producto te hace perder dinero' : `${productosEnRojo} productos te hacen perder dinero`,
      detalle: 'Su precio no alcanza para cubrir producto, flete, devoluciones y anuncios.',
      ir: 'productos',
    });
  }
  return tareas;
}

// Datos que se reemplazan en los mensajes de WhatsApp.
export function datosMensaje(pedido, { nombreTienda, pais }) {
  const productos = pedido.productos
    .map((l) => `${l.cantidad > 1 ? `${l.cantidad} × ` : ''}${l.titulo}${l.variante ? ` (${l.variante})` : ''}`)
    .join(', ');
  return {
    nombre: primerNombre(pedido.cliente) || 'hola',
    cliente: pedido.cliente || '',
    pedido: pedido.numero,
    producto: productos,
    total: dinero(pedido.total, pais),
    direccion: pedido.direccion || '',
    ciudad: pedido.ciudad || '',
    tienda: nombreTienda || 'nuestra tienda',
    guia: pedido.guia || '',
  };
}

export function filtrarPedidos(pedidos, filtro, busqueda = '') {
  let lista = pedidos;
  if (filtro === 'sin_dropi') lista = lista.filter((p) => ['por_confirmar', 'confirmado'].includes(p.estado) && !p.enDropi);
  else if (filtro && filtro !== 'todos') lista = lista.filter((p) => p.estado === filtro);
  const q = busqueda.trim().toLowerCase();
  if (!q) return lista;
  return lista.filter((p) =>
    [p.numero, p.cliente, p.ciudad, p.telefono, p.guia, ...p.productos.map((l) => l.titulo)]
      .filter(Boolean)
      .some((campo) => String(campo).toLowerCase().includes(q)),
  );
}
