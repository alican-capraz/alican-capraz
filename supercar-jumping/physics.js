// Supercar Jumping — fizik çekirdeği (DOM'dan bağımsız; tarayıcıda ve Node'da çalışır).
// Birimler: metre, saniye, kilogram, watt. x sağa, y yukarı.
(function (root) {
  const G = 9.81;
  const RHO = 1.2;
  const DT = 1 / 240;
  const ZONE = 28;        // kalkış bölgesi: kenardan önceki son 28 m
  const LATE_WINDOW = 0.22;
  const NITRO_TIME = 2.6;

  const CARS = [
    {
      id: 'vento', name: 'Vento R', cls: 'Hiper araba', shape: 'wedge',
      mass: 1150, len: 4.4, h: 1.12, wb: 2.68, wr: 0.34,
      power: 520e3, cda: 0.62, cla: 1.7, plan: 7.4, crr: 0.014,
      pitch: 4.4, crashVn: 11,
      color: '#c91d25', trim: '#151515',
      desc: 'Hafif ve çevik. Uzun süzülür ama sert inişi affetmez.',
    },
    {
      id: 'corsa', name: 'Corsa V12', cls: 'Gran turismo', shape: 'gt',
      mass: 1650, len: 4.75, h: 1.24, wb: 2.82, wr: 0.36,
      power: 610e3, cda: 0.74, cla: 1.5, plan: 8.4, crr: 0.014,
      pitch: 3.4, crashVn: 13,
      color: '#2058c9', trim: '#e9edf2',
      desc: 'Dengeli. Güçlü motor, sağlam süspansiyon.',
    },
    {
      id: 'titan', name: 'Titan XR', cls: 'Süper SUV', shape: 'suv',
      mass: 2400, len: 5.05, h: 1.72, wb: 3.0, wr: 0.42,
      power: 720e3, cda: 1.12, cla: 1.9, plan: 9.8, crr: 0.016,
      pitch: 2.4, crashVn: 16,
      color: '#3a4049', trim: '#d9b44a',
      desc: 'Ağır tank. Rüzgâra aldırmaz, iner inmez yere yapışır.',
    },
    {
      id: 'bolt', name: 'Bolt Mini', cls: 'Şehir arabası', shape: 'mini',
      mass: 820, len: 3.35, h: 1.5, wb: 2.12, wr: 0.29,
      power: 175e3, cda: 0.66, cla: 1.9, plan: 5.2, crr: 0.012,
      pitch: 5.4, crashVn: 10,
      color: '#f1bf2c', trim: '#1d1d1d',
      desc: 'Yavaş ama tüy gibi. Rüzgârı iyi okursan sürpriz yapar.',
    },
  ];

  const HILL_CFG = {
    name: 'Kartal Tepe',
    INRUN: 28,   // ana iniş eğimi (derece)
    TABLE: 11,   // kalkış masası eğimi
    TO: 240,     // kalkış kenarının x konumu
    STEP: 3.5,   // kenardan sonra iniş pistinin başladığı düşüş
    KNOLL: 16,   // iniş pistinin başlangıç eğimi
    LAND: 33,    // iniş pisti eğimi
    V0: 62,         // pistin tasarlandığı nominal kalkış hızı (m/s)
    NOM_DRAG: 0.00035,
    NOM_LIFT: 0.12,
    STRAIGHT: 55,   // eğim düzleşmeden önceki düz bölüm
    FLATTEN: 130,   // düzleşme mesafesi
    BUMPS: [
      { c: 70, hgt: 0.5, w: 6.5 },
      { c: 118, hgt: 0.75, w: 7.0 },
      { c: 158, hgt: 0.65, w: 6.0 },
    ],
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, t) => { t = clamp(t, 0, 1); t = t * t * (3 - 2 * t); return a + (b - a) * t; };
  const deg = (d) => d * Math.PI / 180;
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  function buildHill(cfg) {
    const dx = 0.25;
    const TO = cfg.TO;
    const xEnd = TO + 900;
    const n = Math.ceil(xEnd / dx) + 1;
    const iTO = Math.round(TO / dx);
    const ys = new Float64Array(n);

    const inrunAngle = (x) => {
      if (x < TO - 72) return -cfg.INRUN;
      if (x < TO - 16) return smooth(-cfg.INRUN, -cfg.TABLE, (x - (TO - 72)) / 56);
      return -cfg.TABLE;
    };
    // İniş pisti, gerçek atlama kulelerindeki gibi nominal bir uçuş eğrisinin
    // birkaç metre altına çizilir: iyi bir atlayış pistin hemen üstünde süzülür.
    const nominal = [];
    {
      const th = deg(-cfg.TABLE);
      let vx = cfg.V0 * Math.cos(th) - Math.sin(th) * 3;
      let vy = cfg.V0 * Math.sin(th) + Math.cos(th) * 3;
      let d = 0;
      const h2 = 0.02;
      while (d < 600) {
        const v = Math.hypot(vx, vy);
        vx += (-cfg.NOM_DRAG * v * vx) * h2;
        vy += (-cfg.NOM_DRAG * v * vy - 9.81 * (1 - cfg.NOM_LIFT)) * h2;
        d += vx * h2;
        nominal.push([d, Math.atan2(vy, vx) * 180 / Math.PI]);
        if (Math.atan2(vy, vx) * 180 / Math.PI < -cfg.LAND) break;
      }
    }
    const d1 = nominal[nominal.length - 1][0];
    const nomAngle = (d) => {
      let lo = 0, hi = nominal.length - 1;
      if (d <= nominal[0][0]) return nominal[0][1];
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (nominal[m][0] < d) lo = m; else hi = m; }
      return nominal[hi][1];
    };
    const dK = d1 + cfg.STRAIGHT;
    const dFlat = dK + cfg.FLATTEN;
    const landAngle = (d) => {
      if (d < d1) return Math.max(-cfg.LAND, smooth(-cfg.KNOLL, nomAngle(d) - 1.6, d / 12));
      if (d < dK) return -cfg.LAND;
      if (d < dFlat) return smooth(-cfg.LAND, 0, (d - dK) / cfg.FLATTEN);
      if (d < dFlat + 170) return 0;
      return smooth(0, 9, (d - dFlat - 170) / 60);
    };

    let y = 0;
    for (let i = 0; i <= iTO; i++) {
      ys[i] = y;
      y += Math.tan(deg(inrunAngle(i * dx + dx / 2))) * dx;
    }
    const yTO = ys[iTO];
    y = yTO - cfg.STEP;
    for (let i = iTO + 1; i < n; i++) {
      const d = i * dx - TO;
      ys[i] = y;
      y += Math.tan(deg(landAngle(d + dx / 2))) * dx;
    }
    for (const b of cfg.BUMPS) {
      for (let i = 0; i < iTO - 40; i++) {
        const t = (i * dx - b.c) / b.w;
        if (Math.abs(t) < 4) ys[i] += b.hgt * Math.exp(-t * t);
      }
    }

    // Eğim, eğrilik ve iniş pisti boyunca yay uzunluğu
    const slope = new Float64Array(n);
    const curv = new Float64Array(n);
    const arc = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) {
      if (i === iTO || i === iTO + 1) { slope[i] = slope[i - 1]; continue; }
      const s = (ys[i + 1] - ys[i - 1]) / (2 * dx);
      slope[i] = s;
      const s2 = (ys[i + 1] - 2 * ys[i] + ys[i - 1]) / (dx * dx);
      curv[i] = s2 / Math.pow(1 + s * s, 1.5);
    }
    slope[0] = slope[1]; slope[n - 1] = slope[n - 2];
    curv[iTO] = curv[iTO + 1] = 0;
    for (let i = iTO + 2; i < n; i++) {
      arc[i] = arc[i - 1] + Math.hypot(dx, ys[i] - ys[i - 1]);
    }

    const sample = (arr, x) => {
      const f = clamp(x / dx, 0, n - 1.001);
      const i = Math.floor(f);
      const t = f - i;
      return arr[i] * (1 - t) + arr[i + 1] * t;
    };
    const hill = {
      cfg, dx, n, TO, iTO, yTO, ys, xEnd,
      y: (x) => {
        if (x <= TO) return sample(ys, Math.min(x, TO));
        return sample(ys, Math.max(x, (iTO + 1) * dx));
      },
      slope: (x) => sample(slope, x),
      curv: (x) => sample(curv, x),
      arcAt: (x) => (x <= TO ? 0 : sample(arc, x)),
      xAtArc: (s) => {
        let lo = iTO + 1, hi = n - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arc[m] < s) lo = m; else hi = m; }
        return lo * dx;
      },
    };
    // K noktası: düzleşmenin başladığı yer; HS: güvenli inişin sınırı
    hill.K = Math.round(hill.arcAt(TO + dK) / 5) * 5;
    hill.HS = Math.round(hill.arcAt(TO + dK + cfg.FLATTEN * 0.3) / 5) * 5;
    hill.xFlat = TO + dFlat;
    hill.mPerPoint = 1.2;
    return hill;
  }

  function newRun(car, hill, wind) {
    return {
      car, hill, wind, windNow: wind,
      mode: 'ground', t: 0,
      x: 2, y: hill.y(2), v: 0, vx: 0, vy: 0, phi: 0, om: 0,
      hold: false, nitro: 0, nitroUsed: false,
      tapX: null, late: false, jumped: false, q: null, airT: 0,
      landed: false, landT: 0, dist: null, landDiff: 0, landVn: 0,
      crashed: false, dnf: false, done: false, doneT: 0,
      maxSpeed: 0, edgeSpeed: 0, maxHeight: 0, events: [],
    };
  }

  const ev = (r, type, data) => r.events.push(Object.assign({ type, t: r.t }, data));
  const speedOf = (r) => (r.mode === 'ground' ? Math.abs(r.v) : Math.hypot(r.vx, r.vy));

  function press(r) {
    r.hold = true;
    if (r.done) return;
    if (r.mode === 'ground' && !r.jumped) {
      if (r.x >= r.hill.TO - ZONE) {
        if (r.tapX === null) r.tapX = r.x;
      } else if (!r.nitroUsed) {
        r.nitroUsed = true;
        r.nitro = NITRO_TIME;
        ev(r, 'nitro');
      }
    } else if (r.mode === 'air' && r.jumped && r.tapX === null && !r.late && r.airT < LATE_WINDOW) {
      // Geç basış: daha zayıf bir itiş
      r.late = true;
      const k = 0.45 * (1 - r.airT / LATE_WINDOW);
      applyBoost(r, k);
      r.q = k;
      ev(r, 'late', { q: k });
    }
  }
  function release(r) { r.hold = false; }

  function applyBoost(r, q) {
    const th = Math.atan(-Math.tan(deg(r.hill.cfg.TABLE)));
    const boost = 0.6 + 2.6 * q;
    r.vx += -Math.sin(th) * boost;
    r.vy += Math.cos(th) * boost;
    r.om += 0.12 + 0.25 * q;
  }

  function takeoff(r) {
    const h = r.hill;
    r.jumped = true;
    r.edgeSpeed = speedOf(r);
    if (r.mode === 'ground') {
      const th = Math.atan(h.slope(h.TO - 1));
      r.mode = 'air';
      r.vx = r.v * Math.cos(th);
      r.vy = r.v * Math.sin(th);
      r.om = 0;
      r.airT = 0;
    }
    let q = 0;
    if (r.tapX !== null) {
      q = clamp(1 - (h.TO - r.tapX) / ZONE, 0, 1);
      applyBoost(r, q);
    }
    r.q = r.tapX !== null ? q : null;
    ev(r, 'takeoff', { q: r.q, speed: r.edgeSpeed });
  }

  function groundStep(r) {
    const c = r.car, h = r.hill;
    const th = Math.atan(h.slope(r.x));
    const cth = Math.cos(th), sth = Math.sin(th);
    let F = -c.mass * G * sth;
    if (!r.landed) {
      const P = c.power * (r.nitro > 0 ? 1.6 : 1);
      F += Math.min(P / Math.max(r.v, 4), 1.05 * c.mass * G * cth);
    }
    const va = r.v - r.windNow * cth;
    F -= 0.5 * RHO * c.cda * va * Math.abs(va);
    F -= c.crr * c.mass * G * cth * (r.v >= 0 ? 1 : -1);
    if (r.landed && r.t - r.landT > 0.8) F -= 0.85 * c.mass * G * (r.v >= 0 ? 1 : -1);
    r.v += (F / c.mass) * DT;
    if (r.landed && r.v < 0.4 && r.t - r.landT > 1) r.v = 0;
    r.x += r.v * cth * DT;
    r.phi = th;
    r.om = 0;
    if (!r.jumped && r.x >= h.TO) {
      r.y = h.yTO + (r.x - h.TO) * Math.tan(th);
      takeoff(r);
      return;
    }
    r.y = h.y(r.x);

    const k = h.curv(r.x);
    if (k < 0 && r.v * r.v * -k > G * cth) {
      r.mode = 'air';
      r.vx = r.v * cth;
      r.vy = r.v * sth;
      r.om = r.v * k * 0.35;
      r.airT = 0;
      if (!r.jumped) ev(r, 'bumpAir', { speed: r.v });
    }
    if (r.landed && r.v === 0 && !r.done) finish(r);
  }

  const CONTACT_POINTS = (c) => [
    [-c.wb / 2, 0], [c.wb / 2, 0],
    [-c.len / 2, 0.3], [c.len / 2, 0.3],
    [-c.len * 0.42, c.h], [c.len * 0.3, c.h],
  ];

  function airStep(r) {
    const c = r.car, h = r.hill;
    const vax = r.vx - r.windNow, vay = r.vy;
    const s = Math.hypot(vax, vay) || 1e-6;
    const gam = Math.atan2(vay, vax);
    const a = wrap(r.phi - gam);
    const sa = Math.sin(a);
    const qd = 0.5 * RHO * s * s;
    const D = qd * (c.cda + c.plan * 0.85 * sa * sa);
    const L = qd * c.cla * Math.sin(2 * a);
    r.vx += ((-D * vax - L * vay) / (s * c.mass)) * DT;
    r.vy += ((-D * vay + L * vax) / (s * c.mass) - G) * DT;
    r.x += r.vx * DT;
    r.y += r.vy * DT;

    const ctrl = r.hold ? 1 : -0.22;
    const weather = 0.0016 * s * s * sa * (1500 / c.mass);
    r.om += (c.pitch * ctrl - 2.6 * r.om - weather) * DT;
    r.phi = wrap(r.phi + r.om * DT);
    r.airT += DT;
    r.aoa = a;

    if (!r.jumped && r.x >= h.TO) takeoff(r);
    if (r.jumped) r.maxHeight = Math.max(r.maxHeight, r.y - h.y(r.x));

    const cp = Math.cos(r.phi), sp = Math.sin(r.phi);
    for (const [px, py] of CONTACT_POINTS(c)) {
      const wx = r.x + px * cp - py * sp;
      const wy = r.y + px * sp + py * cp;
      if (r.jumped && wx < h.TO + 0.3) continue;
      if (wy < h.y(wx)) { contact(r); return; }
    }
  }

  function contact(r) {
    const c = r.car, h = r.hill;
    const th = Math.atan(h.slope(r.x));
    const diff = wrap(r.phi - th);
    const nx = -Math.sin(th), ny = Math.cos(th);
    const tx = Math.cos(th), ty = Math.sin(th);
    const vn = -(r.vx * nx + r.vy * ny);
    const vt = r.vx * tx + r.vy * ty;
    const dd = Math.abs(diff) * 180 / Math.PI;
    const lim = r.jumped ? 1 : 1.25;
    const crash = dd > 32 * lim || vn > c.crashVn * lim;

    if (r.jumped && !r.landed) {
      r.landed = true;
      r.landT = r.t;
      r.dist = h.arcAt(r.x);
      r.landDiff = dd;
      r.landVn = vn;
      r.landAngle = diff * 180 / Math.PI;
      ev(r, 'land', { dist: r.dist, diff: dd, vn, crash });
    } else if (!r.jumped) {
      ev(r, 'bumpLand', { diff: dd, vn, crash });
    }

    if (crash) {
      r.crashed = true;
      if (!r.jumped) r.dnf = true;
      r.mode = 'wreck';
      // Bundan sonra (x, y) aracın merkezi
      r.x += -Math.sin(r.phi) * c.h / 2;
      r.y += Math.cos(r.phi) * c.h / 2;
      const kick = clamp(vn / 4, 1, 4);
      r.vx = vt * tx * 0.8 + nx * vn * 0.35;
      r.vy = vt * ty * 0.8 + ny * vn * 0.35;
      r.om = (diff > 0 ? 1 : -1) * (3 + kick * 2);
      r.wreckT = 0;
      ev(r, 'crash', { vn, diff: dd });
    } else {
      r.mode = 'ground';
      r.v = Math.max(0, vt * (1 - 0.35 * dd / 32) - 0.05 * Math.max(0, vn));
      r.y = h.y(r.x);
      r.phi = th;
      r.om = 0;
    }
  }

  function wreckStep(r) {
    const c = r.car, h = r.hill;
    r.wreckT += DT;
    r.vy -= G * DT;
    const s = Math.hypot(r.vx, r.vy);
    const drag = 0.5 * RHO * c.cda * 1.6 * s / c.mass;
    r.vx -= r.vx * drag * DT;
    r.vy -= r.vy * drag * DT;
    r.x += r.vx * DT;
    r.y += r.vy * DT;
    r.phi = wrap(r.phi + r.om * DT);
    const rest = c.h * 0.5;
    const gy = h.y(r.x) + rest;
    if (r.y < gy) {
      const th = Math.atan(h.slope(r.x));
      const nx = -Math.sin(th), ny = Math.cos(th);
      const tx = Math.cos(th), ty = Math.sin(th);
      let vn = r.vx * nx + r.vy * ny;
      let vt = r.vx * tx + r.vy * ty;
      r.y = gy;
      if (vn < 0) {
        const hit = -vn;
        vn = hit * 0.32;
        vt *= 0.93;
        vt -= Math.min(Math.abs(vt), 5.5 * G * DT) * Math.sign(vt);
        r.om = r.om * 0.75 + (hit > 3 ? (Math.random() - 0.5) * hit * 0.9 : 0);
        if (hit > 3) ev(r, 'impact', { hit });
      }
      vt -= Math.min(Math.abs(vt), 4 * G * DT) * Math.sign(vt);
      r.vx = vt * tx + vn * nx;
      r.vy = vt * ty + vn * ny;
      r.om *= 0.985;
      // Yerde kalınca sırt veya tekerlek üstüne otur
      if (Math.hypot(r.vx, r.vy) < 2.5) {
        const target = Math.abs(wrap(r.phi - th)) > Math.PI / 2 ? th + Math.PI : th;
        r.phi = wrap(r.phi + wrap(target - r.phi) * 0.06);
        r.om *= 0.9;
      }
    }
    if ((Math.hypot(r.vx, r.vy) < 0.6 && r.wreckT > 1.5) || r.wreckT > 9) finish(r);
  }

  function finish(r) {
    if (r.done) return;
    r.done = true;
    r.doneT = r.t;
    ev(r, 'done');
  }

  function step(r) {
    r.t += DT;
    r.windNow = r.wind + 0.6 * Math.sin(r.t * 0.9) + 0.3 * Math.sin(r.t * 2.3 + 1);
    if (r.nitro > 0) r.nitro = Math.max(0, r.nitro - DT);
    if (r.mode === 'ground') groundStep(r);
    else if (r.mode === 'air') airStep(r);
    else wreckStep(r);
    if (r.t > 45) finish(r);
    const sp = r.mode === 'wreck' ? 0 : speedOf(r);
    if (!r.jumped) r.maxSpeed = Math.max(r.maxSpeed, sp);
  }

  // Kayakla atlama puanlaması: mesafe puanı + 5 hakemin stil puanı (en yüksek ve en düşük atılır) + rüzgâr düzeltmesi
  function score(r, rand) {
    rand = rand || Math.random;
    const h = r.hill;
    if (r.dnf || r.dist === null) {
      return { dnf: true, dist: 0, distPts: 0, judges: [], stylePts: 0, windPts: 0, total: 0 };
    }
    const dist = Math.round(r.dist * 2) / 2;
    const distPts = Math.max(0, 60 + (dist - h.K) * h.mPerPoint);
    let base;
    if (r.crashed) base = 8.5;
    else {
      base = 20 - r.landDiff * 0.32 - Math.max(0, r.landVn - 3) * 0.9;
      if (r.q !== null && r.q > 0.85) base += 0.5;
      if (dist > h.HS) base -= 1;
      base = clamp(base, 9, 20);
    }
    const judges = [];
    for (let i = 0; i < 5; i++) judges.push(clamp(Math.round((base + (rand() - 0.5) * 1.6) * 2) / 2, 0, 20));
    const sorted = judges.slice().sort((a, b) => a - b);
    const stylePts = sorted[1] + sorted[2] + sorted[3];
    const windPts = Math.round(r.wind * 1.8 * 10) / 10;
    const total = Math.round((distPts + stylePts + windPts) * 10) / 10;
    return { dnf: false, dist, distPts: Math.round(distPts * 10) / 10, judges, dropped: [sorted[0], sorted[4]], stylePts, windPts, total };
  }

  const api = { G, DT, ZONE, LATE_WINDOW, NITRO_TIME, CARS, HILL_CFG, buildHill, newRun, step, press, release, score, speedOf, wrap, clamp, smooth, CONTACT_POINTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SJ = api;
})(typeof window !== 'undefined' ? window : globalThis);
