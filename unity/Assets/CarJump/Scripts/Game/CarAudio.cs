using UnityEngine;

namespace CarJump
{
    /// Araç sesleri. Vitesli motor: devir hıza ve vitese göre hesaplanır; vites atınca devir düşer ve egzoz patlar.
    /// Gerçek kayıtlar (Asset Store motor ses paketleri) atanırsa onlar kullanılır; atanmazsa yerleşik sentez devreye girer.
    public class CarAudio : MonoBehaviour
    {
        [Header("İsteğe bağlı kayıtlar (boşsa sentez)")]
        public AudioClip engineLow, engineHigh, wind, nitroLoop;
        public AudioClip shiftPop, nitroBlast, gateWhoosh, landThump, crash, crowd;
        [Range(0, 1)] public float master = 0.9f;

        static readonly float[] Gears = { 0, 75, 125, 175, 225, 280, 420 }; // her vitesin üst hızı (km/sa)
        AudioSource low, high, windSrc, nitroSrc, oneShot;
        AudioLowPassFilter windFilter;
        int gear = 1;
        float shiftT, rpm = 0.2f;
        bool muted;

        void Awake()
        {
            int sr = AudioSettings.outputSampleRate > 0 ? AudioSettings.outputSampleRate : 48000;
            engineLow = engineLow ? engineLow : Synth.Engine("EngineLow", sr, 55f, false);
            engineHigh = engineHigh ? engineHigh : Synth.Engine("EngineHigh", sr, 110f, true);
            wind = wind ? wind : Synth.Noise("Wind", sr, 2f, 0.8f);
            nitroLoop = nitroLoop ? nitroLoop : Synth.Noise("Nitro", sr, 2f, 0.35f);
            shiftPop = shiftPop ? shiftPop : Synth.Burst("Pop", sr, 0.08f, 0.15f, 140f);
            nitroBlast = nitroBlast ? nitroBlast : Synth.Burst("NitroBlast", sr, 0.7f, 0.6f, 60f);
            gateWhoosh = gateWhoosh ? gateWhoosh : Synth.Whoosh("Whoosh", sr, 0.25f);
            landThump = landThump ? landThump : Synth.Burst("Thump", sr, 0.5f, 0.9f, 55f);
            crash = crash ? crash : Synth.Burst("Crash", sr, 1.2f, 0.8f, 45f);
            crowd = crowd ? crowd : Synth.Crowd("Crowd", sr, 2.6f);

            low = Loop(engineLow); high = Loop(engineHigh); windSrc = Loop(wind); nitroSrc = Loop(nitroLoop);
            windFilter = windSrc.gameObject.AddComponent<AudioLowPassFilter>();
            nitroSrc.gameObject.AddComponent<AudioLowPassFilter>().cutoffFrequency = 900;
            oneShot = gameObject.AddComponent<AudioSource>();
            oneShot.playOnAwake = false; oneShot.spatialBlend = 0;
        }

        AudioSource Loop(AudioClip clip)
        {
            var go = new GameObject(clip.name);
            go.transform.SetParent(transform, false);
            var s = go.AddComponent<AudioSource>();
            s.clip = clip; s.loop = true; s.volume = 0; s.spatialBlend = 0; s.playOnAwake = false;
            s.Play();
            return s;
        }

        public void SetMuted(bool m) { muted = m; AudioListener.volume = m ? 0 : 1; }
        public bool Muted => muted;

        public void ResetGear() { gear = 1; rpm = 0.2f; shiftT = 0; }

        /// state: 0 = sessiz (menü), 1 = start bekleme, 2 = koşu.
        public void Tick(int state, float kmh, bool inAir, bool landed, bool wreck, bool nitro, float dt)
        {
            float eg = 0, pitch = 0.6f, hiMix = 0, wg = 0, wf = 600, ng = 0;
            if (state == 1) { eg = 0.35f; pitch = 0.62f + Mathf.Sin(Time.time * 9) * 0.03f; gear = 1; }
            else if (state == 2 && !wreck)
            {
                float target;
                if (inAir && !landed) target = 0.97f + Mathf.Sin(Time.time * 38) * 0.03f; // havada devir sınırında
                else
                {
                    int g = 1; while (g < Gears.Length - 1 && kmh > Gears[g]) g++;
                    if (g > gear && !landed) { shiftT = 0.14f; Play(shiftPop, 0.5f); }
                    gear = g;
                    float lo = g == 1 ? 0 : Gears[g - 1] * 0.82f;
                    target = 0.28f + 0.72f * Mathf.Clamp01((kmh - lo) / (Gears[g] - lo));
                }
                if (shiftT > 0) { shiftT -= dt; target *= 0.72f; }
                if (landed) target = Mathf.Min(target, 0.25f + kmh / 576f);
                rpm = Mathf.Lerp(rpm, target, Mathf.Min(1, dt * 18));
                float coast = landed ? Mathf.Clamp01(kmh / 144f) : 1; // durunca motor sesi tamamen kesilir
                eg = (landed ? 0.35f : 0.85f) * coast + (nitro ? 0.15f : 0);
                pitch = 0.55f + rpm * 1.9f + (nitro ? 0.12f : 0);
                hiMix = Mathf.Clamp01((rpm - 0.45f) / 0.5f);
                wg = Mathf.Clamp01(kmh / 324f) * (inAir ? 0.8f : 0.35f);
                wf = 400 + kmh * 14;
                ng = nitro ? 0.9f : 0;
            }
            float k = 1 - Mathf.Exp(-dt * 14);
            low.volume = Mathf.Lerp(low.volume, eg * (1 - hiMix * 0.7f) * master, k);
            high.volume = Mathf.Lerp(high.volume, eg * hiMix * master, k);
            low.pitch = pitch; high.pitch = pitch * 0.5f;
            windSrc.volume = Mathf.Lerp(windSrc.volume, wg * master, k);
            windFilter.cutoffFrequency = Mathf.Lerp(windFilter.cutoffFrequency, wf, k);
            nitroSrc.volume = Mathf.Lerp(nitroSrc.volume, ng * master, 1 - Mathf.Exp(-dt * 10));
        }

        void Play(AudioClip c, float vol) { if (c) oneShot.PlayOneShot(c, vol * master); }
        public void Nitro() => Play(nitroBlast, 1f);
        public void Gate(float k) => Play(gateWhoosh, 0.35f + k * 0.4f);
        public void Thump(float k) => Play(landThump, Mathf.Clamp01(0.4f + k * 0.6f));
        public void Crash(float k) { Play(crash, Mathf.Clamp01(0.6f + k * 0.4f)); Play(landThump, 1f); }
        public void Crowd(float k) => Play(crowd, 0.6f * k);

        /// Yer tutucu sesler: gerçek kayıtlar gelene kadar.
        static class Synth
        {
            public static AudioClip Engine(string name, int sr, float f, bool bright)
            {
                // 4 saniyelik döngü: tüm bileşenler tam periyotla biter, döngü noktasında tıkırtı olmaz
                int n = sr * 4;
                var d = new float[n];
                int harmonics = bright ? 14 : 9;
                for (int i = 0; i < n; i++)
                {
                    float t = i / (float)sr, s = 0;
                    for (int h = 1; h <= harmonics; h++) s += Mathf.Sin(2 * Mathf.PI * f * h * t + h * 0.7f) / h * (h % 2 == 1 ? 1f : 0.6f);
                    s += 0.35f * Mathf.Sin(2 * Mathf.PI * f * 0.5f * t); // ateşleme dalgalanması
                    s *= 0.85f + 0.15f * Mathf.Sin(2 * Mathf.PI * f * 0.25f * t);
                    d[i] = (float)System.Math.Tanh(s * (bright ? 1.6f : 1.3f)) * 0.7f;
                }
                return Make(name, d, sr);
            }
            public static AudioClip Noise(string name, int sr, float len, float smooth)
            {
                int n = (int)(sr * len);
                var d = new float[n];
                float y = 0; var r = new System.Random(3);
                for (int i = 0; i < n; i++) { y += ((float)r.NextDouble() * 2 - 1 - y) * (1 - smooth); d[i] = y * 1.6f; }
                return Make(name, d, sr);
            }
            public static AudioClip Burst(string name, int sr, float len, float noise, float subHz)
            {
                int n = (int)(sr * len);
                var d = new float[n]; var r = new System.Random(5);
                float y = 0;
                for (int i = 0; i < n; i++)
                {
                    float t = i / (float)sr, env = Mathf.Exp(-t * 6f / len);
                    y += ((float)r.NextDouble() * 2 - 1 - y) * 0.25f;
                    float sub = Mathf.Sin(2 * Mathf.PI * subHz * (1 - t / len * 0.5f) * t);
                    d[i] = (y * noise * 2f + sub * 0.8f) * env;
                }
                return Make(name, d, sr);
            }
            public static AudioClip Whoosh(string name, int sr, float len)
            {
                int n = (int)(sr * len);
                var d = new float[n]; var r = new System.Random(7);
                float y = 0;
                for (int i = 0; i < n; i++)
                {
                    float t = i / (float)n, env = Mathf.Sin(Mathf.PI * t) * Mathf.Exp(-t * 2);
                    y += ((float)r.NextDouble() * 2 - 1 - y) * Mathf.Lerp(0.6f, 0.08f, t);
                    d[i] = y * env * 1.5f;
                }
                return Make(name, d, sr);
            }
            public static AudioClip Crowd(string name, int sr, float len)
            {
                int n = (int)(sr * len);
                var d = new float[n]; var r = new System.Random(11);
                float y = 0;
                for (int i = 0; i < n; i++)
                {
                    float t = i / (float)sr, env = Mathf.Min(1, t * 3) * Mathf.Exp(-t * 0.9f);
                    y += ((float)r.NextDouble() * 2 - 1 - y) * 0.12f;
                    d[i] = y * env * (0.75f + 0.25f * Mathf.Sin(t * 37)) * 2.2f;
                }
                return Make(name, d, sr);
            }
            static AudioClip Make(string name, float[] d, int sr)
            {
                var c = AudioClip.Create(name, d.Length, 1, sr, false);
                c.SetData(d, 0);
                return c;
            }
        }
    }
}
