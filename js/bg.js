/* Still — the backdrop shader: the real sky gradient (fed by sky.js), aurora curtains and the
   minute ripple. The aurora is a stack of glowing sheets at altitude: each screen ray is traced up
   through the layers, so folds stand as tall curtains with vertical rays, and they stay put in the
   sky while the camera drifts. */
window.BG = (() => {
  const cv = document.getElementById('bg');
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
  let skip = false;
  const V = { a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0] }, TGT = {};
  let U = {}, time = 0, pulse = 0, pulsePos = [0, 0], mouse = [0, 0], mouseT = [0, 0], energy = 0, surge = 0;
  let SK = { zen: [0, 0, 0.02], hor: [0.02, 0.03, 0.08], sunP: [0, -1], sunC: [0, 0, 0], sunA: 0, horY: 0.25, aur: 1, yaw: Math.PI };

  const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const fs = `
precision highp float;
uniform vec2 uRes, uMouse, uPulsePos, uSunP;
uniform float uTime, uPulse, uEnergy, uSunA, uHorY, uAur, uLayers, uYaw, uSurge;
uniform vec3 uA, uB, uC, uZen, uHor, uSunC;
float h(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float n(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y);
}
/* ridged noise: thin bright creases where the field folds, the shape of an auroral sheet seen from below */
float fold(vec2 p, float t){
  float v = 0., a = .62;
  for (int i = 0; i < 3; i++){
    float k = n(p + vec2(t * (.4 + float(i) * .3), -t * .25));
    v += a * (1. - abs(k * 2. - 1.));
    p = mat2(1.7, 1.1, -1.1, 1.7) * p; a *= .42;
  }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - .5*uRes) / uRes.y;
  vec2 dp = p - uPulsePos; float d = length(dp);
  float ring = (1.-uPulse) * 1.6;
  float rip = sin((d - ring) * 26.) * uPulse * exp(-abs(d - ring) * 6.) * .035;
  p += dp / (d + 1e-3) * rip;

  /* the real sky: horizon-to-zenith gradient and the glow of the sun (or moon) */
  float above = clamp((uv.y - uHorY) / max(.05, 1. - uHorY), 0., 1.);
  vec3 sky = mix(uHor, uZen, pow(above, .5));
  float sd = length(p - uSunP);
  sky += uSunC * (exp(-sd * 2.2) * .45 + exp(-sd * 9.) * .6 + exp(-sd * 40.) * .8) * uSunA;
  sky += uHor * exp(-abs(uv.y - uHorY) * 14.) * .3;

  /* aurora: march the ray up through stacked sheets (72 degree field of view, like the sky camera) */
  vec3 aur = vec3(0.);
  float elev = (uv.y - uHorY + rip) * 1.2566;
  if (elev > .005 && uAur > .01) {
    float az = uYaw + (p.x + uMouse.x * .05) * 1.2566;
    vec2 dir = vec2(sin(az), cos(az));
    float te = 1. / tan(elev), t = uTime * .045;
    for (int i = 0; i < 20; i++){
      float fi = float(i);
      if (fi >= uLayers) break;
      float u = fi / uLayers;
      float dist = (1. + u * 1.7) * te;
      vec2 q = dir * dist * .42 + vec2(0., t * .6);
      float f = fold(q, t);
      float sheet = pow(smoothstep(.52, 1.02, f), 3.);
      float rays = .45 + .55 * n(vec2(dot(q, vec2(7.1, 6.3)), u * 1.4 - t * 2.2));
      vec3 col = mix(uA, uB, smoothstep(.12, .6, u));
      col = mix(col, uC, smoothstep(.5, 1., u));
      aur += col * sheet * rays * (1.15 - u) * exp(-dist * .05);
    }
    aur *= (5. / uLayers) * smoothstep(.0, .12, elev);
  }
  vec3 c = sky + aur * uAur * (.55 + uEnergy * .5 + uSurge * 1.6);

  c += mix(uA, uC, .5) * uPulse * exp(-abs(d - ring) * 5.) * .22;
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
      ['uRes', 'uMouse', 'uPulsePos', 'uSunP', 'uTime', 'uPulse', 'uEnergy', 'uSunA', 'uHorY', 'uAur', 'uLayers', 'uYaw', 'uSurge', 'uA', 'uB', 'uC', 'uZen', 'uHor', 'uSunC']
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

  /* the backdrop is soft by nature, so it renders at a fraction of the screen and the browser scales it up */
  function resize() {
    const scale = LITE() ? 0.25 : [0.42, 0.34, 0.28, 0.22][QUALITY.tier];
    cv.width = Math.round(innerWidth * scale);
    cv.height = Math.round(innerHeight * scale);
    if (ok) gl.viewport(0, 0, cv.width, cv.height);
  }
  QUALITY.on(resize);

  function frame(dt) {
    time += dt / 1000 * (0.4 + MOTION() * 0.6) * (1 + energy * 1.5 + surge * 2);
    pulse = Math.max(0, pulse - dt / 1000 * 0.45);
    surge = Math.max(0, surge - dt / 7000);
    for (const k in TGT) for (let i = 0; i < 3; i++) V[k][i] += (TGT[k][i] - V[k][i]) * Math.min(1, dt / 500);
    mouse[0] += (mouseT[0] - mouse[0]) * 0.03; mouse[1] += (mouseT[1] - mouse[1]) * 0.03;
    energy += (Sound.level() - energy) * 0.05;
    if (!ok) return;
    if ((LITE() || QUALITY.tier >= 2) && (skip = !skip)) return;
    gl.uniform1f(U.uLayers, LITE() ? 6 : [18, 13, 9, 7][QUALITY.tier]);
    gl.uniform2f(U.uRes, cv.width, cv.height);
    gl.uniform2f(U.uMouse, mouse[0], mouse[1]);
    gl.uniform2f(U.uPulsePos, pulsePos[0], pulsePos[1]);
    gl.uniform2f(U.uSunP, SK.sunP[0], SK.sunP[1]);
    gl.uniform1f(U.uTime, time + 40);
    gl.uniform1f(U.uPulse, pulse);
    gl.uniform1f(U.uEnergy, energy);
    gl.uniform1f(U.uSurge, surge);
    gl.uniform1f(U.uYaw, SK.yaw || 0);
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
    surge() { surge = 1; },
  };
})();
