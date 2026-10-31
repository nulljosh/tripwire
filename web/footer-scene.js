// Footer scene: an engraved harbour town drawn by one fragment shader, ported from Atlin's FooterScene.jsx.
// Ink is the page's --scene-ink (the app accent), paper is --scene-paper. Animates only while on screen.
(function () {
  var canvas = document.querySelector('canvas.footer-scene');
  var gl = canvas && canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) { if (canvas) canvas.style.display = 'none'; return; }
  var FRAG = `
precision highp float;
uniform vec2 res;
uniform float time;
uniform vec3 paper;
uniform vec3 ink;
uniform float dpr;

float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
}
// Two octaves only: the big shapes a light would actually catch.
float lo(float x) { return noise(x) * 0.5 + noise(x * 2.03) * 0.25; }
float fbm(float x) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(x); x *= 2.03; a *= 0.5; } return v; }

// Ink lines at angle a, spacing s pixels. Returns 1 where ink falls for tone t.
float hatch(vec2 px, float a, float s, float t) {
  float d = abs(fract(dot(px, vec2(cos(a), sin(a))) / s) - 0.5) * 2.0;
  return 1.0 - smoothstep(t - 0.12, t + 0.12, d);
}

// Tone of the scene above the waterline, 0 = paper, 1 = solid ink. kind picks the hatch.
float scene(vec2 uv, out float kind) {
  float x = uv.x * res.x / res.y;
  float back = 0.40 + fbm(x * 0.9 + 4.0) * 0.42;
  float front = 0.31 + fbm(x * 1.8 + 11.0) * 0.20;
  // A skyline in the middle third: towers of hashed height, a few tall ones.
  float col = floor(uv.x * 64.0);
  float band = smoothstep(0.22, 0.32, uv.x) * (1.0 - smoothstep(0.70, 0.82, uv.x));
  float tower = 0.30 + band * (0.04 + pow(hash(col), 2.5) * 0.24);
  kind = 0.0;
  if (uv.y < tower && band > 0.05) {
    kind = 2.0;
    float win = step(0.55, fract(uv.x * 256.0)) * step(0.5, fract(uv.y * 120.0));
    return 0.78 - win * 0.45;
  }
  // Light from the left: slopes facing away from it take more ink.
  float slopeF = (lo(x * 1.8 + 11.08) - lo(x * 1.8 + 10.92)) / 0.16;
  float slopeB = (lo(x * 0.9 + 4.08) - lo(x * 0.9 + 3.92)) / 0.16;
  if (uv.y < front) { kind = 1.0; return clamp(0.45 + slopeF * 0.35 + (front - uv.y) * 0.9, 0.2, 0.9); }
  if (uv.y < back) { kind = 3.0; return clamp(0.24 + slopeB * 0.3 + (back - uv.y) * 0.6, 0.08, 0.7); }
  // Sky: a few soft clouds, barely inked.
  float c = noise2(vec2(x * 2.0 + time * 0.01, uv.y * 5.0));
  return smoothstep(0.62, 0.9, c) * 0.18 * smoothstep(0.55, 0.9, uv.y);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / res;
  float water = 0.30;
  float kind;
  float tone;
  if (uv.y < water) {
    // Mirror the town into the water, broken up by slow ripples.
    float ripple = sin(uv.y * 220.0 - time * 0.8) * 0.004 + (noise2(vec2(uv.x * 40.0, uv.y * 90.0 + time * 0.2)) - 0.5) * 0.01;
    vec2 m = vec2(uv.x + ripple, water + (water - uv.y) * 0.9);
    float depth = uv.y / water;
    tone = scene(m, kind) * 0.45 * depth + 0.06;
    kind = 4.0;
  } else {
    tone = scene(uv, kind);
  }
  float s = 4.0 * dpr;
  float a = kind == 2.0 ? 0.0 : kind == 4.0 ? 1.5708 : kind == 1.0 ? 0.785 : kind == 3.0 ? -0.6 : 0.35;
  float lines = hatch(px, a, s, tone);
  // A cross hatch in the darkest places, like a real engraving.
  lines = max(lines, hatch(px, a + 1.5708, s, tone - 0.55));
  // Fade the whole plate in from the top so it sits under the footer text.
  float fade = smoothstep(1.0, 0.72, uv.y);
  float grain = (hash2(px) - 0.5) * 0.06;
  float amt = clamp(lines * fade + grain * fade, 0.0, 1.0);
  gl_FragColor = vec4(mix(paper, ink, amt), 1.0);
}`;
  var VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  function rgb(css) {
    var c = document.createElement('canvas').getContext('2d'); c.fillStyle = css; var h = c.fillStyle;
    if (h.charAt(0) === '#') return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; });
    return (h.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(function (n) { return +n / 255; });
  }
  var prog = gl.createProgram();
  [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]].forEach(function (s) {
    var sh = gl.createShader(s[0]); gl.shaderSource(sh, s[1]); gl.compileShader(sh); gl.attachShader(prog, sh);
  });
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.style.display = 'none'; return; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  function u(n) { return gl.getUniformLocation(prog, n); }
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches, raf = 0, visible = false, start = performance.now();
  function draw() {
    // ponytail: dpr capped at 2; a 3x phone canvas costs memory for no visible gain.
    var dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    var css = getComputedStyle(canvas);
    gl.uniform2f(u('res'), w, h); gl.uniform1f(u('time'), (performance.now() - start) / 1000); gl.uniform1f(u('dpr'), dpr);
    gl.uniform3fv(u('paper'), rgb(css.getPropertyValue('--scene-paper').trim() || '#fdfdfd'));
    gl.uniform3fv(u('ink'), rgb(css.getPropertyValue('--scene-ink').trim() || '#1a1a1a'));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop() { draw(); if (visible && !still) raf = requestAnimationFrame(loop); }
  new IntersectionObserver(function (e) { visible = e[0].isIntersecting; cancelAnimationFrame(raf); if (visible) loop(); }).observe(canvas);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  draw();
})();
