// Supercar Jumping — 3D sahne, takip kamerası, arayüz, ses.
// Fizik 2D (physics.js): x ileri, y yukarı. Sahnede z yanal eksendir.
(() => {
  const SJ = window.SJ;
  const T = window.THREE;
  const { clamp, CARS } = SJ;
  const hill = SJ.buildHill(SJ.HILL_CFG);
  const $ = (id) => document.getElementById(id);

  if (!T) { $('loading').textContent = '3D motoru yüklenemedi. Bağlantını kontrol edip sayfayı yenile.'; return; }

  const lin = (hex) => new T.Color(hex).convertSRGBToLinear();
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  // ---------- Gürültü ----------
  function hash(i, j) {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, y) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 7, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3 + 3) * 0.15;
  function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

  // ---------- Arazi ----------
  const TO = hill.TO;
  const INRUN_TAN = Math.tan(28 * Math.PI / 180);
  const halfW = (x) => (x < TO ? 3.7 : lerp(3.7, 17, smooth01((x - TO) / 45)));
  const trackY = (x) => (x < 0 ? hill.y(0) - x * INRUN_TAN : hill.y(x));
  const smoothY = (() => {
    const x0 = -160, n = Math.ceil(hill.xEnd - x0) + 1;
    const raw = new Float64Array(n), out = new Float64Array(n);
    for (let i = 0; i < n; i++) raw[i] = trackY(x0 + i);
    const w = 30;
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -w; k <= w; k += 3) { s += raw[clamp(i + k, 0, n - 1)]; c++; } out[i] = s / c; }
    return (x) => { const f = clamp(x - x0, 0, n - 1.001); const i = Math.floor(f); return out[i] + (out[i + 1] - out[i]) * (f - i); };
  })();
  function terrainY(x, z) {
    const hw = halfW(x);
    const d = Math.abs(z) - hw;
    const base = trackY(x);
    if (d <= 0) return base;
    const wallH = x < TO ? 1.15 : 0.55;
    const wb = clamp((d - 4) / 30, 0, 1);
    const yb = lerp(base, Math.max(base, smoothY(x)), wb);
    let h = wallH * smooth01(d / 0.7);
    if (d > 1.4) {
      h += (d - 1.4) * 0.16 + Math.pow(Math.max(0, d - 10) / 45, 2) * 20;
      h += (fbm(x * 0.018, z * 0.018) - 0.45) * clamp((d - 10) / 30, 0, 1) * 26;
    }
    return yb + h;
  }

  // ---------- Kurulum ----------
  const canvas = $('cv');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const scene = new T.Scene();
  const HORIZON = 0xc9dcee;
  scene.fog = new T.Fog(lin(HORIZON), 500, 4600);
  const camera = new T.PerspectiveCamera(60, 1, 0.3, 6000);
  const SUN_DIR = new T.Vector3(-0.35, 0.5, 0.8).normalize();

  // Gökyüzü
  const skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: lin(0x2a5ea8) }, mid: { value: lin(0x86b4e0) }, hor: { value: lin(HORIZON) }, bot: { value: lin(0xe9f0f6) },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunDir; varying vec3 vDir;',
      'void main(){ vec3 d = normalize(vDir); float h = d.y;',
      ' vec3 c = h > 0.0 ? mix(hor, mid, smoothstep(0.0, 0.18, h)) : mix(hor, bot, smoothstep(0.0, -0.2, h));',
      ' c = mix(c, top, smoothstep(0.18, 0.75, h));',
      ' float s = max(dot(d, sunDir), 0.0);',
      ' c += vec3(1.0, 0.92, 0.78) * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.08);',
      ' gl_FragColor = vec4(c, 1.0);',
      ' #include <tonemapping_fragment>',
      ' #include <encodings_fragment>',
      '}',
    ].join('\n'),
  });
  const sky = new T.Mesh(new T.SphereGeometry(5000, 32, 16), skyMat);
  scene.add(sky);

  // Ortam yansıması (araba boyası için)
  {
    const pm = new T.PMREMGenerator(renderer);
    const envScene = new T.Scene();
    envScene.add(new T.Mesh(new T.SphereGeometry(100, 32, 16), skyMat));
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
  }

  scene.add(new T.HemisphereLight(lin(0xcfe2ff), lin(0x6d7f99), 0.42));
  const sun = new T.DirectionalLight(lin(0xffeccc), 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);

  // Arazi ağı
  (function buildTerrain() {
    const xs = [];
    for (let x = -150; x <= hill.xEnd - 1; ) {
      xs.push(x);
      x += Math.abs(x - TO) < 40 ? 0.5 : x < 0 ? 4 : 1.25;
    }
    xs.push(TO, TO + 0.26);
    xs.sort((a, b) => a - b);
    const inner = [-1, -0.62, -0.24, 0, 0.24, 0.62, 1];
    const outer = [0.25, 0.6, 1.0, 1.6, 2.6, 4.2, 6.5, 10, 15, 22, 31, 43, 58, 77, 100, 128, 162, 205, 260, 330];
    const cols = outer.length * 2 + inner.length;
    const pos = new Float32Array(xs.length * cols * 3);
    const col = new Float32Array(xs.length * cols * 3);
    const cTrack = lin(0xe6eef7), cGroove = lin(0xbfd2e6), cSnow = lin(0xf7fafd), cSnow2 = lin(0xdbe6f1), cRock = lin(0x7d8a9b), cWall = lin(0xd0dce9);
    const tmp = new T.Color();
    let k = 0;
    for (const x of xs) {
      const hw = halfW(x);
      const zs = [];
      for (let j = outer.length - 1; j >= 0; j--) zs.push(-(hw + outer[j]));
      for (const f of inner) zs.push(f * hw);
      for (const d of outer) zs.push(hw + d);
      for (const z of zs) {
        pos[k * 3] = x; pos[k * 3 + 1] = terrainY(x, z); pos[k * 3 + 2] = z;
        const d = Math.abs(z) - hw;
        if (d <= 0.001) {
          const groove = x < TO && Math.abs(Math.abs(z) - hw * 0.24) < 0.01;
          tmp.copy(x < TO ? (groove ? cGroove : cTrack) : cSnow);
          if (x >= TO) tmp.lerp(cSnow2, 0.18 * fbm(x * 0.05, z * 0.2));
        } else if (d < 1.5) {
          tmp.copy(cWall);
        } else {
          tmp.copy(cSnow).lerp(cSnow2, clamp(fbm(x * 0.03 + 11, z * 0.03) * 1.3 - 0.2, 0, 1));
          const rock = fbm(x * 0.011 + 3, z * 0.011 + 9);
          if (d > 25 && rock > 0.6) tmp.lerp(cRock, clamp((rock - 0.6) * 4, 0, 0.85));
        }
        col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
        k++;
      }
    }
    const idx = [];
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j, b = (i + 1) * cols + j, c = (i + 1) * cols + j + 1, d = i * cols + j + 1;
        idx.push(a, d, b, b, d, c);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
    m.receiveShadow = true;
    scene.add(m);
  })();

  // Uzak dağlar
  {
    const r = rng(42);
    const mat = new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const cRock = lin(0x6f7f95), cSnowM = lin(0xf2f6fb);
    for (let i = 0; i < 26; i++) {
      const ang = -1.25 + (i / 25) * 2.5 + (r() - 0.5) * 0.08;
      const dist = 2600 + r() * 1300;
      const rad = 420 + r() * 520, ht = 420 + r() * 560;
      const g = new T.ConeGeometry(rad, ht, 14, 8, true).toNonIndexed();
      const p = g.attributes.position;
      const cArr = new Float32Array(p.count * 3);
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v), y = p.getY(v), z = p.getZ(v), f = (y + ht / 2) / ht;
        const n = hash(Math.round(x * 0.1) + i * 31, Math.round(z * 0.1 + y * 0.1));
        if (f < 0.98) { p.setX(v, x * (1 + (n - 0.5) * 0.45)); p.setZ(v, z * (1 + (n - 0.5) * 0.45)); p.setY(v, y + (n - 0.5) * ht * 0.1); }
        const c = f > 0.32 + n * 0.25 ? cSnowM : cRock;
        cArr[v * 3] = c.r; cArr[v * 3 + 1] = c.g; cArr[v * 3 + 2] = c.b;
      }
      g.setAttribute('color', new T.BufferAttribute(cArr, 3));
      g.computeVertexNormals();
      const mesh = new T.Mesh(g, mat);
      const cx = TO + 200 + Math.cos(ang) * dist, cz = Math.sin(ang) * dist;
      mesh.position.set(cx, smoothY(Math.min(cx, hill.xEnd)) - 260 + ht / 2, cz);
      scene.add(mesh);
    }
  }

  // Ağaçlar
  function pineGeometry() {
    const prof = [[0.0, 0], [0.18, 0], [0.18, 0.5], [1.7, 1.2], [0.75, 1.35], [1.35, 2.5], [0.55, 2.6], [1.0, 3.7], [0.35, 3.8], [0.6, 4.8], [0, 6.0]];
    const g = new T.LatheGeometry(prof.map(([rr, y]) => new T.Vector2(rr, y)), 7).toNonIndexed();
    g.computeVertexNormals();
    const n = g.attributes.normal, p = g.attributes.position;
    const cArr = new Float32Array(p.count * 3);
    const green = lin(0x1d3b33), green2 = lin(0x2a5244), snow = lin(0xf2f6fb), trunk = lin(0x4a3527);
    for (let v = 0; v < p.count; v++) {
      const ny = n.getY(v), y = p.getY(v);
      const c = y < 0.55 ? trunk : ny > 0.55 ? snow : (Math.floor(v / 3) % 2 ? green : green2);
      cArr[v * 3] = c.r; cArr[v * 3 + 1] = c.g; cArr[v * 3 + 2] = c.b;
    }
    g.setAttribute('color', new T.BufferAttribute(cArr, 3));
    return g;
  }
  const crowdZone = (x, d) => x > hill.xFlat - 50 && x < hill.xFlat + 140 && d < 26;
  {
    const r = rng(9);
    const N = mobile ? 1500 : 2600;
    const mesh = new T.InstancedMesh(pineGeometry(), new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }), N);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), sv = new T.Vector3(), pv = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    let n = 0, tries = 0;
    while (n < N && tries < N * 4) {
      tries++;
      const x = -140 + r() * (hill.xEnd + 130);
      const side = r() < 0.5 ? -1 : 1;
      const d = 2.4 + Math.pow(r(), 1.7) * 230;
      if (crowdZone(x, d)) continue;
      if (x > TO - 8 && x < TO + 60 && d < 8) continue;
      if (x > hill.xFlat + 60 && x < hill.xFlat + 90 && d < 10) continue;
      const z = side * (halfW(x) + d);
      const s = 0.8 + r() * 1.5 + (d > 60 ? 0.6 : 0);
      q.setFromAxisAngle(up, r() * 6.28);
      pv.set(x, terrainY(x, z) - 0.2, z);
      sv.set(s, s * (0.9 + r() * 0.3), s);
      m4.compose(pv, q, sv);
      mesh.setMatrixAt(n++, m4);
    }
    mesh.count = n;
    scene.add(mesh);
  }

  // Seyirciler
  const crowd = (() => {
    const r = rng(77);
    const N = 760;
    const g = new T.CylinderGeometry(0.2, 0.26, 1.62, 7); g.translate(0, 0.81, 0);
    const mesh = new T.InstancedMesh(g, new T.MeshStandardMaterial({ roughness: 0.8 }), N);
    const palette = [0xe1342a, 0xf5b700, 0x2058c9, 0xf5f8fb, 0x29cc63, 0x15233f, 0xff7a1a, 0xc21f6a].map(lin);
    const data = [];
    const m4 = new T.Matrix4();
    for (let i = 0; i < N; i++) {
      const x = hill.xFlat - 45 + r() * 180;
      const side = r() < 0.5 ? -1 : 1;
      const z = side * (halfW(x) + 2.2 + r() * 16);
      const y = terrainY(x, z);
      data.push({ x, y, z, ph: r() * 6.28 });
      mesh.setColorAt(i, palette[Math.floor(r() * palette.length)]);
      m4.makeTranslation(x, y, z);
      mesh.setMatrixAt(i, m4);
    }
    scene.add(mesh);
    const heads = new T.InstancedMesh(new T.SphereGeometry(0.17, 8, 6), new T.MeshStandardMaterial({ roughness: 0.7 }), N);
    const hats = [0xe1342a, 0xf5f8fb, 0x15233f, 0xf5b700, 0x2058c9].map(lin);
    data.forEach((c, i) => { heads.setColorAt(i, hats[i % hats.length]); m4.makeTranslation(c.x, c.y + 1.86, c.z); heads.setMatrixAt(i, m4); });
    scene.add(heads);
    return { mesh, heads, data };
  })();
  const crowdM4 = new T.Matrix4();
  function animateCrowd(t, excited) {
    for (let i = 0; i < crowd.data.length; i++) {
      const c = crowd.data[i];
      const bob = excited ? Math.max(0, Math.sin(t * 9 + c.ph)) * 0.35 : Math.max(0, Math.sin(t * 2 + c.ph)) * 0.05;
      crowdM4.makeTranslation(c.x, c.y + bob, c.z);
      crowd.mesh.setMatrixAt(i, crowdM4);
      crowdM4.makeTranslation(c.x, c.y + bob + 1.86, c.z);
      crowd.heads.setMatrixAt(i, crowdM4);
    }
    crowd.mesh.instanceMatrix.needsUpdate = true;
    crowd.heads.instanceMatrix.needsUpdate = true;
  }

  // ---------- Yazı dokuları ----------
  const fontStack = '"Saira Condensed", "Arial Narrow", sans-serif';
  const redraws = [];
  function textTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = 4;
    const paint = () => { const g = c.getContext('2d'); g.clearRect(0, 0, w, h); draw(g, w, h); tex.needsUpdate = true; };
    paint(); redraws.push(paint);
    return tex;
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => redraws.forEach((f) => f()));

  function bannerTex(text, bg, fg, accent) {
    return textTexture(512, 80, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      if (accent) { g.fillStyle = accent; g.fillRect(0, h - 8, w, 8); }
      g.fillStyle = fg; g.font = `italic 800 54px ${fontStack}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    });
  }
  const BANNERS = [
    bannerTex('SUPERCAR JUMPING', '#0b1730', '#f5f8fb', '#f5b700'),
    bannerTex('KARTAL TEPE', '#e1342a', '#f5f8fb'),
    bannerTex('NİTRO+', '#f5b700', '#0b1730'),
    bannerTex('SON GAZ', '#f5f8fb', '#0b1730', '#e1342a'),
    bannerTex('DÜNYA KUPASI', '#1d4fbf', '#f5f8fb'),
  ];
  const bannerMats = BANNERS.map((map) => new T.MeshStandardMaterial({ map, roughness: 0.6, side: T.DoubleSide }));

  // Pistin yanındaki panolar
  function placePanel(x, side, w, h, mat, lift) {
    const hw = halfW(x);
    const z = side * (hw + 0.55);
    const y = terrainY(x, z) + (lift || 0);
    const holder = new T.Object3D();
    holder.position.set(x, y + h / 2 + 0.05, z);
    holder.rotation.z = Math.atan(hill.slope(x));
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.rotation.y = side < 0 ? 0 : Math.PI;
    m.receiveShadow = true;
    holder.add(m);
    scene.add(holder);
    return holder;
  }
  {
    let i = 0;
    for (let x = 14; x < TO - 6; x += 15, i++) {
      placePanel(x, -1, 12, 1.05, bannerMats[i % bannerMats.length], 0.2);
      placePanel(x + 7, 1, 12, 1.05, bannerMats[(i + 2) % bannerMats.length], 0.2);
    }
    i = 0;
    for (let s = 10; s < hill.HS + 90; s += 30, i++) {
      const x = hill.xAtArc(s);
      placePanel(x, -1, 14, 1.6, bannerMats[(i + 1) % bannerMats.length], 0.1);
      placePanel(x + 10, 1, 14, 1.6, bannerMats[(i + 3) % bannerMats.length], 0.1);
    }
  }
  // Mesafe tabelaları
  for (let s = 20; s <= hill.HS + 40; s += 10) {
    const color = s < hill.K - 40 ? '#1d4fbf' : s < hill.K ? '#1f9e4d' : s <= hill.HS ? '#e1342a' : '#0b1730';
    const tex = textTexture(160, 96, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.font = `800 70px ${fontStack}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(s), w / 2, h / 2 + 3);
    });
    const mat = new T.MeshStandardMaterial({ map: tex, roughness: 0.5, side: T.DoubleSide, emissive: lin(0x333333), emissiveMap: tex });
    const x = hill.xAtArc(s);
    placePanel(x, -1, 1.9, 1.15, mat, 1.75);
    placePanel(x, 1, 1.9, 1.15, mat, 1.75);
  }

  // Pist üstü çizgiler (K, HS, 50 m'ler, geçilecek çizgi)
  function slopeLine(s, color, thick, opacity) {
    const x = hill.xAtArc(s);
    const holder = new T.Object3D();
    holder.position.set(x, hill.y(x) + 0.03, 0);
    holder.rotation.z = Math.atan(hill.slope(x));
    const m = new T.Mesh(new T.PlaneGeometry(thick, halfW(x) * 2), new T.MeshBasicMaterial({ color: lin(color), transparent: opacity < 1, opacity, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2;
    holder.add(m);
    scene.add(holder);
  }
  // Gerçek tepelerdeki gibi iniş pistine her 5 m'de çam dalı çizgileri; inişte orta işaretler (derinlik ve hız hissi)
  {
    const lines = [];
    for (let s = 5; s <= hill.HS + 120; s += 5) if (s % 50) lines.push(s);
    const mesh = new T.InstancedMesh(new T.PlaneGeometry(0.22, 1), new T.MeshBasicMaterial({ color: lin(0x2f5a46), transparent: true, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -1 }), lines.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), pv = new T.Vector3(), sv = new T.Vector3();
    lines.forEach((s, i) => {
      const x = hill.xAtArc(s);
      e.set(-Math.PI / 2, 0, 0, 'ZXY'); e.z = Math.atan(hill.slope(x));
      q.setFromEuler(e);
      pv.set(x, hill.y(x) + 0.02, 0);
      sv.set(1, halfW(x) * 2 * 0.86, 1);
      mesh.setMatrixAt(i, m4.compose(pv, q, sv));
    });
    scene.add(mesh);
    const marks = [];
    for (let x = 8; x < TO - 2; x += 6) marks.push(x);
    const mm = new T.InstancedMesh(new T.PlaneGeometry(2.2, 0.16), new T.MeshBasicMaterial({ color: lin(0x5b86c9), transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -1 }), marks.length * 2);
    let k = 0;
    for (const x of marks) {
      for (const zz of [-halfW(x) + 0.35, halfW(x) - 0.35]) {
        e.set(-Math.PI / 2, 0, 0, 'ZXY'); e.z = Math.atan(hill.slope(x));
        q.setFromEuler(e);
        pv.set(x, hill.y(x) + 0.02, zz); sv.set(1, 1, 1);
        mm.setMatrixAt(k++, m4.compose(pv, q, sv));
      }
    }
    scene.add(mm);
  }
  for (let s = 50; s <= hill.HS + 50; s += 50) slopeLine(s, 0x3a6fd0, 0.18, 0.55);
  slopeLine(hill.K, 0xe1342a, 0.6, 1);
  slopeLine(hill.HS, 0x0b1730, 0.45, 1);
  const beat = (() => {
    const holder = new T.Object3D();
    const line = new T.Mesh(new T.PlaneGeometry(0.5, 40), new T.MeshBasicMaterial({ color: lin(0x29ff7a), polygonOffset: true, polygonOffsetFactor: -3 }));
    line.rotation.x = -Math.PI / 2;
    holder.add(line);
    const tex = textTexture(8, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(41,255,122,0)'); gr.addColorStop(1, 'rgba(41,255,122,0.9)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const wall = new T.Mesh(new T.PlaneGeometry(40, 7), new T.MeshBasicMaterial({ map: tex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
    wall.rotation.y = Math.PI / 2;
    wall.position.y = 3.5;
    holder.add(wall);
    holder.visible = false;
    scene.add(holder);
    return {
      set(s) {
        if (s === null) { holder.visible = false; return; }
        const x = hill.xAtArc(s);
        holder.visible = true;
        holder.position.set(x, hill.y(x) + 0.04, 0);
        holder.rotation.z = Math.atan(hill.slope(x));
        const w = halfW(x) * 2;
        line.scale.y = w / 40; wall.scale.x = w / 40;
      },
    };
  })();

  // Pist üstüne serilmiş renkli şerit (nitro bölgesi mavi, burun kaldırma bölgesi sarı)
  function ribbon(x0, x1, color, opacity, frac) {
    const pos = [], idx = [];
    let n = 0;
    for (let x = x0; x <= x1 + 0.01; x += 1) {
      const hw = halfW(x) * frac, y = hill.y(Math.min(x, TO)) + 0.025;
      pos.push(x, y, -hw, x, y, hw);
      if (n) { const a = (n - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      n++;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: lin(color), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: T.DoubleSide }));
    scene.add(m);
    return m;
  }
  const NZ0 = hill.cfg.NZ0, NZ1 = hill.cfg.NZ1;
  const nitroRibbon = ribbon(NZ0, NZ1, 0x2f7dff, 0.22, 0.92);
  ribbon(TO - SJ.ZONE, TO - 0.6, 0xf5b700, 0.38, 0.92);
  // Nitro kapıları: üstünden geçerken hız hissi veren ışıklı kemerler
  const gateLight = new T.MeshStandardMaterial({ color: lin(0x9fd6ff), emissive: lin(0x2f8dff), emissiveIntensity: 2.4 });
  const gateFrame = new T.MeshStandardMaterial({ color: lin(0x18233a), roughness: 0.4, metalness: 0.7 });
  const GATE_XS = [];
  for (let x = NZ0; x <= NZ1; x += 10) {
    GATE_XS.push(x);
    const hw = halfW(x) + 0.5, y = trackY(x), ang = Math.atan(hill.slope(x));
    const holder = new T.Object3D();
    holder.position.set(x, y, 0); holder.rotation.z = ang;
    for (const side of [-1, 1]) {
      const post = new T.Mesh(new T.BoxGeometry(0.3, 4.6, 0.3), gateFrame);
      post.position.set(0, 2.3, side * hw); holder.add(post);
      const strip = new T.Mesh(new T.BoxGeometry(0.12, 4.2, 0.1), gateLight);
      strip.position.set(-0.17, 2.3, side * (hw - 0.12)); holder.add(strip);
    }
    const beam = new T.Mesh(new T.BoxGeometry(0.4, 0.35, hw * 2 + 0.3), gateFrame);
    beam.position.set(0, 4.6, 0); holder.add(beam);
    const bar = new T.Mesh(new T.BoxGeometry(0.12, 0.12, hw * 2), gateLight);
    bar.position.set(-0.22, 4.45, 0); holder.add(bar);
    scene.add(holder);
  }
  {
    const nitroTex = textTexture(512, 96, (g, w, h) => {
      g.fillStyle = '#0b1730'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#6fc3ff'; g.font = `italic 800 70px ${fontStack}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('NİTRO BÖLGESİ', w / 2, h / 2 + 3);
    });
    const sign = new T.Mesh(new T.PlaneGeometry(7.4, 1.3), new T.MeshStandardMaterial({ map: nitroTex, emissive: lin(0x444444), emissiveMap: nitroTex }));
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(NZ0 - 0.25, trackY(NZ0) + 5.5, 0);
    sign.rotation.order = 'YXZ';
    scene.add(sign);
  }
  // İnişte iki yanda sık ışık direkleri: yanından akıp geçen nesneler hız hissi verir
  {
    const xs = [];
    for (let x = 6; x < TO - 2; x += 7) xs.push(x);
    const pole = new T.InstancedMesh(new T.CylinderGeometry(0.07, 0.09, 3.2, 6), gateFrame, xs.length * 2);
    const lamp = new T.InstancedMesh(new T.BoxGeometry(0.5, 0.12, 0.25), new T.MeshStandardMaterial({ color: lin(0xffffff), emissive: lin(0xfff1c8), emissiveIntensity: 2 }), xs.length * 2);
    const m4 = new T.Matrix4();
    let k = 0;
    for (const x of xs) {
      for (const side of [-1, 1]) {
        const z = side * (halfW(x) + 1.15), y = terrainY(x, z);
        pole.setMatrixAt(k, m4.makeTranslation(x, y + 1.6, z));
        lamp.setMatrixAt(k, m4.makeTranslation(x, y + 3.2, z - side * 0.25));
        k++;
      }
    }
    scene.add(pole); scene.add(lamp);
  }

  // Kalkış kenarı, start kapısı, kule, tribün
  {
    const red = new T.MeshStandardMaterial({ color: lin(0xe1342a), roughness: 0.5 });
    const white = new T.MeshStandardMaterial({ color: lin(0xf5f8fb), roughness: 0.5 });
    const steel = new T.MeshStandardMaterial({ color: lin(0x2b3442), roughness: 0.4, metalness: 0.6 });
    const lamp = new T.MeshStandardMaterial({ color: lin(0xffffff), emissive: lin(0xfff2c0), emissiveIntensity: 2.2 });
    const edgeAng = Math.atan(hill.slope(TO - 1));
    const hw = halfW(TO - 1);
    const edge = new T.Mesh(new T.BoxGeometry(0.7, 0.12, hw * 2 + 0.2), red);
    edge.position.set(TO - 0.35, hill.yTO + 0.02, 0); edge.rotation.z = edgeAng; edge.receiveShadow = true;
    scene.add(edge);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const seg = new T.Mesh(new T.BoxGeometry(0.3, 0.6, 0.3), k % 2 ? white : red);
        seg.position.set(TO, hill.yTO + 1.2 + k * 0.6, side * (hw + 0.9));
        scene.add(seg);
      }
      const l = new T.Mesh(new T.SphereGeometry(0.22, 12, 8), lamp);
      l.position.set(TO, hill.yTO + 4.9, side * (hw + 0.9));
      scene.add(l);
    }
    const face = new T.Mesh(new T.BoxGeometry(1.4, hill.cfg.STEP + 1.2, hw * 2 + 3), new T.MeshStandardMaterial({ color: lin(0x9aa9bc), roughness: 0.9 }));
    face.position.set(TO - 0.75, hill.yTO - (hill.cfg.STEP + 1.2) / 2 - 0.02, 0);
    face.receiveShadow = true;
    scene.add(face);
    // Start kapısı
    const gx = 0.5, gy = trackY(gx);
    for (const side of [-1, 1]) {
      const p = new T.Mesh(new T.BoxGeometry(0.45, 8.6, 0.45), steel);
      p.position.set(gx, gy + 4.3, side * 4.9); p.castShadow = true;
      scene.add(p);
    }
    const beam = new T.Mesh(new T.BoxGeometry(0.7, 1.5, 10.3), steel);
    beam.position.set(gx, gy + 8.6, 0); beam.castShadow = true;
    scene.add(beam);
    const gateTex = textTexture(1024, 150, (g, w, h) => {
      g.fillStyle = '#0b1730'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e1342a'; g.fillRect(0, 0, 150, h);
      g.fillStyle = '#f5f8fb'; g.font = `800 64px ${fontStack}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('START', 75, h / 2 + 2);
      g.font = `italic 800 84px ${fontStack}`;
      g.fillText('SUPERCAR JUMPING', 150 + (w - 150) / 2, h / 2 + 3);
      g.fillStyle = '#f5b700'; g.fillRect(150, h - 10, w - 150, 10);
    });
    const banner = new T.Mesh(new T.PlaneGeometry(10.2, 1.48), new T.MeshStandardMaterial({ map: gateTex, emissive: lin(0x333333), emissiveMap: gateTex, roughness: 0.6 }));
    banner.rotation.y = -Math.PI / 2;
    banner.position.set(gx + 0.36, gy + 8.6, 0);
    banner.rotation.y = Math.PI / 2;
    scene.add(banner);
    // Hakem kulesi
    const tx = TO + 70, tz = halfW(tx) + 12;
    const ty = terrainY(tx, tz);
    const tower = new T.Mesh(new T.BoxGeometry(8, 16, 6), new T.MeshStandardMaterial({ color: lin(0xdfe6ee), roughness: 0.7 }));
    tower.position.set(tx, ty + 8, tz + 2); tower.castShadow = true;
    scene.add(tower);
    const glass = new T.Mesh(new T.BoxGeometry(8.2, 2.6, 6.2), new T.MeshStandardMaterial({ color: lin(0x1a2f4f), roughness: 0.1, metalness: 0.7 }));
    glass.position.set(tx, ty + 13.8, tz + 2);
    scene.add(glass);
    const towerSign = new T.Mesh(new T.PlaneGeometry(7.6, 1.2), bannerMats[0]);
    towerSign.position.set(tx, ty + 11.4, tz - 1.02);
    scene.add(towerSign);
    // Bitiş tribünü
    const fx = hill.xFlat + 175;
    const stand = new T.Mesh(new T.BoxGeometry(6, 5, 60), new T.MeshStandardMaterial({ color: lin(0x15233f), roughness: 0.7 }));
    stand.position.set(fx, trackY(fx) + 2.5, 0); stand.castShadow = true;
    scene.add(stand);
    const finish = new T.Mesh(new T.PlaneGeometry(36, 3.2), new T.MeshStandardMaterial({ map: BANNERS[0], roughness: 0.6 }));
    finish.rotation.y = -Math.PI / 2; finish.position.set(fx - 3.02, trackY(fx) + 3.2, 0);
    scene.add(finish);
  }

  // ---------- Arabalar ----------
  const CAR_W = { vento: 2.04, corsa: 1.96, titan: 2.06, bolt: 1.7 };
  const PROFILES = {
    wedge: { top: [[-0.5, 0.52], [-0.4, 0.6], [-0.3, 0.66], [-0.14, 0.93], [0.06, 0.95], [0.26, 0.6], [0.42, 0.42], [0.5, 0.3]], belt: 0.6, wing: true, splitter: true },
    gt: { top: [[-0.5, 0.56], [-0.42, 0.62], [-0.28, 0.67], [-0.13, 0.95], [0.08, 0.96], [0.22, 0.68], [0.42, 0.58], [0.5, 0.46]], belt: 0.64, ducktail: true },
    suv: { top: [[-0.5, 0.86], [-0.47, 0.95], [-0.4, 0.98], [0.14, 0.98], [0.29, 0.68], [0.45, 0.62], [0.5, 0.5]], belt: 0.66, rack: true },
    mini: { top: [[-0.5, 0.82], [-0.46, 0.95], [-0.38, 0.99], [0.2, 0.99], [0.36, 0.64], [0.47, 0.58], [0.5, 0.46]], belt: 0.62 },
  };
  function chaikin(pts, iter) {
    let p = pts;
    for (let k = 0; k < iter; k++) {
      const out = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(p[p.length - 1]);
      p = out;
    }
    return p;
  }
  function clipY(poly, yc, keepAbove) {
    const out = [];
    const inside = (p) => (keepAbove ? p[1] >= yc : p[1] <= yc);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) { const t = (yc - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, yc]); }
    }
    return out;
  }
  function mergeVerts(g) {
    const p = g.attributes.position;
    const map = new Map(), verts = [], index = [];
    for (let i = 0; i < p.count; i++) {
      const key = `${Math.round(p.getX(i) * 500)},${Math.round(p.getY(i) * 500)},${Math.round(p.getZ(i) * 500)}`;
      let id = map.get(key);
      if (id === undefined) { id = verts.length / 3; map.set(key, id); verts.push(p.getX(i), p.getY(i), p.getZ(i)); }
      index.push(id);
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    out.setIndex(index);
    out.computeVertexNormals();
    return out;
  }
  function extrude(poly, depth, bevel, taperFrom, taper) {
    const shape = new T.Shape(poly.map(([x, y]) => new T.Vector2(x, y)));
    const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 4, steps: 1 });
    g.translate(0, 0, -depth / 2);
    if (taper) {
      const p = g.attributes.position;
      let ymax = -1e9; for (let i = 0; i < p.count; i++) ymax = Math.max(ymax, p.getY(i));
      for (let i = 0; i < p.count; i++) {
        const t = clamp((p.getY(i) - taperFrom) / Math.max(0.01, ymax - taperFrom), 0, 1);
        p.setZ(i, p.getZ(i) * (1 - taper * t));
      }
    }
    return mergeVerts(g);
  }

  const MAT = {
    glass: new T.MeshPhysicalMaterial({ color: lin(0x0c1626), metalness: 0.1, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 }),
    black: new T.MeshStandardMaterial({ color: lin(0x15171c), roughness: 0.55, metalness: 0.2 }),
    tire: new T.MeshStandardMaterial({ color: lin(0x111214), roughness: 0.85 }),
    rim: new T.MeshStandardMaterial({ color: lin(0xc6ccd4), roughness: 0.25, metalness: 0.9 }),
    chrome: new T.MeshStandardMaterial({ color: lin(0xdfe4ea), roughness: 0.15, metalness: 1 }),
    tail: new T.MeshStandardMaterial({ color: lin(0x5a0a08), emissive: lin(0xff2a1a), emissiveIntensity: 1.6 }),
    head: new T.MeshStandardMaterial({ color: lin(0xffffff), emissive: lin(0xfff5d6), emissiveIntensity: 1.5 }),
    flame: new T.MeshBasicMaterial({ color: lin(0x3f8cff), transparent: true, opacity: 0.75, blending: T.AdditiveBlending, depthWrite: false }),
  };

  function buildCar(car) {
    const P = PROFILES[car.shape];
    const L = car.len, Hh = car.h, Wd = CAR_W[car.id];
    const wr = car.wr, ra = wr * 1.16;
    const yb = wr * 0.95; // sürüş yüksekliği: lastikler gövdenin altından görünsün
    const xr = -car.wb / 2, xf = car.wb / 2;
    // Dış hat: üst profil (arkadan öne), ön alt köşe, sonra çamurluk kemerleriyle alt kenar (önden arkaya)
    const top = chaikin(P.top.map(([u, v]) => [u * L, v * Hh]), 2);
    const arch = (xc) => {
      const pts = [];
      const a0 = Math.asin(clamp((yb - wr) / ra, -1, 1));
      for (let k = 0; k <= 10; k++) { const a = a0 + (Math.PI - 2 * a0) * (k / 10); pts.push([xc + ra * Math.cos(a), wr + ra * Math.sin(a)]); }
      return pts;
    };
    const outline = [[-L / 2, yb + 0.02], ...top, [L / 2, yb + 0.04], ...arch(xf), ...arch(xr)];
    const poly = outline.slice().reverse();
    const belt = P.belt * Hh;
    const lower = clipY(poly, belt + 0.02, false);
    const upper = clipY(poly, belt - 0.04, true);
    let ymax = -1e9; for (const p of upper) ymax = Math.max(ymax, p[1]);
    const roof = clipY(poly, ymax - 0.07 * Hh, true);

    const paint = new T.MeshPhysicalMaterial({ color: lin(car.color), metalness: 0.35, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.75 });
    const trimMat = new T.MeshPhysicalMaterial({ color: lin(car.trim), metalness: 0.3, roughness: 0.4, clearcoat: 0.6 });
    const g = new T.Group();
    const body = new T.Mesh(extrude(lower, Wd - 0.2, 0.1, belt * 0.6, 0.06), paint);
    const glassMat = MAT.glass.clone();
    const cabin = new T.Mesh(extrude(upper, Wd * 0.84 - 0.12, 0.06, belt, 0.22), glassMat);
    const roofM = new T.Mesh(extrude(roof, Wd * 0.7 - 0.1, 0.05, ymax - 0.1, 0.1), paint);
    roofM.position.y = 0.012;
    [body, cabin, roofM].forEach((m) => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
    const under = new T.Mesh(new T.BoxGeometry(L * 0.86, yb + 0.12, Wd * 0.86), MAT.black);
    under.position.y = (yb + 0.12) / 2 + 0.06; g.add(under);
    const skirt = new T.Mesh(new T.BoxGeometry(Math.max(0.2, car.wb - ra * 2 - 0.1), 0.12, Wd + 0.02), trimMat);
    skirt.position.set(0, yb + 0.08, 0); g.add(skirt);
    // Arka: difüzör, stoplar, egzozlar
    const rearX = -L / 2 - 0.08;
    const diffuser = new T.Mesh(new T.BoxGeometry(0.18, 0.2, Wd * 0.8), MAT.black);
    diffuser.position.set(rearX + 0.04, yb + 0.06, 0); g.add(diffuser);
    const tailY = clamp(P.belt * Hh - 0.12, yb + 0.25, Hh * 0.7);
    if (car.shape === 'wedge' || car.shape === 'gt') {
      const bar = new T.Mesh(new T.BoxGeometry(0.05, 0.07, Wd * 0.82), MAT.tail);
      bar.position.set(rearX - 0.005, tailY, 0); g.add(bar);
    } else {
      for (const s of [-1, 1]) {
        const tl = new T.Mesh(new T.BoxGeometry(0.05, car.shape === 'suv' ? 0.36 : 0.22, 0.24), MAT.tail);
        tl.position.set(rearX - 0.005, tailY, s * (Wd / 2 - 0.26)); g.add(tl);
      }
    }
    const exhausts = [];
    const exZ = car.shape === 'wedge' ? [-0.12, 0.12] : [-(Wd / 2 - 0.45), Wd / 2 - 0.45];
    for (const z of exZ) {
      const ex = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.2, 12), MAT.chrome);
      ex.rotation.z = Math.PI / 2; ex.position.set(rearX - 0.02, yb + 0.12, z); g.add(ex);
      const fl = new T.Mesh(new T.ConeGeometry(0.11, 1, 10, 1, true), MAT.flame);
      fl.rotation.z = Math.PI / 2; fl.position.set(rearX - 0.6, yb + 0.12, z); fl.visible = false; g.add(fl);
      exhausts.push(fl);
    }
    const frontX = L / 2 + 0.06;
    for (const s of [-1, 1]) {
      const hl = new T.Mesh(new T.BoxGeometry(0.06, 0.07, 0.42), MAT.head);
      hl.position.set(frontX - 0.04, clamp(0.33 * Hh, yb + 0.12, Hh * 0.55), s * (Wd / 2 - 0.36)); g.add(hl);
    }
    if (P.splitter) {
      const sp = new T.Mesh(new T.BoxGeometry(0.3, 0.04, Wd * 0.94), MAT.black);
      sp.position.set(L / 2 - 0.05, yb - 0.02, 0); g.add(sp);
    }
    const loose = []; // kazada kopabilen parçalar
    if (P.wing) {
      const wingG = new T.Group();
      const wing = new T.Mesh(new T.BoxGeometry(0.42, 0.05, Wd * 0.96), trimMat);
      wing.position.set(-L / 2 + 0.25, 0.86 * Hh, 0); wing.castShadow = true; wingG.add(wing);
      for (const s of [-1, 1]) {
        const st = new T.Mesh(new T.BoxGeometry(0.08, 0.26 * Hh, 0.04), MAT.black);
        st.position.set(-L / 2 + 0.3, 0.73 * Hh, s * 0.5); wingG.add(st);
        const ep = new T.Mesh(new T.BoxGeometry(0.5, 0.18, 0.03), trimMat);
        ep.position.set(-L / 2 + 0.25, 0.86 * Hh, s * Wd * 0.48); wingG.add(ep);
      }
      g.add(wingG); loose.push(wingG);
    }
    if (P.ducktail) {
      const dt = new T.Mesh(new T.BoxGeometry(0.3, 0.05, Wd * 0.8), trimMat);
      dt.position.set(-L / 2 + 0.1, 0.62 * Hh, 0); dt.rotation.z = 0.25; g.add(dt);
    }
    if (P.rack) {
      const rackG = new T.Group();
      for (const s of [-1, 1]) {
        const rail = new T.Mesh(new T.BoxGeometry(L * 0.5, 0.05, 0.05), MAT.chrome);
        rail.position.set(-L * 0.1, Hh + 0.07, s * Wd * 0.3); rackG.add(rail);
      }
      g.add(rackG); loose.push(rackG);
    }
    // Tekerlekler
    const wheels = [];
    const tireW = car.shape === 'mini' ? 0.24 : 0.32;
    for (const x of [xr, xf]) {
      for (const s of [-1, 1]) {
        const w = new T.Group();
        const tire = new T.Mesh(new T.CylinderGeometry(wr, wr, tireW, 28), MAT.tire);
        tire.rotation.x = Math.PI / 2; tire.castShadow = true; w.add(tire);
        const rim = new T.Mesh(new T.CylinderGeometry(wr * 0.66, wr * 0.66, tireW + 0.012, 24), MAT.rim);
        rim.rotation.x = Math.PI / 2; w.add(rim);
        for (let k = 0; k < 5; k++) {
          const sp = new T.Mesh(new T.BoxGeometry(wr * 1.2, wr * 0.16, 0.02), MAT.black);
          sp.position.z = s * (tireW / 2 + 0.008); sp.rotation.z = (k / 5) * Math.PI; w.add(sp);
        }
        w.position.set(x, wr, s * (Wd / 2 - tireW / 2 + 0.1)); // lastikler gövdeden taşar: arkadan görünür
        g.add(w); wheels.push(w);
      }
    }
    const deform = [body, cabin, roofM].map((m) => ({ mesh: m, orig: Float32Array.from(m.geometry.attributes.position.array) }));
    const glassOrig = { color: glassMat.color.clone(), roughness: glassMat.roughness };
    const attach = [...loose, ...wheels].map((o) => ({ o, pos: o.position.clone(), rot: o.rotation.clone() }));
    return { group: g, wheels, exhausts, car, deform, loose, glassMat, glassOrig, attach, L, Hh, Wd, smoke: 0, detached: 0 };
  }
  const carModels = CARS.map(buildCar);
  // ---------- Görsel hasar: göçük, çatlak cam, kopan parçalar, duman ----------
  const flying = [];
  function resetDamage(m) {
    for (const d of m.deform) {
      d.mesh.geometry.attributes.position.array.set(d.orig);
      d.mesh.geometry.attributes.position.needsUpdate = true;
      d.mesh.geometry.computeVertexNormals();
    }
    m.glassMat.color.copy(m.glassOrig.color); m.glassMat.roughness = m.glassOrig.roughness;
    for (const a of m.attach) {
      if (a.o.parent !== m.group) { scene.remove(a.o); m.group.add(a.o); }
      a.o.position.copy(a.pos); a.o.rotation.copy(a.rot); a.o.scale.set(1, 1, 1);
    }
    flying.length = 0;
    m.smoke = 0; m.detached = 0;
  }
  // (lx, ly): yerden/duvardan arabaya doğru yön, araç ekseninde. cost: darbenin hasar bedeli.
  function applyDamage(m, lx, ly, cost) {
    const k = clamp(cost / 900000, 0.12, 1.3);
    // Darbe noktası: araç merkezinden darbe yönünün tersine, gövdenin kenarına
    const cx = 0, cy = m.Hh * 0.5;
    const ex = m.L * 0.5, ey = m.Hh * 0.5;
    const t = Math.min(ex / Math.max(1e-3, Math.abs(lx)), ey / Math.max(1e-3, Math.abs(ly)));
    const px = cx - lx * t, py = cy - ly * t;
    const R = 0.9 + k * 1.1, depth = Math.min(0.55, 0.12 + k * 0.38);
    for (const d of m.deform) {
      const pos = d.mesh.geometry.attributes.position;
      const a = pos.array;
      const oy = d.mesh.position.y;
      for (let i = 0; i < a.length; i += 3) {
        const dx = a[i] - px, dy = a[i + 1] + oy - py, dz = a[i + 2] * 0.35;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > R) continue;
        const f = (1 - dist / R) ** 2;
        const n = 0.7 + 0.6 * Math.abs(Math.sin(a[i] * 13.1 + a[i + 2] * 7.7));
        a[i] += lx * depth * f * n;
        a[i + 1] += ly * depth * f * n;
        a[i + 2] *= 1 - 0.12 * f * k; // ezilen bölge içe toplanır
      }
      pos.needsUpdate = true;
      d.mesh.geometry.computeVertexNormals();
    }
    // Cam çatlar: beyazlaşır ve matlaşır
    m.glassMat.color.lerp(lin(0xb9c6d4), clamp(0.25 + k * 0.5, 0, 1));
    m.glassMat.roughness = Math.min(0.85, m.glassMat.roughness + 0.25 * k + 0.1);
    // Büyük darbede parçalar kopar: önce kanat/raf, sonra bir tekerlek
    if (k > 0.35) {
      const order = [...m.loose, ...m.wheels];
      const cand = order.filter((o) => o.parent === m.group);
      const n = k > 0.9 ? 2 : 1;
      for (let i = 0; i < n && cand.length; i++) {
        const o = i === 0 && m.loose.some((l) => l.parent === m.group) ? cand[0] : cand[Math.floor(Math.random() * cand.length)];
        cand.splice(cand.indexOf(o), 1);
        detach(m, o, k);
      }
    }
    m.smoke = Math.min(1, m.smoke + 0.35 + k * 0.4);
  }
  const _wp = new T.Vector3(), _wq = new T.Quaternion();
  function detach(m, o, k) {
    o.getWorldPosition(_wp); o.getWorldQuaternion(_wq);
    m.group.remove(o);
    scene.add(o);
    o.position.copy(_wp); o.quaternion.copy(_wq);
    const r = G.run;
    const vx = r ? r.vx * 0.7 : 0, vy = r ? Math.max(0, r.vy) : 0;
    flying.push({ o, v: new T.Vector3(vx + (Math.random() - 0.5) * 10, vy + 4 + Math.random() * 8 * k, (Math.random() - 0.5) * 12), w: new T.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14) });
    m.detached++;
  }
  function updateFlying(dt) {
    for (const f of flying) {
      f.v.y -= 9.81 * dt;
      f.o.position.addScaledVector(f.v, dt);
      const gy = terrainY(f.o.position.x, f.o.position.z) + 0.3;
      if (f.o.position.y < gy) { f.o.position.y = gy; f.v.y = Math.abs(f.v.y) * 0.35; f.v.x *= 0.85; f.v.z *= 0.85; f.w.multiplyScalar(0.8); }
      f.o.rotation.x += f.w.x * dt; f.o.rotation.y += f.w.y * dt; f.o.rotation.z += f.w.z * dt;
    }
  }

  const carRoot = new T.Group();
  scene.add(carRoot);
  let activeCar = null;
  function useCar(i) {
    if (activeCar) carRoot.remove(activeCar.group);
    activeCar = carModels[i];
    carRoot.add(activeCar.group);
  }

  // Garaj döner platformu
  const SHOW_X = hill.xBarrier + 45;
  const showY = trackY(SHOW_X);
  const turntable = new T.Group();
  {
    const disc = new T.Mesh(new T.CylinderGeometry(3.6, 3.8, 0.16, 64), new T.MeshStandardMaterial({ color: lin(0x16213a), roughness: 0.35, metalness: 0.6 }));
    disc.position.y = 0.08; disc.receiveShadow = true; turntable.add(disc);
    const ring = new T.Mesh(new T.TorusGeometry(3.7, 0.05, 8, 96), new T.MeshStandardMaterial({ color: lin(0xf5b700), emissive: lin(0xf5b700), emissiveIntensity: 1.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.17; turntable.add(ring);
    turntable.position.set(SHOW_X, showY, 0);
    scene.add(turntable);
  }

  // ---------- Parçacıklar ----------
  const snowTex = textTexture(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const PS = (() => {
    const MAX = 1400;
    const pos = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), age = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -1e5;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pts = new T.Points(g, new T.PointsMaterial({ map: snowTex, size: 0.55, transparent: true, depthWrite: false, opacity: 0.9 }));
    pts.frustumCulled = false;
    scene.add(pts);
    let head = 0;
    return {
      spawn(x, y, z, vx, vy, vz, l) {
        const i = head; head = (head + 1) % MAX;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
        life[i] = l; age[i] = 0;
      },
      update(dt) {
        for (let i = 0; i < MAX; i++) {
          if (life[i] <= 0) continue;
          age[i] += dt;
          if (age[i] > life[i]) { life[i] = 0; pos[i * 3 + 1] = -1e5; continue; }
          vel[i * 3 + 1] -= 4 * dt;
          const dr = 1 - 1.4 * dt;
          vel[i * 3] *= dr; vel[i * 3 + 2] *= dr;
          pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        }
        g.attributes.position.needsUpdate = true;
      },
      clear() { for (let i = 0; i < MAX; i++) { life[i] = 0; pos[i * 3 + 1] = -1e5; } },
    };
  })();
  // Kaza dumanı: koyu, büyüyen ve yükselen parçacıklar
  const smoke = (() => {
    const MAX = 240;
    const pos = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), age = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -1e5;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const mat = new T.PointsMaterial({ map: snowTex, size: 2.4, transparent: true, depthWrite: false, opacity: 0.55, color: lin(0x3a3d44) });
    const pts = new T.Points(g, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    let head = 0;
    return {
      spawn(x, y, z, vx, vy, vz, l) { const i = head; head = (head + 1) % MAX; pos.set([x, y, z], i * 3); vel.set([vx, vy, vz], i * 3); life[i] = l; age[i] = 0; },
      update(dt) {
        for (let i = 0; i < MAX; i++) {
          if (life[i] <= 0) continue;
          age[i] += dt;
          if (age[i] > life[i]) { life[i] = 0; pos[i * 3 + 1] = -1e5; continue; }
          pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        }
        g.attributes.position.needsUpdate = true;
      },
      clear() { for (let i = 0; i < MAX; i++) { life[i] = 0; pos[i * 3 + 1] = -1e5; } },
    };
  })();
  function burst(x, y, z, vx, vy, n, spread, l) {
    for (let i = 0; i < n; i++) PS.spawn(x, y, z + (Math.random() - 0.5) * 1.6, vx + (Math.random() - 0.5) * spread, vy + Math.random() * spread * 0.6, (Math.random() - 0.5) * spread, l * (0.6 + Math.random() * 0.7));
  }
  // Pist sonu: reklam panosu duvarı ve arkasında kar seti. Araba çarpınca panolar parçalanıp uçar.
  const barrier = (() => {
    const XB = hill.xBarrier;
    const yb = trackY(XB);
    const span = halfW(XB) + 4;
    const boards = [];
    const BW = 2.6, BH = 2.1;
    const palette = [0x0b1730, 0xe1342a, 0xf5b700, 0xf5f8fb, 0x1d4fbf].map(lin);
    let i = 0;
    for (let z = -span + BW / 2; z <= span - BW / 2 + 0.01; z += BW, i++) {
      const g = new T.Group();
      const back = new T.Mesh(new T.BoxGeometry(0.16, BH, BW - 0.06), gateFrame);
      g.add(back);
      const face = new T.Mesh(new T.PlaneGeometry(BW - 0.1, BH - 0.2), bannerMats[i % bannerMats.length]);
      face.rotation.y = -Math.PI / 2; face.position.x = -0.09;
      g.add(face);
      g.position.set(XB, yb + BH / 2 + 0.1, z);
      g.children.forEach((m) => { m.castShadow = true; });
      scene.add(g);
      boards.push({ g, z, color: palette[i % palette.length] });
    }
    // Fizikteki kar setiyle aynı ölçü: üstüne konulabilir, yüksekten üstünden geçilebilir
    const BH_ = hill.cfg.BANK_H, BWD = hill.cfg.BANK_W;
    const bank = new T.Mesh(new T.BoxGeometry(BWD, BH_ + 0.2, span * 2 + 6), new T.MeshStandardMaterial({ color: lin(0xeef3f9), roughness: 0.95 }));
    bank.position.set(XB + BWD / 2, yb + BH_ / 2 - 0.1, 0); bank.receiveShadow = true; bank.castShadow = true;
    scene.add(bank);
    // Uçan pano parçaları
    const N = 60;
    const bits = new T.InstancedMesh(new T.BoxGeometry(1.2, 0.7, 0.06), new T.MeshStandardMaterial({ roughness: 0.6 }), N);
    bits.castShadow = true; bits.frustumCulled = false;
    const d = [];
    const m4 = new T.Matrix4(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1);
    for (let k = 0; k < N; k++) { d.push({ p: new T.Vector3(0, -1e5, 0), v: new T.Vector3(), r: new T.Euler(), w: new T.Vector3(), on: false }); bits.setColorAt(k, palette[k % palette.length]); }
    scene.add(bits);
    let head = 0;
    return {
      XB,
      reset() {
        boards.forEach((b) => { b.g.visible = true; b.g.rotation.set(0, 0, 0); b.g.position.x = XB; });
        d.forEach((o) => { o.on = false; o.p.set(0, -1e5, 0); });
      },
      smash(speed, carZ) {
        boards.forEach((b) => {
          const near = Math.abs(b.z - carZ);
          if (near < 4.2) {
            b.g.visible = false;
            for (let k = 0; k < 7; k++) {
              const o = d[head]; head = (head + 1) % N;
              o.on = true;
              o.p.set(XB, yb + 0.5 + Math.random() * 1.8, b.z + (Math.random() - 0.5) * 2);
              o.v.set(speed * (0.25 + Math.random() * 0.35), 6 + Math.random() * speed * 0.18, (Math.random() - 0.5) * speed * 0.25);
              o.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
              bits.setColorAt((head + N - 1) % N, b.color);
            }
          } else if (near < 8) {
            b.g.rotation.z = -(0.5 + Math.random() * 0.6) * (1 - near / 8) * 1.6; // komşu panolar geriye devrilir
          }
        });
        if (bits.instanceColor) bits.instanceColor.needsUpdate = true;
      },
      update(dt) {
        for (let k = 0; k < N; k++) {
          const o = d[k];
          if (o.on) {
            o.v.y -= 9.81 * dt;
            o.v.multiplyScalar(1 - 0.35 * dt);
            o.p.addScaledVector(o.v, dt);
            const gy = terrainY(o.p.x, o.p.z) + 0.05;
            if (o.p.y < gy) { o.p.y = gy; o.v.y = Math.abs(o.v.y) * 0.2; o.v.x *= 0.5; o.v.z *= 0.5; o.w.multiplyScalar(0.5); }
            o.r.x += o.w.x * dt; o.r.y += o.w.y * dt; o.r.z += o.w.z * dt;
          }
          q.setFromEuler(o.r); m4.compose(o.p, q, one); bits.setMatrixAt(k, m4);
        }
        bits.instanceMatrix.needsUpdate = true;
      },
    };
  })();

  const debris = (() => {
    const N = 36;
    const mesh = new T.InstancedMesh(new T.BoxGeometry(0.35, 0.08, 0.25), new T.MeshStandardMaterial({ color: lin(0x22252b), roughness: 0.6, metalness: 0.4 }), N);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    const d = [];
    for (let i = 0; i < N; i++) d.push({ p: new T.Vector3(0, -1e5, 0), v: new T.Vector3(), r: new T.Euler(), w: new T.Vector3(), on: false });
    scene.add(mesh);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1);
    let head = 0;
    return {
      spawn(x, y, vx, vy, n, color) {
        if (color) mesh.material.color.copy(color);
        for (let k = 0; k < n; k++) {
          const o = d[head]; head = (head + 1) % N;
          o.on = true; o.p.set(x, y, (Math.random() - 0.5) * 2);
          o.v.set(vx + (Math.random() - 0.5) * 12, vy + Math.random() * 9, (Math.random() - 0.5) * 10);
          o.w.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
        }
      },
      update(dt) {
        for (let i = 0; i < N; i++) {
          const o = d[i];
          if (o.on) {
            o.v.y -= 9.81 * dt; o.p.addScaledVector(o.v, dt);
            const gy = terrainY(o.p.x, o.p.z);
            if (o.p.y < gy) { o.p.y = gy; o.v.y = Math.abs(o.v.y) * 0.25; o.v.x *= 0.6; o.v.z *= 0.6; o.w.multiplyScalar(0.6); }
            o.r.x += o.w.x * dt; o.r.y += o.w.y * dt; o.r.z += o.w.z * dt;
          }
          q.setFromEuler(o.r); m4.compose(o.p, q, one); mesh.setMatrixAt(i, m4);
        }
        mesh.instanceMatrix.needsUpdate = true;
      },
      clear() { for (const o of d) { o.on = false; o.p.set(0, -1e5, 0); } },
    };
  })();
  const flakes = (() => {
    const N = mobile ? 900 : 1600, BX = 90, BY = 50, BZ = 70;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = Math.random() * BX; pos[i * 3 + 1] = Math.random() * BY; pos[i * 3 + 2] = Math.random() * BZ; seed[i] = Math.random(); }
    const g = new T.BufferGeometry();
    const render = new Float32Array(N * 3);
    g.setAttribute('position', new T.BufferAttribute(render, 3));
    const pts = new T.Points(g, new T.PointsMaterial({ map: snowTex, size: 0.14, transparent: true, depthWrite: false, opacity: 0.8 }));
    pts.frustumCulled = false;
    scene.add(pts);
    const wrap = (v, o, s) => ((((v - o) % s) + s) % s) + o;
    return {
      update(dt, t, cam) {
        const ox = cam.x - BX / 2, oy = cam.y - BY / 2, oz = cam.z - BZ / 2;
        for (let i = 0; i < N; i++) {
          pos[i * 3 + 1] -= (1.2 + seed[i]) * dt;
          pos[i * 3] += Math.sin(t * 0.7 + seed[i] * 20) * 0.4 * dt;
          render[i * 3] = wrap(pos[i * 3], ox, BX);
          render[i * 3 + 1] = wrap(pos[i * 3 + 1], oy, BY);
          render[i * 3 + 2] = wrap(pos[i * 3 + 2], oz, BZ);
        }
        g.attributes.position.needsUpdate = true;
      },
    };
  })();

  // ---------- Kayıtlar ----------
  const STORE_KEY = 'sj-records-v1';
  function loadRecords() {
    try { const v = JSON.parse(localStorage.getItem(STORE_KEY)); if (v && v.list) return v; } catch (e) { /* yok */ }
    return { list: [] };
  }
  function saveRecords() { try { localStorage.setItem(STORE_KEY, JSON.stringify(G.records)); } catch (e) { /* yok */ } }

  const G = {
    phase: 'menu', carIdx: 0, run: null, wind: 0,
    acc: 0, last: 0, t: 0, slow: 1, slowT: 0, shake: 0,
    records: loadRecords(), evIdx: 0, flags: {}, wheelRot: 0, wheelSpin: 0, roll: 0, rollW: 0,
    countT: 0, toBeat: null, fov: 52, kick: 0, kickV: 0, gateIdx: 0, flash: 0,
  };
  const camState = { pos: new T.Vector3(SHOW_X + 8, showY + 3, 6), look: new T.Vector3(SHOW_X, showY + 1, 0), heading: 0, off: new T.Vector3(), lookOff: new T.Vector3() };

  // ---------- Ses ----------
  // Vitesli motor: devir hıza ve vitese göre hesaplanır; vites atınca devir düşer ve egzoz patlar.
  const GEARS = [0, 75, 125, 175, 225, 280, 420]; // her vitesin üst hızı (km/sa)
  const A = { ctx: null, on: true, gear: 1, shiftT: 0, rpm: 0.2 };
  const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* desteklenmiyor */ } };
  function noiseSrc() { const s = A.ctx.createBufferSource(); s.buffer = A.noiseBuf; s.loop = true; return s; }
  function initAudio() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      A.ctx = ac;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5;
      comp.connect(ac.destination);
      A.master = ac.createGain(); A.master.gain.value = A.on ? 0.8 : 0; A.master.connect(comp);
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      A.noiseBuf = buf;
      // Motor: üç osilatör, distorsiyon, alçak geçiren filtre
      A.o1 = ac.createOscillator(); A.o1.type = 'sawtooth';
      A.o2 = ac.createOscillator(); A.o2.type = 'square';
      A.o3 = ac.createOscillator(); A.o3.type = 'sawtooth'; A.o3.detune.value = 9;
      const mix = ac.createGain(); mix.gain.value = 0.33;
      [A.o1, A.o2, A.o3].forEach((o) => o.connect(mix));
      const shaper = ac.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let k = 0; k < 1024; k++) { const x = k / 512 - 1; curve[k] = Math.tanh(x * 3.2); }
      shaper.curve = curve;
      A.engF = ac.createBiquadFilter(); A.engF.type = 'lowpass'; A.engF.Q.value = 2;
      A.engG = ac.createGain(); A.engG.gain.value = 0;
      mix.connect(shaper); shaper.connect(A.engF); A.engF.connect(A.engG); A.engG.connect(A.master);
      // Emiş gürültüsü
      A.intake = noiseSrc();
      A.intakeF = ac.createBiquadFilter(); A.intakeF.type = 'bandpass'; A.intakeF.Q.value = 0.9;
      A.intakeG = ac.createGain(); A.intakeG.gain.value = 0;
      A.intake.connect(A.intakeF); A.intakeF.connect(A.intakeG); A.intakeG.connect(A.master);
      // Rüzgâr
      A.wind = noiseSrc();
      A.windF = ac.createBiquadFilter(); A.windF.type = 'bandpass'; A.windF.Q.value = 0.6;
      A.windG = ac.createGain(); A.windG.gain.value = 0;
      A.wind.connect(A.windF); A.windF.connect(A.windG); A.windG.connect(A.master);
      // Nitro uğultusu ve turbo ıslığı
      A.roar = noiseSrc();
      A.roarF = ac.createBiquadFilter(); A.roarF.type = 'lowpass'; A.roarF.frequency.value = 520;
      A.roarG = ac.createGain(); A.roarG.gain.value = 0;
      A.roar.connect(A.roarF); A.roarF.connect(A.roarG); A.roarG.connect(A.master);
      A.whistle = ac.createOscillator(); A.whistle.type = 'sine';
      A.whistleG = ac.createGain(); A.whistleG.gain.value = 0;
      A.whistle.connect(A.whistleG); A.whistleG.connect(A.master);
      [A.o1, A.o2, A.o3, A.intake, A.wind, A.roar, A.whistle].forEach((n) => n.start());
    } catch (e) { A.ctx = null; }
  }
  function burstSound(type, freq, q, gain, dur, sweepTo) {
    if (!A.ctx) return;
    const ac = A.ctx, t = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = A.noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(A.master); src.start(t); src.stop(t + dur + 0.05);
  }
  function sub(from, to, gain, dur) {
    if (!A.ctx) return;
    const ac = A.ctx, t = ac.currentTime;
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + dur + 0.05);
  }
  const SFX = {
    thump: (k) => { burstSound('lowpass', 300 + k * 700, 0.7, Math.min(1, 0.3 + k * 0.5), 0.25 + k * 0.45); sub(90, 32, 0.6 * Math.min(1, k + 0.3), 0.35 + k * 0.3); },
    pop: () => { burstSound('highpass', 1400, 0.7, 0.35, 0.06); sub(140, 60, 0.25, 0.08); },
    nitro: () => { burstSound('highpass', 300, 0.8, 0.9, 0.7, 4200); sub(70, 40, 0.7, 0.5); },
    gate: (k) => burstSound('bandpass', 900 + k * 900, 1.4, 0.18 + k * 0.12, 0.16, 300),
    wall: (k) => { burstSound('lowpass', 900, 0.7, 1, 0.9 * k); burstSound('bandpass', 2600, 2, 0.45 * k, 0.6); burstSound('bandpass', 5200, 3, 0.25 * k, 0.45); sub(70, 25, 0.9, 0.8); },
    crowd: (k) => { burstSound('bandpass', 850, 0.4, 0.35 * k, 2.4); burstSound('bandpass', 1900, 0.6, 0.18 * k, 1.8); },
  };
  function updateAudio(dt) {
    if (!A.ctx) return;
    const r = G.run, t = A.ctx.currentTime;
    let eg = 0, ef = 40, cut = 600, ig = 0, wg = 0, wf = 300, rg = 0, wh = 0;
    if (r && (G.phase === 'run' || G.phase === 'result') && r.mode !== 'wreck') {
      const sp = SJ.speedOf(r), kmh = sp * 3.6;
      let rpm;
      if (r.mode === 'air' && !r.landed) {
        rpm = 0.97 + Math.sin(G.t * 38) * 0.03; // havada devir sınırında
      } else {
        let g = 1; while (g < GEARS.length - 1 && kmh > GEARS[g]) g++;
        if (g > A.gear && !r.landed) { A.shiftT = 0.14; SFX.pop(); }
        A.gear = g;
        const lo = g === 1 ? 0 : GEARS[g - 1] * 0.82;
        rpm = 0.28 + 0.72 * clamp((kmh - lo) / (GEARS[g] - lo), 0, 1);
      }
      if (A.shiftT > 0) { A.shiftT -= dt; rpm *= 0.72; }
      if (r.landed) rpm = Math.min(rpm, 0.25 + sp / 160);
      A.rpm += (rpm - A.rpm) * Math.min(1, dt * 18);
      const load = r.landed ? 0.25 : r.mode === 'air' ? 0.55 : 1;
      ef = 34 + A.rpm * 170 + (r.nitro ? 14 : 0);
      cut = 500 + A.rpm * 2600 * load + (r.nitro ? 1200 : 0);
      const coast = r.landed ? clamp(sp / 40, 0, 1) : 1; // durunca motor sesi tamamen kesilir
      eg = (r.landed ? 0.12 : 0.3) * coast + (r.nitro ? 0.1 : 0);
      ig = (0.05 + A.rpm * 0.1 * load) * coast;
      wf = 250 + sp * 14;
      wg = clamp(sp / 90, 0, 1) * (r.mode === 'air' ? 0.55 : 0.22);
      rg = r.nitro ? 0.55 : 0;
      wh = r.nitro ? 0.035 : 0;
      A.whistle.frequency.setTargetAtTime(2200 + sp * 14, t, 0.1);
    }
    if (G.phase === 'ready' || G.phase === 'count') { ef = 40 + Math.sin(G.t * 9) * 4; eg = 0.18; cut = 900; ig = 0.04; A.gear = 1; }
    A.o1.frequency.setTargetAtTime(ef, t, 0.03);
    A.o2.frequency.setTargetAtTime(ef * 0.5, t, 0.03);
    A.o3.frequency.setTargetAtTime(ef * 2, t, 0.03);
    A.engF.frequency.setTargetAtTime(cut, t, 0.04);
    A.engG.gain.setTargetAtTime(eg, t, 0.06);
    A.intakeF.frequency.setTargetAtTime(700 + A.rpm * 2200, t, 0.05);
    A.intakeG.gain.setTargetAtTime(ig, t, 0.06);
    A.windF.frequency.setTargetAtTime(wf, t, 0.1);
    A.windG.gain.setTargetAtTime(wg, t, 0.12);
    A.roarG.gain.setTargetAtTime(rg, t, 0.08);
    A.whistleG.gain.setTargetAtTime(wh, t, 0.1);
  }
  const thump = (k) => SFX.thump(k);
  $('muteBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    A.on = !A.on;
    $('muteBtn').textContent = A.on ? 'Ses: açık' : 'Ses: kapalı';
    if (A.ctx) A.master.gain.setTargetAtTime(A.on ? 0.8 : 0, A.ctx.currentTime, 0.05);
  });

  // ---------- Spiker ----------
  let tickerTimer = 0;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function say(text, dur) {
    $('tickerText').textContent = text;
    $('ticker').classList.add('on');
    tickerTimer = dur || 2.8;
  }

  // ---------- Garaj ----------
  const maxPW = Math.max(...CARS.map((c) => c.power / c.mass));
  const maxGlide = Math.max(...CARS.map((c) => c.cla / c.mass));
  const maxMass = Math.max(...CARS.map((c) => c.mass));
  const maxTough = Math.max(...CARS.map((c) => c.crashVn));
  function bestFor(id) {
    const l = G.records.list.filter((e) => e.car === id && !e.crashed);
    return l.length ? l.reduce((a, b) => (b.dist > a.dist ? b : a)) : null;
  }
  function bestDistance() {
    const l = G.records.list.filter((e) => !e.crashed);
    return l.length ? Math.max(...l.map((e) => e.dist)) : null;
  }
  function renderGarage() {
    const car = CARS[G.carIdx];
    $('carCls').textContent = car.cls;
    $('carName').textContent = car.name;
    $('carDesc').textContent = car.desc;
    $('dots').innerHTML = CARS.map((_, i) => `<i class="${i === G.carIdx ? 'on' : ''}"></i>`).join('');
    const stat = (label, val, v) => `<div class="stat"><div class="stat-row"><span>${label}</span><b>${val}</b></div><span class="bar"><b style="width:${Math.round(v * 100)}%"></b></span></div>`;
    $('carStats').innerHTML =
      stat('Güç', Math.round(car.power / 745.7) + ' hp', car.power / car.mass / maxPW) +
      stat('Ağırlık', car.mass + ' kg', car.mass / maxMass) +
      stat('Süzülme', Math.round((car.cla / car.mass) / maxGlide * 10) + '/10', car.cla / car.mass / maxGlide) +
      stat('Dayanıklılık', Math.round(car.crashVn / maxTough * 10) + '/10', car.crashVn / maxTough);
    const pb = bestFor(car.id);
    $('carPb').textContent = pb ? `En iyi: ${pb.dist.toFixed(1)} m` : 'Henüz atlamadı';
    const top = G.records.list.filter((e) => !e.crashed).sort((a, b) => b.total - a.total)[0];
    const leader = $('leader');
    leader.hidden = !top;
    if (top) { const c = CARS.find((x) => x.id === top.car); leader.textContent = `Lider: ${top.dist.toFixed(1)} m · ${c ? c.name : top.car} · ${top.total.toFixed(1)} puan`; }
    useCar(G.carIdx);
  }
  function stepCar(d) { G.carIdx = (G.carIdx + d + CARS.length) % CARS.length; renderGarage(); }
  $('prevCar').addEventListener('click', (e) => { e.stopPropagation(); stepCar(-1); });
  $('nextCar').addEventListener('click', (e) => { e.stopPropagation(); stepCar(1); });
  $('menuHill').textContent = `${hill.cfg.name} · K-${hill.K} · HS-${hill.HS}`;
  $('hudHill').textContent = `${hill.cfg.name} · HS${hill.HS}`;

  // ---------- Akış ----------
  function showMenu() {
    G.phase = 'menu';
    G.run = null;
    $('menu').hidden = false; $('result').hidden = true; $('hud').hidden = true;
    turntable.visible = true;
    beat.set(null);
    PS.clear(); debris.clear(); barrier.reset();
    renderGarage();
    resetDamage(activeCar);
  }
  function startRun() {
    initAudio();
    const car = CARS[G.carIdx];
    useCar(G.carIdx);
    resetDamage(activeCar);
    G.wind = Math.round((Math.random() * 8 - 4) * 10) / 10;
    G.run = SJ.newRun(car, hill, G.wind);
    G.evIdx = 0; G.flags = {}; G.gateIdx = 0; G.kick = 0; G.kickV = 0; A.gear = 1; G.slow = 1; G.slowT = 0; G.wheelRot = 0; G.wheelSpin = 0; G.roll = 0; G.rollW = 0; G.acc = 0;
    PS.clear(); debris.clear(); barrier.reset(); smoke.clear();
    G.toBeat = bestDistance();
    beat.set(G.toBeat);
    turntable.visible = false;
    G.phase = 'ready';
    $('menu').hidden = true; $('result').hidden = true; $('hud').hidden = false;
    $('hudCar').textContent = car.name;
    $('hudDist').hidden = true;
    $('meter').hidden = true;
    $('meterTap').hidden = true;
    const bt = $('hudBeat');
    bt.hidden = G.toBeat === null;
    if (G.toBeat !== null) bt.textContent = `Geçilecek: ${G.toBeat.toFixed(1)} m`;
    const head = G.wind < 0;
    $('hudWind').className = 'wind ' + (head ? 'head' : 'tail');
    $('windVal').textContent = `${Math.abs(G.wind).toFixed(1)} m/s ${head ? 'önden' : 'arkadan'}`;
    $('windArrow').setAttribute('transform', head ? 'rotate(180 13 7)' : '');
    snapCamera();
    G.fov = 58;
    setPrompt('Hazır olunca ekrana dokun', false);
    say(`${car.name} start kapısında. Rüzgâr ${Math.abs(G.wind).toFixed(1)} metre ${head ? 'önden, atlayış için iyi haber' : 'arkadan, işi zor'}.`, 4);
  }
  function setPrompt(text, hot) {
    const p = $('prompt');
    if (p.textContent !== text) p.textContent = text;
    p.classList.toggle('hot', !!hot);
  }
  $('goBtn').addEventListener('click', (e) => { e.stopPropagation(); startRun(); });

  // ---------- Giriş ----------
  const isUi = (t) => t.closest && t.closest('button, summary, details, .garage, #result');
  function down() {
    initAudio();
    if (G.phase === 'ready') { G.phase = 'count'; G.countT = 0; $('lights').hidden = false; return; }
    if (G.phase === 'run' && G.run) SJ.press(G.run);
  }
  function up() { if (G.run) SJ.release(G.run); }
  $('app').addEventListener('pointerdown', (e) => { if (isUi(e.target)) return; e.preventDefault(); down(); });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('keydown', (e) => {
    if (G.phase === 'menu') {
      if (e.code === 'ArrowLeft') stepCar(-1);
      else if (e.code === 'ArrowRight') stepCar(1);
      return;
    }
    if (e.code !== 'Space' || e.repeat || G.phase === 'result') return;
    e.preventDefault(); down();
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') up(); });

  // ---------- Olaylar ----------
  function carCenter(r) {
    if (r.mode === 'wreck') return { x: r.x, y: r.y };
    return { x: r.x - Math.sin(r.phi) * r.car.h / 2, y: r.y + Math.cos(r.phi) * r.car.h / 2 };
  }
  function handleEvents() {
    const r = G.run;
    while (G.evIdx < r.events.length) {
      const e = r.events[G.evIdx++];
      const car = r.car;
      switch (e.type) {
        case 'nitro':
          if (!G.flags.nitroSaid) { G.flags.nitroSaid = true; say(pick(['Nitro açıldı! Motor bağırıyor!', 'Ve nitro! Mavi alev arkada!', 'Nitroya bastı, hız tavan yapıyor!']), 2.2); }
          G.kickV += 7; G.shake = Math.max(G.shake, 0.35); G.flash = 0.6;
          SFX.nitro(); buzz(45);
          break;
        case 'nitroEnd':
          if (r.x > hill.cfg.NZ1 - 2 && !G.flags.nitroEnd) { G.flags.nitroEnd = true; say(`Nitro bitti, ${Math.round(r.v * 3.6)} km/sa! Şimdi bırak ve kenarı bekle.`, 2.4); }
          break;
        case 'bumpAir': if (e.speed > 25 && !G.flags.bumpSaid) { G.flags.bumpSaid = true; say(pick(['Engebede havalandı!', 'Tümsek onu fırlattı, dikkat!', 'Pist engebeli, araba zıplıyor!'])); } break;
        case 'bumpLand':
          burst(r.x, hill.y(r.x) + 0.2, 0, r.v * 0.5, 2, 18, 5, 0.9);
          if (!e.crash && (e.diff > 10 || e.vn > 5)) { say(pick(['Sert indi, hız kaybediyor!', 'Burun yere vurdu, değerli km/sa gidiyor.'])); thump(0.5); G.shake = 0.3; }
          break;
        case 'takeoff': {
          const kmh = Math.round(e.speed * 3.6);
          let line;
          if (e.q === null) line = `Kenarda ${kmh} km/sa ama hiç zıplamadı!`;
          else if (e.q > 0.85) line = `Kusursuz kalkış! Tam kenardan, ${kmh} km/sa!`;
          else if (e.q > 0.5) line = `İyi zamanlama, ${kmh} km/sa ile havada.`;
          else line = `Biraz erken bastı. ${kmh} km/sa ile havalandı.`;
          say(line, 2.6);
          G.slow = 0.33; G.slowT = 0.7; G.flash = 1; G.kickV -= 5;
          SFX.crowd(1); buzz([25, 30, 60]);
          const tap = $('meterTap');
          if (r.tapX !== null) { tap.hidden = false; tap.style.left = clamp(100 - (hill.TO - r.tapX) / 120 * 100, 0, 100) + '%'; }
          break;
        }
        case 'late': say('Geç bastı! Kenarı kaçırdı, zayıf bir itiş.'); break;
        case 'land': {
          const strength = clamp(e.vn / car.crashVn, 0, 1.5);
          burst(r.x, hill.y(r.x) + 0.3, 0, r.vx * 0.5, 3 + e.vn * 0.5, 70, 9, 1.4);
          G.shake = 0.3 + strength * 0.7;
          thump(strength); buzz(e.crash ? [90, 40, 140] : 50);
          if (!e.crash) SFX.crowd(0.8);
          if (!e.crash) {
            if (e.diff < 6 && e.vn < 6) say(pick(['Yumuşacık iniş! Hakemler bunu sever.', 'Telemark gibi! Dört teker aynı anda!', 'Kusursuz iniş, tüy gibi!']), 3);
            else if (e.diff < 15) say(pick(['Dengeli bir iniş.', 'Biraz sert ama kontrol onda.']), 3);
            else say('Burun önde indi, stil puanı gidecek!', 3);
          }
          break;
        }
        case 'crash': {
          const p = carCenter(r);
          applyDamage(activeCar, e.lx, e.ly, e.cost);
          debris.spawn(p.x, p.y, r.vx * 0.6, 4, 22, lin(car.color));
          burst(p.x, p.y, 0, r.vx * 0.4, 4, 120, 12, 1.6);
          G.shake = 1.4; G.slow = 0.3; G.slowT = 1.0;
          G.rollW = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4);
          thump(1.5);
          say(r.dnf ? 'Ve kaza! İnişte kontrolü kaybetti, diskalifiye!' : pick(['Ve kaza! Araç takla atıyor!', 'Olamaz! Sert iniş, araba paramparça!', 'Kaza! Mesafe sayılır ama stil puanı uçtu.']), 3.5);
          break;
        }
        case 'wall': {
          const p = carCenter(r);
          applyDamage(activeCar, e.lx, e.ly, e.cost);
          barrier.smash(e.speed, 0);
          debris.spawn(p.x, p.y, -4, 6, 26, lin(car.color));
          burst(hill.xBarrier - 1, p.y, 0, 6, 8, 160, 16, 1.8);
          G.shake = 1.8; G.slow = 0.28; G.slowT = 1.1; G.flash = 0.8;
          G.rollW = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 5);
          SFX.wall(clamp(e.speed / 80, 0.4, 1.4)); buzz([120, 50, 200]);
          say(pick([`Ve panolara ${Math.round(e.speed * 3.6)} km/sa ile daldı! Ortalık savaş alanı!`, 'Panolar paramparça! Bu reklamın faturası ağır olacak!', 'Duvara tam gaz! Araba takla atıyor!']), 3.5);
          break;
        }
        case 'impact': { const p = carCenter(r); applyDamage(activeCar, e.lx, e.ly, e.cost); G.rollW += (Math.random() - 0.5) * e.hit * 0.8; burst(p.x, p.y - 0.4, 0, r.vx * 0.3, 3, 30, 7, 1.1); debris.spawn(p.x, p.y, r.vx * 0.5, 3, 3); thump(clamp(e.hit / 15, 0.2, 1)); G.shake = Math.max(G.shake, 0.5); break; }
        default: break;
      }
    }
  }
  function flightComments(r) {
    if (!r.jumped || r.landed || r.mode !== 'air') return;
    const d = hill.arcAt(r.x);
    if (!G.flags.k && d > hill.K) { G.flags.k = true; say('K noktasını geçti! Hâlâ havada!', 2); }
    if (G.toBeat !== null && !G.flags.beat && d > G.toBeat) { G.flags.beat = true; say('Yeşil çizgiyi geçiyor! Liderliğe uçuyor!', 2.2); }
    if (!G.flags.hs && d > hill.HS) { G.flags.hs = true; say('HS sınırını aştı! Bu iniş çok tehlikeli!', 2.2); }
  }

  // ---------- Sonuç ----------
  function damageNote(r) {
    const parts = [];
    const tumbles = r.events.filter((e) => e.type === 'impact').length;
    if (r.crashed) parts.push(tumbles ? `Yere çakıldı, ${tumbles} kez yuvarlandı` : 'Yere çakıldı');
    if (r.wallHit) parts.push(`panolara ${Math.round(r.wallSpeed * 3.6)} km/sa ile çarptı`);
    const t = parts.join(', ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function showResult() {
    const r = G.run;
    G.phase = 'result';
    const sc = SJ.score(r);
    const car = r.car;
    const prevBest = bestFor(car.id);
    const prevTop = G.records.list.filter((e) => !e.crashed).reduce((m, e) => Math.max(m, e.total), -1);
    const crashed = r.crashed || sc.dnf;
    if (!sc.dnf) { G.records.list.push({ car: car.id, dist: sc.dist, total: sc.total, crashed, at: Date.now() }); G.records.list = G.records.list.slice(-60); saveRecords(); }
    const isTop = !crashed && sc.total > prevTop;
    const isPb = !crashed && (!prevBest || sc.dist > prevBest.dist);
    const tag = sc.dnf ? 'Diskalifiye' : r.crashed ? 'Kaza' : isTop ? 'Yeni lider' : isPb ? 'Kişisel rekor' : 'Sonuç';
    const tagCls = (isTop || isPb) && !r.crashed ? 'res-tag rec' : 'res-tag';
    let note;
    if (sc.dnf) note = 'Kenara ulaşamadan kaza yaptı. Engebelerden sonra basılı tutarak burnu dengede tut.';
    else if (r.crashed) note = r.landVn > car.crashVn ? `İniş çok sert (${r.landVn.toFixed(1)} m/s). Yere yaklaşırken basılı tutup süzülerek düşüşü yumuşat.` : `Araç yokuşa ${r.landDiff.toFixed(0)}° açıyla indi. İnişte yokuşa paralel ol.`;
    else if (r.q === null) note = 'Kenarda zıplamadın. Sarı bölgede, kenara olabildiğince yakın dokun.';
    else if (sc.dist < hill.K - 60) note = 'Uçuşta daha uzun basılı tut: burun kalkınca araba süzülür.';
    else if (sc.dist > hill.HS) note = 'HS sınırının ötesi düzlük. Daha uzağa uçmak, daha sert iniş demek.';
    else note = `Kalkış: ${Math.round(r.q * 100)}% · Kenarda ${Math.round(r.edgeSpeed * 3.6)} km/sa · İniş açısı ${r.landDiff.toFixed(0)}°`;
    if (isTop && G.toBeat === null) note = 'İlk kayıt. Yeşil çizgi artık bu mesafede.';
    const lo = sc.dropped ? sc.judges.indexOf(sc.dropped[0]) : -1;
    const hi = sc.dropped ? sc.judges.lastIndexOf(sc.dropped[1]) : -1;
    const judgesHtml = sc.judges.map((j, i) => `<span class="judge${i === lo || i === hi ? ' drop' : ''}">${j.toFixed(1)}</span>`).join('');
    const fmt = (v) => (v > 0 ? '+' : '') + v.toFixed(1);
    $('resBox').innerHTML = `
      <div class="res-head"><span class="${tagCls}">${tag}</span><span class="res-who">${car.name} · ${car.cls}</span></div>
      <div class="res-main">
        <div class="res-dist">${sc.dnf ? '—' : sc.dist.toFixed(1)}<small>m</small></div>
        <div class="res-total"><small>Toplam puan</small><b>${sc.total.toFixed(1)}</b></div>
        <div class="res-note">${note}</div>
        ${r.damage > 0 ? `<div class="res-damage"><span>Hasar bedeli</span><b>${(Math.round(r.damage / 100) * 100).toLocaleString('tr-TR')} ₺</b><span>${damageNote(r)}</span></div>` : ''}
      </div>
      ${sc.dnf ? '' : `<div class="res-table">
        <div class="judges"><span class="jl">Hakemler</span>${judgesHtml}</div>
        <div class="pts">
          <div class="pt"><small>Mesafe puanı</small><b>${sc.distPts.toFixed(1)}</b></div>
          <div class="pt"><small>Stil puanı</small><b>${sc.stylePts.toFixed(1)}</b></div>
          <div class="pt"><small>Rüzgâr düzeltmesi</small><b>${fmt(sc.windPts)}</b></div>
          <div class="pt"><small>K-${hill.K} farkı</small><b>${fmt(sc.dist - hill.K)} m</b></div>
        </div>
      </div>`}
      <div class="row res-actions">
        <button class="go" id="againBtn" type="button">Tekrar atla</button>
        <button class="ghost" id="menuBtn" type="button">Garaja dön</button>
      </div>`;
    $('result').hidden = false;
    $('hud').hidden = true;
    $('againBtn').addEventListener('click', (e) => { e.stopPropagation(); startRun(); });
    $('menuBtn').addEventListener('click', (e) => { e.stopPropagation(); showMenu(); });
  }

  // ---------- Kamera: arabanın arkasında ve üstünde ----------
  const V = new T.Vector3(), V2 = new T.Vector3();
  const landscape = () => camera.aspect > 1.4 && canvas.clientHeight < 560;
  function cameraTarget(r) {
    const p = carCenter(r);
    const sp = r.mode === 'wreck' ? Math.hypot(r.vx, r.vy) : SJ.speedOf(r);
    let heading;
    if (r.mode === 'ground') heading = r.phi;
    else if (r.mode === 'air') heading = Math.atan2(r.vy, r.vx);
    else heading = camState.heading;
    let dist, height, ahead, lookUp, side = 0;
    if (G.phase === 'ready' || G.phase === 'count') { dist = 8.6; height = 3.0; ahead = 18; lookUp = -1.2; }
    else if (r.mode === 'wreck') { dist = 13; height = 6; ahead = 0; lookUp = 0; }
    else if (r.mode === 'air' && r.jumped && !r.landed) { dist = 8 + G.kick; height = 2.7; ahead = 30; lookUp = -4 - (landscape() ? 2 : 0); side = 0.5; }
    else { dist = 5.0 + sp * 0.012 + G.kick; height = 1.45 + sp * 0.005; ahead = 18 + sp * 0.15; lookUp = landscape() ? -1.6 : -0.2; }
    return { p, heading, dist, height, ahead, lookUp, side, sp };
  }
  // Kamera arabaya göre bir ofsette durur; ofset yumuşatılır, mutlak konum değil.
  // Böylece yüksek hızda kamera geride kalmaz.
  const OFF = new T.Vector3(), LOFF = new T.Vector3();
  function placeCamera(c, kPos, kLook, kHead) {
    camState.heading += (c.heading - camState.heading) * kHead;
    const hx = Math.cos(camState.heading), hy = Math.sin(camState.heading);
    V.set(c.p.x - hx * c.dist, c.p.y - hy * c.dist + c.height, c.side * c.dist * 0.3);
    const floor = terrainY(V.x, V.z) + 1.1;
    if (V.y < floor) V.y = floor;
    V2.set(c.p.x + hx * c.ahead, c.p.y + hy * c.ahead + c.lookUp + 0.4, 0);
    OFF.set(V.x - c.p.x, V.y - c.p.y, V.z);
    LOFF.set(V2.x - c.p.x, V2.y - c.p.y, 0);
    camState.off.lerp(OFF, kPos);
    camState.lookOff.lerp(LOFF, kLook);
    camState.pos.set(c.p.x + camState.off.x, c.p.y + camState.off.y, camState.off.z);
    const fl = terrainY(camState.pos.x, camState.pos.z) + 0.9;
    if (camState.pos.y < fl) camState.pos.y = fl;
    camState.look.set(c.p.x + camState.lookOff.x, c.p.y + camState.lookOff.y, camState.lookOff.z);
  }
  function snapCamera() {
    const c = cameraTarget(G.run);
    camState.heading = c.heading;
    placeCamera(c, 1, 1, 1);
  }
  function updateCamera(dt) {
    G.kickV += (-30 * G.kick - 7 * G.kickV) * dt;
    G.kick += G.kickV * dt;
    if (G.phase === 'menu' || !G.run) {
      const a = G.t * 0.22;
      const portrait = camera.aspect < 1;
      const R = portrait ? 10.5 : 8.4;
      V.set(SHOW_X + Math.cos(a) * R, showY + (portrait ? 2.0 : 1.7) + Math.sin(G.t * 0.3) * 0.2, Math.sin(a) * R);
      camState.pos.lerp(V, 1 - Math.exp(-dt * 3));
      camState.look.lerp(V2.set(SHOW_X, showY + (portrait ? -0.9 : 0.3), 0), 1 - Math.exp(-dt * 3));
      G.fov += ((portrait ? 58 : 46) - G.fov) * (1 - Math.exp(-dt * 2));
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (camera.aspect > 1.2) camera.setViewOffset(w, h, w * 0.2, 0, w, h); else camera.clearViewOffset();
    } else {
      const r = G.run;
      if (camera.view && camera.view.enabled) camera.clearViewOffset();
      const c = cameraTarget(r);
      placeCamera(c, 1 - Math.exp(-dt * 3), 1 - Math.exp(-dt * 5), 1 - Math.exp(-dt * 3.5));
      const kmh = c.sp * 3.6;
      G.camK = { kmh, ground: r.mode === 'ground' && !r.landed, nitro: r.nitro > 0 };
      const targetFov = Math.min(104, (camera.aspect < 1 ? 66 : 56) + clamp(kmh - 60, 0, 300) * 0.085 + (r.nitro > 0 ? 9 : 0));
      G.fov += (targetFov - G.fov) * (1 - Math.exp(-dt * (r.nitro > 0 ? 5 : 2.5)));
    }
    camera.position.copy(camState.pos);
    if (G.shake > 0) {
      const s = G.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
      G.shake = Math.max(0, G.shake - dt * 1.8);
    }
    // Hıza bağlı sürekli titreşim: yüksek hızda kamera sarsılır
    let roll = 0;
    if (G.run && G.camK && G.phase !== 'menu') {
      const k = G.camK;
      const amp = clamp((k.kmh - 90) / 260, 0, 1) * (k.ground ? 0.06 : 0.025) + (k.nitro ? 0.045 : 0);
      camera.position.x += (Math.sin(G.t * 53) + Math.sin(G.t * 31.7)) * amp * 0.5;
      camera.position.y += (Math.sin(G.t * 47.3) + Math.sin(G.t * 23.1)) * amp * 0.5;
      camera.position.z += Math.sin(G.t * 39.9) * amp * 0.5;
      roll = Math.sin(G.t * 17) * amp * 0.12;
    }
    camera.lookAt(camState.look);
    if (roll) camera.rotateZ(roll);
    if (Math.abs(camera.fov - G.fov) > 0.01) { camera.fov = G.fov; camera.updateProjectionMatrix(); }
  }

  // ---------- Arabayı sahneye yerleştir ----------
  function syncCar(dt) {
    const m = activeCar;
    if (!m) return;
    const g = m.group;
    if (G.phase === 'menu' || !G.run) {
      g.position.set(SHOW_X, showY + 0.16, 0);
      g.rotation.set(0, G.t * 0.25, 0);
      turntable.rotation.y = G.t * 0.25;
      m.wheels.forEach((w) => { w.rotation.z = 0; });
      m.exhausts.forEach((f) => { f.visible = false; });
      MAT.tail.emissiveIntensity = 1.6;
      return;
    }
    const r = G.run;
    if (r.mode === 'wreck') {
      G.roll += G.rollW * dt; G.rollW *= 1 - 0.6 * dt;
      g.position.set(r.x + Math.sin(r.phi) * r.car.h / 2, r.y - Math.cos(r.phi) * r.car.h / 2, 0);
    } else {
      g.position.set(r.x, r.y, 0);
    }
    g.rotation.order = 'ZXY';
    g.rotation.set(G.roll, 0, r.phi);
    for (const w of m.wheels) if (w.parent === g) w.rotation.z = -G.wheelRot;
    const on = r.nitro > 0 && r.mode !== 'wreck';
    m.exhausts.forEach((f) => {
      f.visible = on;
      if (on) { const s = 0.7 + Math.random() * 0.6; f.scale.set(1.25, s * 1.5, 1.25); f.position.x = -r.car.len / 2 - 0.08 - s * 0.75; }
    });
    MAT.tail.emissiveIntensity = r.landed && r.mode === 'ground' && r.t - r.landT > 0.8 ? 5 : 1.6;
  }

  // ---------- HUD ----------
  function updateHud(r) {
    const sp = r.mode === 'wreck' ? 0 : SJ.speedOf(r);
    $('hudSpeed').textContent = String(Math.round(sp * 3.6));
    $('hudSpeed').parentElement.classList.toggle('nitro', r.nitro > 0);
    const dEl = $('hudDist');
    if (r.jumped) {
      const d = r.landed ? Math.round(r.dist * 2) / 2 : hill.arcAt(r.x);
      dEl.hidden = false;
      $('hudDistVal').textContent = d.toFixed(1);
      dEl.classList.toggle('over', G.toBeat !== null && d > G.toBeat);
    }
    // Rampa göstergesi: start → nitro bölgesi → burun kaldırma bölgesi → kenar
    const meter = $('meter');
    const pct = (x) => clamp(x / hill.TO * 100, 0, 100);
    if (!r.jumped) {
      meter.hidden = false;
      const mn = $('meterNitro');
      mn.style.left = pct(NZ0) + '%'; mn.style.width = (pct(NZ1) - pct(NZ0)) + '%';
      mn.classList.toggle('burn', r.nitro > 0);
      $('meterZone').style.left = pct(hill.TO - SJ.ZONE) + '%';
      $('meterCar').style.left = pct(r.x) + '%';
    } else if (r.airT > 0.35) meter.hidden = true;

    if (G.phase !== 'run') return;
    if (r.mode === 'wreck' || r.landed) { setPrompt('', false); return; }
    const toEdge = hill.TO - r.x;
    if (!r.jumped) {
      if (r.x < NZ0) setPrompt(r.x < NZ0 - 18 ? 'Tam gaz' : 'Nitro geliyor · bas ve tut', r.x >= NZ0 - 18);
      else if (r.x <= NZ1) setPrompt(r.nitro ? 'NİTRO!' : 'Basılı tut: nitro', !r.nitro);
      else if (toEdge > SJ.ZONE) setPrompt(r.hold ? 'Bırak!' : 'Bekle… sarı bölgede bas', !!r.hold);
      else setPrompt(r.tapX === null ? 'Şimdi bas: burnu kaldır!' : 'Burun yukarıda · tut', r.tapX === null);
    } else {
      const gap = r.y - hill.y(r.x);
      const d = hill.arcAt(r.x);
      if (r.hold) setPrompt(d > hill.HS - 40 ? 'HS yaklaşıyor · bırak!' : gap < 6 ? 'Yere paralel ol' : 'Süzülüyor · bırak: in', d > hill.HS - 40);
      else setPrompt('Basılı tut: süzül', false);
    }
  }

  // ---------- Ekran efektleri: hız çizgileri, kenar karartma, nitro parlaması ----------
  const fx = $('fx');
  const fctx = fx.getContext('2d');
  const streaks = [];
  for (let i = 0; i < 90; i++) streaks.push({ a: Math.random() * Math.PI * 2, r: Math.random(), w: 0.5 + Math.random() * 1.5 });
  const proj = new T.Vector3();
  function drawFx(dt) {
    const w = fx.clientWidth, h = fx.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (fx.width !== Math.round(w * dpr) || fx.height !== Math.round(h * dpr)) { fx.width = Math.round(w * dpr); fx.height = Math.round(h * dpr); }
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.clearRect(0, 0, w, h);
    const r = G.run;
    if (!r || G.phase === 'menu' || r.mode === 'wreck') { G.flash = 0; return; }
    const kmh = SJ.speedOf(r) * 3.6;
    const nitro = r.nitro > 0;
    // Kaçış noktası: kameranın baktığı nokta
    proj.copy(camState.look).project(camera);
    const cx = (proj.x * 0.5 + 0.5) * w, cy = (-proj.y * 0.5 + 0.5) * h;
    const diag = Math.hypot(w, h) * 0.6;
    const k = clamp((kmh - 110) / 220, 0, 1);
    const n = Math.floor(streaks.length * Math.min(1, k + (nitro ? 0.45 : 0)));
    const speed = 1.6 + k * 4.5 + (nitro ? 3 : 0);
    fctx.lineCap = 'round';
    for (let i = 0; i < streaks.length; i++) {
      const st = streaks[i];
      st.r += st.r * speed * dt + 0.02 * dt;
      if (st.r > 1.25) { st.r = 0.32 + Math.random() * 0.2; st.a = Math.random() * Math.PI * 2; }
      if (i >= n) continue;
      const r0 = st.r * diag, r1 = r0 * (1 + 0.12 + k * 0.25 + (nitro ? 0.2 : 0));
      const ca = Math.cos(st.a), sa = Math.sin(st.a);
      const alpha = clamp((st.r - 0.4) * 1.8, 0, 1) * (0.35 + k * 0.45);
      fctx.strokeStyle = nitro ? `rgba(160,215,255,${alpha})` : `rgba(255,255,255,${alpha})`;
      fctx.lineWidth = st.w * (1 + st.r);
      fctx.beginPath(); fctx.moveTo(cx + ca * r0, cy + sa * r0); fctx.lineTo(cx + ca * r1, cy + sa * r1); fctx.stroke();
    }
    // Kenar karartma ve nitro mavisi
    const vig = 0.18 + k * 0.45 + (nitro ? 0.2 : 0);
    const grad = fctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.28, cx, cy, diag * 1.1);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, nitro ? `rgba(20,70,160,${vig})` : `rgba(5,12,28,${vig})`);
    fctx.fillStyle = grad; fctx.fillRect(0, 0, w, h);
    if (G.flash > 0) {
      fctx.fillStyle = `rgba(255,255,255,${G.flash * 0.35})`;
      fctx.fillRect(0, 0, w, h);
      G.flash = Math.max(0, G.flash - dt * 3);
    }
  }
  // Kapıların altından geçerken ses ve ışık
  function gatePass(r) {
    if (r.jumped) return;
    while (G.gateIdx < GATE_XS.length && r.x > GATE_XS[G.gateIdx]) {
      G.gateIdx++;
      SFX.gate(clamp(r.v / 90, 0, 1));
      if (r.nitro) { G.flash = Math.max(G.flash, 0.18); buzz(12); }
    }
    gateLight.emissiveIntensity = 2.4 + (r.nitro ? 1.6 + Math.sin(G.t * 30) * 0.8 : 0);
    nitroRibbon.material.opacity = r.nitro ? 0.34 : 0.22;
  }

  // ---------- Döngü ----------
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function frame(now) {
    const dtReal = Math.min(0.05, (now - (G.last || now)) / 1000);
    G.last = now;
    G.t += dtReal;
    if (G.slowT > 0) { G.slowT -= dtReal; if (G.slowT <= 0) G.slow = 1; }
    const dt = dtReal * G.slow;

    if (G.phase === 'count') {
      G.countT += dtReal;
      const lights = $('lights').children;
      const n = Math.floor(G.countT / 0.45);
      for (let i = 0; i < 3; i++) lights[i].className = n >= 3 ? 'g' : i < n + 1 ? 'r' : '';
      setPrompt(n >= 3 ? 'Git!' : 'Hazır…', false);
      if (G.countT > 1.45) { G.phase = 'run'; $('lights').hidden = true; if (G.run) G.run.hold = false; }
    }

    const r = G.run;
    if (r && (G.phase === 'run' || G.phase === 'result')) {
      G.acc += dt;
      let n = 0;
      while (G.acc >= SJ.DT && n < 40) { SJ.step(r); G.acc -= SJ.DT; n++; }
      handleEvents();
      flightComments(r);
      if (r.mode === 'ground') {
        G.wheelSpin = r.v / r.car.wr;
        if (r.v > 6) {
          const k = Math.min(4, Math.floor(r.v / 14));
          const rx = r.x - Math.cos(r.phi) * r.car.wb / 2;
          for (let i = 0; i < k; i++) {
            for (const s of [-1, 1]) PS.spawn(rx, r.y + 0.1, s * (CAR_W[r.car.id] / 2 - 0.2), r.v * Math.cos(r.phi) * 0.55, 1 + Math.random() * 2, s * (1 + Math.random() * 2), 0.5 + Math.random() * 0.4);
          }
        }
      } else G.wheelSpin *= 1 - 0.3 * dt;
      G.wheelRot += G.wheelSpin * dt;
      if (G.phase === 'run') {
        const t0 = r.landT || 0;
        const ready = r.done || (r.dnf && r.t - t0 > 2.5) || (r.wallHit && r.t - r.wallT > 2.8) || (r.crashed && r.landed && r.t - t0 > 9);
        if (ready) showResult();
      }
      gatePass(r);
      if (r.landed && !r.crashed && !r.wallHit && !G.flags.ice && r.t - r.landT > 1.3) { G.flags.ice = true; say(pick(['Pist buz gibi, durmuyor... panolar geliyor!', 'Fren yok, buzda kayıyor! Panolara dikkat!']), 2.5); }
      updateHud(r);
    }
    PS.update(dt);
    debris.update(dt);
    barrier.update(dt);
    updateFlying(dt);
    smoke.update(dt);
    if (r && activeCar && activeCar.smoke > 0 && G.phase !== 'menu' && Math.random() < activeCar.smoke * 0.8) { const p = carCenter(r); smoke.spawn(p.x, p.y + 0.4, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2, 2.2 + Math.random()); }
    syncCar(dt);
    updateCamera(dtReal);
    flakes.update(dtReal, G.t, camera.position);
    if (Math.abs(camera.position.x - hill.xFlat) < 420) animateCrowd(G.t, !!(r && r.jumped && Math.abs(r.x - hill.xFlat) < 260));
    // Güneş ve gölge kamerası arabayı takip eder
    const focus = activeCar ? activeCar.group.position : camState.look;
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(SUN_DIR, 120);
    updateAudio(dtReal);
    if (tickerTimer > 0) { tickerTimer -= dtReal; if (tickerTimer <= 0) $('ticker').classList.remove('on'); }
    renderer.render(scene, camera);
    drawFx(dtReal);
    requestAnimationFrame(frame);
  }

  window.__sj = G; // hata ayıklama için
  $('loading').hidden = true;
  showMenu();
  requestAnimationFrame(frame);
})();
