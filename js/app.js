/* =====================================================================
   Realidad aumentada · Plano de Sastre (1824) + Santa Fe actual
   Lógica principal. Las constantes que se ajustan están en config.js
   ===================================================================== */
(function () {
  'use strict';

  const C = window.CONFIG;
  const THREE = AFRAME.THREE;
  const $ = (sel) => document.querySelector(sel);

  // Si la persona pidió menos movimiento en su sistema, las animaciones se acortan.
  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FACTOR_TIEMPO = reducirMovimiento ? 0.25 : 1;

  /* ------------------------------------------------------------------
     ESTADO
     Todo lo que se ve en pantalla sale de acá (ver aplicarEstado).
     Como vive en JS y no en la escena, se conserva si se pierde el marcador.
     ------------------------------------------------------------------ */
  const estado = {
    marcadorVisible: false,
    vistoAlgunaVez: false,
    introIniciada: false,
    opacidad: C.UI.opacidadInicial,       // opacidad del trazado actual (slider)
    opacidadPlano: C.UI.opacidadPlanoInicial,  // opacidad de la copia del plano de 1824 (slider)
    escala: C.UI.escalaInicial,           // escala de la capa nueva (slider)
    // "casco" = casco histórico (contorno de la traza de 1824); activo por defecto
    capas: { actual: true, casco: true, puntos: true },
    prog: { plano: 0, contorno: 0, actual: 0, puntos: 0 },            // avance 0..1 de la animación
    puntos: [],                           // [{ datos, mesh, hit }]
    puntoActivo: null
  };

  // Objetos de la escena (se llenan en construirCapas)
  const objs = { grupoNuevas: null, plano: null, actual: null, contorno: null };

  let escena = null;
  let renderer = null;
  const hits = [];                        // mallas invisibles que reciben el toque
  const texturasPunto = {};               // { normal, activo }

  /* ------------------------------------------------------------------
     ESCENA A-FRAME + MINDAR
     Se inyecta desde acá para que los valores de tracking salgan de config.js
     ------------------------------------------------------------------ */
  function crearEscena() {
    const T = C.TRACKING;
    const html = `
      <a-scene id="escena"
        mindar-image="imageTargetSrc: ${C.ARCHIVOS.target};
                      autoStart: false; maxTrack: 1;
                      filterMinCF: ${T.filterMinCF}; filterBeta: ${T.filterBeta};
                      missTolerance: ${T.missTolerance}; warmupTolerance: ${T.warmupTolerance};
                      uiLoading: no; uiScanning: no; uiError: no;"
        color-space="sRGB"
        renderer="colorManagement: true, physicallyCorrectLights"
        vr-mode-ui="enabled: false"
        device-orientation-permission-ui="enabled: false"
        loading-screen="enabled: false">
        <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
        <a-entity id="target" mindar-image-target="targetIndex: 0">
          <a-entity id="capas-nuevas"></a-entity>
        </a-entity>
      </a-scene>`;
    document.body.insertAdjacentHTML('afterbegin', html);
    return $('#escena');
  }

  function esperarEscena(el) {
    return new Promise((resolve) => {
      if (el.hasLoaded) resolve();
      else el.addEventListener('loaded', resolve, { once: true });
    });
  }

  /* ------------------------------------------------------------------
     TEXTURAS
     ------------------------------------------------------------------ */
  function cargarImagen(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar ' + url));
      img.src = url;
    });
  }

  function configurarTextura(tex) {
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    return tex;
  }

  // Carga un PNG como textura. Si es más grande de lo que soporta el celular, lo reduce.
  async function cargarTextura(url) {
    const img = await cargarImagen(url);
    const maximo = Math.min(renderer.capabilities.maxTextureSize, C.RENDIMIENTO.maxLadoTextura);
    const lado = Math.max(img.naturalWidth, img.naturalHeight);
    let fuente = img;
    if (lado > maximo) {
      const k = maximo / lado;
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.naturalWidth * k);
      lienzo.height = Math.round(img.naturalHeight * k);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      fuente = lienzo;
      console.warn(`[AR] ${url} se redujo de ${img.naturalWidth}×${img.naturalHeight} a ${lienzo.width}×${lienzo.height}`);
    }
    return configurarTextura(new THREE.Texture(fuente));
  }

  // Plano transparente que arranca invisible (opacidad 0)
  function crearPlano(ancho, alto, textura, ordenRender) {
    const material = new THREE.MeshBasicMaterial({
      map: textura,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,        // el orden lo define renderOrder, así no hay parpadeos entre capas
      toneMapped: false
    });
    const malla = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), material);
    malla.renderOrder = ordenRender;
    malla.visible = false;
    return malla;
  }

  // Casco histórico: la zona del plano de 1824, dibujada por código
  // (tinte suave + marco con borde oscuro y línea ocre)
  function texturaMarco() {
    const ancho = 1024;
    const alto = Math.round(ancho * C.altoMarcador);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    const g = C.CONTORNO.grosor;
    const m = g * 1.5;
    ctx.lineJoin = 'round';
    if (C.CONTORNO.relleno) {
      ctx.fillStyle = C.CONTORNO.relleno;
      ctx.fillRect(m, m, ancho - 2 * m, alto - 2 * m);
    }
    ctx.strokeStyle = C.CONTORNO.colorBorde;
    ctx.lineWidth = g * 2;
    ctx.strokeRect(m, m, ancho - 2 * m, alto - 2 * m);
    ctx.strokeStyle = C.CONTORNO.colorLinea;
    ctx.lineWidth = g;
    ctx.strokeRect(m, m, ancho - 2 * m, alto - 2 * m);
    return configurarTextura(new THREE.CanvasTexture(lienzo));
  }

  // Marcador de un punto de interés (normal / seleccionado)
  function texturaPunto(activo) {
    const t = 128, c = t / 2;
    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = t;
    const ctx = lienzo.getContext('2d');
    const circulo = (r, color) => { ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); };
    circulo(62, 'rgba(20, 32, 43, 0.95)');                       // borde oscuro exterior
    circulo(54, activo ? '#E9B949' : '#F4EDDD');                 // aro claro (ocre si está activo)
    circulo(42, '#14202B');                                      // centro oscuro
    circulo(16, activo ? '#F4EDDD' : '#E9B949');                 // punto central
    return configurarTextura(new THREE.CanvasTexture(lienzo));
  }

  /* ------------------------------------------------------------------
     CONSTRUCCIÓN DE CAPAS
     ------------------------------------------------------------------ */
  async function construirCapas() {
    renderer = escena.renderer;
    objs.grupoNuevas = $('#capas-nuevas').object3D;

    // Casco histórico = zona que ocupa el plano de 1824 dentro del trazado actual.
    // Va dentro del grupo de capas nuevas, así acompaña al mapa cuando cambia la escala
    // y siempre marca la zona correcta. Centrado en el origen (el centro del plano viejo).
    objs.contorno = crearPlano(1, C.altoMarcador, texturaMarco(), 30);
    objs.contorno.position.set(0, 0, C.Z.contorno);
    objs.grupoNuevas.add(objs.contorno);

    // Trazado actual (obligatorio: si falla, se corta todo)
    const cA = C.capas.actual;
    objs.actual = crearPlano(cA.ancho, cA.alto, await cargarTextura(C.ARCHIVOS.trazado), 10);
    objs.actual.position.set(cA.x, cA.y, C.Z.actual);
    objs.grupoNuevas.add(objs.actual);

    // Copia digital del plano de 1824: exactamente sobre el marcador (1 de ancho),
    // un poco más cerca de la cámara que el trazado actual. Va directo en el marcador
    // (fuera del grupo escalable), así siempre queda calzada con el papel.
    const texPlano = await cargarTextura(C.ARCHIVOS.plano);
    const proporcion = texPlano.image.height / texPlano.image.width;
    if (Math.abs(proporcion - C.altoMarcador) / C.altoMarcador > 0.01) {
      console.warn(`[AR] plano-1824.png tiene proporción ${proporcion.toFixed(3)} y el marcador ${C.altoMarcador.toFixed(3)}: se va a ver deformado.`);
    }
    objs.plano = crearPlano(1, C.altoMarcador, texPlano, 20);
    objs.plano.position.set(0, 0, C.Z.plano);
    $('#target').object3D.add(objs.plano);

    // Puntos de interés (opcional)
    if (C.ARCHIVOS.puntos) {
      try { await construirPuntos(); }
      catch (e) { console.warn('[AR] Puntos de interés no disponibles.', e); }
    }
    if (!estado.puntos.length) deshabilitarCapa('puntos');

    aplicarEstado();
  }

  /* Formato de puntos.json: { "puntos": [ { "id", "nombre", "descripcion", "x", "y" } ] }
     x e y van de 0 a 1 sobre la imagen trazado-actual.png (0,0 = arriba a la izquierda). */
  async function construirPuntos() {
    const resp = await fetch(C.ARCHIVOS.puntos, { cache: 'no-cache' });
    if (!resp.ok) throw new Error('puntos.json: HTTP ' + resp.status);
    const json = await resp.json();
    const lista = Array.isArray(json) ? json : (json.puntos || []);

    texturasPunto.normal = texturaPunto(false);
    texturasPunto.activo = texturaPunto(true);
    const cA = C.capas.actual;

    lista.forEach((datos) => {
      const px = cA.x + (datos.x - 0.5) * cA.ancho;
      const py = cA.y + (0.5 - datos.y) * cA.alto;

      const malla = crearPlano(C.PUNTOS.tamano, C.PUNTOS.tamano, texturasPunto.normal, 40);
      malla.position.set(px, py, C.Z.puntos);
      objs.grupoNuevas.add(malla);

      // Zona de toque más grande que el dibujo; no se ve (material invisible) pero recibe el rayo
      const zona = new THREE.Mesh(
        new THREE.PlaneGeometry(C.PUNTOS.areaToque, C.PUNTOS.areaToque),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      zona.position.set(px, py, C.Z.puntos);
      zona.userData.punto = datos;
      objs.grupoNuevas.add(zona);

      estado.puntos.push({ datos, mesh: malla, hit: zona });
      hits.push(zona);
    });
  }

  function deshabilitarCapa(clave) {
    estado.capas[clave] = false;
    const boton = document.querySelector(`[data-capa="${clave}"]`);
    if (boton) {
      boton.disabled = true;
      boton.setAttribute('aria-pressed', 'false');
      boton.title = 'No disponible';
    }
  }

  /* ------------------------------------------------------------------
     APLICAR ESTADO → ESCENA
     Único lugar que toca opacidades, visibilidad y escala.
     ------------------------------------------------------------------ */
  function poner(malla, opacidad) {
    if (!malla) return;
    malla.material.opacity = opacidad;
    malla.visible = opacidad > 0.003;
  }

  function aplicarEstado() {
    const p = estado.prog;
    poner(objs.actual, estado.capas.actual ? p.actual * estado.opacidad : 0);
    poner(objs.plano, p.plano * estado.opacidadPlano);
    poner(objs.contorno, estado.capas.casco ? p.contorno : 0);   // casco histórico
    const opPuntos = estado.capas.puntos ? p.puntos : 0;
    estado.puntos.forEach((pt) => poner(pt.mesh, opPuntos));
    // La escala afecta al trazado actual, al casco histórico y a los puntos;
    // la copia del plano de 1824 queda fija sobre el marcador.
    if (objs.grupoNuevas) objs.grupoNuevas.scale.setScalar(estado.escala);
  }

  /* ------------------------------------------------------------------
     ANIMACIÓN INICIAL (una sola vez, la primera vez que se detecta el plano)
     ------------------------------------------------------------------ */
  const suavizar = (x) => x * x * (3 - 2 * x);                    // arranque y llegada suaves
  const programar = (ms, fn) => setTimeout(fn, ms * FACTOR_TIEMPO);

  function iniciarIntro() {
    estado.introIniciada = true;
    const A = C.ANIMACION;
    const tramos = { plano: A.plano, contorno: A.contorno, actual: A.trazado, puntos: A.puntos };
    const t0 = performance.now();

    function paso(ahora) {
      const t = (ahora - t0) / FACTOR_TIEMPO;
      let termino = true;
      for (const clave in tramos) {
        const [inicio, duracion] = tramos[clave];
        const x = Math.min(1, Math.max(0, (t - inicio) / duracion));
        estado.prog[clave] = suavizar(x);
        if (x < 1) termino = false;
      }
      aplicarEstado();
      if (!termino) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);

    // Leyendas que acompañan la secuencia
    leyenda(C.TEXTOS.leyendaVieja);
    programar(A.contorno[0], () => leyenda(C.TEXTOS.leyendaCasco));
    programar(A.trazado[0], () => leyenda(C.TEXTOS.leyendaActual));
    programar(A.puntos[0] + A.puntos[1], () => {
      if (estado.puntos.length) {
        leyenda(C.TEXTOS.leyendaPuntos);
        programar(4000, () => leyenda(null));
      } else {
        leyenda(null);
      }
    });
  }

  function leyenda(texto) {
    const el = $('#leyenda');
    if (!texto) { el.hidden = true; return; }
    el.textContent = texto;
    el.hidden = false;
  }

  /* ------------------------------------------------------------------
     PUNTOS DE INTERÉS: toque → panel
     Escuchamos en document (y no en el canvas) porque MindAR deja el
     canvas detrás de la página; ignoramos los toques sobre la interfaz.
     ------------------------------------------------------------------ */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let toqueInicial = null;

  const esInterfaz = (el) => !!(el && el.closest && el.closest('.interactivo'));

  document.addEventListener('pointerdown', (e) => {
    toqueInicial = esInterfaz(e.target) ? null : { x: e.clientX, y: e.clientY, t: performance.now() };
  });

  document.addEventListener('pointerup', (e) => {
    if (!toqueInicial) return;
    const { x, y, t } = toqueInicial;
    toqueInicial = null;
    const movio = Math.hypot(e.clientX - x, e.clientY - y) > 12;
    const largo = performance.now() - t > 700;
    if (!movio && !largo) manejarToque(e.clientX, e.clientY);
  });

  function manejarToque(cx, cy) {
    const puntosActivos = estado.capas.puntos && estado.prog.puntos > 0.5 && hits.length;
    if (!estado.marcadorVisible || !puntosActivos || !escena.camera) return;
    const r = escena.canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    escena.camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, escena.camera);
    const golpes = raycaster.intersectObjects(hits, false);
    if (golpes.length) abrirPunto(golpes[0].object.userData.punto);
  }

  function marcarPunto(datos) {
    estado.puntos.forEach((pt) => {
      pt.mesh.material.map = (pt.datos === datos) ? texturasPunto.activo : texturasPunto.normal;
    });
  }

  function abrirPunto(datos) {
    estado.puntoActivo = datos;
    marcarPunto(datos);
    $('#hoja-titulo').textContent = datos.nombre || '';
    $('#hoja-texto').textContent = datos.descripcion || '';
    $('#hoja').hidden = false;
  }

  function cerrarPunto() {
    estado.puntoActivo = null;
    marcarPunto(null);
    $('#hoja').hidden = true;
  }

  /* ------------------------------------------------------------------
     PANTALLAS DE ESTADO (cargando / error)
     ------------------------------------------------------------------ */
  function mostrarCargando(texto) {
    $('#inicio').hidden = true;
    $('#estado-titulo').textContent = 'Un momento';
    $('#estado-texto').textContent = texto;
    $('#estado .spinner').hidden = false;
    $('#btn-reintentar').hidden = true;
    $('#estado').hidden = false;
  }

  function mostrarError(titulo, texto) {
    $('#inicio').hidden = true;
    $('#estado-titulo').textContent = titulo;
    $('#estado-texto').textContent = texto;
    $('#estado .spinner').hidden = true;
    $('#btn-reintentar').hidden = false;
    $('#estado').hidden = false;
  }

  /* ------------------------------------------------------------------
     INICIO: botón "Comenzar" → permiso de cámara
     ------------------------------------------------------------------ */
  let capasListas = null;   // promesa: { ok: true } o { ok: false, error }

  async function comenzar() {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      mostrarError('No se puede usar la cámara',
        'Este navegador no permite acceder a la cámara en esta página. Abrila desde el enlace https del QR, con Chrome o Safari actualizados.');
      return;
    }
    mostrarCargando('Cargando el mapa…');
    const res = await capasListas;
    if (!res.ok) {
      console.error('[AR]', res.error);
      mostrarError('No se pudo cargar el mapa', 'Revisá tu conexión y volvé a intentar.');
      return;
    }
    $('#estado-texto').textContent = 'Aceptá el permiso de cámara para continuar.';
    try {
      escena.systems['mindar-image-system'].start();
    } catch (e) {
      console.error('[AR]', e);
      mostrarError('No se pudo iniciar la cámara', 'Cerrá y volvé a abrir la página.');
    }
  }

  /* ------------------------------------------------------------------
     CONTROLES
     ------------------------------------------------------------------ */
  function prepararControles() {
    const rngOpacidad = $('#rng-opacidad');
    const rngEscala = $('#rng-escala');
    const rngPlano = $('#rng-plano');

    rngOpacidad.value = Math.round(C.UI.opacidadInicial * 100);
    rngPlano.value = Math.round(C.UI.opacidadPlanoInicial * 100);
    rngEscala.min = Math.round(C.UI.escalaMin * 100);
    rngEscala.max = Math.round(C.UI.escalaMax * 100);
    rngEscala.step = Math.round(C.UI.escalaPaso * 100);
    rngEscala.value = Math.round(C.UI.escalaInicial * 100);

    function leerSliders() {
      estado.opacidad = rngOpacidad.value / 100;
      estado.opacidadPlano = rngPlano.value / 100;
      estado.escala = rngEscala.value / 100;
      $('#val-opacidad').textContent = rngOpacidad.value + ' %';
      $('#val-plano').textContent = rngPlano.value + ' %';
      $('#val-escala').textContent = rngEscala.value + ' %';
      aplicarEstado();
    }
    rngOpacidad.addEventListener('input', leerSliders);
    rngPlano.addEventListener('input', leerSliders);
    rngEscala.addEventListener('input', leerSliders);
    leerSliders();

    // Botones de capas (toggle)
    document.querySelectorAll('[data-capa]').forEach((boton) => {
      boton.addEventListener('click', () => {
        const clave = boton.dataset.capa;
        estado.capas[clave] = !estado.capas[clave];
        boton.setAttribute('aria-pressed', String(estado.capas[clave]));
        if (clave === 'puntos' && !estado.capas[clave]) cerrarPunto();
        aplicarEstado();
      });
    });

    // Restablecer vista
    $('#btn-restablecer').addEventListener('click', () => {
      rngOpacidad.value = Math.round(C.UI.opacidadInicial * 100);
      rngPlano.value = Math.round(C.UI.opacidadPlanoInicial * 100);
      rngEscala.value = Math.round(C.UI.escalaInicial * 100);
      document.querySelectorAll('[data-capa]').forEach((boton) => {
        const clave = boton.dataset.capa;
        const disponible = !boton.disabled;
        estado.capas[clave] = disponible;
        boton.setAttribute('aria-pressed', String(disponible));
      });
      cerrarPunto();
      leerSliders();
    });

    // Mostrar / ocultar el panel de controles
    const boton = $('#btn-controles');
    boton.addEventListener('click', () => {
      const colapsado = $('#panel').classList.toggle('colapsado');
      boton.setAttribute('aria-expanded', String(!colapsado));
      boton.textContent = colapsado ? 'Mostrar controles' : 'Ocultar controles';
    });

    $('#btn-cerrar-hoja').addEventListener('click', cerrarPunto);
    $('#btn-comenzar').addEventListener('click', comenzar);
    $('#btn-reintentar').addEventListener('click', () => location.reload());
  }

  /* ------------------------------------------------------------------
     ARRANQUE
     ------------------------------------------------------------------ */
  function iniciar() {
    escena = crearEscena();
    prepararControles();

    // Mientras la persona lee la portada, ya vamos cargando las imágenes
    capasListas = esperarEscena(escena)
      .then(construirCapas)
      .then(() => ({ ok: true }))
      .catch((error) => ({ ok: false, error }));

    escena.addEventListener('arReady', () => {
      $('#estado').hidden = true;
      if (!estado.vistoAlgunaVez) $('#buscando').hidden = false;
    });

    escena.addEventListener('arError', () => {
      mostrarError('No pudimos acceder a la cámara',
        'Revisá que hayas dado el permiso en el navegador (en el candado de la barra de direcciones) y volvé a intentar.');
    });

    const marcador = $('#target');

    marcador.addEventListener('targetFound', () => {
      estado.marcadorVisible = true;
      estado.vistoAlgunaVez = true;
      $('#buscando').hidden = true;
      $('#aviso-perdido').hidden = true;
      $('#panel').hidden = false;
      if (!estado.introIniciada) iniciarIntro();
    });

    // Al perderlo no tocamos el estado: sliders, capas y punto abierto quedan como estaban
    marcador.addEventListener('targetLost', () => {
      estado.marcadorVisible = false;
      $('#aviso-perdido').hidden = false;
    });
  }

  iniciar();
})();
