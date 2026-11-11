# MyFotoCards: Luli's Photocards para imprimir

Herramienta web para armar photocards:

- **Luli's Photocards** (`index.html`, la principal: es lo que abre la app): photocards tipo K-pop con frente y dorso, organizadas por grupo y álbum, para imprimir en doble faz.
- **Hojas de fotos** (`hojas.html`, herramienta extra, desde Más opciones → «Hojas de fotos»): hojas A4, Carta o papel foto 10×15 con fotos estilo polaroid, borde fino o sin marco. Arriba tiene «← Luli's Photocards» para volver.
- `photocards.html` quedó solo para que sigan andando los enlaces y accesos directos viejos: lleva a la principal.

Publicada en https://kaseofer.github.io/MyFotoCardsApp/. Las fotos no se suben a ningún servidor: todo queda en el navegador de quien la usa.

## Tecnología

- HTML, CSS y JavaScript sin frameworks: una página por modalidad y `common.js` con lo compartido.
- Canvas 2D para componer y exportar a 300 ppp.
- IndexedDB para guardar en el navegador: `hojas-fotos-a4` (Hojas de fotos) y `photocards-a4` (photocards y biblioteca de grupos).
- [Supabase](https://supabase.com) para la cuenta y la nube (`sync.js`; la base está en `supabase/schema.sql`). La librería supabase-js 2.115.0 se baja de jsDelivr solo si se usa la cuenta.
- [jsPDF 2.5.1](https://github.com/parallax/jsPDF) desde cdnjs para generar el PDF.
- Fuentes Figtree, Caveat, Bricolage Grotesque y Playfair Display desde Google Fonts.

## Instalarla como app

- **Android (Chrome):** abrir el enlace → menú ⋮ → "Instalar app". Mantener apretado el ícono muestra accesos directos a cada modalidad. Desde la galería: Compartir → MyFotoCards y las fotos entran solas en la última modalidad que se usó.
- **iPhone (Safari):** botón Compartir → "Agregar a inicio". (iPhone no permite recibir fotos compartidas en apps web.)
- Una vez abierta funciona sin conexión (`sw.js` guarda las dos páginas, `common.js` y jsPDF).
- "Compartir PDF" manda el PDF directo a WhatsApp, mail, Drive, etc. (aparece solo si el navegador lo permite).

## Lo que comparten las dos modalidades

- **Cuenta y nube** (botón "Entrar", arriba a la derecha): se entra con el correo (un enlace o un código de 6 dígitos) o, si se le puso una desde la ventana de la cuenta, con correo y contraseña (sirve para no esperar el correo: el envío gratis de Supabase manda 2 por hora). Con la sesión abierta, los proyectos de las dos modalidades, sus fotos y los grupos con sus logos se guardan solos en la nube y aparecen en los otros dispositivos donde se entre. Todo sigue funcionando sin internet: se sincroniza cuando vuelve la conexión (al abrir la app, cada 30 s y al salir de ella). Si el mismo proyecto se cambió en dos dispositivos, queda la versión de la nube y la otra como «(copia de este dispositivo)». Lo que se borra en uno se borra en los otros (en la nube queda en la papelera). Cada foto se sube una sola vez aunque se use en varios proyectos. "Salir" deja lo del dispositivo; "Borrar mi cuenta" borra todo lo de la nube.
- **Mis proyectos** (en Photocards, el botón «Mis tarjetas») muestra los proyectos de las dos modalidades. Los de la otra se abren allá con "Abrir".
- **Pasar de una a otra:** "Hacer photocards con estas fotos" (en Hojas) y "Usar en Hojas de fotos" (en Photocards) arman un proyecto nuevo en la otra modalidad con las mismas fotos, el mismo nombre y el mismo grupo y álbum. Así, por ejemplo, se recorta un collage en Photocards y después se arma una hoja de polaroids con esas fotos.
- **Grupos y álbumes:** se cargan en Photocards → Más opciones → "Grupos y álbumes" (cada uno; asignarle grupo a una colección es opcional, desde el botón «Elegir grupo y álbum» de Más opciones con su logo). En Hojas de fotos, el texto automático "Grupo y álbum" escribe por ejemplo «TWICE · Fancy» en cada foto.
- **Copia de todo:** en Mis proyectos → «Copias de seguridad», un solo archivo con las dos modalidades y los grupos (`.ndjson`, un registro por línea para que no haga falta tenerlo entero en memoria). "Restaurar copia de todo" lo vuelve a cargar, por ejemplo en otro teléfono.
- **Guardado automático:** a lo sumo 2,5 s después del primer cambio, aunque se siga trabajando (y cada 30 s como respaldo, y al cerrar o cambiar de app o de modalidad). El símbolo al lado del nombre muestra el estado (en Photocards, con texto: «Guardado en este dispositivo»): ✓ guardado · ● cambios sin guardar · ◌ guardando · ⚠ no se pudo guardar. Tocarlo guarda en el momento.
- **Al abrir** se carga el último proyecto con el que se trabajó. Los nuevos arrancan con la última configuración usada.
- **Deshacer** (o Ctrl+Z).
- **Brillo, contraste, sombras e intensidad de color** de cada foto: en Hojas, en la barra de la foto elegida; en Photocards, en el panel "Luz y color" a la derecha del editor de la tarjeta (frente o dorso propio; en el teléfono queda debajo). En el editor la foto se acomoda con un dedo y se acerca o aleja con dos (en la computadora, con la rueda del mouse). "Sombras" aclara u oscurece solo las partes oscuras; "Intensidad de color" va de blanco y negro a colores más vivos. "Aplicar a todas" copia el ajuste a todas las fotos. La foto original no se modifica: el ajuste se aplica al dibujar y al exportar, así que se puede cambiar o quitar cuando se quiera.
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

- **Mis artistas** (lo primero que se ve): cada artista o grupo con su foto (o su inicial), su nombre y cuántas colecciones tiene; buscador que no distingue mayúsculas, espacios ni acentos, y «＋ Agregar artista o grupo» (nombre obligatorio; foto y tipo —artista, grupo u otro— opcionales). Si ya existe uno con ese nombre avisa «Ya tenés a Kaos. ¿Querés abrirlo?» y ofrece «Crear otro»; nunca fusiona solo. Las colecciones de antes sin artista aparecen en «Colecciones sin artista», con «Elegir artista».
- **Un artista:** foto, nombre, «＋ Nueva colección» y sus colecciones con portada (la primera tarjeta o la elegida) y cantidad de tarjetas. El «⋯» de cada colección: cambiar nombre, cambiar portada, duplicar (copia independiente, «Mis favoritas — copia»), mover a otro artista (con «Deshacer») y eliminar (con «Recuperarla»). El «⋯» del artista: cambiar nombre o foto, y eliminarlo cuando ya no tiene colecciones.
- **Dentro de una colección:** arriba «← Kaos» y debajo el nombre de la colección y el guardado. Volver guarda; el botón «atrás» del teléfono también navega entre las tres pantallas. La foto del artista no se pone sola en las tarjetas: en Decorar están «Agregar el nombre de Kaos» y «Agregar la imagen de Kaos».
- Los artistas son los mismos «grupos» de antes (se relacionan por id, así que cambiarle el nombre no rompe nada). La foto y el tipo del artista se sincronizan con la nube dentro del grupo, sin tablas nuevas.

- **Pensada para chicos:** la primera pantalla muestra un solo botón grande, «Elegí tus fotos»; lo demás (carpeta, collage, seleccionar, grupos, pasar a Hojas) está en «Más opciones». La bienvenida y las pestañas usan los mismos tres pasos, 1 Mis fotos → 2 Decorar → 3 Terminar (ninguno es obligatorio), y la barra de abajo destaca la acción del momento: elegir fotos, «Preparar para imprimir» o «Descargar PDF». En el teléfono la cabecera es compacta (Mis tarjetas, nombre, guardado y deshacer) y no hay desplazamiento lateral ni a 320 px. En «Mis tarjetas», cada colección muestra «Abrir» y «⋯» (Duplicar, Eliminar); lo último eliminado se puede recuperar.
- **Editor de tarjeta:** imagen grande con la ayuda «Mové la foto con el dedo». A la vista solo lo básico: − / +, «Centrar foto» y «Girar» (además del gesto con dos dedos). «Más herramientas» muestra «Cambiar foto», «Quitar un color» y el panel Luz y color (en la computadora, al costado). Abajo, fijos: «Deshacer» (un paso; un arrastre o un pellizco cuenta como uno), «Cancelar» (deja la imagen exactamente como estaba al abrir el editor, zoom incluido; también con Escape) y «Listo». Duplicar, mover y eliminar no están en el editor sino en el «⋯» de cada tarjeta, así «Cancelar» solo afecta a la imagen. Si una foto puede salir borrosa, lo dice con palabras («Puede verse borrosa al imprimir»); los ppp quedan como detalle al pasar el mouse. El «Deshacer» de arriba, fuera del editor, es el general de la colección.
- **Colección de tarjetas:** agregar fotos o una carpeta, encuadrar, girar, duplicar, ordenar arrastrando y borrar. Con mouse se arrastra siempre; en el teléfono, después de tocar «Ordenar».
- **Recorte desde un collage:** marcar zonas de frente y dorso, cuadrícula automática, zoom, tamaño compartido y atajos de teclado.
- **Parte de atrás:** diseños listos de un toque (Corazones, Estrellas, Colores, Lunares, Ondas, Clásico) y «Personalizar» para el resto (en el teléfono la tarjeta queda fija arriba mientras se eligen): 9 dibujos (incluido uno estilo naipe español), colores, marco fino, logo del grupo y del álbum (con color, contorno y posición), textos y numeración.
- **Quitar un color** de una imagen y soporte para PNG con transparencia.
- **Impresión** (arranca con un tamaño ya elegido; «Cambiar tamaño» muestra hoja y medidas; sangrado, cortes compartidos, marcas y girar dorsos quedan en «Opciones de impresión para adultos»): hoja A4 o Carta; tarjetas photocard 55×85, póker 63×88, naipe español 61,5×95 y mini 44×68 mm; cortes compartidos (tarjetas pegadas, entran más por hoja); sangrado, marcas de corte, dorsos espejados para doble faz y hoja de prueba de alineación.
- **Para la imprenta:** imprimir el PDF en doble faz, volteo por el borde largo y escala 100%.
- **Colección nueva:** solo pide «¿Cómo se llama tu colección?»; grupo, álbum o set quedan en una sección opcional. Los cuadros de diálogo se manejan con teclado: el foco entra, Tab no sale, Escape cierra y el foco vuelve al botón.
- Colecciones clasificadas por grupo y álbum o set; copia de una colección en archivo JSON.
