// Atlama fiziği ve puanlama. UnityEngine'e bağımlı değildir; web prototipindeki physics.js'in birebir karşılığıdır.
// Birimler: metre, saniye, kilogram, watt. x ileri, y yukarı (2D kesit).
using System;
using System.Collections.Generic;

namespace CarJump.Core
{
    [Serializable]
    public class CarSpec
    {
        public string id = "car";
        public string displayName = "Car";
        public string carClass = "";
        public string description = "";
        public float mass = 1500f;
        public float length = 4.5f;
        public float height = 1.2f;
        public float wheelbase = 2.7f;
        public float wheelRadius = 0.34f;
        public float power = 500e3f;      // W
        public float cda = 0.7f;          // sürükleme katsayısı x ön alan
        public float cla = 1.5f;          // kaldırma katsayısı x alan
        public float plan = 8f;           // yukarıdan görünen alan (burun açısı arttıkça sürükleme)
        public float crr = 0.014f;        // yuvarlanma direnci
        public float pitch = 3.5f;        // burun kaldırma ivmesi (rad/s²)
        public float crashVn = 13f;       // iniş toleransı (m/s)

        public static CarSpec[] Defaults() => new[]
        {
            new CarSpec { id = "vento", displayName = "Vento R", carClass = "Hiper araba", description = "Hafif ve çevik. Uzun süzülür ama sert inişi affetmez.",
                mass = 1150, length = 4.4f, height = 1.12f, wheelbase = 2.68f, wheelRadius = 0.34f, power = 520e3f, cda = 0.62f, cla = 1.45f, plan = 7.4f, crr = 0.014f, pitch = 4.4f, crashVn = 12 },
            new CarSpec { id = "corsa", displayName = "Corsa V12", carClass = "Gran turismo", description = "Dengeli. Güçlü motor, sağlam süspansiyon.",
                mass = 1650, length = 4.75f, height = 1.24f, wheelbase = 2.82f, wheelRadius = 0.36f, power = 610e3f, cda = 0.74f, cla = 1.5f, plan = 8.4f, crr = 0.014f, pitch = 3.4f, crashVn = 13 },
            new CarSpec { id = "titan", displayName = "Titan XR", carClass = "Süper SUV", description = "Ağır tank. Rüzgâra aldırmaz, iner inmez yere yapışır.",
                mass = 2400, length = 5.05f, height = 1.72f, wheelbase = 3.0f, wheelRadius = 0.42f, power = 720e3f, cda = 1.12f, cla = 1.9f, plan = 9.8f, crr = 0.016f, pitch = 2.4f, crashVn = 16 },
            new CarSpec { id = "bolt", displayName = "Bolt Mini", carClass = "Şehir arabası", description = "Yavaş ama tüy gibi. Rüzgârı iyi okursan sürpriz yapar.",
                mass = 820, length = 3.35f, height = 1.5f, wheelbase = 2.12f, wheelRadius = 0.29f, power = 175e3f, cda = 0.66f, cla = 1.75f, plan = 5.2f, crr = 0.012f, pitch = 5.4f, crashVn = 11 },
        };
    }

    [Serializable]
    public class HillConfig
    {
        public string name = "Kartal Tepe";
        public double inrun = 28;      // ana iniş eğimi (derece)
        public double table = 11;      // kalkış masası eğimi
        public double takeoffX = 240;  // kalkış kenarının x konumu
        public double step = 3.5;      // kenardan sonra iniş pistinin başladığı düşüş
        public double knoll = 16;      // iniş pistinin başlangıç eğimi
        public double land = 33;       // iniş pisti eğimi
        public double v0 = 95;         // pistin tasarlandığı nominal kalkış hızı (m/s)
        public double nomDrag = 0.00035;
        public double nomLift = 0.12;
        public double straight = 80;   // eğim düzleşmeden önceki düz bölüm
        public double flatten = 190;   // düzleşme mesafesi
        public double nitroStart = 30; // nitro bölgesi (x)
        public double nitroEnd = 150;  // sonrası kusursuz rampa
        public double barrier = 60;    // pist sonundaki reklam panosu duvarı: düzlüğün başlangıcından sonra (m)
        public double bankHeight = 3.3; // panoların arkasındaki kar seti
        public double bankWidth = 7;
    }

    public static class SimMath
    {
        public static double Clamp(double v, double a, double b) => v < a ? a : v > b ? b : v;
        public static double Smooth(double a, double b, double t) { t = Clamp(t, 0, 1); t = t * t * (3 - 2 * t); return a + (b - a) * t; }
        public static double Deg(double d) => d * Math.PI / 180.0;
        public static double Wrap(double a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
    }

    /// Pist profili: inişin ve iniş pistinin yüksekliği, eğimi, eğriliği ve kenardan itibaren yay uzunluğu.
    public class Hill
    {
        public readonly HillConfig Cfg;
        public readonly double Dx = 0.25;
        public readonly int N, ITO;
        public readonly double TO, YTO, XEnd, XFlat, XBarrier;
        public readonly double K, HS, MPerPoint = 0.4;
        readonly double[] ys, slope, curv, arc;

        public Hill(HillConfig cfg)
        {
            Cfg = cfg;
            TO = cfg.takeoffX;
            XEnd = TO + 1350;
            N = (int)Math.Ceiling(XEnd / Dx) + 1;
            ITO = (int)Math.Round(TO / Dx);
            ys = new double[N]; slope = new double[N]; curv = new double[N]; arc = new double[N];

            // Gerçek atlama kulelerindeki gibi iniş pisti, nominal bir uçuş eğrisinin birkaç metre altına çizilir.
            var nominal = new List<(double d, double a)>();
            {
                double th = SimMath.Deg(-cfg.table);
                double vx = cfg.v0 * Math.Cos(th) - Math.Sin(th) * 3;
                double vy = cfg.v0 * Math.Sin(th) + Math.Cos(th) * 3;
                double d = 0, h2 = 0.02;
                while (d < 600)
                {
                    double v = Math.Sqrt(vx * vx + vy * vy);
                    vx += (-cfg.nomDrag * v * vx) * h2;
                    vy += (-cfg.nomDrag * v * vy - 9.81 * (1 - cfg.nomLift)) * h2;
                    d += vx * h2;
                    double ang = Math.Atan2(vy, vx) * 180 / Math.PI;
                    nominal.Add((d, ang));
                    if (ang < -cfg.land) break;
                }
            }
            double d1 = nominal[nominal.Count - 1].d;
            double NomAngle(double d)
            {
                if (d <= nominal[0].d) return nominal[0].a;
                int lo = 0, hi = nominal.Count - 1;
                while (hi - lo > 1) { int m = (lo + hi) >> 1; if (nominal[m].d < d) lo = m; else hi = m; }
                return nominal[hi].a;
            }
            double dK = d1 + cfg.straight, dFlat = dK + cfg.flatten;
            double InrunAngle(double x)
            {
                if (x < TO - 72) return -cfg.inrun;
                if (x < TO - 16) return SimMath.Smooth(-cfg.inrun, -cfg.table, (x - (TO - 72)) / 56);
                return -cfg.table;
            }
            double LandAngle(double d)
            {
                if (d < d1) return Math.Max(-cfg.land, SimMath.Smooth(-cfg.knoll, NomAngle(d) - 1.6, d / 12));
                if (d < dK) return -cfg.land;
                if (d < dFlat) return SimMath.Smooth(-cfg.land, 0, (d - dK) / cfg.flatten);
                if (d < dFlat + 170) return 0;
                return SimMath.Smooth(0, 9, (d - dFlat - 170) / 60);
            }

            double y = 0;
            for (int i = 0; i <= ITO; i++) { ys[i] = y; y += Math.Tan(SimMath.Deg(InrunAngle(i * Dx + Dx / 2))) * Dx; }
            YTO = ys[ITO];
            y = YTO - cfg.step;
            for (int i = ITO + 1; i < N; i++) { double d = i * Dx - TO; ys[i] = y; y += Math.Tan(SimMath.Deg(LandAngle(d + Dx / 2))) * Dx; }

            for (int i = 1; i < N - 1; i++)
            {
                if (i == ITO || i == ITO + 1) { slope[i] = slope[i - 1]; continue; }
                double s = (ys[i + 1] - ys[i - 1]) / (2 * Dx);
                slope[i] = s;
                double s2 = (ys[i + 1] - 2 * ys[i] + ys[i - 1]) / (Dx * Dx);
                curv[i] = s2 / Math.Pow(1 + s * s, 1.5);
            }
            slope[0] = slope[1]; slope[N - 1] = slope[N - 2];
            curv[ITO] = curv[ITO + 1] = 0;
            for (int i = ITO + 2; i < N; i++) { double dy = ys[i] - ys[i - 1]; arc[i] = arc[i - 1] + Math.Sqrt(Dx * Dx + dy * dy); }

            K = Math.Round(ArcAt(TO + dK) / 5) * 5;
            HS = Math.Round(ArcAt(TO + dK + cfg.flatten * 0.3) / 5) * 5;
            XFlat = TO + dFlat;
            XBarrier = XFlat + cfg.barrier;
        }

        double Sample(double[] arr, double x)
        {
            double f = SimMath.Clamp(x / Dx, 0, N - 1.001);
            int i = (int)Math.Floor(f);
            double t = f - i;
            return arr[i] * (1 - t) + arr[i + 1] * t;
        }
        public double Y(double x) => x <= TO ? Sample(ys, Math.Min(x, TO)) : Sample(ys, Math.Max(x, (ITO + 1) * Dx));
        public double Slope(double x) => Sample(slope, x);
        public double Curv(double x) => Sample(curv, x);
        public double ArcAt(double x) => x <= TO ? 0 : Sample(arc, x);
        public double XAtArc(double s)
        {
            int lo = ITO + 1, hi = N - 1;
            while (hi - lo > 1) { int m = (lo + hi) >> 1; if (arc[m] < s) lo = m; else hi = m; }
            return lo * Dx;
        }
        public double SlopeAngle(double x) => Math.Atan(Slope(x));
        /// Kar seti fiziğin parçası: üstüne konulabilir, yeterince yüksekten üstünden geçilebilir.
        public double Bank(double x) => x >= XBarrier && x <= XBarrier + Cfg.bankWidth ? Cfg.bankHeight : 0;
        public double Ground(double x) => Y(x) + Bank(x);
    }

    public enum Mode { Ground, Air, Wreck }

    public enum SimEventType { Nitro, NitroEnd, BumpAir, BumpLand, Takeoff, Late, Land, Crash, Impact, Wall, Done }

    public struct SimEvent
    {
        public SimEventType type;
        public double t, speed, q, dist, diff, vn, hit, cost;
        public double lx, ly; // darbe yönü, araç ekseninde (yerden/duvardan arabaya doğru)
        public bool crash, hasQ;
    }

    public class ScoreResult
    {
        public bool dnf;
        public double dist, distPts, stylePts, windPts, total;
        public double[] judges = new double[0];
        public int droppedLow = -1, droppedHigh = -1;
    }

    /// Bir atlayışın durumu. Step() sabit zaman adımıyla ilerletir; Press/Release dokunma girdisidir.
    public class JumpRun
    {
        public const double G = 9.81, RHO = 1.2, DT = 1.0 / 240.0;
        public const double ZONE = 40;          // burun kaldırma bölgesi: kenardan önceki son 40 m
        public const double LATE_WINDOW = 0.22;
        public const double NITRO_MULT = 2.4;   // nitro açıkken motor gücü çarpanı
        public const double NITRO_THRUST = 5.5; // nitro açıkken ek itiş (m/s²)
        public const double WIND_LIFT = 6;      // önden rüzgâr kaldırmayı artırır

        public readonly CarSpec Car;
        public readonly Hill Hill;
        public readonly double Wind;
        public double WindNow;
        public Mode Mode = Mode.Ground;
        public double T, X, Y, V, Vx, Vy, Phi, Om, Aoa, AirT, NitroDist;
        public bool Hold, Nitro, NitroUsed, Late, Jumped, Landed, Crashed, Dnf, Done;
        public double? TapX, Q, Dist;
        public double LandT, LandDiff, LandVn, LandAngle, EdgeSpeed, MaxSpeed, MaxHeight, WreckT, DoneT;
        public bool WallHit;
        public double WallT, WallSpeed, Damage; // Damage: oyun içi hasar bedeli (₺), her darbede birikir
        public int Tumbles;
        public readonly List<SimEvent> Events = new List<SimEvent>();
        readonly Random rng;

        public JumpRun(CarSpec car, Hill hill, double wind, int seed = 1)
        {
            Car = car; Hill = hill; Wind = wind; WindNow = wind;
            X = 2; Y = hill.Y(2); Phi = Math.Atan(hill.Slope(2)); // rampaya oturmuş başlar
            rng = new Random(seed);
        }

        public double Speed => Mode == Mode.Ground ? Math.Abs(V) : Math.Sqrt(Vx * Vx + Vy * Vy);
        public bool InNitroZone => !Jumped && X >= Hill.Cfg.nitroStart && X <= Hill.Cfg.nitroEnd;
        public bool InLiftZone => !Jumped && X >= Hill.TO - ZONE;

        void Ev(SimEventType type, double speed = 0, double? q = null, double dist = 0, double diff = 0, double vn = 0, bool crash = false, double hit = 0)
        {
            Events.Add(new SimEvent { type = type, t = T, speed = speed, q = q ?? 0, hasQ = q.HasValue, dist = dist, diff = diff, vn = vn, crash = crash, hit = hit });
        }

        public void Press()
        {
            Hold = true;
            if (Done) return;
            if (Mode == Mode.Ground && !Jumped)
            {
                // Kenara yaklaşırken ilk basış: burun kaldırma ve kalkış zamanlaması
                if (X >= Hill.TO - ZONE && TapX == null) TapX = X;
            }
            else if (Mode == Mode.Air && Jumped && TapX == null && !Late && AirT < LATE_WINDOW)
            {
                Late = true;
                double k = 0.45 * (1 - AirT / LATE_WINDOW);
                ApplyBoost(k);
                Q = k;
                Ev(SimEventType.Late, q: k);
            }
        }

        public void Release() { Hold = false; }

        void ApplyBoost(double q)
        {
            double th = Math.Atan(-Math.Tan(SimMath.Deg(Hill.Cfg.table)));
            double boost = 0.6 + 4.2 * q;
            Vx += -Math.Sin(th) * boost;
            Vy += Math.Cos(th) * boost;
            Om += 0.12 + 0.25 * q;
        }

        void Takeoff()
        {
            Jumped = true;
            EdgeSpeed = Speed;
            if (Mode == Mode.Ground)
            {
                double th = Math.Atan(Hill.Slope(Hill.TO - 1));
                Mode = Mode.Air;
                Vx = V * Math.Cos(th); Vy = V * Math.Sin(th);
                Om = 0; AirT = 0;
            }
            double q = 0;
            if (TapX != null) { q = SimMath.Clamp(1 - (Hill.TO - TapX.Value) / ZONE, 0, 1); ApplyBoost(q); }
            Q = TapX != null ? q : (double?)null;
            Ev(SimEventType.Takeoff, speed: EdgeSpeed, q: Q);
        }

        void GroundStep()
        {
            var c = Car; var h = Hill;
            double th = Math.Atan(h.Slope(X)), cth = Math.Cos(th), sth = Math.Sin(th);
            double F = -c.mass * G * sth;
            bool nitroOn = InNitroZone && Hold;
            if (nitroOn && !Nitro) { NitroUsed = true; Ev(SimEventType.Nitro); }
            if (!nitroOn && Nitro) Ev(SimEventType.NitroEnd, speed: V);
            Nitro = nitroOn;
            if (nitroOn) NitroDist += V * DT;
            if (!Landed)
            {
                double P = c.power * (nitroOn ? NITRO_MULT : 1);
                F += Math.Min(P / Math.Max(V, 4), 1.05 * c.mass * G * cth * (nitroOn ? 1.6 : 1));
                if (nitroOn) F += NITRO_THRUST * c.mass;
            }
            double va = V - WindNow * cth;
            double noseUp = !Jumped && TapX != null && Hold ? 2.2 : 1; // erken kaldırılan burun hava freni gibi çalışır
            F -= 0.5 * RHO * c.cda * noseUp * va * Math.Abs(va);
            // İnişten sonra pist buz: araç durmadan pist sonundaki panolara kayar
            F -= c.crr * (Landed ? 0.4 : 1) * c.mass * G * cth * (V >= 0 ? 1 : -1);
            V += F / c.mass * DT;
            if (Landed && V < 0.4 && T - LandT > 1) V = 0;
            X += V * cth * DT;
            Phi = th; Om = 0;
            if (!Jumped && X >= h.TO) { Y = h.YTO + (X - h.TO) * Math.Tan(th); Takeoff(); return; }
            double gy = h.Ground(X);
            if (Landed && gy < Y - 0.3)
            {
                // Kar setinin arkasından boşluğa çıkış
                Mode = Mode.Air; Vx = V * cth; Vy = V * sth; AirT = 0;
                return;
            }
            Y = gy;

            double k = h.Curv(X);
            if (k < 0 && V * V * -k > G * cth)
            {
                Mode = Mode.Air;
                Vx = V * cth; Vy = V * sth; Om = V * k * 0.35; AirT = 0;
                if (!Jumped) Ev(SimEventType.BumpAir, speed: V);
            }
            if (Landed && V == 0 && !Done) Finish();
        }

        public (double x, double y)[] ContactPoints() => new[]
        {
            (-Car.wheelbase / 2.0, 0.0), (Car.wheelbase / 2.0, 0.0),
            (-Car.length / 2.0, 0.3), (Car.length / 2.0, 0.3),
            (-Car.length * 0.42, (double)Car.height), (Car.length * 0.3, (double)Car.height),
        };

        void AirStep()
        {
            var c = Car; var h = Hill;
            double vax = Vx - WindNow, vay = Vy;
            double s = Math.Sqrt(vax * vax + vay * vay); if (s < 1e-6) s = 1e-6;
            double gam = Math.Atan2(vay, vax);
            double a = SimMath.Wrap(Phi - gam), sa = Math.Sin(a);
            double qd = 0.5 * RHO * s * s;
            double D = qd * (c.cda + c.plan * 0.85 * sa * sa);
            double sl = Math.Max(0, s - WIND_LIFT * WindNow);
            double L = 0.5 * RHO * sl * sl * c.cla * Math.Sin(2 * a);
            Vx += (-D * vax - L * vay) / (s * c.mass) * DT;
            Vy += ((-D * vay + L * vax) / (s * c.mass) - G) * DT;
            X += Vx * DT; Y += Vy * DT;

            double ctrl = Hold ? 1 : -0.22;
            double weather = 0.0016 * s * s * sa * (1500.0 / c.mass);
            Om += (c.pitch * ctrl - 2.6 * Om - weather) * DT;
            Phi = SimMath.Wrap(Phi + Om * DT);
            AirT += DT;
            Aoa = a;

            if (!Jumped && X >= h.TO) Takeoff();
            if (Jumped) MaxHeight = Math.Max(MaxHeight, Y - h.Y(X));

            double cp = Math.Cos(Phi), sp = Math.Sin(Phi);
            foreach (var (px, py) in ContactPoints())
            {
                double wx = X + px * cp - py * sp, wy = Y + px * sp + py * cp;
                if (Jumped && wx < h.TO + 0.3) continue;
                if (wy < h.Ground(wx)) { Contact(); return; }
            }
        }

        (double lx, double ly) LocalDir(double wx, double wy)
        {
            double c = Math.Cos(-Phi), s = Math.Sin(-Phi);
            return (wx * c - wy * s, wx * s + wy * c);
        }
        static double EnergyTL(double m, double v) => 0.5 * m * v * v / 4;

        void Contact()
        {
            var c = Car; var h = Hill;
            double th = Math.Atan(h.Slope(X));
            double diff = SimMath.Wrap(Phi - th);
            double nx = -Math.Sin(th), ny = Math.Cos(th), tx = Math.Cos(th), ty = Math.Sin(th);
            double vn = -(Vx * nx + Vy * ny), vt = Vx * tx + Vy * ty;
            double dd = Math.Abs(diff) * 180 / Math.PI;
            bool crash = dd > 34 || vn > c.crashVn * 1.7; // süspansiyon toleransı geniş, açı hatası affedilmez

            if (Jumped && !Landed)
            {
                Landed = true; LandT = T; Dist = h.ArcAt(X);
                LandDiff = dd; LandVn = vn; LandAngle = diff * 180 / Math.PI;
                Ev(SimEventType.Land, dist: Dist.Value, diff: dd, vn: vn, crash: crash);
            }
            else if (!Jumped) Ev(SimEventType.BumpLand, diff: dd, vn: vn, crash: crash);

            if (crash)
            {
                Crashed = true;
                if (!Jumped) Dnf = true;
                Mode = Mode.Wreck;
                // Bundan sonra (X, Y) aracın merkezi
                X += -Math.Sin(Phi) * c.height / 2;
                Y += Math.Cos(Phi) * c.height / 2;
                double kick = SimMath.Clamp(vn / 4, 1, 4);
                Vx = vt * tx * 0.8 + nx * vn * 0.35;
                Vy = vt * ty * 0.8 + ny * vn * 0.35;
                Om = (diff > 0 ? 1 : -1) * (3 + kick * 2);
                WreckT = 0;
                // Dik vuruş ve açılı (burun/sırt üstü) temas birlikte hasar yapar
                double cost = EnergyTL(c.mass, vn) + EnergyTL(c.mass, Math.Abs(vt) * Math.Min(1, Math.Sin(dd * Math.PI / 180)) * 0.6);
                Damage += cost;
                var (lx, ly) = LocalDir(nx, ny);
                Events.Add(new SimEvent { type = SimEventType.Crash, t = T, vn = vn, diff = dd, cost = cost, lx = lx, ly = ly, speed = Math.Sqrt(Vx * Vx + Vy * Vy) });
            }
            else
            {
                Mode = Mode.Ground;
                V = Math.Max(0, vt * (1 - 0.35 * dd / 32) - 0.05 * Math.Max(0, vn));
                Y = h.Ground(X); Phi = th; Om = 0;
            }
        }

        void WreckStep()
        {
            var c = Car; var h = Hill;
            WreckT += DT;
            Vy -= G * DT;
            double s = Math.Sqrt(Vx * Vx + Vy * Vy);
            double drag = 0.5 * RHO * c.cda * 1.6 * s / c.mass;
            Vx -= Vx * drag * DT; Vy -= Vy * drag * DT;
            X += Vx * DT; Y += Vy * DT;
            Phi = SimMath.Wrap(Phi + Om * DT);
            double gy = h.Ground(X) + c.height * 0.5;
            if (Y < gy)
            {
                double th = Math.Atan(h.Slope(X));
                double nx = -Math.Sin(th), ny = Math.Cos(th), tx = Math.Cos(th), ty = Math.Sin(th);
                double vn = Vx * nx + Vy * ny, vt = Vx * tx + Vy * ty;
                Y = gy;
                if (vn < 0)
                {
                    double hit = -vn;
                    // Takla atan araba her vuruşta seker; dönüş hızı yukarı fırlatır
                    vn = hit * 0.4 + Math.Min(3, Math.Abs(Om) * 0.2);
                    // Sürtünme darbesi: her vuruş yatay hızı vuruşun şiddetiyle orantılı keser
                    vt -= Math.Sign(vt) * Math.Min(Math.Abs(vt), 0.5 * (hit + vn));
                    Om = Om * 0.6 + (hit > 2 ? (rng.NextDouble() - 0.5) * hit * 0.7 : 0);
                    if (hit > 3)
                    {
                        double cost = EnergyTL(c.mass, hit);
                        Damage += cost; Tumbles++;
                        var (lx, ly) = LocalDir(nx, ny);
                        Events.Add(new SimEvent { type = SimEventType.Impact, t = T, hit = hit, cost = cost, lx = lx, ly = ly });
                    }
                }
                // Karda kayma sürtünmesi düşük: hızlı kaza uzun bir takla serisine dönüşür
                vt -= Math.Min(Math.Abs(vt), 0.7 * G * DT) * Math.Sign(vt);
                // Yere sürtünen gövde yuvarlanır: dönüş hızı kayma hızına doğru çekilir
                double roll = Math.Max(-9, Math.Min(9, -vt / (c.height * 0.6)));
                Om += (roll - Om) * 0.04;
                Vx = vt * tx + vn * nx; Vy = vt * ty + vn * ny;
                if (Math.Sqrt(Vx * Vx + Vy * Vy) < 2.5)
                {
                    double target = Math.Abs(SimMath.Wrap(Phi - th)) > Math.PI / 2 ? th + Math.PI : th;
                    Phi = SimMath.Wrap(Phi + SimMath.Wrap(target - Phi) * 0.06);
                    Om *= 0.9;
                }
            }
            if ((Math.Sqrt(Vx * Vx + Vy * Vy) < 0.6 && WreckT > 1.5) || WreckT > 16) Finish();
        }

        /// Pist sonundaki panolara çarpma: panolar parçalanır, araç takla atarak geri sekip durur.
        void HitWall()
        {
            var c = Car;
            double sp = Mode == Mode.Ground ? V : Math.Sqrt(Vx * Vx + Vy * Vy);
            if (Mode != Mode.Wreck) { X += -Math.Sin(Phi) * c.height / 2; Y += Math.Cos(Phi) * c.height / 2; }
            double vfx = Mode == Mode.Ground ? V * Math.Cos(Phi) : Vx;
            Mode = Mode.Wreck;
            WallHit = true; WallT = T; WallSpeed = Math.Abs(sp);
            double wallCost = EnergyTL(c.mass, sp);
            Damage += wallCost;
            var (wlx, wly) = LocalDir(-1, 0);
            Vx = -Math.Abs(vfx) * 0.03;
            Vy = 3 + Math.Abs(sp) * 0.09;
            Om = -(4 + Math.Abs(sp) * 0.07);
            WreckT = 0;
            Events.Add(new SimEvent { type = SimEventType.Wall, t = T, speed = WallSpeed, cost = wallCost, lx = wlx, ly = wly });
        }

        void Finish()
        {
            if (Done) return;
            Done = true; DoneT = T;
            Ev(SimEventType.Done);
        }

        public void Step()
        {
            T += DT;
            WindNow = Wind + 0.6 * Math.Sin(T * 0.9) + 0.3 * Math.Sin(T * 2.3 + 1);
            if (Mode != Mode.Ground) Nitro = false;
            if (Mode == Mode.Ground) GroundStep();
            else if (Mode == Mode.Air) AirStep();
            else WreckStep();
            double xb = Hill.XBarrier;
            double top = Hill.Y(xb) + Hill.Cfg.bankHeight;
            double bottom = Mode == Mode.Wreck ? Y - Car.height / 2.0 : Y;
            if (X < xb && bottom < top - 0.2)
            {
                // Setin önündeyken ve üst kenarının altındayken duvar katıdır
                double front = Mode == Mode.Wreck ? X + Car.length / 2.0 : X + Math.Cos(Phi) * Car.length / 2.0;
                if (front >= xb)
                {
                    if (!WallHit) HitWall();
                    else if (Vx > 0) { X = xb - Car.length / 2.0; Vx = -Math.Abs(Vx) * 0.3; }
                }
            }
            if (T > 45) Finish();
            if (!Jumped) MaxSpeed = Math.Max(MaxSpeed, Mode == Mode.Wreck ? 0 : Speed);
        }

        /// Kayakla atlama puanlaması: mesafe + 5 hakemin stil puanı (en yüksek ve en düşük atılır) + rüzgâr düzeltmesi
        public ScoreResult Score(Random rand = null)
        {
            rand = rand ?? new Random();
            var h = Hill;
            if (Dnf || Dist == null) return new ScoreResult { dnf = true };
            double dist = Math.Round(Dist.Value * 2) / 2;
            double distPts = Math.Max(0, 60 + (dist - h.K) * h.MPerPoint);
            double baseStyle;
            if (Crashed) baseStyle = 8.5;
            else
            {
                baseStyle = 20 - LandDiff * 0.32 - Math.Max(0, LandVn - 3) * 0.9;
                if (Q != null && Q.Value > 0.85) baseStyle += 0.5;
                if (dist > h.HS) baseStyle -= 1;
                baseStyle = SimMath.Clamp(baseStyle, 9, 20);
            }
            var judges = new double[5];
            for (int i = 0; i < 5; i++) judges[i] = SimMath.Clamp(Math.Round((baseStyle + (rand.NextDouble() - 0.5) * 1.6) * 2) / 2, 0, 20);
            int lo = 0, hi = 0;
            for (int i = 1; i < 5; i++) { if (judges[i] < judges[lo]) lo = i; if (judges[i] >= judges[hi]) hi = i; }
            if (hi == lo) hi = lo == 4 ? 3 : 4;
            double style = 0;
            for (int i = 0; i < 5; i++) if (i != lo && i != hi) style += judges[i];
            double windPts = Math.Round(Wind * 1.8 * 10) / 10;
            return new ScoreResult
            {
                dnf = false, dist = dist, distPts = Math.Round(distPts * 10) / 10, judges = judges,
                droppedLow = lo, droppedHigh = hi, stylePts = style, windPts = windPts,
                total = Math.Round((distPts + style + windPts) * 10) / 10,
            };
        }
    }
}
