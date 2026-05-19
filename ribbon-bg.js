/**
 * ribbon-bg.js
 * WebGL ambient ribbon background effect — IIM Rohtak Student Operations.
 *
 * Ported from the RibbonShowcase React/OGL component to a pure vanilla-JS
 * ES-module, loaded via <script type="module">. Injects a canvas into the
 * existing #app-bg element so it sits behind all UI at zero pointer-events cost.
 *
 * Config is tuned for a professional dashboard context:
 *   - Brand accent palette  (#3b5bdb / #4c6ef5 / #7c3aed)
 *   - Low container opacity (0.13 light / 0.18 dark) — atmospheric, not distracting
 *   - enableFade: true   — ribbons dissolve gracefully at the tail
 *   - enableShaderEffect: false — keeps frame-rate smooth on large displays
 */

import {
  Renderer,
  Transform,
  Vec3,
  Color,
  Polyline,
} from 'https://cdn.jsdelivr.net/npm/ogl@0.0.117/src/index.js';

// ─── Configuration ────────────────────────────────────────────────────────────
const CONFIG = {
  colors:             ['#3b5bdb', '#4c6ef5', '#7c3aed'],
  baseSpring:         0.028,
  baseFriction:       0.88,
  baseThickness:      20,
  offsetFactor:       0.07,
  maxAge:             520,
  pointCount:         50,
  speedMultiplier:    0.52,
  enableFade:         true,
  enableShaderEffect: false,
  effectAmplitude:    2.0,
  backgroundColor:    [0, 0, 0, 0],
  /** Opacity of the wrapper div (light / dark mode) */
  opacityLight:       0.13,
  opacityDark:        0.20,
};

// ─── Skip on touch-only / reduced-motion devices ──────────────────────────────
if (
  !('ontouchstart' in window) &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches
) {
  initRibbonBackground();
}

// ─── Main entry ───────────────────────────────────────────────────────────────
function initRibbonBackground() {
  const appBg = document.getElementById('app-bg');
  if (!appBg) return;

  // Wrapper div — inherits opacity from data-theme
  const wrapper = document.createElement('div');
  wrapper.id = 'ribbon-bg-wrapper';
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.cssText =
    'position:absolute;inset:0;pointer-events:none;z-index:0;' +
    'opacity:' + CONFIG.opacityLight + ';' +
    'transition:opacity 0.5s ease;';
  appBg.insertBefore(wrapper, appBg.firstChild);

  // React to dark-mode toggle — bump opacity so ribbons stay visible
  function syncOpacity() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    wrapper.style.opacity = dark ? CONFIG.opacityDark : CONFIG.opacityLight;
  }

  const themeObserver = new MutationObserver(syncOpacity);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ─── OGL Renderer ───────────────────────────────────────────────────────────
  const renderer = new Renderer({
    dpr:   Math.min(window.devicePixelRatio || 2, 2),
    alpha: true,
  });
  const gl = renderer.gl;
  gl.clearColor(...CONFIG.backgroundColor);

  Object.assign(gl.canvas.style, {
    position: 'absolute',
    top:      '0',
    left:     '0',
    width:    '100%',
    height:   '100%',
  });
  wrapper.appendChild(gl.canvas);

  // ─── GLSL Shaders ───────────────────────────────────────────────────────────
  const vertex = /* glsl */`
    precision highp float;

    attribute vec3 position;
    attribute vec3 next;
    attribute vec3 prev;
    attribute vec2 uv;
    attribute float side;

    uniform vec2  uResolution;
    uniform float uDPR;
    uniform float uThickness;
    uniform float uTime;
    uniform float uEnableShaderEffect;
    uniform float uEffectAmplitude;

    varying vec2 vUV;

    vec4 getPosition() {
      vec4  current     = vec4(position, 1.0);
      vec2  aspect      = vec2(uResolution.x / uResolution.y, 1.0);
      vec2  nextScreen  = next.xy * aspect;
      vec2  prevScreen  = prev.xy * aspect;
      vec2  tangent     = normalize(nextScreen - prevScreen);
      vec2  normal      = vec2(-tangent.y, tangent.x);
      normal /= aspect;
      normal *= mix(1.0, 0.1, pow(abs(uv.y - 0.5) * 2.0, 2.0));
      float dist        = length(nextScreen - prevScreen);
      normal *= smoothstep(0.0, 0.02, dist);
      float pixelRatio  = 1.0 / (uResolution.y / uDPR);
      float pixelWidth  = current.w * pixelRatio;
      normal           *= pixelWidth * uThickness;
      current.xy       -= normal * side;
      if (uEnableShaderEffect > 0.5) {
        current.xy += normal * sin(uTime + current.x * 10.0) * uEffectAmplitude;
      }
      return current;
    }

    void main() {
      vUV          = uv;
      gl_Position  = getPosition();
    }
  `;

  const fragment = /* glsl */`
    precision highp float;

    uniform vec3  uColor;
    uniform float uOpacity;
    uniform float uEnableFade;

    varying vec2 vUV;

    void main() {
      float fade = 1.0;
      if (uEnableFade > 0.5) {
        fade = 1.0 - smoothstep(0.0, 1.0, vUV.y);
      }
      gl_FragColor = vec4(uColor, uOpacity * fade);
    }
  `;

  // ─── Build ribbon lines ──────────────────────────────────────────────────────
  const scene  = new Transform();
  const lines  = [];
  const center = (CONFIG.colors.length - 1) / 2;

  CONFIG.colors.forEach((hex, idx) => {
    const spring    = CONFIG.baseSpring    + (Math.random() - 0.5) * 0.01;
    const friction  = CONFIG.baseFriction  + (Math.random() - 0.5) * 0.02;
    const thickness = CONFIG.baseThickness + (Math.random() - 0.5) * 3;
    const offset    = new Vec3(
      (idx - center) * CONFIG.offsetFactor + (Math.random() - 0.5) * 0.01,
      (Math.random() - 0.5) * 0.10,
      0,
    );

    const points = Array.from({ length: CONFIG.pointCount }, () => new Vec3());

    const polyline = new Polyline(gl, {
      points,
      vertex,
      fragment,
      uniforms: {
        uColor:             { value: new Color(hex)                        },
        uThickness:         { value: thickness                             },
        uOpacity:           { value: 1.0                                   },
        uTime:              { value: 0.0                                   },
        uEnableShaderEffect:{ value: CONFIG.enableShaderEffect ? 1.0 : 0.0 },
        uEffectAmplitude:   { value: CONFIG.effectAmplitude                },
        uEnableFade:        { value: CONFIG.enableFade ? 1.0 : 0.0        },
      },
    });
    polyline.mesh.setParent(scene);

    lines.push({
      spring,
      friction,
      mouseVelocity: new Vec3(),
      mouseOffset:   offset,
      points,
      polyline,
    });
  });

  // ─── Resize ─────────────────────────────────────────────────────────────────
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    lines.forEach(l => l.polyline.resize());
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // ─── Mouse / touch tracking (global — works across the whole dashboard) ──────
  const mouse = new Vec3(-2, -2, 0); // park off-screen initially

  function updateMouse(e) {
    let cx, cy;
    if (e.changedTouches && e.changedTouches.length) {
      cx = e.changedTouches[0].clientX;
      cy = e.changedTouches[0].clientY;
    } else {
      cx = e.clientX;
      cy = e.clientY;
    }
    mouse.set(
      (cx / window.innerWidth)  *  2 - 1,
      (cy / window.innerHeight) * -2 + 1,
      0,
    );
  }
  window.addEventListener('mousemove',  updateMouse, { passive: true });
  window.addEventListener('touchstart', updateMouse, { passive: true });
  window.addEventListener('touchmove',  updateMouse, { passive: true });

  // ─── Animation loop ──────────────────────────────────────────────────────────
  let frameId;
  let lastTime = performance.now();
  let pageHidden = false;
  document.addEventListener('visibilitychange', () => { pageHidden = document.hidden; });

  function tick() {
    frameId = requestAnimationFrame(tick);
    if (pageHidden) return;

    const now = performance.now();
    const dt  = now - lastTime;
    lastTime  = now;

    lines.forEach(line => {
      // Spring-damper: pull point[0] toward mouse
      const tmp = new Vec3();
      tmp.copy(mouse)
         .add(line.mouseOffset)
         .sub(line.points[0])
         .multiply(line.spring);
      line.mouseVelocity.add(tmp).multiply(line.friction);
      line.points[0].add(line.mouseVelocity);

      // Trail: each subsequent point chases the one before it
      for (let i = 1; i < line.points.length; i++) {
        const segDelay = CONFIG.maxAge / (line.points.length - 1);
        const alpha    = Math.min(1, (dt * CONFIG.speedMultiplier) / segDelay);
        line.points[i].lerp(line.points[i - 1], alpha);
      }

      if (line.polyline.mesh.program.uniforms.uTime) {
        line.polyline.mesh.program.uniforms.uTime.value = now * 0.001;
      }
      line.polyline.updateGeometry();
    });

    renderer.render({ scene });
  }
  tick();

  // Expose a teardown for HMR / SPAs (not needed here but good practice)
  window.__ribbonBgCleanup = function () {
    cancelAnimationFrame(frameId);
    window.removeEventListener('resize',      resize);
    window.removeEventListener('mousemove',   updateMouse);
    window.removeEventListener('touchstart',  updateMouse);
    window.removeEventListener('touchmove',   updateMouse);
    themeObserver.disconnect();
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  };
}
