# AR del plano de Sastre (1824) · Santa Fe, ayer y hoy

Experiencia web de realidad aumentada con image tracking (MindAR + A-Frame) para la guía impresa del Museo Etnográfico y Colonial de Santa Fe, núcleo "De Santa Fe la Vieja a Santa Fe de la Vera Cruz".

Al apuntar la cámara al plano de 1824 impreso en el folleto, se ve una copia digital del plano sobre el papel y, alrededor, el trazado actual de la ciudad. Se resalta el casco histórico: la zona que ocupa el plano de 1824 dentro de la Santa Fe de hoy. Es un proyecto estático: no necesita backend.

Las únicas imágenes del proyecto son el marcador (`plano-1824.mind`), la copia digital del plano (`plano-1824.png`) y `trazado-actual.png`.

### Orden de las capas (de abajo hacia arriba)

1. **Trazado actual** (`trazado-actual.png`): mucho más grande que el marcador; se extiende alrededor, con tamaño y posición calculados desde `config.js`.
2. **Plano de 1824** (`plano-1824.png`): exactamente sobre el marcador, de 1 unidad de ancho y alto proporcional, apenas más cerca de la cámara que el trazado actual para que no se tapen. Con su slider se puede hacer transparente para ver el trazado actual que queda debajo.
3. **Casco histórico (traza de 1824):** contorno resaltado que marca la zona del plano de 1824 dentro del mapa.
4. **Puntos de interés** (opcionales).

## Estructura

```
index.html
css/styles.css
js/config.js        ← acá se ajusta todo (medidas, tracking, animación, archivos)
js/app.js           ← lógica; normalmente no hace falta tocarlo
assets/
  targets/plano-1824.mind        ← TU target compilado
  img/trazado-actual.png         ← TU PNG transparente del mapa actual
  img/plano-1824.png             ← TU copia digital del plano de 1824
  data/puntos.json               ← opcional (hay un ejemplo)
.nojekyll
```

Copiá tus archivos con esos nombres exactos. Si los nombres son otros, cambialos en `js/config.js` (sección 1).

## 1. Cargar las medidas

Abrí `js/config.js` y completá la sección 2 con tus medidas en píxeles, tomadas sobre el mismo lienzo de diseño:

| Constante | Qué es |
|---|---|
| `PLANO_VIEJO` | `w`, `h` (wV, hV) y `cx`, `cy` (cxV, cyV) del plano de 1824 |
| `MAPA_ACTUAL` | `w`, `h` (wN, hN) y `cx`, `cy` (cxN, cyN) del mapa actual |

Las fórmulas ya están aplicadas en `calcularCapa()`:

- ancho = wN / wV · alto = hN / wV
- x = (cxN − cxV) / wV · y = −(cyN − cyV) / wV

**Los valores que vienen cargados son de ejemplo**, hay que reemplazarlos.

### Puntos de interés

`assets/data/puntos.json`: cada punto tiene `nombre`, `descripcion`, `x` e `y`. La posición va de 0 a 1 sobre la imagen `trazado-actual.png` (0,0 es la esquina superior izquierda). Los textos y posiciones del archivo son de ejemplo.

### Copia digital del plano de 1824

`assets/img/plano-1824.png` tiene que ser el mismo plano que imprimiste en el folleto y que compilaste en el `.mind`, con el mismo recorte y la misma proporción (alto / ancho = hV / wV). Se coloca exactamente sobre el marcador con 1 unidad de ancho; si la proporción no coincide se ve deformado y la consola avisa con un mensaje `[AR]`. Puede ser PNG con o sin transparencia.

### Casco histórico (traza de 1824)

No es una imagen: es la zona que ocupa el plano de 1824 dentro del trazado actual. Se dibuja por código como un marco ocre con borde oscuro y un tinte suave, del tamaño del plano viejo y ubicado donde corresponde dentro del mapa nuevo (por eso las medidas de la sección 2 tienen que estar bien). Está activado por defecto. El grosor, los colores y el tinte se cambian en `CONTORNO` (`config.js`, sección 7); poné `relleno: ''` para dejar solo la línea.

## 2. Ajustes que conviene probar en el celular

- **Temblor:** `TRACKING.filterMinCF` (más bajo = más estable) y `filterBeta` (más alto = menos retraso al mover). Los valores iniciales son un punto de partida, no un óptimo: probalos con el folleto impreso.
- **Parpadeo al perder el marcador:** subí `missTolerance`.
- **Animación:** `ANIMACION` define cuándo aparece cada capa y cuánto dura: primero se ve solo el plano de 1824, después el casco histórico, luego el trazado actual aparece alrededor con un fade-in suave y por último los puntos.
- **Valores iniciales de los sliders:** sección `UI` (`opacidadPlanoInicial` para el plano de 1824, `opacidadInicial` para el trazado actual y `escalaInicial`).

Si el casco histórico o el plano de 1824 no caen donde deberían dentro del mapa, revisá primero las medidas de la sección 2; con la escala en 100 % el contorno tiene que coincidir con el borde de la copia del plano.

## 3. Probar en tu computadora

La cámara solo funciona con **https** (o `localhost`), y `puntos.json` no se puede leer abriendo el HTML con doble clic. Levantá un servidor local desde la carpeta del proyecto:

```
python3 -m http.server 8000
```

y abrí `http://localhost:8000` en la computadora. Para probar en el celular, lo más simple es publicarlo en GitHub Pages (abajo).

## 4. Publicar en GitHub Pages

1. Creá un repositorio nuevo en GitHub (por ejemplo `museo-ra`), público.
2. Subí **todo el contenido** de esta carpeta (que `index.html` quede en la raíz del repo), incluido el archivo `.nojekyll`. Desde la web: *Add file → Upload files*; o con git:
   ```
   git init
   git add .
   git commit -m "AR plano de Sastre"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/museo-ra.git
   git push -u origin main
   ```
3. En el repo: *Settings → Pages → Build and deployment*. En *Source* elegí **Deploy from a branch**, rama `main`, carpeta `/ (root)`, y guardá.
4. Esperá uno o dos minutos. La dirección queda así:
   `https://TU-USUARIO.github.io/museo-ra/`
5. Abrila desde el celular y probala con el folleto.

Para actualizar, volvé a subir los archivos cambiados. Si no ves los cambios, recargá sin caché o esperá un par de minutos.

## 5. Generar el QR

Usá la dirección final de GitHub Pages (con la barra final).

- **Sin instalar nada:** cualquier generador de QR online que permita descargar en PNG o SVG. Preferí SVG para imprimir.
- **Con Python:**
  ```
  pip install "qrcode[pil]"
  python3 -c "import qrcode; qrcode.make('https://TU-USUARIO.github.io/museo-ra/').save('qr.png')"
  ```
- **Con la terminal (qrencode):**
  ```
  qrencode -o qr.png -s 12 -m 4 -l H "https://TU-USUARIO.github.io/museo-ra/"
  ```

Para la impresión: corrección de errores alta (H), margen blanco alrededor de al menos 4 módulos, alto contraste (oscuro sobre claro), tamaño mínimo cercano a 2,5 cm de lado, y probalo con varios celulares sobre el papel ya impreso, con el acabado final.

## 6. Consejos de uso y de producción

- **Peso de las imágenes:** los PNG grandes tardan en cargar con datos móviles. Mantené cada lado de `trazado-actual.png` en 4096 px o menos (si es más grande, la página lo reduce sola); para `plano-1824.png` alcanza con un ancho de 1500 a 2000 px. Optimizá las dos imágenes (por ejemplo con TinyPNG o Squoosh).
- **Marcador impreso:** evitá papel con mucho brillo (el reflejo complica el tracking) y probá con luz de ambiente variada. El plano debe entrar completo en la cámara; los controles incluyen un slider de escala para ajustar la vista según la distancia.
- **Versiones:** `index.html` carga A-Frame 1.5.0 y MindAR 1.2.5 desde jsDelivr. Si querés que funcione sin depender del CDN, descargá esos dos archivos a una carpeta `lib/` y cambiá las rutas en `index.html`.
- **Si algo no anda:** abrí la consola del navegador (en el celular, con depuración remota desde Chrome o Safari). Los mensajes de la app empiezan con `[AR]`.

## Cómo funciona la interfaz

- **Plano de 1824:** controla la opacidad de la copia digital del plano (de 0 a 100 %). Al bajarla se ve a través de ella el trazado actual que queda debajo; en 0 % se ve el plano impreso del folleto.
- **Trazado actual:** controla la opacidad del mapa de hoy (de 0 a 100 %).
- **Escala de visualización:** achica o agranda el trazado actual, el casco histórico y los puntos respecto del marcador, tomando como centro el plano viejo. La copia del plano de 1824 no cambia: siempre queda sobre el marcador. A 100 % el casco histórico coincide con el plano; en otros valores sigue marcando la zona correcta dentro del mapa, pero ya no coincide con el plano.
- **Capas:** botones para encender y apagar "Trazado actual", "Casco histórico (traza de 1824)" y "Puntos de interés". Las tres arrancan activadas.
- **Restablecer:** vuelve sliders y capas a los valores iniciales.
- Si se pierde el marcador, aparece "Volvé a apuntar al plano" y al reencontrarlo todo sigue como estaba (sin repetir la animación inicial).
