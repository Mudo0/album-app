# ESCALA
[ ] - Backend para usuarios, suscripcion, pagos,etc.
[ ] - migrar indexdb a backend -> postgres.
[ ] - Guardado en la nube

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

- [ ] adaptar a offline
- [ ] agregar cache
- [ ] agregar preview webp de sticker // para verla mas de cerca
- [ ] agregar thumbnail webp de sticker // para el album
- [ ] cargado de stickers parejos (todos al mismo tiempo)
- [ ] al agregar muchas imagenes se empieza a laguear (posible problema de memoria)

# bugs para corregir

- [ ] al eliminar una imagen y tocar otra, la ultima se mueve sola hacia la esquina superior izquierda.
- [ ] guardado del album al cerrar repentinamente, onDestroy y guardar pocas veces, no con cada drag-drop (utilizar debounce).
- [ ] al cancelar el drag con esc, volver, cerrar la pestaña se puede bugear.
- [ ] al cambiar de resolucion algunos stickers se pueden quedar fuera del limite de la pantalla pero existiendo dentro del album.
# Testing

- [ ] agregar tests para prevenir errores de navegacion
- [ ] agregar tests e2e que simulen el flujo de creacion/edicion de albumes y stickers.
