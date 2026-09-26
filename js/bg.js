/* Still v3 — the backdrop shader: the real sky gradient (fed by sky.js) with aurora curtains
   and the minute shockwave */
window.BG = (() => {
  const cv = document.getElementById('bg');
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
  let skip = false;
  const V = { a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0] }, TGT = {};
  let U = {}, time = 0, pulse = 0, pulsePos = [0, 0], mouse = [0, 0], mouseT = [0, 0], energy = 0;
  let SK = { zen: [0, 0, 0.02], hor: [0.02, 0.03, 0.08], sunP: [0, -1], sunC: [0, 0, 0], sunA: 0, horY: 0.25, aur: 1 };

  const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const fs = `
precision highp float;
uniform vec2 uRes, uMouse, uPulsePos, uSunP;
uniform float uTime, uPulse, uEnergy, uSunA, uHorY, uAur, uOct;
uniform vec3 uA, uB, uC, uZen, uHor, uSunC;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y);
}
const mat2 M = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ if (float(i) >= uOct) break; v += a*n(p); p = M*p; a *= .5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - .5*uRes) / uRes.y;
  vec2 dp = p - uPulsePos; float d = length(dp);
  float ring = (1.-uPulse) * 1.6;
  float rip = sin((d - ring) * 26.) * uPulse * exp(-abs(d - ring) * 6.) * .05;
  p += dp / (d + 1e-3) * rip;

  /* the real sky: horizon-to-zenith gradient and the glow of the sun (or moon) */
  float above = clamp((uv.y - uHorY) / max(.05, 1. - uHorY), 0., 1.);
  vec3 sky = mix(uHor, uZen, pow(above, .5));
  float sd = length(p - uSunP);
  sky += uSunC * (exp(-sd * 2.2) * .45 + exp(-sd * 9.) * .6 + exp(-sd * 40.) * .8) * uSunA;
  sky += uHor * exp(-abs(uv.y - uHorY) * 14.) * .3;

  /* aurora curtains, strongest in the dark */
  vec2 ap = p + uMouse * .06;
  float t = uTime * .035;
  vec2 q = vec2(fbm(ap*1.2 + vec2(0., t)), fbm(ap*1.2 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(ap*1.5 + 3.2*q + vec2(1.7, 9.2) + t*1.4), fbm(ap*1.5 + 3.2*q + vec2(8.3, 2.8) - t*1.2));
  float f = fbm(ap*1.1 + 2.6*r);
  vec3 col = mix(uA, uB, clamp(q.x*1.5 - .2, 0., 1.));
  col = mix(col, uC, clamp(r.y*r.y*1.8 - .15, 0., 1.));
  float curtain = pow(smoothstep(.25, .95, f), 1.6);
  float wave = .22 + .2*sin(ap.x*1.7 + t*4. + f*3.);
  float band = exp(-pow((ap.y - wave) * 2.6, 2.)) * smoothstep(.2, .8, f);
  float lum = (curtain*.45 + band*.8) * smoothstep(uHorY - .02, uHorY + .25, uv.y);
  vec3 c = sky + col * lum * (.55 + uEnergy*.7) * uAur;

  c += mix(uA, uC, .5) * uPulse * exp(-abs(d - ring) * 5.) * .35;
  float v = length(uv - .5); c *= 1. - .35*v*v;
  gl_FragColor = vec4(c, 1.);
}`;

  let ok = !!gl;
  if (ok) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); ok = false; } return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (ok && gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ['uRes', 'uMouse', 'uPulsePos', 'uSunP', 'uTime', 'uPulse', 'uEnergy', 'uSunA', 'uHorY', 'uAur', 'uOct', 'uA', 'uB', 'uC', 'uZen', 'uHor', 'uSunC']
        .forEach(k => U[k] = gl.getUniformLocation(prog, k));
    } else ok = false;
  }
  if (!ok) document.body.classList.add('no-gl');

  const f3 = h => Col.rgb(h).map(v => v / 255);
  function palette(p, instant) {
    TGT.a = f3(p.a).map(v => v * 0.85);
    TGT.b = f3(p.b).map(v => v * 0.85);
    TGT.c = f3(p.c).map(v => v * 0.8);
    if (instant) for (const k in TGT) V[k] = TGT[k].slice();
  }

  function resize() {
    const scale = LITE() ? 0.25 : 0.45;
    cv.width = Math.round(innerWidth * scale);
    cv.height = Math.round(innerHeight * scale);
    if (ok) gl.viewport(0, 0, cv.width, cv.height);
  }

  function frame(dt) {
    time += dt / 1000 * (0.4 + MOTION() * 0.6) * (1 + energy * 1.5);
    pulse = Math.max(0, pulse - dt / 1000 * 0.45);
    for (const k in TGT) for (let i = 0; i < 3; i++) V[k][i] += (TGT[k][i] - V[k][i]) * Math.min(1, dt / 500);
    mouse[0] += (mouseT[0] - mouse[0]) * 0.03; mouse[1] += (mouseT[1] - mouse[1]) * 0.03;
    energy += (Sound.level() - energy) * 0.05;
    if (!ok) return;
    if (LITE() && (skip = !skip)) return;
    gl.uniform1f(U.uOct, LITE() ? 3 : 5);
    gl.uniform2f(U.uRes, cv.width, cv.height);
    gl.uniform2f(U.uMouse, mouse[0], mouse[1]);
    gl.uniform2f(U.uPulsePos, pulsePos[0], pulsePos[1]);
    gl.uniform2f(U.uSunP, SK.sunP[0], SK.sunP[1]);
    gl.uniform1f(U.uTime, time + 40);
    gl.uniform1f(U.uPulse, pulse);
    gl.uniform1f(U.uEnergy, energy);
    gl.uniform1f(U.uSunA, SK.sunA); gl.uniform1f(U.uHorY, SK.horY); gl.uniform1f(U.uAur, SK.aur * (Store.get('motion') === 'wild' ? 1.4 : 1));
    gl.uniform3fv(U.uZen, SK.zen); gl.uniform3fv(U.uHor, SK.hor); gl.uniform3fv(U.uSunC, SK.sunC);
    gl.uniform3fv(U.uA, V.a); gl.uniform3fv(U.uB, V.b); gl.uniform3fv(U.uC, V.c);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  addEventListener('pointermove', e => {
    mouseT[0] = (e.clientX / innerWidth - 0.5);
    mouseT[1] = -(e.clientY / innerHeight - 0.5);
  });

  return {
    resize, frame, palette,
    sky(o) { SK = o; },
    pulse(x, y, strength = 1) {
      pulsePos = [(x - innerWidth / 2) / innerHeight, (innerHeight / 2 - y) / innerHeight];
      pulse = Math.min(1, strength);
    },
  };
})();
