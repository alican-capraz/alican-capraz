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
    flame: new T.MeshBasicMaterial({ color: lin(0x7fc8ff), transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }),
  };

  function buildCar(car) {
    const P = PROFILES[car.shape];
    const L = car.len, Hh = car.h, Wd = CAR_W[car.id];
    const wr = car.wr, ra = wr * 1.16;
    const yb = Math.min(0.2 * Hh, wr * 0.75);
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
    const cabin = new T.Mesh(extrude(upper, Wd * 0.84 - 0.12, 0.06, belt, 0.22), MAT.glass);
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
    if (P.wing) {
      const wing = new T.Mesh(new T.BoxGeometry(0.42, 0.05, Wd * 0.96), trimMat);
      wing.position.set(-L / 2 + 0.25, 0.86 * Hh, 0); wing.castShadow = true; g.add(wing);
      for (const s of [-1, 1]) {
        const st = new T.Mesh(new T.BoxGeometry(0.08, 0.26 * Hh, 0.04), MAT.black);
        st.position.set(-L / 2 + 0.3, 0.73 * Hh, s * 0.5); g.add(st);
        const ep = new T.Mesh(new T.BoxGeometry(0.5, 0.18, 0.03), trimMat);
        ep.position.set(-L / 2 + 0.25, 0.86 * Hh, s * Wd * 0.48); g.add(ep);
      }
    }
    if (P.ducktail) {
      const dt = new T.Mesh(new T.BoxGeometry(0.3, 0.05, Wd * 0.8), trimMat);
      dt.position.set(-L / 2 + 0.1, 0.62 * Hh, 0); dt.rotation.z = 0.25; g.add(dt);
    }
    if (P.rack) {
      for (const s of [-1, 1]) {
        const rail = new T.Mesh(new T.BoxGeometry(L * 0.5, 0.05, 0.05), MAT.chrome);
        rail.position.set(-L * 0.1, Hh + 0.07, s * Wd * 0.3); g.add(rail);
      }
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
        w.position.set(x, wr, s * (Wd / 2 - tireW / 2 - 0.04));
        g.add(w); wheels.push(w);
      }
    }
    return { group: g, wheels, exhausts, car };
  }
  const carModels = CARS.map(buildCar);
  const carRoot = new T.Group();
  scene.add(carRoot);
  let activeCar = null;
  function useCar(i) {
    if (activeCar) carRoot.remove(activeCar.group);
    activeCar = carModels[i];
    carRoot.add(activeCar.group);
  }

  // Garaj döner platformu
  const SHOW_X = hill.xFlat + 75;
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
  function burst(x, y, z, vx, vy, n, spread, l) {
    for (let i = 0; i < n; i++) PS.spawn(x, y, z + (Math.random() - 0.5) * 1.6, vx + (Math.random() - 0.5) * spread, vy + Math.random() * spread * 0.6, (Math.random() - 0.5) * spread, l * (0.6 + Math.random() * 0.7));
  }
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
    countT: 0, toBeat: null, fov: 52,
  };
  const camState = { pos: new T.Vector3(SHOW_X + 8, showY + 3, 6), look: new T.Vector3(SHOW_X, showY + 1, 0), heading: 0, off: new T.Vector3(), lookOff: new T.Vector3() };

  // ---------- Ses ----------
  const A = { ctx: null, on: true };
  function initAudio() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      A.ctx = ac;
      A.master = ac.createGain(); A.master.gain.value = A.on ? 0.55 : 0; A.master.connect(ac.destination);
      A.eng = ac.createOscillator(); A.eng.type = 'sawtooth';
      A.eng2 = ac.createOscillator(); A.eng2.type = 'square';
      A.engF = ac.createBiquadFilter(); A.engF.type = 'lowpass'; A.engF.frequency.value = 900;
      A.engG = ac.createGain(); A.engG.gain.value = 0;
      A.eng.connect(A.engF); A.eng2.connect(A.engF); A.engF.connect(A.engG); A.engG.connect(A.master);
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      A.noiseBuf = buf;
      A.wind = ac.createBufferSource(); A.wind.buffer = buf; A.wind.loop = true;
      A.windF = ac.createBiquadFilter(); A.windF.type = 'bandpass'; A.windF.Q.value = 0.7; A.windF.frequency.value = 500;
      A.windG = ac.createGain(); A.windG.gain.value = 0;
      A.wind.connect(A.windF); A.windF.connect(A.windG); A.windG.connect(A.master);
      A.eng.start(); A.eng2.start(); A.wind.start();
    } catch (e) { A.ctx = null; }
  }
  function thump(strength) {
    if (!A.ctx) return;
    const ac = A.ctx, t = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = A.noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300 + strength * 900;
    const g = ac.createGain(); g.gain.setValueAtTime(Math.min(1, 0.25 + strength * 0.5), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25 + strength * 0.5);
    src.connect(f); f.connect(g); g.connect(A.master); src.start(t); src.stop(t + 1.2);
  }
  function updateAudio() {
    if (!A.ctx) return;
    const r = G.run, t = A.ctx.currentTime;
    let eg = 0, ef = 40, wg = 0, wf = 400;
    if (r && (G.phase === 'run' || G.phase === 'result') && r.mode !== 'wreck') {
      const sp = SJ.speedOf(r);
      const revving = !r.landed;
      ef = (revving ? 55 : 35) + sp * (r.mode === 'air' ? 3.1 : 2.2) + (r.nitro > 0 ? 40 : 0);
      eg = revving ? 0.16 : 0.05;
      if (r.mode === 'air') { wg = clamp(sp / 70, 0, 1) * 0.5; wf = 300 + sp * 9; }
    }
    if (G.phase === 'ready' || G.phase === 'count') { ef = 48; eg = 0.07; }
    A.eng.frequency.setTargetAtTime(ef, t, 0.05);
    A.eng2.frequency.setTargetAtTime(ef * 0.501, t, 0.05);
    A.engG.gain.setTargetAtTime(eg, t, 0.08);
    A.windG.gain.setTargetAtTime(wg, t, 0.15);
    A.windF.frequency.setTargetAtTime(wf, t, 0.1);
  }
  $('muteBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    A.on = !A.on;
    $('muteBtn').textContent = A.on ? 'Ses: açık' : 'Ses: kapalı';
    if (A.ctx) A.master.gain.setTargetAtTime(A.on ? 0.55 : 0, A.ctx.currentTime, 0.05);
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
    PS.clear(); debris.clear();
    renderGarage();
  }
  function startRun() {
    initAudio();
    const car = CARS[G.carIdx];
    useCar(G.carIdx);
    G.wind = Math.round((Math.random() * 5.2 - 2.6) * 10) / 10;
    G.run = SJ.newRun(car, hill, G.wind);
    G.evIdx = 0; G.flags = {}; G.slow = 1; G.slowT = 0; G.wheelRot = 0; G.wheelSpin = 0; G.roll = 0; G.rollW = 0; G.acc = 0;
    PS.clear(); debris.clear();
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
        case 'nitro': say(pick(['Nitro açıldı! Motor bağırıyor!', 'Ve nitro! Mavi alev arkada!', 'Nitroya bastı, hız tavan yapıyor!']), 2.2); break;
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
          G.slow = 0.4; G.slowT = 0.55;
          const tap = $('meterTap');
          if (r.tapX !== null) { tap.hidden = false; tap.style.left = clamp(100 - (hill.TO - r.tapX) / 120 * 100, 0, 100) + '%'; }
          break;
        }
        case 'late': say('Geç bastı! Kenarı kaçırdı, zayıf bir itiş.'); break;
        case 'land': {
          const strength = clamp(e.vn / car.crashVn, 0, 1.5);
          burst(r.x, hill.y(r.x) + 0.3, 0, r.vx * 0.5, 3 + e.vn * 0.5, 70, 9, 1.4);
          G.shake = 0.3 + strength * 0.7;
          thump(strength);
          if (!e.crash) {
            if (e.diff < 6 && e.vn < 6) say(pick(['Yumuşacık iniş! Hakemler bunu sever.', 'Telemark gibi! Dört teker aynı anda!', 'Kusursuz iniş, tüy gibi!']), 3);
            else if (e.diff < 15) say(pick(['Dengeli bir iniş.', 'Biraz sert ama kontrol onda.']), 3);
            else say('Burun önde indi, stil puanı gidecek!', 3);
          }
          break;
        }
        case 'crash': {
          const p = carCenter(r);
          debris.spawn(p.x, p.y, r.vx * 0.6, 4, 22, lin(car.color));
          burst(p.x, p.y, 0, r.vx * 0.4, 4, 120, 12, 1.6);
          G.shake = 1.4; G.slow = 0.3; G.slowT = 1.0;
          G.rollW = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4);
          thump(1.5);
          say(r.dnf ? 'Ve kaza! İnişte kontrolü kaybetti, diskalifiye!' : pick(['Ve kaza! Araç takla atıyor!', 'Olamaz! Sert iniş, araba paramparça!', 'Kaza! Mesafe sayılır ama stil puanı uçtu.']), 3.5);
          break;
        }
        case 'impact': { const p = carCenter(r); burst(p.x, p.y - 0.4, 0, r.vx * 0.3, 3, 30, 7, 1.1); debris.spawn(p.x, p.y, r.vx * 0.5, 3, 3); thump(clamp(e.hit / 15, 0.2, 1)); G.shake = Math.max(G.shake, 0.5); break; }
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
      </div>
      ${sc.dnf ? '' : `<div class="res-table">
        <div class="judges"><span class="jl">Hakemler</span>${judgesHtml}</div>
        <div class="pts">
          <div class="pt"><small>Mesafe</small><b>${sc.distPts.toFixed(1)}</b></div>
          <div class="pt"><small>Stil</small><b>${sc.stylePts.toFixed(1)}</b></div>
          <div class="pt"><small>Rüzgâr</small><b>${fmt(sc.windPts)}</b></div>
          <div class="pt"><small>K-${hill.K}</small><b>${fmt(sc.dist - hill.K)}</b></div>
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
    else if (r.mode === 'air' && r.jumped && !r.landed) { dist = 10 + sp * 0.02; height = 3.4 + sp * 0.012; ahead = 26; lookUp = -4.5 - (landscape() ? 2 : 0); side = 0.6; }
    else { dist = 6.8 + sp * 0.03; height = 2.3 + sp * 0.012; ahead = 14 + sp * 0.1; lookUp = landscape() ? -2.2 : -0.6; }
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
      const targetFov = (camera.aspect < 1 ? 70 : 58) + clamp(kmh - 80, 0, 200) * 0.07 + (r.nitro > 0 ? 4 : 0);
      G.fov += (targetFov - G.fov) * (1 - Math.exp(-dt * 2.5));
    }
    camera.position.copy(camState.pos);
    if (G.shake > 0) {
      const s = G.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
      G.shake = Math.max(0, G.shake - dt * 1.8);
    }
    camera.lookAt(camState.look);
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
    for (const w of m.wheels) w.rotation.z = -G.wheelRot;
    const on = r.nitro > 0 && r.mode !== 'wreck';
    m.exhausts.forEach((f) => {
      f.visible = on;
      if (on) { const s = 0.7 + Math.random() * 0.7; f.scale.set(1, s * 1.6, 1); f.position.x = -r.car.len / 2 - 0.08 - s * 0.8; }
    });
    MAT.tail.emissiveIntensity = r.landed && r.mode === 'ground' && r.t - r.landT > 0.8 ? 5 : 1.6;
  }

  // ---------- HUD ----------
  function updateHud(r) {
    const sp = r.mode === 'wreck' ? 0 : SJ.speedOf(r);
    $('hudSpeed').textContent = String(Math.round(sp * 3.6));
    const dEl = $('hudDist');
    if (r.jumped) {
      const d = r.landed ? Math.round(r.dist * 2) / 2 : hill.arcAt(r.x);
      dEl.hidden = false;
      $('hudDistVal').textContent = d.toFixed(1);
      dEl.classList.toggle('over', G.toBeat !== null && d > G.toBeat);
    }
    const meter = $('meter');
    const toEdge = hill.TO - r.x;
    if (!r.jumped && toEdge < 120) {
      meter.hidden = false;
      $('meterZone').style.left = (100 - SJ.ZONE / 120 * 100) + '%';
      $('meterCar').style.left = clamp(100 - toEdge / 120 * 100, 0, 100) + '%';
    } else if (r.jumped && r.airT > 0.35) meter.hidden = true;

    if (G.phase !== 'run') return;
    if (r.mode === 'wreck' || r.landed) { setPrompt('', false); return; }
    if (!r.jumped) {
      if (r.mode === 'air') setPrompt(r.hold ? 'Burnu dengele' : 'Basılı tut: burnu kaldır', false);
      else if (toEdge <= SJ.ZONE) setPrompt(r.tapX === null ? 'Şimdi zıpla!' : 'Zıplıyor…', r.tapX === null);
      else if (!r.nitroUsed) setPrompt('Dokun: nitro', false);
      else if (r.nitro > 0) setPrompt('Nitro!', false);
      else setPrompt(toEdge < 120 ? 'Kenara hazırlan' : 'Tam gaz', false);
    } else {
      const gap = r.y - hill.y(r.x);
      if (r.hold) setPrompt(gap < 6 ? 'Yere paralel ol' : 'Süzülüyor · bırak: in', false);
      else setPrompt('Basılı tut: süzül', false);
    }
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
        const ready = r.done || (r.dnf && r.t - t0 > 2.5) || (r.landed && !r.crashed && r.t - t0 > 2.8) || (r.crashed && r.landed && r.t - t0 > 3.8);
        if (ready) showResult();
      }
      updateHud(r);
    }
    PS.update(dt);
    debris.update(dt);
    syncCar(dt);
    updateCamera(dtReal);
    flakes.update(dtReal, G.t, camera.position);
    if (Math.abs(camera.position.x - hill.xFlat) < 420) animateCrowd(G.t, !!(r && r.jumped && Math.abs(r.x - hill.xFlat) < 260));
    // Güneş ve gölge kamerası arabayı takip eder
    const focus = activeCar ? activeCar.group.position : camState.look;
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(SUN_DIR, 120);
    updateAudio();
    if (tickerTimer > 0) { tickerTimer -= dtReal; if (tickerTimer <= 0) $('ticker').classList.remove('on'); }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  window.__sj = G; // hata ayıklama için
  $('loading').hidden = true;
  showMenu();
  requestAnimationFrame(frame);
})();
