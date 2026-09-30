# Panel Dropi Fácil

Un panel en español para manejar tu tienda **Shopify** conectada a **Dropi** sin saber de dropshipping. Cada mañana te dice qué hacer, te prepara los mensajes de WhatsApp y te muestra cuánto ganas de verdad.

- **Vista previa en línea** (con datos de ejemplo): https://claude.ai/artifact/XFkUhTfWLtFNNMPnD4euHF
- **Guía completa para conectar Dropi con Shopify**: https://claude.ai/code/artifact/7161731f-943c-401b-a882-e22f090b5c99

## Qué hace

| Pantalla | Para qué sirve |
| --- | --- |
| **Hoy** | Lista de tareas del día (novedades, pedidos por confirmar, pedidos que no llegaron a Dropi), ventas y ganancia del mes, tasa de entrega y pedidos por día. |
| **Pedidos** | Cada pedido como una guía de envío con su siguiente paso. Un botón abre WhatsApp con el mensaje de confirmación listo. Marcas el estado con un clic, anotas y revisas si ya está en Dropi. |
| **Productos** | Escribes el precio del proveedor y el flete, y ves si tu precio deja ganancia (verde, amarillo o rojo), el precio mínimo y el sugerido. |
| **Calcular** | Calculadora de ganancia para contra entrega: incluye devoluciones y anuncios, y lo explica con 100 pedidos de ejemplo. |
| **Aprende** | Cómo viaja un pedido, la lista para arrancar y un glosario. |
| **Ajustes** | País y moneda, tus números (comisión, devoluciones, anuncios), los mensajes de WhatsApp y la conexión con Shopify. |

La app **solo lee** tu tienda Shopify: no puede cambiar ni borrar nada. Lo que marcas (estados, notas, costos) se guarda en tu computador, en la carpeta `datos`.

## Cómo abrirla en tu computador

### Opción A: con Node.js (la más fácil)

1. Instala **Node.js** versión LTS desde https://nodejs.org (siguiente, siguiente, finalizar).
2. Descarga esta carpeta (`panel-dropi-shopify`). En GitHub: botón **Code → Download ZIP** y descomprímelo.
3. Ábrela:
   - **Windows**: doble clic en `iniciar-windows.bat`.
   - **Mac o Linux**: abre la Terminal en la carpeta y escribe `./iniciar-mac-linux.sh`.
4. Se abre `http://localhost:3000` en tu navegador. Deja abierta la ventana negra mientras usas el panel; ciérrala para apagarlo.

No hay que instalar nada más: la app no usa paquetes externos.

### Opción B: con Docker

```bash
docker compose up -d
```

Luego abre `http://localhost:3000`. Tus datos quedan en `./datos`.

## Conectar tu tienda Shopify

La app empieza con **datos de ejemplo**. Para ver tus pedidos reales ve a **Ajustes → Conectar Shopify**.

Desde el 1 de enero de 2026 Shopify ya no permite crear apps personalizadas nuevas desde el panel de la tienda. Ahora se crean en el **Dev Dashboard** y se conectan con **Client ID y Client Secret**:

1. Entra a https://dev.shopify.com con tu cuenta de Shopify y crea una app (por ejemplo "Mi panel").
2. En la configuración de la versión, marca estos permisos de la Admin API: `read_orders`, `read_products` y `read_inventory`. Publica la versión.
3. Instala la app en tu tienda.
4. Copia el **Client ID** y el **Client Secret** de la configuración de la app y pégalos en el panel junto con tu dominio `mitienda.myshopify.com`.
5. Si los pedidos llegan sin nombre ni teléfono, pide en la app acceso a los datos protegidos del cliente (nombre, teléfono y dirección).

El panel cambia esas claves por un token que dura 24 horas y lo renueva solo.

¿Ya tenías una app personalizada creada antes de 2026? Elige **"Un token shpat_"** y pega su token de la Admin API.

## Actualizar estados con el reporte de Dropi

Dropi no ofrece una API pública, así que el panel no puede leer los estados de Dropi solo. Tienes dos formas de mantenerlos al día:

- Marcar cada pedido con los botones ("El cliente confirmó", "Se entregó"…).
- En Dropi, descargar tu reporte de pedidos, guardarlo como **CSV** (en Excel: *Guardar como → CSV*) y subirlo en **Pedidos → Subir reporte de Dropi**. El panel busca el número de pedido de Shopify o el teléfono del cliente y copia el estado y la guía.

## Problemas comunes

| Lo que ves | Qué hacer |
| --- | --- |
| "Falta Node.js" | Instala Node.js LTS desde nodejs.org y vuelve a abrir el archivo de inicio. |
| "Shopify no aceptó el Client ID y el Client Secret" | Revisa que la app esté **instalada** en tu tienda y que copiaste las claves completas. |
| "La app no tiene permiso" | Agrega `read_orders`, `read_products` y `read_inventory`, publica una versión nueva y vuelve a instalar. |
| Pedidos sin nombre ni teléfono | Pide acceso a los datos protegidos del cliente en la configuración de la app. |
| El puerto 3000 está ocupado | Inicia con otro puerto: `PORT=3001 node server.js` (en Windows: `set PORT=3001` y luego `node server.js`). |

## Para desarrolladores

- `node server.js` inicia el servidor (Node 18.17 o más nuevo, sin dependencias).
- `npm test` corre las pruebas con el test runner de Node.
- Variables: `PORT` (3000), `HOST` (127.0.0.1), `DATA_DIR` (`./datos`) y `ALLOWED_HOSTS` (hosts extra separados por coma).
- Estructura:
  - `server.js`: servidor HTTP, archivos estáticos y rutas `/api/*`.
  - `src/almacen.js`: guarda `datos/panel.json` de forma atómica.
  - `public/js/nucleo/`: lógica compartida entre el servidor y el navegador (cálculo de ganancia, estados de pedidos, CSV de Dropi, datos de ejemplo, cliente de Shopify).
  - `public/js/app.js`: la interfaz, sin frameworks ni compilación.
- Shopify: Admin GraphQL API versión `2026-07`, solo consultas de lectura.
- Seguridad: el servidor escucha solo en `127.0.0.1`, rechaza hosts que no sean locales (protege contra DNS rebinding), exige el encabezado `X-Panel` en las escrituras y nunca devuelve las claves de Shopify al navegador.
- Si abres `public/` sin servidor (o en la vista previa), la app usa la misma lógica dentro del navegador con datos de ejemplo guardados en `localStorage`.
