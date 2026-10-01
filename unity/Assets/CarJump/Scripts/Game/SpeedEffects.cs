using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CarJump
{
    /// Hız hissini taşıyan ekran ve parçacık efektleri:
    /// hareket bulanıklığı, renk sapması, mercek bükülmesi, kenar karartma (URP Volume),
    /// kameranın önünden akan hız çizgileri, tekerlek kar tozu, iniş patlaması, duman ve enkaz.
    public class SpeedEffects : MonoBehaviour
    {
        public GameAssets assets;
        public Volume volume;

        MotionBlur blur; ChromaticAberration chroma; LensDistortion lens; Vignette vignette; Bloom bloom;
        ParticleSystem lines, spray, burst, smoke, debris;
        float flash;

        void Start()
        {
            if (volume != null && volume.profile != null)
            {
                volume.profile.TryGet(out blur);
                volume.profile.TryGet(out chroma);
                volume.profile.TryGet(out lens);
                volume.profile.TryGet(out vignette);
                volume.profile.TryGet(out bloom);
            }
            lines = MakeLines();
            spray = MakeWorld("Spray", assets.snowParticle, 0.5f, 0.9f, new Color(1, 1, 1, 0.85f), -0.4f, 1500);
            burst = MakeWorld("Burst", assets.snowParticle, 1.1f, 1.6f, new Color(1, 1, 1, 0.9f), -0.3f, 800);
            smoke = MakeWorld("Smoke", assets.snowParticle, 2.6f, 3f, new Color(0.22f, 0.23f, 0.26f, 0.55f), 0.15f, 300);
            debris = MakeWorld("Debris", assets.debris, 0.25f, 3f, Color.white, -1f, 120);
            var r = debris.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Mesh;
            r.mesh = Resources.GetBuiltinResource<Mesh>("Cube.fbx");
        }

        ParticleSystem MakeLines()
        {
            var cam = GetComponentInParent<Camera>() ? GetComponentInParent<Camera>().transform : transform;
            var go = new GameObject("SpeedLines");
            go.transform.SetParent(cam, false);
            go.transform.localPosition = new Vector3(0, 0, 40);
            go.transform.localRotation = Quaternion.Euler(0, 180, 0);
            var ps = go.AddComponent<ParticleSystem>();
            var main = ps.main;
            main.loop = true; main.startLifetime = 0.45f; main.startSpeed = 90f; main.startSize = 0.05f;
            main.simulationSpace = ParticleSystemSimulationSpace.Local; main.maxParticles = 400;
            main.startColor = new Color(1, 1, 1, 0.55f);
            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Cone; shape.angle = 0f; shape.radius = 9f; shape.radiusThickness = 0.35f;
            var em = ps.emission; em.rateOverTime = 0;
            var col = ps.colorOverLifetime; col.enabled = true;
            var grad = new Gradient();
            grad.SetKeys(new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) }, new[] { new GradientAlphaKey(0, 0), new GradientAlphaKey(1, 0.3f), new GradientAlphaKey(0, 1) });
            col.color = grad;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Stretch; r.velocityScale = 0.06f; r.lengthScale = 2f;
            r.sharedMaterial = assets.speedLine;
            return ps;
        }

        ParticleSystem MakeWorld(string name, Material mat, float size, float life, Color color, float gravity, int max)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            var ps = go.AddComponent<ParticleSystem>();
            var main = ps.main;
            main.loop = false; main.playOnAwake = false; main.startLifetime = life; main.startSize = size; main.startSpeed = 0;
            main.simulationSpace = ParticleSystemSimulationSpace.World; main.maxParticles = max; main.gravityModifier = gravity;
            main.startColor = color;
            var em = ps.emission; em.enabled = false;
            var sz = ps.sizeOverLifetime; sz.enabled = true; sz.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 0.6f, 1, 1.6f));
            var col = ps.colorOverLifetime; col.enabled = true;
            var grad = new Gradient();
            grad.SetKeys(new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) }, new[] { new GradientAlphaKey(1, 0), new GradientAlphaKey(0, 1) });
            col.color = grad;
            go.GetComponent<ParticleSystemRenderer>().sharedMaterial = mat;
            ps.Play();
            return ps;
        }

        static void Emit(ParticleSystem ps, Vector3 pos, Vector3 vel, int n, float spread, float lifeMul = 1, Color? color = null)
        {
            if (ps == null) return;
            var p = new ParticleSystem.EmitParams();
            for (int i = 0; i < n; i++)
            {
                p.position = pos + Random.insideUnitSphere * 0.4f;
                p.velocity = vel + new Vector3(Random.Range(-1f, 1f) * spread, Random.value * spread * 0.6f, Random.Range(-1f, 1f) * spread);
                p.startLifetime = ps.main.startLifetime.constant * (0.6f + Random.value * 0.7f) * lifeMul;
                if (color.HasValue) p.startColor = color.Value;
                p.rotation3D = Random.insideUnitSphere * 180f;
                ps.Emit(p, 1);
            }
        }

        public void Spray(Vector3 pos, Vector3 vel) => Emit(spray, pos, vel, 1, 1.5f);
        public void Burst(Vector3 pos, Vector3 vel, int n, float spread) => Emit(burst, pos, vel, n, spread);
        public void Smoke(Vector3 pos) => Emit(smoke, pos, new Vector3(0, 1.8f, 0), 1, 0.6f);
        public void Debris(Vector3 pos, Vector3 vel, int n, Color color) => Emit(debris, pos, vel, n, 10f, 1, color);
        public void Flash(float amount) => flash = Mathf.Max(flash, amount);

        /// Her kare çağrılır: k = hız etkisi (0..1), nitro açık mı.
        public void Tick(float kmh, bool nitro, bool running, float dt)
        {
            float k = running ? Mathf.Clamp01((kmh - 110) / 220f) : 0;
            if (lines != null)
            {
                var em = lines.emission;
                em.rateOverTime = running ? (k * 260 + (nitro ? 160 : 0)) : 0;
                var main = lines.main;
                main.startColor = nitro ? new Color(0.62f, 0.84f, 1f, 0.7f) : new Color(1, 1, 1, 0.5f);
            }
            if (blur != null) blur.intensity.Override(Mathf.Lerp(0.05f, 0.75f, k) + (nitro ? 0.2f : 0));
            if (chroma != null) chroma.intensity.Override(k * 0.35f + (nitro ? 0.35f : 0) + flash * 0.4f);
            if (lens != null) lens.intensity.Override(-(k * 0.18f + (nitro ? 0.12f : 0)));
            if (vignette != null)
            {
                vignette.intensity.Override(0.18f + k * 0.25f + (nitro ? 0.12f : 0));
                vignette.color.Override(nitro ? new Color(0.08f, 0.27f, 0.62f) : Color.black);
            }
            if (bloom != null) bloom.intensity.Override(0.8f + flash * 4f + (nitro ? 0.6f : 0));
            flash = Mathf.Max(0, flash - dt * 3);
        }
    }
}
