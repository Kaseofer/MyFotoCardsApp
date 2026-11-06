# MyFotoCards: hojas de fotos y photocards para imprimir

Herramienta web con dos modalidades, que se eligen arriba de todo:

- **Hojas de fotos** (`index.html`): hojas A4, Carta o papel foto 10×15 con fotos estilo polaroid, borde fino o sin marco.
- **Luli's Photocards** (`photocards.html`): photocards tipo K-pop con frente y dorso, organizadas por grupo y álbum, para imprimir en doble faz.

Publicada en https://kaseofer.github.io/MyFotoCardsApp/. Las fotos no se suben a ningún servidor: todo queda en el navegador de quien la usa.

## Tecnología

- HTML, CSS y JavaScript sin frameworks: una página por modalidad y `common.js` con lo compartido.
- Canvas 2D para componer y exportar a 300 ppp.
- IndexedDB para guardar en el navegador: `hojas-fotos-a4` (Hojas de fotos) y `photocards-a4` (photocards y biblioteca de grupos).
- [jsPDF 2.5.1](https://github.com/parallax/jsPDF) desde cdnjs para generar el PDF.
- Fuentes Figtree, Caveat, Bricolage Grotesque y Playfair Display desde Google Fonts.

## Instalarla como app

- **Android (Chrome):** abrir el enlace → menú ⋮ → "Instalar app". Mantener apretado el ícono muestra accesos directos a cada modalidad. Desde la galería: Compartir → MyFotoCards y las fotos entran solas en la última modalidad que se usó.
- **iPhone (Safari):** botón Compartir → "Agregar a inicio". (iPhone no permite recibir fotos compartidas en apps web.)
- Una vez abierta funciona sin conexión (`sw.js` guarda las dos páginas, `common.js` y jsPDF).
- "Compartir PDF" manda el PDF directo a WhatsApp, mail, Drive, etc. (aparece solo si el navegador lo permite).

## Lo que comparten las dos modalidades

- **Mis proyectos** (ícono de carpeta) muestra los proyectos de las dos modalidades. Los de la otra se abren allá con "Abrir".
- **Pasar de una a otra:** "Hacer photocards con estas fotos" (en Hojas) y "Usar en Hojas de fotos" (en Photocards) arman un proyecto nuevo en la otra modalidad con las mismas fotos, el mismo nombre y el mismo grupo y álbum. Así, por ejemplo, se recorta un collage en Photocards y después se arma una hoja de polaroids con esas fotos.
- **Grupos y álbumes:** se cargan en Photocards → "Grupos" (cada uno con su logo). En Hojas de fotos, el texto automático "Grupo y álbum" escribe por ejemplo «TWICE · Fancy» en cada foto.
- **Copia de todo:** en Mis proyectos, un solo archivo con las dos modalidades y los grupos (`.ndjson`, un registro por línea para que no haga falta tenerlo entero en memoria). "Restaurar copia de todo" lo vuelve a cargar, por ejemplo en otro teléfono.
- **Guardado automático:** a lo sumo 2,5 s después del primer cambio, aunque se siga trabajando (y cada 30 s como respaldo, y al cerrar o cambiar de app o de modalidad). El símbolo al lado del nombre muestra el estado: ✓ guardado · ● cambios sin guardar · ◌ guardando · ⚠ no se pudo guardar. Tocarlo guarda en el momento.
- **Al abrir** se carga el último proyecto con el que se trabajó. Los nuevos arrancan con la última configuración usada.
- **Deshacer** (o Ctrl+Z).
- **Memoria liviana:** en memoria hay miniaturas; las fotos completas se cargan solo para imprimir o encuadrar, así se pueden usar carpetas grandes en el teléfono.
- **Aviso de baja resolución:** las fotos que saldrían impresas a menos de 150 ppp se marcan (solo en pantalla).

## Hojas de fotos

- **Hoja:** A4, Carta o papel foto 10×15.
- **Orientación por hoja:** cada hoja puede ser vertical u horizontal sin cambiar las demás ("Aplicar a todas las hojas" las iguala).
- **Forma de las fotos:** Automática, **Apaisadas** (3:2) o **Verticales** (2:3).
- **Fotos por hoja** (8 a 20) **o tamaño fijo** en cm: 13×18, 10×15, 9×13, 6×9 y 4×4 carnet.
- **Texto automático:** año, lugar, lugar y año, o grupo y álbum. El lugar sale del GPS de la foto y se consulta a [OpenStreetMap (Nominatim)](https://nominatim.org/) **solo si se elige Lugar**: se envían las coordenadas, nunca las fotos. Un texto escrito a mano no se pisa.
- Las fotos HEIC de iPhone se convierten solas con [heic2any](https://github.com/alexcorvi/heic2any).

## Luli's Photocards

- **Colección de tarjetas:** agregar fotos o una carpeta, encuadrar, girar, duplicar, ordenar arrastrando y borrar. Con mouse se arrastra siempre; en el teléfono, después de tocar «Ordenar».
- **Recorte desde un collage:** marcar zonas de frente y dorso, cuadrícula automática, zoom, tamaño compartido y atajos de teclado.
- **Diseñador de dorsos:** 6 patrones (incluido uno estilo naipe español), colores, marco fino, logo del grupo y del álbum (con color, contorno y posición), textos y numeración.
- **Quitar un color** de una imagen y soporte para PNG con transparencia.
- **Impresión:** hoja A4 o Carta; tarjetas photocard 55×85, póker 63×88, naipe español 61,5×95 y mini 44×68 mm; cortes compartidos (tarjetas pegadas, entran más por hoja); sangrado, marcas de corte, dorsos espejados para doble faz y hoja de prueba de alineación.
- **Para la imprenta:** imprimir el PDF en doble faz, volteo por el borde largo y escala 100%.
- Colecciones clasificadas por grupo y álbum o set; copia de una colección en archivo JSON.
