# ESCALA
[ ] - opcional guardado local(gratis) / en nube (premium)
[ ] - Backend para usuarios, suscripcion, etc. 
[ ] - Guardado en la nube
       1- subir imagen
       2- convertir a webp
       3- guardar original (blob) en cloud
       4- guardar thumbnail webp en indexeddb
       5- si hace falta copiar la imagen ir a pedir la original al backend (cloud)
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
