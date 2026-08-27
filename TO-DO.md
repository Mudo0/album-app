# ESCALA

[ ] - Adaptar a desktop para aprovechar la webapp.
Flujo de Sincronización por QR (App Desktop <-> App Android)

    Host (Desktop): Tu contenedor en Java o C# inicia un servidor WebSocket en segundo plano e imprime en la vista de Angular un código QR con su IP local, puerto y un token temporal.

    Cliente (Celular): El usuario abre la app de Capacitor en Android, escanea el QR con la cámara y extrae las credenciales.

    Conexión Directa: El celular se conecta al socket de la PC. A partir de este momento, ambas aplicaciones se envían peticiones bidireccionales en la red WiFi para intercambiar las imágenes y los metadatos.

[ ] - Backend para usuarios, suscripcion, pagos,etc.
[ ] - migrar indexdb a backend -> postgres. ???
[ ] - Guardado en la nube ???

- 1. subir imagen
- 2. convertir a webp
- 3. guardar original (blob) en cloud
- 4. guardar thumbnail webp en indexeddb
- 5. si hace falta copiar la imagen ir a pedir la original al backend (cloud)

# EXTRAS

- [ ] agregar **about** (acerca de la app, de mi, donar)
- [ ] agregar pagina de caracteristicas (explicacion de funcionamiento, etc.)
- [ ] landing para descargar.

# FEATURES A AGREGAR

- [ ] pantalla para seleccionar idioma (ingles/español)
- [ ] usuarios para manejar suscripciones y pagos
- [ ] etiquetas para los albumes y stickers
- [ ] filtro por etiquetas
- [ ] auto-organizacion
- [ ] customizacion de fondo de album
- [ ] themes (posible monetizacion)
- [ ] agregar lightbox de los stickers (ver mas de cerca)

## Edicion de stickers

- [ ] bloquear el movimiento de stickers
- [ ] añadir limite preciso (bordes) de stickers png
- [ ] cambiar tamaño
- [ ] rotacion
- [ ] añadir decoracion/bordes
- [ ] copiado/pegado facil

## Optimizacion

- [x] adaptar a offline
- [ ] agregar cache
- [ ] agregar preview webp de sticker // para verla mas de cerca
- [x] agregar thumbnail webp de sticker // para el album
- [x] cargado de stickers parejos (todos al mismo tiempo)
- [x] al agregar muchas imagenes se empieza a laguear (posible problema de memoria)

# bugs para corregir

- [x] al eliminar una imagen y tocar otra, la ultima se mueve sola hacia la esquina superior izquierda.
- [ ] guardado del album al cerrar repentinamente, onDestroy y guardar pocas veces, no con cada drag-drop (utilizar debounce).
- [ ] al cancelar el drag con esc, volver, cerrar la pestaña se puede bugear.
- [ ] al cambiar de resolucion algunos stickers se pueden quedar fuera del limite de la pantalla pero existiendo dentro del album.
- [x] limitar posicion de sticker al margen de la pantalla
# Testing

- [x] agregar tests para prevenir errores de navegacion
- [ ] agregar tests e2e que simulen el flujo de creacion/edicion de albumes y stickers.
