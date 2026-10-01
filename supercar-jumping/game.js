// Supercar Jumping — çizim, kamera, arayüz, ses.
(() => {
  const SJ = window.SJ;
  const { clamp, CARS } = SJ;
  const hill = SJ.buildHill(SJ.HILL_CFG);
  const $ = (id) => document.getElementById(id);
  const cv = $('cv');
  const ctx = cv.getContext('2d');

  const COLORS = {
    ink: '#0d1b33', paper: '#f5f8fb', red: '#e1342a', gold: '#f5b700', go: '#29cc63',
    snowTop: '#ffffff', snowMid: '#e4edf6', snowDeep: '#b9cbe0', snowLine: '#9fb8d3',
    back: '#cfdcea', backShade: '#b6c8dc', pine: '#1e3a3a', pine2: '#2c4f48',
    sky1: '#2f63a8', sky2: '#86b5df', sky3: '#e8f0f7', mtnFar: '#a9c0db', mtnNear: '#7f9bbd',
  };

  // ---------- Kayıtlar (yalnızca bu tarayıcıda) ----------
  const STORE_KEY = 'sj-records-v1';
  function loadRecords() {
    try { const v = JSON.parse(localStorage.getItem(STORE_KEY)); if (v && v.list) return v; } catch (e) { /* yok */ }
    return { list: [] };
  }
  function saveRecords() { try { localStorage.setItem(STORE_KEY, JSON.stringify(G.records)); } catch (e) { /* yok */ } }

  const G = {
    phase: 'menu', carIdx: 0, run: null, wind: 0,
    cam: { x: 120, y: -40, s: 6, shake: 0 },
    particles: [], acc: 0, last: 0, slow: 1, slowT: 0,
    records: loadRecords(), evIdx: 0, flags: {}, wheelRot: 0, wheelSpin: 0,
    resultAt: 0, countT: 0, menuT: 0, lastScore: null,
  };

  // ---------- Ekran ----------
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }
  window.addEventListener('resize', resize);
  resize();

  const sx = (x) => (x - G.cam.x) * G.cam.s + W / 2;
  const sy = (y) => H / 2 - (y - G.cam.y) * G.cam.s;

  // ---------- Dekor (bir kez üretilir) ----------
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const R = rng(7);
  const backY = (x) => hill.y(x) + 7 + 4 * Math.sin(x * 0.013) + 2.2 * Math.sin(x * 0.051 + 1);
  const trees = [];
  for (let x = -60; x < hill.xEnd; x += 5 + R() * 11) {
    if (x > hill.xFlat - 20 && x < hill.xFlat + 160) continue; // seyirci alanı
    trees.push({ x, up: 2 + R() * 7, h: 5 + R() * 6, w: 0.42 + R() * 0.12, c: R() < 0.5 ? COLORS.pine : COLORS.pine2 });
  }
  const crowd = [];
  const crowdCols = ['#e1342a', '#f5b700', '#2058c9', '#f5f8fb', '#29cc63', '#0d1b33', '#ff7a1a'];
  for (let i = 0; i < 260; i++) {
    const x = hill.xFlat - 10 + R() * 170;
    crowd.push({ x, up: 1.2 + R() * 4.5, c: crowdCols[Math.floor(R() * crowdCols.length)], ph: R() * 6.28, flag: R() < 0.06 });
  }
  const boards = [];
  const boardText = ['SUPERCAR JUMPING', 'KARTAL TEPE', 'NİTRO+', 'SON GAZ', 'K-' + hill.K];
  for (let s = 30, i = 0; s < hill.HS + 40; s += 46, i++) boards.push({ x: hill.xAtArc(s), text: boardText[i % boardText.length], dark: i % 2 === 0 });
  function makeRange(seed, n, hMin, hMax) {
    const r = rng(seed); const pts = [];
    for (let i = 0; i <= n; i++) pts.push(hMin + r() * (hMax - hMin) * (i % 2 ? 0.55 : 1));
    return pts;
  }
  const mtnFar = makeRange(3, 24, 60, 170);
  const mtnNear = makeRange(11, 30, 40, 120);

  // ---------- Araba çizimi ----------
  const SHAPES = {
    wedge: {
      body: [[-0.5, 0.2], [-0.5, 0.56], [-0.36, 0.63], [-0.12, 0.96], [0.08, 0.96], [0.3, 0.56], [0.5, 0.33], [0.5, 0.17]],
      glass: [[-0.1, 0.9], [0.06, 0.9], [0.22, 0.6], [-0.22, 0.63]],
      wing: true,
    },
    gt: {
      body: [[-0.5, 0.22], [-0.49, 0.6], [-0.3, 0.67], [-0.14, 0.96], [0.1, 0.96], [0.23, 0.67], [0.5, 0.52], [0.5, 0.2]],
      glass: [[-0.13, 0.9], [0.08, 0.9], [0.18, 0.68], [-0.27, 0.67]],
    },
    suv: {
      body: [[-0.5, 0.2], [-0.5, 0.9], [-0.42, 0.99], [0.16, 0.99], [0.31, 0.66], [0.5, 0.58], [0.5, 0.2]],
      glass: [[-0.45, 0.91], [0.13, 0.91], [0.26, 0.68], [-0.45, 0.68]],
      rack: true,
    },
    mini: {
      body: [[-0.5, 0.2], [-0.5, 0.86], [-0.42, 0.99], [0.22, 0.99], [0.38, 0.63], [0.5, 0.56], [0.5, 0.2]],
      glass: [[-0.44, 0.91], [0.2, 0.91], [0.33, 0.65], [-0.44, 0.65]],
    },
  };

  // Yerel koordinat: metre, y yukarı, orijin aracın alt-orta noktası
  function drawCarLocal(c, car, wheelRot, nitroOn) {
    const sh = SHAPES[car.shape];
    const L = car.len, Hh = car.h;
    const P = (p) => [p[0] * L, p[1] * Hh];
    c.lineJoin = 'round';
    if (nitroOn) {
      const fl = 0.9 + Math.random() * 0.9;
      const g = c.createLinearGradient(-L / 2, 0, -L / 2 - fl * 1.6, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.3, 'rgba(120,190,255,0.9)'); g.addColorStop(1, 'rgba(60,120,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(-L / 2, Hh * 0.28); c.lineTo(-L / 2 - fl * 1.6, Hh * 0.33); c.lineTo(-L / 2, Hh * 0.4); c.fill();
    }
    // Gövde
    c.fillStyle = car.color;
    c.beginPath(); sh.body.forEach((p, i) => { const [x, y] = P(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.fill();
    // Alt gölge
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(-L / 2, Hh * 0.17, L, Hh * 0.1);
    // Şerit
    c.fillStyle = car.trim;
    c.fillRect(-L * 0.48, Hh * 0.42, L * 0.96, Hh * 0.06);
    // Cam
    c.fillStyle = '#1a2a40';
    c.beginPath(); sh.glass.forEach((p, i) => { const [x, y] = P(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.28)';
    const g0 = P(sh.glass[0]), g1 = P(sh.glass[1]);
    c.beginPath(); c.moveTo(g0[0] + 0.1, g0[1] - 0.04); c.lineTo(g0[0] + (g1[0] - g0[0]) * 0.45, g0[1] - 0.04); c.lineTo(g0[0] + 0.05, g0[1] - Hh * 0.18); c.closePath(); c.fill();
    // Kanat / tavan rafı
    if (sh.wing) {
      c.fillStyle = car.trim;
      c.fillRect(-L * 0.5, Hh * 0.72, L * 0.16, Hh * 0.06);
      c.fillRect(-L * 0.44, Hh * 0.58, L * 0.025, Hh * 0.15);
    }
    if (sh.rack) {
      c.fillStyle = car.trim;
      c.fillRect(-L * 0.4, Hh * 1.0, L * 0.5, Hh * 0.04);
      c.fillRect(-L * 0.36, Hh * 0.98, L * 0.02, Hh * 0.04);
      c.fillRect(0.0, Hh * 0.98, L * 0.02, Hh * 0.04);
    }
    // Farlar
    c.fillStyle = '#fff6c8'; c.fillRect(L * 0.47, Hh * 0.3, L * 0.03, Hh * 0.08);
    c.fillStyle = '#ff3b2f'; c.fillRect(-L * 0.5, Hh * 0.46, L * 0.025, Hh * 0.1);
    // Tekerlekler
    for (const wx of [-car.wb / 2, car.wb / 2]) {
      const r = car.wr;
      c.fillStyle = '#111';
      c.beginPath(); c.arc(wx, r, r * 1.06, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#9aa6b4';
      c.beginPath(); c.arc(wx, r, r * 0.58, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#3a4350'; c.lineWidth = r * 0.14;
      for (let k = 0; k < 5; k++) {
        const a = -wheelRot + k * Math.PI * 2 / 5;
        c.beginPath(); c.moveTo(wx, r); c.lineTo(wx + Math.cos(a) * r * 0.55, r + Math.sin(a) * r * 0.55); c.stroke();
      }
    }
  }

  // ---------- Parçacıklar ----------
  function puff(x, y, vx, vy, n, color, size, life, spread) {
    for (let i = 0; i < n; i++) {
      G.particles.push({
        x, y, vx: vx + (Math.random() - 0.5) * spread, vy: vy + Math.random() * spread * 0.6,
        life: life * (0.6 + Math.random() * 0.6), age: 0, size: size * (0.6 + Math.random() * 0.8), color, grav: color === 'debris' ? 1 : 0.25,
      });
    }
    if (G.particles.length > 700) G.particles.splice(0, G.particles.length - 700);
  }
  function updateParticles(dt) {
    for (const p of G.particles) {
      p.age += dt;
      p.vy -= 9.81 * p.grav * dt;
      p.vx *= 1 - 1.2 * dt; p.vy *= 1 - 0.6 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.color === 'debris' && p.y < hill.y(p.x)) { p.y = hill.y(p.x); p.vy = Math.abs(p.vy) * 0.3; p.vx *= 0.6; }
    }
    G.particles = G.particles.filter((p) => p.age < p.life);
  }

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

  // ---------- Menü ----------
  const carsEl = $('cars');
  const maxPW = Math.max(...CARS.map((c) => c.power / c.mass));
  const maxGlide = Math.max(...CARS.map((c) => c.cla / c.mass));
  const maxMass = Math.max(...CARS.map((c) => c.mass));
  const maxTough = Math.max(...CARS.map((c) => c.crashVn));
  function bestFor(id) {
    const l = G.records.list.filter((e) => e.car === id && !e.crashed);
    return l.length ? l.reduce((a, b) => (b.dist > a.dist ? b : a)) : null;
  }
  function renderCars() {
    carsEl.innerHTML = '';
    CARS.forEach((car, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'car'; b.id = 'car-' + car.id;
      b.setAttribute('aria-pressed', String(i === G.carIdx));
      const pb = bestFor(car.id);
      const stat = (label, v) => `<div class="stat"><span>${label}</span><span class="bar"><b style="width:${Math.round(v * 100)}%"></b></span></div>`;
      b.innerHTML = `<canvas width="240" height="96"></canvas>
        <span class="car-cls">${car.cls}</span>
        <span class="car-name">${car.name}</span>
        <span class="car-desc">${car.desc}</span>
        <div class="stats">
          ${stat('Güç/ağırlık', car.power / car.mass / maxPW)}
          ${stat('Ağırlık', car.mass / maxMass)}
          ${stat('Süzülme', car.cla / car.mass / maxGlide)}
          ${stat('Dayanıklılık', car.crashVn / maxTough)}
        </div>
        <span class="car-pb">${pb ? 'En iyi: ' + pb.dist.toFixed(1) + ' m' : 'Henüz atlamadı'} · ${car.mass} kg</span>`;
      b.addEventListener('click', () => { G.carIdx = i; renderCars(); });
      carsEl.appendChild(b);
      const c = b.querySelector('canvas').getContext('2d');
      const sc = 240 / 6.4;
      c.setTransform(sc, 0, 0, -sc, 120, 86);
      c.fillStyle = 'rgba(13,27,51,0.12)';
      c.fillRect(-3, -0.12, 6, 0.12);
      drawCarLocal(c, car, 0.4, false);
    });
  }
  function renderBoard() {
    const el = $('board');
    const list = G.records.list.filter((e) => !e.crashed).slice().sort((a, b) => b.total - a.total).slice(0, 6);
    if (!list.length) { el.innerHTML = '<div class="board-empty">Henüz kayıt yok. İlk atlayışın bu tabloya yazılır.</div>'; return; }
    el.innerHTML = list.map((e, i) => {
      const car = CARS.find((c) => c.id === e.car);
      return `<div class="board-row"><span class="rk">${i + 1}</span><span class="nm">${car ? car.name : e.car}</span><span class="ds">${e.dist.toFixed(1)} m</span><span class="tt">${e.total.toFixed(1)}</span></div>`;
    }).join('');
  }
  $('menuHill').textContent = `${hill.cfg.name} · K-${hill.K} · HS-${hill.HS}`;
  $('hudHill').textContent = `${hill.cfg.name} · HS${hill.HS}`;
  renderCars(); renderBoard();

  // ---------- Akış ----------
  function showMenu() {
    G.phase = 'menu';
    G.run = null;
    $('menu').hidden = false; $('result').hidden = true; $('hud').hidden = true;
    renderCars(); renderBoard();
  }
  function bestDistance() {
    const l = G.records.list.filter((e) => !e.crashed);
    return l.length ? Math.max(...l.map((e) => e.dist)) : null;
  }
  function startRun() {
    initAudio();
    const car = CARS[G.carIdx];
    G.wind = Math.round((Math.random() * 5.2 - 2.6) * 10) / 10;
    G.run = SJ.newRun(car, hill, G.wind);
    G.evIdx = 0; G.flags = {}; G.particles = []; G.slow = 1; G.slowT = 0; G.wheelRot = 0; G.wheelSpin = 0;
    G.toBeat = bestDistance();
    G.phase = 'ready';
    $('menu').hidden = true; $('result').hidden = true; $('hud').hidden = false;
    $('hudCar').textContent = car.name;
    $('hudDist').hidden = true;
    $('meter').hidden = true;
    $('meterTap').hidden = true;
    const beat = $('hudBeat');
    beat.hidden = G.toBeat === null;
    if (G.toBeat !== null) beat.textContent = `Geçilecek: ${G.toBeat.toFixed(1)} m`;
    const head = G.wind < 0;
    $('hudWind').className = 'wind ' + (head ? 'head' : 'tail');
    $('windVal').textContent = `${Math.abs(G.wind).toFixed(1)} m/s ${head ? 'önden' : 'arkadan'}`;
    $('windArrow').setAttribute('transform', head ? 'rotate(180 13 7)' : '');
    const cc = carCenter(G.run);
    G.cam.x = cc.x + 8; G.cam.y = cc.y - 2; G.cam.s = baseScale();
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
  function isUi(t) { return t.closest && t.closest('button, .overlay'); }
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
    if (e.code !== 'Space' || e.repeat) return;
    if (G.phase === 'menu') return;
    if (G.phase === 'result') return;
    e.preventDefault(); down();
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') up(); });

  // ---------- Olaylar ve spiker ----------
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
        case 'bumpLand': {
          const p = carCenter(r);
          puff(p.x, hill.y(p.x), r.v * 0.3, 2, 14, 'snow', 0.5, 0.9, 4);
          if (e.crash) { /* aşağıda crash olayı */ } else if (e.diff > 10 || e.vn > 5) { say(pick(['Sert indi, hız kaybediyor!', 'Burun yere vurdu, değerli km/sa gidiyor.'])); thump(0.5); }
          break;
        }
        case 'takeoff': {
          const kmh = Math.round(e.speed * 3.6);
          let line;
          if (e.q === null) line = `Kenarda ${kmh} km/sa ama hiç zıplamadı!`;
          else if (e.q > 0.85) line = `Kusursuz kalkış! Tam kenardan, ${kmh} km/sa!`;
          else if (e.q > 0.5) line = `İyi zamanlama, ${kmh} km/sa ile havada.`;
          else line = `Biraz erken bastı. ${kmh} km/sa ile havalandı.`;
          say(line, 2.6);
          G.flags.takeoffQ = e.q;
          G.slow = 0.45; G.slowT = 0.5;
          const tap = $('meterTap');
          if (r.tapX !== null) { tap.hidden = false; tap.style.left = clamp(100 - (hill.TO - r.tapX) / 120 * 100, 0, 100) + '%'; }
          break;
        }
        case 'late': say('Geç bastı! Kenarı kaçırdı, zayıf bir itiş.'); break;
        case 'land': {
          const p = carCenter(r);
          const strength = clamp(e.vn / car.crashVn, 0, 1.5);
          puff(p.x, hill.y(p.x), r.vx * 0.4, 3 + e.vn * 0.4, 40, 'snow', 0.7, 1.3, 8);
          G.cam.shake = 0.25 + strength * 0.6;
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
          for (let i = 0; i < 4; i++) puff(p.x, p.y, r.vx * 0.5, 4, 8, 'debris', 0.35, 2.4, 10);
          puff(p.x, p.y, r.vx * 0.3, 4, 50, 'snow', 0.9, 1.5, 10);
          G.cam.shake = 1.2; G.slow = 0.35; G.slowT = 0.9;
          thump(1.5);
          say(r.dnf ? 'Ve kaza! İnişte kontrolü kaybetti, diskalifiye!' : pick(['Ve kaza! Araç takla atıyor!', 'Olamaz! Sert iniş, araba paramparça!', 'Kaza! Mesafe sayılır ama stil puanı uçtu.']), 3.5);
          break;
        }
        case 'impact': { const p = carCenter(r); puff(p.x, p.y, r.vx * 0.3, 3, 14, 'snow', 0.6, 1, 6); puff(p.x, p.y, r.vx * 0.4, 3, 3, 'debris', 0.25, 2, 7); thump(clamp(e.hit / 15, 0.2, 1)); break; }
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
    const rec = { car: car.id, dist: sc.dist, total: sc.total, crashed: r.crashed || sc.dnf, at: Date.now() };
    if (!sc.dnf) { G.records.list.push(rec); G.records.list = G.records.list.slice(-60); saveRecords(); }
    const isTop = !rec.crashed && !sc.dnf && sc.total > prevTop;
    const isPb = !rec.crashed && !sc.dnf && (!prevBest || sc.dist > prevBest.dist);
    const tag = sc.dnf ? 'Diskalifiye' : r.crashed ? 'Kaza' : isTop ? 'Yeni lider' : isPb ? 'Kişisel rekor' : 'Sonuç';
    const tagCls = (isTop || isPb) && !r.crashed ? 'res-tag rec' : 'res-tag';
    let note;
    if (sc.dnf) note = 'Kenara ulaşamadan kaza yaptı. Engebelerden sonra basılı tutarak burnu dengede tut.';
    else if (r.crashed) note = r.landVn > car.crashVn ? `İniş çok sert (${r.landVn.toFixed(1)} m/s). Yere yaklaşırken basılı tutup süzülerek düşüşü yumuşat.` : `Araç yokuşa ${r.landDiff.toFixed(0)}° açıyla indi. İnişte yokuşa paralel ol.`;
    else if (r.q === null) note = 'Kenarda zıplamadın. Sarı bölgede, kenara olabildiğince yakın dokun.';
    else if (sc.dist < hill.K - 60) note = 'Uçuşta daha uzun basılı tut: burun kalkınca araba süzülür.';
    else if (sc.dist > hill.HS) note = 'HS sınırının ötesi düzlük. Daha uzağa uçmak, daha sert iniş demek.';
    else note = `Kalkış: ${r.q !== null ? Math.round(r.q * 100) + '%' : '-'} · Kenarda ${Math.round(r.edgeSpeed * 3.6)} km/sa · İniş açısı ${r.landDiff.toFixed(0)}°`;
    if (isTop && !G.toBeat) note = 'İlk kayıt. Yeşil çizgi artık bu mesafede.';
    const judgesHtml = sc.judges.map((j, i) => {
      const dropped = (sc.dropped && (j === sc.dropped[0] && i === sc.judges.indexOf(sc.dropped[0]))) || (sc.dropped && j === sc.dropped[1] && i === sc.judges.lastIndexOf(sc.dropped[1]));
      return `<span class="judge${dropped ? ' drop' : ''}">${j.toFixed(1)}</span>`;
    }).join('');
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
        <button class="ghost" id="menuBtn" type="button">Araba değiştir</button>
      </div>`;
    $('result').hidden = false;
    $('hud').hidden = true;
    $('againBtn').addEventListener('click', (e) => { e.stopPropagation(); startRun(); });
    $('menuBtn').addEventListener('click', (e) => { e.stopPropagation(); showMenu(); });
    setPrompt('', false);
    $('meter').hidden = true;
  }

  // ---------- Kamera ----------
  function baseScale() { return clamp(Math.min(W * 1.5, H * 1.6) / 30, 10, 34); }
  function updateCamera(dt) {
    const cam = G.cam;
    let tx, ty, ts;
    const base = baseScale();
    if (G.phase === 'menu' || !G.run) {
      G.menuT += dt;
      const x = 40 + ((G.menuT * 14) % (hill.xFlat - 40));
      tx = x; ty = hill.y(x) + 8; ts = base * 0.55;
    } else {
      const r = G.run;
      const p = carCenter(r);
      const sp = r.mode === 'wreck' ? Math.hypot(r.vx, r.vy) : SJ.speedOf(r);
      const vx = r.mode === 'ground' ? r.v * Math.cos(r.phi) : r.vx;
      if (r.mode === 'air' && r.jumped && !r.landed) {
        const gap = Math.max(0, r.y - hill.y(r.x));
        ts = Math.min(base * 0.7, (H * 0.42) / (gap + 12));
        tx = p.x + Math.min(vx * 0.5, (W / ts) * 0.22);
        ty = (p.y + hill.y(r.x + vx * 0.5)) / 2 + 2;
      } else if (!r.jumped) {
        ts = base * clamp(1.15 - sp / 110, 0.6, 1.15);
        tx = p.x + Math.min(vx * 0.3, (W / ts) * 0.2);
        ty = p.y + 1.5 + sp * 0.04;
      } else {
        ts = base * 0.6;
        tx = p.x + Math.min(Math.max(vx, 0) * 0.3, (W / ts) * 0.2);
        ty = p.y + 2;
      }
      if (G.phase === 'ready' || G.phase === 'count') { ts = base * 1.2; tx = p.x + 6; ty = p.y + 1; }
    }
    const k = 1 - Math.exp(-dt * 4);
    const ks = 1 - Math.exp(-dt * 1.8);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    cam.s += (ts - cam.s) * ks;
    cam.shake = Math.max(0, cam.shake - dt * 1.6);
  }

  // ---------- Çizim ----------
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COLORS.sky1); g.addColorStop(0.55, COLORS.sky2); g.addColorStop(1, COLORS.sky3);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Güneş
    const sunX = W * 0.78 - G.cam.x * 0.02, sunY = H * 0.2;
    const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.35);
    sg.addColorStop(0, 'rgba(255,248,225,0.95)'); sg.addColorStop(0.08, 'rgba(255,244,210,0.75)'); sg.addColorStop(1, 'rgba(255,244,210,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    drawRange(mtnFar, 0.06, COLORS.mtnFar, 0.62, 2.2);
    drawRange(mtnNear, 0.14, COLORS.mtnNear, 0.74, 1.6);
  }
  function drawRange(pts, par, color, baseFrac, widthMul) {
    const seg = Math.max(W, 600) / 8 * widthMul;
    const period = seg * (pts.length - 1);
    const off = (((G.cam.x * G.cam.s * par) % period) + period) % period;
    const base = H * baseFrac + G.cam.y * G.cam.s * par * 0.25;
    const amp = Math.min(1, H / 700);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-off, H);
    for (let rep = 0; rep < 3; rep++) {
      for (let i = 0; i < pts.length; i++) {
        const x = -off + rep * period + i * seg;
        ctx.lineTo(x, base - pts[i] * amp);
      }
    }
    ctx.lineTo(-off + 3 * period, H); ctx.closePath(); ctx.fill();
    // Kar başlıkları
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let rep = 0; rep < 3; rep++) {
      for (let i = 0; i < pts.length; i += 2) {
        const x = -off + rep * period + i * seg;
        const y = base - pts[i] * amp;
        if (x < -seg || x > W + seg) continue;
        const ly = base - pts[Math.max(0, i - 1)] * amp, ry = base - pts[Math.min(pts.length - 1, i + 1)] * amp;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x - seg * 0.28, y + (ly - y) * 0.28); ctx.lineTo(x - seg * 0.1, y + (ly - y) * 0.2);
        ctx.lineTo(x + seg * 0.05, y + (ry - y) * 0.26); ctx.lineTo(x + seg * 0.28, y + (ry - y) * 0.28);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  function viewRange() {
    const half = W / 2 / G.cam.s;
    return [G.cam.x - half - 6, G.cam.x + half + 6];
  }
  function terrainPath(fn, x0, x1, step) {
    ctx.beginPath(); ctx.moveTo(sx(x0), H + 10);
    let crossed = false;
    for (let x = x0; x <= x1; x += step) {
      if (!crossed && x > hill.TO) {
        crossed = true;
        ctx.lineTo(sx(hill.TO), sy(fn(hill.TO)));
        ctx.lineTo(sx(hill.TO + 0.01), sy(fn(hill.TO + 0.3)));
      }
      ctx.lineTo(sx(x), sy(fn(x)));
    }
    ctx.lineTo(sx(x1), sy(fn(x1)));
    ctx.lineTo(sx(x1), H + 10); ctx.closePath();
  }

  function drawWorld(t) {
    const [x0, x1] = viewRange();
    const s = G.cam.s;
    const step = Math.max(0.5, 3 / s);

    // Arka yamaç ve ağaçlar
    terrainPath(backY, x0, x1, step);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, COLORS.back); bg.addColorStop(1, COLORS.backShade);
    ctx.fillStyle = bg; ctx.fill();
    for (const tr of trees) {
      if (tr.x < x0 - 10 || tr.x > x1 + 10) continue;
      const by = backY(tr.x) - tr.up;
      const bx = sx(tr.x), byy = sy(by), hh = tr.h * s, ww = tr.h * tr.w * s;
      ctx.fillStyle = tr.c;
      ctx.beginPath(); ctx.moveTo(bx, byy - hh); ctx.lineTo(bx - ww / 2, byy); ctx.lineTo(bx + ww / 2, byy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.moveTo(bx, byy - hh); ctx.lineTo(bx - ww * 0.16, byy - hh * 0.68); ctx.lineTo(bx + ww * 0.12, byy - hh * 0.72); ctx.closePath(); ctx.fill();
    }
    // Seyirciler
    for (const c of crowd) {
      if (c.x < x0 || c.x > x1) continue;
      const bob = Math.abs(Math.sin(t * 6 + c.ph)) * 0.25;
      const px = sx(c.x), py = sy(hill.y(c.x) + 0.6 + c.up + bob);
      ctx.fillStyle = c.c;
      ctx.fillRect(px - 0.25 * s, py - 1.0 * s, 0.5 * s, 1.0 * s);
      ctx.beginPath(); ctx.arc(px, py - 1.2 * s, 0.22 * s, 0, Math.PI * 2); ctx.fill();
      if (c.flag) {
        ctx.fillStyle = COLORS.ink; ctx.fillRect(px + 0.2 * s, py - 2.6 * s, 0.06 * s, 1.6 * s);
        ctx.fillStyle = c.c === COLORS.red ? COLORS.paper : COLORS.red;
        const wv = Math.sin(t * 5 + c.ph) * 0.2 * s;
        ctx.beginPath(); ctx.moveTo(px + 0.26 * s, py - 2.6 * s); ctx.lineTo(px + 1.3 * s, py - 2.4 * s + wv); ctx.lineTo(px + 0.26 * s, py - 2.0 * s); ctx.fill();
      }
    }

    // Reklam panoları (pistin arkasında)
    for (const b of boards) {
      if (b.x < x0 - 12 || b.x > x1 + 12) continue;
      const y = hill.y(b.x);
      const bw = 10 * s, bh = 1.6 * s;
      const px = sx(b.x) - bw / 2, py = sy(y) - bh - 0.3 * s;
      ctx.fillStyle = b.dark ? COLORS.ink : COLORS.red;
      ctx.fillRect(px, py, bw, bh);
      if (bh > 9) {
        ctx.fillStyle = COLORS.paper;
        ctx.font = `700 ${Math.round(bh * 0.62)}px "Saira Condensed", "Arial Narrow", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.text, px + bw / 2, py + bh / 2 + 1);
      }
    }

    // Ana pist
    terrainPath(hill.y, x0, x1, step);
    const tg = ctx.createLinearGradient(0, sy(G.cam.y + 10), 0, sy(G.cam.y - 60));
    tg.addColorStop(0, COLORS.snowTop); tg.addColorStop(0.4, COLORS.snowMid); tg.addColorStop(1, COLORS.snowDeep);
    ctx.fillStyle = tg; ctx.fill();

    // Yüzey çizgisi ve buz pisti
    ctx.lineWidth = Math.max(1.5, 0.12 * s);
    ctx.strokeStyle = COLORS.snowLine;
    ctx.beginPath();
    let first = true;
    for (let x = x0; x <= x1; x += step) {
      if (x > hill.TO && x - step <= hill.TO) { ctx.lineTo(sx(hill.TO), sy(hill.y(hill.TO))); first = true; }
      const X = sx(x), Y = sy(hill.y(x));
      if (first) { ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    if (x0 < hill.TO) {
      ctx.strokeStyle = 'rgba(120,150,190,0.35)';
      ctx.lineWidth = Math.max(1, 0.18 * s);
      ctx.beginPath();
      const end = Math.min(x1, hill.TO);
      for (let x = Math.max(0, x0); x <= end; x += step) { const X = sx(x), Y = sy(hill.y(x) - 0.35); x === Math.max(0, x0) ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); }
      ctx.stroke();
      // Kenar direkleri ve ağ (hız hissi)
      for (let x = Math.ceil(Math.max(0, x0) / 8) * 8; x <= end; x += 8) {
        const y = hill.y(x);
        ctx.strokeStyle = (x / 8) % 2 ? COLORS.red : COLORS.paper;
        ctx.lineWidth = Math.max(1.5, 0.1 * s);
        ctx.beginPath(); ctx.moveTo(sx(x), sy(y)); ctx.lineTo(sx(x), sy(y + 1.3)); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(225,52,42,0.55)'; ctx.lineWidth = Math.max(1, 0.05 * s);
      ctx.beginPath();
      for (let x = Math.max(0, x0); x <= end; x += step) { const X = sx(x), Y = sy(hill.y(x) + 1.15); x === Math.max(0, x0) ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); }
      ctx.stroke();
      // Kalkış bölgesi işareti
      const zx0 = hill.TO - SJ.ZONE;
      if (zx0 < x1 && hill.TO > x0) {
        ctx.fillStyle = 'rgba(245,183,0,0.55)';
        ctx.beginPath();
        for (let x = zx0; x <= hill.TO; x += 0.5) { const X = sx(x), Y = sy(hill.y(x)); x === zx0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); }
        for (let x = hill.TO; x >= zx0; x -= 0.5) ctx.lineTo(sx(x), sy(hill.y(x) - 0.45));
        ctx.closePath(); ctx.fill();
      }
      // Kenar
      if (hill.TO > x0 && hill.TO < x1) {
        const ex = sx(hill.TO), ey = sy(hill.yTO);
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(ex - 0.12 * s, ey - 2.8 * s, 0.24 * s, 2.8 * s);
        ctx.fillStyle = COLORS.paper;
        ctx.fillRect(ex - 0.12 * s, ey - 2.2 * s, 0.24 * s, 0.5 * s);
        ctx.fillRect(ex - 0.12 * s, ey - 1.2 * s, 0.24 * s, 0.5 * s);
        // Kulenin beton yüzü
        ctx.fillStyle = '#8fa3bb';
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex, sy(hill.yTO - hill.cfg.STEP)); ctx.lineTo(ex - 1.5 * s, sy(hill.yTO - hill.cfg.STEP - 1)); ctx.lineTo(ex - 1.5 * s, ey + 0.4 * s); ctx.closePath(); ctx.fill();
      }
    }

    // İniş pisti mesafe işaretleri
    const font = (px, w) => `${w || 700} ${Math.round(px)}px "Saira Condensed", "Arial Narrow", sans-serif`;
    for (let d = 10; d <= hill.HS + 60; d += 10) {
      const x = hill.xAtArc(d);
      if (x < x0 || x > x1) continue;
      const y = hill.y(x);
      const th = Math.atan(hill.slope(x));
      const nx = Math.sin(th), ny = -Math.cos(th);
      const len = d % 50 === 0 ? 1.4 : 0.7;
      ctx.strokeStyle = 'rgba(13,27,51,0.45)';
      ctx.lineWidth = Math.max(1, 0.08 * s);
      ctx.beginPath(); ctx.moveTo(sx(x), sy(y)); ctx.lineTo(sx(x + nx * len), sy(y + ny * len)); ctx.stroke();
      if (d % 50 === 0 && s > 3) {
        ctx.fillStyle = 'rgba(13,27,51,0.6)';
        ctx.font = font(Math.max(11, 1.1 * s));
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(String(d), sx(x + nx * 2.4), sy(y + ny * 2.4));
      }
    }
    const lineAt = (d, color, label, laser) => {
      const x = hill.xAtArc(d);
      if (x < x0 - 5 || x > x1 + 5) return;
      const y = hill.y(x);
      const th = Math.atan(hill.slope(x));
      const nx = Math.sin(th), ny = -Math.cos(th);
      if (laser) {
        const lg = ctx.createLinearGradient(0, sy(y), 0, sy(y + 14));
        lg.addColorStop(0, 'rgba(41,204,99,0.55)'); lg.addColorStop(1, 'rgba(41,204,99,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(sx(x) - 0.18 * s, sy(y + 14), 0.36 * s, 14 * s);
      }
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, 0.28 * s);
      ctx.beginPath(); ctx.moveTo(sx(x - nx * 0.2), sy(y - ny * 0.2)); ctx.lineTo(sx(x + nx * 2.2), sy(y + ny * 2.2)); ctx.stroke();
      if (s > 2.5) {
        ctx.fillStyle = color;
        ctx.font = font(Math.max(12, 1.2 * s), 800);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(label, sx(x + nx * 4.2), sy(y + ny * 4.2));
      }
    };
    lineAt(hill.K, COLORS.red, 'K');
    lineAt(hill.HS, COLORS.ink, 'HS');
    if (G.toBeat !== null && G.toBeat !== undefined && G.run) lineAt(G.toBeat, COLORS.go, G.toBeat.toFixed(1), true);
  }

  function drawCar(r) {
    const car = r.car, s = G.cam.s;
    // Uçuşta gölge
    if (r.mode !== 'ground') {
      const p = carCenter(r);
      const gy = hill.y(p.x);
      const gap = Math.max(0, p.y - gy);
      const a = clamp(0.35 - gap / 120, 0.06, 0.35);
      const w = car.len * (1 + gap / 25) * s / 2;
      ctx.fillStyle = `rgba(13,27,51,${a})`;
      ctx.beginPath(); ctx.ellipse(sx(p.x), sy(gy), w, Math.max(2, 0.3 * s), -Math.atan(hill.slope(p.x)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    let ox = r.x, oy = r.y;
    if (r.mode === 'wreck') { ox = r.x + Math.sin(r.phi) * car.h / 2; oy = r.y - Math.cos(r.phi) * car.h / 2; }
    ctx.translate(sx(ox), sy(oy));
    ctx.rotate(-r.phi);
    ctx.scale(s, -s);
    drawCarLocal(ctx, car, G.wheelRot, r.nitro > 0 && r.mode !== 'wreck');
    ctx.restore();
  }

  function drawParticles() {
    const s = G.cam.s;
    for (const p of G.particles) {
      const k = 1 - p.age / p.life;
      if (p.color === 'debris') {
        ctx.fillStyle = `rgba(30,35,45,${k})`;
        ctx.fillRect(sx(p.x) - p.size * s / 2, sy(p.y) - p.size * s / 2, p.size * s, p.size * s * 0.6);
      } else {
        ctx.fillStyle = `rgba(255,255,255,${0.85 * k})`;
        ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), Math.max(1, p.size * s * (1.4 - k * 0.6)), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawSpeedLines(r) {
    if (r.mode !== 'air' || !r.jumped) return;
    const sp = Math.hypot(r.vx, r.vy);
    const n = Math.floor(clamp((sp - 30) / 4, 0, 10));
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    const ang = Math.atan2(r.vy, r.vx);
    for (let i = 0; i < n; i++) {
      const y = (Math.sin(i * 91.7 + G.t * 3) * 0.5 + 0.5) * H;
      const x = ((i * 137 - G.t * sp * 18) % W + W) % W;
      const len = 30 + sp;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
    }
  }

  // ---------- HUD ----------
  function updateHud(r) {
    const sp = r.mode === 'wreck' ? 0 : SJ.speedOf(r);
    $('hudSpeed').textContent = String(Math.round(sp * 3.6));
    const inFlight = r.jumped;
    const dEl = $('hudDist');
    if (inFlight) {
      const d = r.landed ? Math.round(r.dist * 2) / 2 : hill.arcAt(r.x);
      dEl.hidden = false;
      $('hudDistVal').textContent = d.toFixed(1);
      dEl.classList.toggle('over', G.toBeat !== null && d > G.toBeat);
    }
    // Kalkış göstergesi: kenardan önceki son 120 m
    const meter = $('meter');
    const toEdge = hill.TO - r.x;
    if (!r.jumped && toEdge < 120) {
      meter.hidden = false;
      $('meterZone').style.left = (100 - SJ.ZONE / 120 * 100) + '%';
      $('meterZone').style.right = '0';
      $('meterCar').style.left = clamp(100 - toEdge / 120 * 100, 0, 100) + '%';
    } else if (r.jumped && r.airT > 1.2) meter.hidden = true;

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
  function frame(now) {
    const dtReal = Math.min(0.05, (now - (G.last || now)) / 1000);
    G.last = now;
    G.t = (G.t || 0) + dtReal;

    if (G.slowT > 0) { G.slowT -= dtReal; if (G.slowT <= 0) G.slow = 1; }
    const dt = dtReal * G.slow;

    if (G.phase === 'count') {
      G.countT += dtReal;
      const lights = $('lights').children;
      const n = Math.floor(G.countT / 0.45);
      for (let i = 0; i < 3; i++) lights[i].className = n >= 3 ? 'g' : i < n + 1 ? 'r' : '';
      setPrompt(n >= 3 ? 'Git!' : 'Hazır…', false);
      if (G.countT > 1.45) {
        G.phase = 'run';
        $('lights').hidden = true;
        if (G.run) G.run.hold = false;
      }
    }

    const r = G.run;
    if (r && (G.phase === 'run' || G.phase === 'result')) {
      G.acc += dt;
      let n = 0;
      while (G.acc >= SJ.DT && n < 40) { SJ.step(r); G.acc -= SJ.DT; n++; }
      handleEvents();
      flightComments(r);
      // Tekerlek dönüşü ve kar tozu
      if (r.mode === 'ground') {
        G.wheelSpin = r.v / r.car.wr;
        if (r.v > 8 && Math.random() < 0.7) {
          const p = { x: r.x - Math.cos(r.phi) * r.car.wb / 2, y: r.y };
          puff(p.x, p.y + 0.1, -r.v * 0.08, 0.6, 1, 'snow', 0.35, 0.6, 1.5);
        }
      } else G.wheelSpin *= 1 - 0.3 * dt;
      G.wheelRot += G.wheelSpin * dt;

      if (G.phase === 'run') {
        const t0 = r.landT || 0;
        const ready = r.done || (r.dnf && r.t - t0 > 2.5) || (r.landed && !r.crashed && r.t - t0 > 2.6) || (r.crashed && r.landed && r.t - t0 > 3.6);
        if (ready) showResult();
      }
      updateHud(r);
    }
    updateParticles(dt);
    updateCamera(dtReal);
    updateAudio();

    if (tickerTimer > 0) { tickerTimer -= dtReal; if (tickerTimer <= 0) $('ticker').classList.remove('on'); }

    // Çiz
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sh = G.cam.shake;
    if (sh > 0) ctx.translate((Math.random() - 0.5) * sh * 14, (Math.random() - 0.5) * sh * 14);
    drawSky();
    drawWorld(G.t);
    if (r && G.phase !== 'menu') {
      drawParticles();
      drawCar(r);
      drawSpeedLines(r);
    }
    requestAnimationFrame(frame);
  }

  window.__sj = G; // hata ayıklama için
  showMenu();
  requestAnimationFrame(frame);
})();
