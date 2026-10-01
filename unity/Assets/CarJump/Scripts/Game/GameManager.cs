using System;
using System.Collections.Generic;
using CarJump.Core;
using UnityEngine;

namespace CarJump
{
    /// Oyunun akışı: garaj → start kapısı → geri sayım → atlayış → sonuç.
    /// Fizik sabit adımla (240 Hz) JumpRun'da ilerler; bu sınıf olayları kameraya, efektlere, sese, titreşime ve arayüze dağıtır.
    public class GameManager : MonoBehaviour
    {
        public enum Phase { Menu, Ready, Count, Run, Result }

        [Header("Bağlantılar (Oyun sahnesini kur menüsü doldurur)")]
        public GameAssets assets;
        public HillBuilder hillBuilder;
        public ChaseCamera chaseCamera;
        public SpeedEffects effects;
        public CarAudio carAudio;
        public Hud hud;
        public CarView carView;
        public CarDamage carDamage;

        [Header("Arabalar")]
        [Tooltip("Boş bırakılırsa 4 yer tutucu araba kullanılır. Asset Store modelleri için Car Definition oluşturup buraya ekle.")]
        public List<CarDefinition> cars = new List<CarDefinition>();
        public HillConfig hillConfig = new HillConfig();

        public Phase State { get; private set; } = Phase.Menu;
        Hill hill;
        JumpRun run;
        readonly List<(CarDefinition def, CarSpec spec)> roster = new List<(CarDefinition, CarSpec)>();
        int carIdx, evIdx, gateIdx;
        float wind, acc, slow = 1, slowT, countT, roll, rollW;
        bool wasHeld, saidIce, saidK, saidBeat, saidHS, saidNitro, saidNitroEnd;
        double? toBeat;
        Records records;

        // ---------- Kayıtlar (yalnızca bu cihazda) ----------
        [Serializable] class Entry { public string car; public double dist, total; public bool crashed; }
        [Serializable] class Records { public List<Entry> list = new List<Entry>(); }
        const string Key = "carjump-records-v1";
        void LoadRecords() { records = JsonUtility.FromJson<Records>(PlayerPrefs.GetString(Key, "")) ?? new Records(); }
        void SaveRecords() { PlayerPrefs.SetString(Key, JsonUtility.ToJson(records)); PlayerPrefs.Save(); }

        void Start()
        {
            Application.targetFrameRate = 60;
            LoadRecords();
            hill = new Hill(hillConfig);
            hillBuilder.Build(hill);
            chaseCamera.SetShowroom(hillBuilder.ShowroomPoint + Vector3.up * 0.7f);

            roster.Clear();
            if (cars != null) foreach (var d in cars) if (d != null) roster.Add((d, d.spec));
            if (roster.Count == 0) foreach (var s in CarSpec.Defaults()) roster.Add((null, s));

            hud.Build(assets.font, StartRun, () => StepCar(-1), () => StepCar(1), StartRun, ShowMenu, ToggleMute);
            hud.SetHill(hill.Cfg.name, hill.K, hill.HS);
            ShowMenu();
        }

        // ---------- Akış ----------
        void SelectCar(int i)
        {
            carIdx = (i + roster.Count) % roster.Count;
            var (def, spec) = roster[carIdx];
            carView.Setup(def, spec, assets);
            carDamage.Bind(hillBuilder.TerrainY);
        }

        void StepCar(int d) { SelectCar(carIdx + d); RenderGarage(); }

        void ShowMenu()
        {
            State = Phase.Menu;
            run = null;
            hillBuilder.SetBeat(null);
            hillBuilder.ResetBarrier();
            SelectCar(carIdx);
            hud.Show(false, true, false);
            RenderGarage();
        }

        void RenderGarage()
        {
            var spec = roster[carIdx].spec;
            float maxPW = 0, maxGlide = 0, maxMass = 0, maxTough = 0;
            foreach (var (_, s) in roster) { maxPW = Mathf.Max(maxPW, s.power / s.mass); maxGlide = Mathf.Max(maxGlide, s.cla / s.mass); maxMass = Mathf.Max(maxMass, s.mass); maxTough = Mathf.Max(maxTough, s.crashVn); }
            var stats = new[]
            {
                ("Güç", $"{spec.power / 745.7f:0} hp", spec.power / spec.mass / maxPW),
                ("Ağırlık", $"{spec.mass:0} kg", spec.mass / maxMass),
                ("Süzülme", $"{Mathf.Round(spec.cla / spec.mass / maxGlide * 10)}/10", spec.cla / spec.mass / maxGlide),
                ("Dayanıklılık", $"{Mathf.Round(spec.crashVn / maxTough * 10)}/10", spec.crashVn / maxTough),
            };
            var pb = BestFor(spec.id);
            Entry top = null;
            foreach (var e in records.list) if (!e.crashed && (top == null || e.total > top.total)) top = e;
            string leader = top == null ? null : $"LİDER: {top.dist:0.0} m · {NameOf(top.car)} · {top.total:0.0} PUAN";
            hud.SetGarage(spec.carClass, spec.displayName, spec.description, carIdx, roster.Count, stats, pb == null ? "Henüz atlamadı" : $"En iyi: {pb.dist:0.0} m", leader);
        }

        string NameOf(string id) { foreach (var (_, s) in roster) if (s.id == id) return s.displayName; return id; }
        Entry BestFor(string id) { Entry b = null; foreach (var e in records.list) if (e.car == id && !e.crashed && (b == null || e.dist > b.dist)) b = e; return b; }
        double? BestDistance() { double? b = null; foreach (var e in records.list) if (!e.crashed && (b == null || e.dist > b)) b = e.dist; return b; }

        void StartRun()
        {
            SelectCar(carIdx);
            carDamage.ResetDamage();
            var spec = roster[carIdx].spec;
            wind = Mathf.Round(UnityEngine.Random.Range(-4f, 4f) * 10) / 10;
            run = new JumpRun(spec, hill, wind, UnityEngine.Random.Range(1, 100000));
            evIdx = 0; gateIdx = 0; acc = 0; slow = 1; slowT = 0; roll = 0; rollW = 0;
            saidIce = saidK = saidBeat = saidHS = saidNitro = saidNitroEnd = false;
            hillBuilder.ResetBarrier();
            toBeat = BestDistance();
            hillBuilder.SetBeat(toBeat);
            carAudio.ResetGear();
            State = Phase.Ready;
            wasHeld = true; // start düğmesine basan parmak kalkana kadar oyuna sayılmaz
            hud.Show(true, false, false);
            hud.SetRun(spec.displayName, wind, toBeat == null ? null : $"GEÇİLECEK: {toBeat:0.0} m");
            hud.SetPrompt("Hazır olunca ekrana dokun", false);
            hud.SetLights(-1);
            hud.Say(Commentary.Start(spec.displayName, wind), 4);
            SyncCar(0);
            chaseCamera.Follow(ChaseCamera.Shot.Ready, CarCenter(), (float)run.Phi, 0, false, true, 0.016f, true);
        }

        void ToggleMute() { carAudio.SetMuted(!carAudio.Muted); hud.SetMuted(carAudio.Muted); }

        // ---------- Döngü ----------
        void Update()
        {
            float dtReal = Mathf.Min(Time.unscaledDeltaTime, 0.05f);
            if (slowT > 0) { slowT -= dtReal; if (slowT <= 0) slow = 1; }
            float dt = dtReal * slow;

            bool held = InputReader.Held();
            bool pressed = held && !wasHeld, released = !held && wasHeld;
            wasHeld = held;

            if (State == Phase.Ready && pressed) { State = Phase.Count; countT = 0; pressed = false; }
            if (State == Phase.Count)
            {
                countT += dtReal;
                int n = Mathf.FloorToInt(countT / 0.45f);
                hud.SetLights(Mathf.Min(n, 3));
                hud.SetPrompt(n >= 3 ? "Git!" : "Hazır…", false);
                if (countT > 1.45f) { State = Phase.Run; hud.SetLights(-1); run.Release(); }
            }

            if (run != null && (State == Phase.Run || State == Phase.Result))
            {
                if (State == Phase.Run)
                {
                    if (pressed) run.Press();
                    if (released) run.Release();
                }
                acc += dt;
                int steps = 0;
                while (acc >= JumpRun.DT && steps < 40) { run.Step(); acc -= (float)JumpRun.DT; steps++; }
                HandleEvents();
                FlightComments();
                UpdateRunFx(dt);
                if (State == Phase.Run)
                {
                    double t0 = run.LandT;
                    bool ready = run.Done || (run.Dnf && run.T - t0 > 2.5) || (run.WallHit && run.T - run.WallT > 2.8) || (run.Crashed && run.Landed && run.T - t0 > 9);
                    if (ready) ShowResult();
                    UpdateHud();
                }
            }

            // Kamera
            if (State == Phase.Menu || run == null)
            {
                carView.transform.SetPositionAndRotation(hillBuilder.ShowroomPoint + Vector3.up * 0.05f, Quaternion.Euler(0, Time.time * 14f, 0));
                chaseCamera.Follow(ChaseCamera.Shot.Showroom, Vector3.zero, 0, 0, false, false, dtReal);
            }
            else
            {
                SyncCar(dt);
                var shot = State == Phase.Ready || State == Phase.Count ? ChaseCamera.Shot.Ready
                    : run.Mode == Mode.Wreck ? ChaseCamera.Shot.Wreck
                    : run.Mode == Mode.Air && run.Jumped && !run.Landed ? ChaseCamera.Shot.Flight : ChaseCamera.Shot.Ground;
                float heading = run.Mode == Mode.Ground ? (float)run.Phi : (float)Math.Atan2(run.Vy, run.Vx);
                float kmh = run.Mode == Mode.Wreck ? 0 : (float)run.Speed * 3.6f;
                chaseCamera.Follow(shot, CarCenter(), heading, kmh, run.Nitro, run.Mode == Mode.Ground && !run.Landed, dtReal);
                chaseCamera.ClampAbove(hillBuilder.TerrainY, 0.9f);
            }

            float speedKmh = run != null && run.Mode != Mode.Wreck ? (float)run.Speed * 3.6f : 0;
            bool running = run != null && (State == Phase.Run || State == Phase.Result);
            effects.Tick(speedKmh, run != null && run.Nitro, running && run.Mode != Mode.Wreck, dtReal);
            int audioState = State == Phase.Ready || State == Phase.Count ? 1 : running ? 2 : 0;
            carAudio.Tick(audioState, speedKmh, run != null && run.Mode == Mode.Air, run != null && run.Landed, run != null && run.Mode == Mode.Wreck, run != null && run.Nitro, dtReal);
        }

        Vector3 CarCenter()
        {
            if (run.Mode == Mode.Wreck) return new Vector3((float)run.X, (float)run.Y, 0);
            return new Vector3((float)(run.X - Math.Sin(run.Phi) * run.Car.height / 2), (float)(run.Y + Math.Cos(run.Phi) * run.Car.height / 2), 0);
        }

        void SyncCar(float dt)
        {
            if (run.Mode == Mode.Wreck)
            {
                roll += rollW * dt; rollW *= 1 - 0.6f * dt;
                var bottom = new Vector3((float)(run.X + Math.Sin(run.Phi) * run.Car.height / 2), (float)(run.Y - Math.Cos(run.Phi) * run.Car.height / 2), 0);
                carView.SetPose(bottom, (float)run.Phi, roll);
            }
            else carView.SetPose(new Vector3((float)run.X, (float)run.Y, 0), (float)run.Phi, 0);
            if (run.Mode == Mode.Ground) carView.SpinWheels((float)run.V * dt);
            carView.SetNitro(run.Nitro);
            carView.SetBrake(run.Landed && run.Mode == Mode.Ground);
        }

        void UpdateRunFx(float dt)
        {
            // Tekerlek kar tozu
            if (run.Mode == Mode.Ground && run.V > 6)
            {
                var rear = new Vector3((float)(run.X - Math.Cos(run.Phi) * run.Car.wheelbase / 2), (float)run.Y + 0.1f, 0);
                int k = Mathf.Min(4, (int)(run.V / 14));
                for (int i = 0; i < k; i++)
                    foreach (int s in new[] { -1, 1 })
                        effects.Spray(rear + Vector3.forward * s * 0.85f, new Vector3((float)(run.V * Math.Cos(run.Phi) * 0.55), 1 + UnityEngine.Random.value * 2, s * (1 + UnityEngine.Random.value * 2)));
            }
            // Duman
            if (carDamage.Smoke > 0 && UnityEngine.Random.value < carDamage.Smoke * 0.8f) effects.Smoke(CarCenter() + Vector3.up * 0.4f);
            // Nitro kapılarından geçiş
            if (!run.Jumped)
                while (gateIdx < hillBuilder.GateXs.Count && run.X > hillBuilder.GateXs[gateIdx])
                {
                    gateIdx++;
                    carAudio.Gate(Mathf.Clamp01((float)run.V / 90f));
                    if (run.Nitro) { effects.Flash(0.18f); Haptics.Pulse(12); }
                }
            if (hillBuilder.GateLightInstance)
            {
                float glow = 2.4f + (run.Nitro ? 1.6f + Mathf.Sin(Time.time * 30) * 0.8f : 0);
                hillBuilder.GateLightInstance.SetColor("_EmissionColor", new Color(0.18f, 0.55f, 1f) * glow);
            }
            if (run.Landed && !run.Crashed && !run.WallHit && !saidIce && run.T - run.LandT > 1.3) { saidIce = true; hud.Say(Commentary.Ice(), 2.5f); }
        }

        void HandleEvents()
        {
            while (evIdx < run.Events.Count)
            {
                var e = run.Events[evIdx++];
                var c = CarCenter();
                var vel = new Vector3((float)run.Vx, (float)run.Vy, 0);
                switch (e.type)
                {
                    case SimEventType.Nitro:
                        if (!saidNitro) { saidNitro = true; hud.Say(Commentary.Nitro(), 2.2f); }
                        chaseCamera.NitroKick(7); chaseCamera.Shake(0.35f); effects.Flash(0.6f);
                        carAudio.Nitro(); Haptics.Pulse(45);
                        break;
                    case SimEventType.NitroEnd:
                        if (run.X > hill.Cfg.nitroEnd - 2 && !saidNitroEnd) { saidNitroEnd = true; hud.Say(Commentary.NitroEnd((float)e.speed * 3.6f), 2.4f); }
                        break;
                    case SimEventType.Takeoff:
                        hud.Say(Commentary.Takeoff(e.hasQ ? e.q : (double?)null, (float)e.speed * 3.6f), 2.6f);
                        slow = 0.33f; slowT = 0.7f; effects.Flash(1); chaseCamera.NitroKick(-5);
                        carAudio.Crowd(1); Haptics.Pulse(60);
                        break;
                    case SimEventType.Late: hud.Say(Commentary.Late()); break;
                    case SimEventType.Land:
                    {
                        float strength = Mathf.Clamp((float)(e.vn / run.Car.crashVn), 0, 1.5f);
                        effects.Burst(new Vector3((float)run.X, (float)hill.Y(run.X) + 0.3f, 0), new Vector3((float)run.Vx * 0.5f, 3 + (float)e.vn * 0.5f, 0), 70, 9);
                        chaseCamera.Shake(0.3f + strength * 0.7f);
                        carAudio.Thump(strength); Haptics.Pulse(e.crash ? 140 : 50);
                        if (!e.crash) { hud.Say(Commentary.Land(e.diff, e.vn), 3); carAudio.Crowd(0.8f); }
                        break;
                    }
                    case SimEventType.Crash:
                        carDamage.Apply((float)e.lx, (float)e.ly, (float)e.cost, vel);
                        effects.Debris(c, vel * 0.6f + Vector3.up * 4, 22, Color.gray);
                        effects.Burst(c, vel * 0.4f + Vector3.up * 4, 120, 12);
                        chaseCamera.Shake(1.4f); slow = 0.3f; slowT = 1f;
                        rollW = (UnityEngine.Random.value < 0.5f ? -1 : 1) * (4 + UnityEngine.Random.value * 4) * Mathf.Rad2Deg;
                        carAudio.Crash(1.2f);
                        hud.Say(Commentary.Crash(run.Dnf), 3.5f);
                        break;
                    case SimEventType.Impact:
                        carDamage.Apply((float)e.lx, (float)e.ly, (float)e.cost, vel);
                        effects.Burst(c - Vector3.up * 0.4f, vel * 0.3f + Vector3.up * 3, 30, 7);
                        effects.Debris(c, vel * 0.5f, 3, Color.gray);
                        rollW += (UnityEngine.Random.value - 0.5f) * (float)e.hit * 0.8f * Mathf.Rad2Deg;
                        carAudio.Thump(Mathf.Clamp((float)e.hit / 15f, 0.2f, 1f));
                        chaseCamera.Shake(0.5f);
                        break;
                    case SimEventType.Wall:
                        carDamage.Apply((float)e.lx, (float)e.ly, (float)e.cost, new Vector3((float)e.speed, 0, 0));
                        hillBuilder.SmashBarrier((float)e.speed, 0);
                        effects.Debris(c, new Vector3(-4, 6, 0), 26, Color.gray);
                        effects.Burst(new Vector3((float)hill.XBarrier - 1, c.y, 0), new Vector3(6, 8, 0), 160, 16);
                        chaseCamera.Shake(1.8f); slow = 0.28f; slowT = 1.1f; effects.Flash(0.8f);
                        rollW = (UnityEngine.Random.value < 0.5f ? -1 : 1) * (5 + UnityEngine.Random.value * 5) * Mathf.Rad2Deg;
                        carAudio.Crash(Mathf.Clamp((float)e.speed / 80f, 0.4f, 1.4f)); Haptics.Pulse(220);
                        hud.Say(Commentary.Wall((float)e.speed * 3.6f), 3.5f);
                        break;
                }
            }
        }

        void FlightComments()
        {
            if (!run.Jumped || run.Landed || run.Mode != Mode.Air) return;
            double d = hill.ArcAt(run.X);
            if (!saidK && d > hill.K) { saidK = true; hud.Say(Commentary.PassK(), 2); }
            if (toBeat != null && !saidBeat && d > toBeat) { saidBeat = true; hud.Say(Commentary.PassBeat(), 2.2f); }
            if (!saidHS && d > hill.HS) { saidHS = true; hud.Say(Commentary.PassHS(), 2.2f); }
        }

        void UpdateHud()
        {
            float kmh = run.Mode == Mode.Wreck ? 0 : (float)run.Speed * 3.6f;
            hud.SetSpeed(kmh, run.Nitro);
            if (run.Jumped)
            {
                double d = run.Landed ? Math.Round(run.Dist.Value * 2) / 2 : hill.ArcAt(run.X);
                hud.SetDistance((float)d, toBeat != null && d > toBeat);
            }
            else hud.SetDistance(null, false);
            float to = (float)hill.TO;
            hud.SetMeter(!run.Jumped || run.AirT < 0.35, Mathf.Clamp01((float)run.X / to), (float)hill.Cfg.nitroStart / to, (float)hill.Cfg.nitroEnd / to, (to - (float)JumpRun.ZONE) / to, run.Nitro);

            if (run.Mode == Mode.Wreck || run.Landed) { hud.SetPrompt("", false); return; }
            double toEdge = hill.TO - run.X;
            if (!run.Jumped)
            {
                if (run.X < hill.Cfg.nitroStart) hud.SetPrompt(run.X < hill.Cfg.nitroStart - 18 ? "Tam gaz" : "Nitro geliyor · bas ve tut", run.X >= hill.Cfg.nitroStart - 18);
                else if (run.X <= hill.Cfg.nitroEnd) hud.SetPrompt(run.Nitro ? "NİTRO!" : "Basılı tut: nitro", !run.Nitro);
                else if (toEdge > JumpRun.ZONE) hud.SetPrompt(run.Hold ? "Bırak!" : "Bekle… sarı bölgede bas", run.Hold);
                else hud.SetPrompt(run.TapX == null ? "Şimdi bas: burnu kaldır!" : "Burun yukarıda · tut", run.TapX == null);
            }
            else
            {
                double gap = run.Y - hill.Y(run.X), d = hill.ArcAt(run.X);
                if (run.Hold) hud.SetPrompt(d > hill.HS - 40 ? "HS yaklaşıyor · bırak!" : gap < 6 ? "Yere paralel ol" : "Süzülüyor · bırak: in", d > hill.HS - 40);
                else hud.SetPrompt("Basılı tut: süzül", false);
            }
        }

        // ---------- Sonuç ----------
        void ShowResult()
        {
            State = Phase.Result;
            var sc = run.Score();
            var spec = run.Car;
            var prevBest = BestFor(spec.id);
            double prevTop = -1; foreach (var e in records.list) if (!e.crashed) prevTop = Math.Max(prevTop, e.total);
            bool crashed = run.Crashed || sc.dnf;
            if (!sc.dnf)
            {
                records.list.Add(new Entry { car = spec.id, dist = sc.dist, total = sc.total, crashed = crashed });
                if (records.list.Count > 60) records.list.RemoveAt(0);
                SaveRecords();
            }
            bool isTop = !crashed && sc.total > prevTop;
            bool isPb = !crashed && (prevBest == null || sc.dist > prevBest.dist);
            string tag = sc.dnf ? "Diskalifiye" : run.Crashed ? "Kaza" : isTop ? "Yeni lider" : isPb ? "Kişisel rekor" : "Sonuç";

            string note;
            if (sc.dnf) note = "Kenara ulaşamadan kaza yaptı.";
            else if (run.Crashed) note = run.LandVn > spec.crashVn * 1.7 ? $"İniş çok sert ({run.LandVn:0.0} m/s). Yere yaklaşırken basılı tutup süzülerek düşüşü yumuşat." : $"Araç yokuşa {run.LandDiff:0}° açıyla indi. İnişte yokuşa paralel ol.";
            else if (run.Q == null) note = "Burnu kaldırmadın. Sarı bölgede, kenara olabildiğince yakın bas.";
            else if (sc.dist < hill.K - 80) note = "Nitroyu sonuna kadar yak ve uçuşta daha uzun basılı tut.";
            else if (sc.dist > hill.HS) note = "HS sınırının ötesi düzlük. Daha uzağa uçmak, daha sert iniş demek.";
            else note = $"Kalkış: %{run.Q.Value * 100:0} · Kenarda {run.EdgeSpeed * 3.6:0} km/sa · İniş açısı {run.LandDiff:0}°";

            var parts = new List<string>();
            if (run.Crashed) parts.Add(run.Tumbles > 0 ? $"Yere çakıldı, {run.Tumbles} kez yuvarlandı" : "Yere çakıldı");
            if (run.WallHit) parts.Add($"panolara {run.WallSpeed * 3.6:0} km/sa ile çarptı");
            string dmgNote = string.Join(", ", parts);

            hud.SetResult(new Hud.ResultData
            {
                tag = tag, who = $"{spec.displayName} · {spec.carClass}", record = (isTop || isPb) && !run.Crashed,
                dist = sc.dnf ? "—" : $"{sc.dist:0.0} m", total = $"{sc.total:0.0}", note = note,
                showDamage = run.Damage > 0, damage = $"{Math.Round(run.Damage / 100) * 100:N0} ₺", damageNote = dmgNote,
                showTable = !sc.dnf, judges = sc.judges, dropLow = sc.droppedLow, dropHigh = sc.droppedHigh,
                distPts = $"{sc.distPts:0.0}", stylePts = $"{sc.stylePts:0.0}", windPts = $"{(sc.windPts > 0 ? "+" : "")}{sc.windPts:0.0}",
                kDiff = $"{(sc.dist - hill.K > 0 ? "+" : "")}{sc.dist - hill.K:0.0} m",
            });
            hud.Show(false, false, true);
        }
    }
}
