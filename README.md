# Hojas A4 de fotos

Herramienta web para armar hojas A4 con fotos (estilo polaroid, borde fino o sin marco), lista para mandar a imprimir.

## Uso

Abrir `index.html` en el navegador (doble clic) o publicarlo con GitHub Pages.

## Tecnología

- Un solo archivo HTML con CSS y JavaScript sin frameworks.
- Canvas 2D para componer las hojas y exportarlas a 300 ppp (2480 × 3508 px).
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
