// Datos de ejemplo para explorar la app sin conectar una tienda.
// Son inventados y la app siempre los marca como "ejemplo".

// Precios base en pesos colombianos; para otros países se convierten de forma aproximada.
const FACTOR_MONEDA = { COP: 1, USD: 1 / 4000, PEN: 1 / 1100, CLP: 1 / 4.2, MXN: 1 / 220, GTQ: 1 / 520, PYG: 1.9, ARS: 1 / 3.4, EUR: 1 / 4500 };

const PRODUCTOS = [
  { id: 'demo-p1', titulo: 'Corrector de postura ajustable', precio: 79900, costo: 25000, flete: 15700, stock: 140, tono: 1 },
  { id: 'demo-p2', titulo: 'Masajeador eléctrico de cuello', precio: 119900, costo: 48000, flete: 15700, stock: 62, tono: 2 },
  { id: 'demo-p3', titulo: 'Lámpara de luna 3D recargable', precio: 69900, costo: 31000, flete: 15700, stock: 85, tono: 3 },
  { id: 'demo-p4', titulo: 'Cepillo alisador de cerámica', precio: 59900, costo: 29500, flete: 15700, stock: 23, tono: 4 },
  { id: 'demo-p5', titulo: 'Mini proyector portátil HD', precio: 189900, costo: null, flete: null, stock: 12, tono: 5 },
];

const CLIENTES = [
  ['Laura Gómez', 'Bogotá', 'Cundinamarca', 'Calle 45 # 12-30, apto 402'],
  ['Andrés Ramírez', 'Medellín', 'Antioquia', 'Carrera 70 # 32-15'],
  ['Valentina Torres', 'Cali', 'Valle del Cauca', 'Avenida 6N # 28-44'],
  ['Carlos Pérez', 'Barranquilla', 'Atlántico', 'Calle 84 # 51B-20'],
  ['Daniela Rojas', 'Bucaramanga', 'Santander', 'Carrera 27 # 36-08'],
  ['Juan Esteban Díaz', 'Pereira', 'Risaralda', 'Calle 19 # 8-52'],
  ['María Fernanda Ruiz', 'Cartagena', 'Bolívar', 'Barrio Manga, calle 25 # 20-11'],
  ['Santiago Herrera', 'Ibagué', 'Tolima', 'Carrera 5 # 60-24'],
  ['Camila Vargas', 'Villavicencio', 'Meta', 'Calle 37 # 30-19'],
  ['Felipe Castro', 'Manizales', 'Caldas', 'Avenida Santander # 65-10'],
  ['Natalia Moreno', 'Bogotá', 'Cundinamarca', 'Carrera 15 # 118-40'],
  ['Sebastián López', 'Medellín', 'Antioquia', 'Calle 10 # 43D-25'],
];

const TRANSPORTADORAS = ['Servientrega', 'Interrapidísimo', 'Coordinadora', 'Envía'];

// Estado de cada pedido de ejemplo, del más nuevo al más viejo, con horas de antigüedad.
const RECORRIDO = [
  ['por_confirmar', 0.3],
  ['por_confirmar', 2],
  ['por_confirmar', 5],
  ['por_confirmar', 27],
  ['confirmado', 20],
  ['confirmado', 30],
  ['novedad', 50],
  ['enviado', 44],
  ['enviado', 70],
  ['cancelado', 75],
  ['novedad', 96],
  ['enviado', 100],
  ['entregado', 120],
  ['entregado', 150],
  ['devuelto', 170],
  ['entregado', 190],
  ['entregado', 220],
  ['entregado', 260],
  ['devuelto', 300],
  ['entregado', 330],
  ['entregado', 380],
  ['entregado', 430],
  ['cancelado', 470],
  ['entregado', 520],
];

function aleatorio(semilla) {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convierte un valor de ejemplo en pesos colombianos a la moneda del país elegido.
export function convertir(valor, moneda) {
  if (valor === null) return null;
  const v = valor * (FACTOR_MONEDA[moneda] ?? 1);
  if (['COP', 'CLP', 'PYG', 'ARS'].includes(moneda)) return Math.round(v / 100) * 100;
  if (['MXN', 'GTQ', 'PEN'].includes(moneda)) return Math.round(v);
  return Math.round(v * 100) / 100;
}

function precioVitrina(valor, moneda) {
  if (['COP', 'CLP', 'PYG', 'ARS'].includes(moneda)) return Math.round(valor / 1000) * 1000 - 100;
  if (['MXN', 'GTQ', 'PEN'].includes(moneda)) return Math.round(valor / 10) * 10 - 1;
  return Math.round(valor) - 0.01;
}

export function productosDemo(moneda = 'COP') {
  return PRODUCTOS.map((p) => ({
    id: p.id,
    titulo: p.titulo,
    precio: precioVitrina(convertir(p.precio, moneda), moneda),
    costoEjemplo: convertir(p.costo, moneda),
    fleteEjemplo: convertir(p.flete, moneda),
    stock: p.stock,
    imagen: null,
    tono: p.tono,
    variantes: 1,
    ejemplo: true,
  }));
}

export function pedidosDemo(moneda = 'COP', ahora = Date.now()) {
  const azar = aleatorio(20260930);
  const productos = productosDemo(moneda);
  return RECORRIDO.map(([estado, horas], i) => {
    const [cliente, ciudad, departamento, direccion] = CLIENTES[i % CLIENTES.length];
    const producto = productos[Math.floor(azar() * productos.length)];
    const cantidad = azar() < 0.15 ? 2 : 1;
    const conGuia = ['enviado', 'novedad', 'entregado', 'devuelto'].includes(estado);
    const telefono = `3${String(Math.floor(azar() * 1e9)).padStart(9, '0')}`;
    return {
      id: `demo-${1024 - i}`,
      numero: `#${1024 - i}`,
      fecha: new Date(ahora - horas * 3600 * 1000).toISOString(),
      cliente,
      telefono,
      ciudad,
      departamento,
      direccion,
      total: producto.precio * cantidad,
      productos: [{ productoId: producto.id, titulo: producto.titulo, variante: null, cantidad, precio: producto.precio }],
      pagoContraEntrega: true,
      cancelado: estado === 'cancelado',
      guia: conGuia ? `${240000000 + Math.floor(azar() * 9999999)}` : null,
      transportadora: conGuia ? TRANSPORTADORAS[Math.floor(azar() * TRANSPORTADORAS.length)] : null,
      estadoFuente: estado,
      enDropiFuente: estado === 'por_confirmar' ? i % 2 === 0 : true,
      ejemplo: true,
    };
  });
}
