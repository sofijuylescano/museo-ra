/* =====================================================================
   CONFIGURACIÓN — todo lo que se ajusta está en este archivo
   Museo Etnográfico y Colonial de Santa Fe · Núcleo 4
   "De Santa Fe la Vieja a Santa Fe de la Vera Cruz"
   ===================================================================== */
(function () {
  'use strict';

  /* -------------------------------------------------------------------
     1. ARCHIVOS
     Rutas relativas a index.html. Las únicas imágenes del proyecto son
     el marcador (plano de 1824 impreso, compilado en .mind), la copia
     digital de ese plano y el trazado actual.
     Los puntos de interés son opcionales (null = sin puntos).

     Orden de las capas, de abajo hacia arriba:
       1. trazado actual            (grande, se extiende alrededor)
       2. plano de 1824 (copia)     (exactamente sobre el marcador)
       3. casco histórico           (contorno resaltado)
       4. puntos de interés
     ------------------------------------------------------------------- */
  const ARCHIVOS = {
    target:  'assets/targets/plano-1824.mind',   // obligatorio (compilado con MindAR)
    trazado: 'assets/img/trazado-actual.png',    // obligatorio (PNG transparente)
    plano:   'assets/img/plano-1824.png',        // obligatorio (copia digital del plano impreso)
    puntos: null                                 // opcional
  };

  /* -------------------------------------------------------------------
     2. MEDIDAS DEL LIENZO (en píxeles)
     Todas las medidas se toman sobre el MISMO lienzo de diseño (por ejemplo
     el documento de Illustrator/Photoshop/Figma donde alineaste el plano
     viejo con el mapa actual). El origen es la esquina superior izquierda.
       w, h   = ancho y alto de la imagen
       cx, cy = posición del CENTRO de la imagen en ese lienzo
     ⚠ Los valores de abajo son de EJEMPLO: reemplazalos por los reales.
     ------------------------------------------------------------------- */
const PLANO_VIEJO = { w: 8.55,  h: 11.83, cx: 20.465, cy: 22.235 };  // wV, hV, cxV, cyV
const MAPA_ACTUAL = { w: 28.07, h: 33.5,  cx: 14.035, cy: 16.75 };   // wN, hN, cxN, cyN
  /* -------------------------------------------------------------------
     3. FÓRMULAS: de píxeles a unidades de MindAR
     El marcador (plano viejo) mide 1 unidad de ancho, así que 1 unidad
     equivale a wV píxeles.
        ancho = wN / wV          alto  = hN / wV
        x     =  (cxN − cxV) / wV
        y     = −(cyN − cyV) / wV     (el eje Y de MindAR crece hacia arriba)

     CASCO HISTÓRICO: no es una imagen. Es la zona que ocupa el plano de
     1824 dentro del trazado actual, y se dibuja como un contorno del
     tamaño del marcador (1 × altoMarcador) centrado en el plano viejo.
     No hace falta tocar esta función.
     ------------------------------------------------------------------- */
  function calcularCapa(m) {
    return {
      ancho: m.w / PLANO_VIEJO.w,
      alto:  m.h / PLANO_VIEJO.w,
      x:   (m.cx - PLANO_VIEJO.cx) / PLANO_VIEJO.w,
      y: -((m.cy - PLANO_VIEJO.cy) / PLANO_VIEJO.w)
    };
  }

  /* -------------------------------------------------------------------
     4. ESTABILIZACIÓN DEL TRACKING (filtro One Euro de MindAR)
     Son valores de partida: probalos en el celular y ajustalos.
       filterMinCF  más BAJO  → menos temblor, pero la capa "arrastra" un poco
                    más ALTO  → más reactivo, pero tiembla más
                    (MindAR por defecto: 0.001)
       filterBeta   más ALTO  → menos retraso cuando movés rápido el celular
                    más BAJO  → más suavizado en movimiento
                    (MindAR por defecto: 1000)
       missTolerance   cuadros seguidos sin detectar antes de dar el marcador
                       por perdido (más alto = menos parpadeo). Defecto: 5
       warmupTolerance cuadros seguidos detectando antes de mostrar la capa
                       (más alto = menos falsos positivos). Defecto: 5
     ------------------------------------------------------------------- */
  const TRACKING = {
    filterMinCF: 0.0002,
    filterBeta: 5000,
    missTolerance: 12,
    warmupTolerance: 6
  };

  /* -------------------------------------------------------------------
     5. ANIMACIÓN INICIAL (milisegundos)
     Cada tramo es [cuándo empieza, cuánto dura], contado desde que se
     detecta el marcador por primera vez.
       plano        aparece primero, solo, la copia del plano de 1824
       contorno     después se resalta el casco histórico (traza de 1824)
       trazado      fade-in suave del trazado actual alrededor del plano
       puntos       aparecen al final
     ------------------------------------------------------------------- */
  const ANIMACION = {
    plano:    [0, 800],
    contorno: [1400, 900],
    trazado:  [3200, 2600],
    puntos:   [6000, 900]
  };

  /* -------------------------------------------------------------------
     6. VALORES INICIALES DE LA INTERFAZ
     ------------------------------------------------------------------- */
  const UI = {
    opacidadPlanoInicial: 1,   // 0 a 1 · opacidad de la copia del plano de 1824
    opacidadInicial: 0.8,      // 0 a 1 · opacidad del trazado actual al terminar la animación
    escalaInicial: 1,       // 1 = el plano viejo encaja en su lugar dentro del mapa nuevo
    escalaMin: 0.25,
    escalaMax: 1.5,
    escalaPaso: 0.05
  };

  /* -------------------------------------------------------------------
     7. ASPECTO DE LAS CAPAS
     ------------------------------------------------------------------- */
  // Casco histórico (traza de 1824). El grosor está en píxeles de una
  // textura de 1024 px de ancho.
  const CONTORNO = {
    grosor: 12,
    colorLinea: '#E9B949',
    colorBorde: 'rgba(20, 32, 43, 0.9)',    // borde oscuro para que se lea sobre cualquier fondo
    relleno: 'rgba(233, 185, 73, 0.14)'     // tinte suave dentro de la zona ('' = sin relleno)
  };

  // Puntos de interés (medidas en unidades de MindAR: 1 = ancho del plano viejo)
  const PUNTOS = {
    tamano: 0.07,       // diámetro del marcador visible
    areaToque: 0.14     // zona sensible al toque (más grande que el marcador, para dedos)
  };

  // Altura (eje Z) de cada capa sobre el marcador, de abajo hacia arriba:
  // trazado actual → plano de 1824 (un poco más cerca de la cámara) → contorno → puntos.
  // El orden de dibujo también está fijado en app.js (renderOrder). No hace falta tocar.
  const Z = { actual: 0.002, plano: 0.004, contorno: 0.006, puntos: 0.008 };

  /* -------------------------------------------------------------------
     8. RENDIMIENTO
     Si una imagen supera este lado máximo (o el que soporte el celular),
     se reduce automáticamente al cargarla.
     ------------------------------------------------------------------- */
  const RENDIMIENTO = { maxLadoTextura: 4096 };

  /* -------------------------------------------------------------------
     9. TEXTOS DE LAS LEYENDAS DE LA ANIMACIÓN
     ------------------------------------------------------------------- */
  const TEXTOS = {
    leyendaVieja:  'Plano de Marcos Sastre, 1824',
    leyendaCasco:  'Casco histórico (traza de 1824)',
    leyendaActual: 'Santa Fe hoy',
    leyendaPuntos: 'Tocá un punto para saber más'
  };

  /* -------------------------------------------------------------------
     No tocar de acá para abajo: se arma el objeto final.
     ------------------------------------------------------------------- */
  window.CONFIG = {
    ARCHIVOS, TRACKING, ANIMACION, UI, CONTORNO, PUNTOS, Z, RENDIMIENTO, TEXTOS,
    altoMarcador: PLANO_VIEJO.h / PLANO_VIEJO.w,   // el marcador mide 1 de ancho y esto de alto
    capas: {
      actual: calcularCapa(MAPA_ACTUAL)
    }
  };
})();
