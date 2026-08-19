- [x] **Capacitor** para adaptar a mobile nativo.
- [x] acceso completo al almacenamiento (kinda)
- [x] guardado de path de las imagenes.

### UPDATES

- [ ] updates remotas (ionic appflow ???)
- [ ] sincronizacion entre dispositivos

### TESTS

- integracion con Maestro (framework de tests e2e)

Las 3 pruebas críticas en el dispositivo:

- [ ] Fling con muchas fotos: Hacer scroll ultra rápido y continuo hacia abajo y arriba en una galería cargada de imágenes. El objetivo es verificar que la app no se cuelgue, que no haya tirones (jank), que no salten errores de bridge y que los thumbnails se vayan cargando prolijos a medida que frenás.

- [ ] Rotación de pantalla: Girar el celular de vertical a horizontal mientras mirás la galería. El objetivo es comprobar que el ResizeObserver recalcule bien la altura de las filas (rowHeight) sin romper el layout del grid ni perder la posición del scroll.

- [ ] Guardado con selección grande: Seleccionar muchas fotos a la vez y tocar guardar. El objetivo es verificar que el flujo de salida funcione bien ahora que media.thumbnail ya no existe en el modelo y que no reviente la memoria al procesar la selección.
