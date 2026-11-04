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
