# MyFotoCards: hojas de fotos para imprimir

Herramienta web para armar hojas A4, Carta o papel foto 10×15 con fotos (estilo polaroid, borde fino o sin marco), lista para mandar a imprimir.

## Uso

Abrir `index.html` en el navegador (doble clic) o publicarlo con GitHub Pages.

## Tecnología

- Un solo archivo HTML con CSS y JavaScript sin frameworks.
- Canvas 2D para componer las hojas y exportarlas a 300 ppp (A4: 2480 × 3508 px).
- IndexedDB para guardar los proyectos en el navegador (las fotos no salen del dispositivo).
- [jsPDF 2.5.1](https://github.com/parallax/jsPDF) desde cdnjs para generar el PDF.
- Fuentes Figtree y Caveat desde Google Fonts.

## Uso desde el teléfono

Publicada en https://kaseofer.github.io/MyFotoCardsApp/ — se puede agregar a la pantalla de inicio desde el menú del navegador.

- Tocá una foto para elegirla; recién ahí arrastrarla la encuadra. Sin foto elegida, el dedo desplaza la página.
- "Deshacer" (o Ctrl+Z) revierte quitar, mover, girar, encuadrar, vaciar y eliminar hojas.
- En memoria solo están las fotos completas de la hoja visible; el resto usa miniaturas, así se pueden cargar carpetas grandes.
- Las fotos HEIC de iPhone se convierten solas con [heic2any](https://github.com/alexcorvi/heic2any) (se descarga solo si hace falta).

## Instalarla como app

- **Android (Chrome):** abrir el enlace → menú ⋮ → "Instalar app". Después, desde la galería: Compartir → MyFotoCards y las fotos entran solas.
- **iPhone (Safari):** botón Compartir → "Agregar a inicio". (iPhone no permite recibir fotos compartidas en apps web; se cargan con "Agregar fotos sueltas".)
- Una vez abierta, funciona sin conexión (`sw.js` guarda la app y jsPDF).
- "Compartir PDF" manda el PDF directo a WhatsApp, mail, Drive, etc. (aparece solo si el navegador lo permite).

## Hojas, tamaños y textos

- **Hoja:** A4, Carta o papel foto 10×15.
- **Orientación por hoja:** cada hoja puede ser vertical u horizontal sin cambiar las demás ("Aplicar a todas las hojas" las iguala). Las hojas nuevas salen como la última. El PDF lleva cada página en su orientación.
- **Forma de las fotos:** Automática (llenan el espacio), **Apaisadas** (3:2, más anchas que altas, aunque la hoja esté parada) o **Verticales** (2:3). Se mantiene la cantidad por hoja y se eligen las filas y columnas que dejan las fotos más grandes; el marco se descuenta para que la foto en sí quede en 3:2.
- **Fotos por hoja** (8 a 20, llenan la hoja) **o tamaño fijo** en cm: 13×18, 10×15, 9×13, 6×9 y 4×4 carnet. Con tamaño fijo entran las que quepan, centradas y en tamaño real; si no entra ninguna, se achica y lo avisa.
- **Texto automático:** año, lugar o lugar y año. El lugar sale del GPS guardado en la foto y se consulta a [OpenStreetMap (Nominatim)](https://nominatim.org/) **solo si se elige Lugar**: se envían las coordenadas, nunca las fotos. Se pide de a una por segundo y se recuerda por zona. Un texto escrito a mano no se pisa.
- **Aviso de baja resolución:** las fotos que saldrían impresas a menos de 150 ppp muestran una marca naranja (solo en pantalla) y la barra de la foto dice la calidad.

## Guardado

- Se guarda solo unos segundos después de cada cambio (y cada 30 s como respaldo, y al cerrar o cambiar de app).
- El símbolo al lado del nombre muestra el estado: ✓ guardado · ● cambios sin guardar · ◌ guardando · ⚠ no se pudo guardar. Tocarlo guarda en el momento.
- Al abrir la app se carga el último proyecto con el que se trabajó, con su configuración.
- Los proyectos nuevos arrancan con la última configuración usada (hoja, tamaño, estilo, márgenes, textos).
