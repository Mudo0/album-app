# ESCALA

[ ] - opcional guardado local(gratis) / en nube (premium)
[ ] - Backend para usuarios, suscripcion, pagos,etc.
[ ] - migrar indexdb a backend -> postgres.
[ ] - Guardado en la nube
1- subir imagen
2- convertir a webp
3- guardar original (blob) en cloud
4- guardar thumbnail webp en indexeddb
5- si hace falta copiar la imagen ir a pedir la original al backend (cloud)

### IMAGE

[ ] - IImageStorageStrategy (saveOriginal(blob), getOriginal(id) y delete(id).)

1. Caché de Thumbnails (Rendimiento y Costos)

   Problema: Si cada vez que el usuario abre un álbum, tu PWA descarga 50 thumbnails (WebP) desde tu Cloud Storage, consumirás tiempo, batería y datos móviles del usuario, además de aumentar los costos de tráfico de tu nube.

   Solución: Al descargar un thumbnail por primera vez, lo guardas en IndexedDB. Las próximas veces, Angular carga el WebP instantáneamente desde el almacenamiento del celular sin hacer peticiones HTTP.

2. Soporte Offline (PWA)

   Problema: Sin conexión a internet, una app que depende 100% de PostgreSQL y Cloud Storage mostrará una pantalla en blanco o de error.

   Solución: Al guardar en IndexedDB una copia de la estructura del álbum (el JSON con x, y, z) y los thumbnails, la aplicación puede arrancar y mostrar el tablero interactivo incluso si el usuario está en modo avión.

3. Actualizaciones Optimistas (Optimistic UI)

   Problema: Esperar la respuesta de la API tras cada movimiento de un sticker genera una sensación de lag en la interfaz.

   Solución: Actualizas el estado en IndexedDB y en la memoria del componente inmediatamente para que la UI reaccione en tiempo real. En segundo plano, envías la petición a tu API. Si la red falla, la acción queda encolada localmente para reintentarse.

4. Borradores y Cargas Pausadas

   Problema: Si un usuario sube 20 imágenes pesadas y pierde la conexión a la mitad, pierde el progreso.

   Solución: Puedes almacenar los archivos seleccionados temporalmente en IndexedDB. Si el upload falla, la PWA recupera los archivos desde la base local y reanuda la subida cuando vuelva la conexión, sin obligar al usuario a abrir la galería de nuevo.

# features a agregar

- [ ] usuarios ???
- [ ] definir un limite de almacenamiento por usuario (limite gratuito / pagado)
- [ ] etiquetas para los albumes y stickers
- [ ] filtro por etiquetas
- [ ] auto-organizacion
- [ ] customizacion de fondo de album
- [ ] themes (posible monetizacion)
- [ ] agregar lightbox de los stickers (ver mas de cerca)

## Edicion de stickers

- [ ] añadir limite preciso de stickers png
- [ ] cambiar tamaño
- [ ] rotacion
- [ ] añadir decoracion/bordes
- [ ] copiado/pegado facil

## Optimizacion

- [ ] adaptar a offline
- [ ] agregar cache
- [ ] agregar preview webp de sticker // para verla mas de cerca
- [ ] agregar thumbnail webp de sticker // para el album

# bugs para corregir

- [ ] al salir del album no recuerda la posicion z de los stickers
- [ ] guardado del album al cerrar repentinamente, onDestroy y guardar pocas veces, no con cada drag-drop (utilizar debounce)
- [ ] al cancelar el drag con esc, volver, cerrar la pestaña se puede bugear

# Testing

- [ ] agregar tests para prevenir errores de navegacion
- [ ] agregar tests e2e que simulen el flujo de creacion/edicion de albumes y stickers.
