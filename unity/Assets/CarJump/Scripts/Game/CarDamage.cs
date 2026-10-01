using System.Collections.Generic;
using UnityEngine;

namespace CarJump
{
    /// Görsel hasar: darbe noktasında gövde içe göçer, cam çatlar (beyazlaşır), büyük darbede kanat ve tekerlek kopar.
    /// Asset Store modelleriyle de çalışır. Modelin içe aktarma ayarlarında "Read/Write" açık olmalıdır;
    /// kapalıysa göçük atlanır, cam ve kopan parçalar yine çalışır.
    [RequireComponent(typeof(CarView))]
    public class CarDamage : MonoBehaviour
    {
        class Deformable { public MeshFilter mf; public Mesh mesh; public Vector3[] orig, cur; }
        class Attached { public Transform t, parent; public Vector3 pos; public Quaternion rot; }
        class Flying { public Transform t; public Vector3 v, w; }

        readonly List<Deformable> parts = new List<Deformable>();
        readonly List<Attached> attached = new List<Attached>();
        readonly List<Flying> flying = new List<Flying>();
        readonly List<Transform> looseOrder = new List<Transform>();
        readonly List<(Material m, Color c, float smooth)> glass = new List<(Material, Color, float)>();
        CarView view;
        System.Func<float, float, float> groundY;

        public float Smoke { get; private set; }

        static readonly string[] LooseNames = { "spoiler", "wing", "mirror", "bumper", "rack" };
        static readonly string[] GlassNames = { "glass", "window", "windshield", "cam" };

        public void Bind(System.Func<float, float, float> ground)
        {
            groundY = ground;
            view = GetComponent<CarView>();
            // Önceki arabadan kopup sahnede kalan parçaları temizle
            foreach (var f in flying) if (f.t && !f.t.IsChildOf(transform)) Destroy(f.t.gameObject);
            parts.Clear(); attached.Clear(); flying.Clear(); looseOrder.Clear(); glass.Clear(); Smoke = 0;
            if (view.Model == null) return;
            var wheels = new HashSet<Transform>(view.Wheels);
            var flames = new HashSet<Transform>(view.Flames);
            foreach (var mf in view.Model.GetComponentsInChildren<MeshFilter>(true))
            {
                if (IsUnder(mf.transform, wheels) || IsUnder(mf.transform, flames)) continue;
                var shared = mf.sharedMesh;
                if (shared == null || !shared.isReadable) continue;
                var mesh = Instantiate(shared);
                mf.sharedMesh = mesh;
                var v = mesh.vertices;
                parts.Add(new Deformable { mf = mf, mesh = mesh, orig = (Vector3[])v.Clone(), cur = v });
            }
            foreach (var r in view.Model.GetComponentsInChildren<Renderer>(true))
                foreach (var m in r.materials)
                {
                    string n = (m.name + " " + r.name).ToLowerInvariant();
                    foreach (var key in GlassNames)
                        if (n.Contains(key)) { glass.Add((m, m.color, m.HasProperty("_Smoothness") ? m.GetFloat("_Smoothness") : 0.9f)); break; }
                }
            foreach (var t in view.Model.GetComponentsInChildren<Transform>(true))
            {
                string n = t.name.ToLowerInvariant();
                foreach (var key in LooseNames) if (n.Contains(key) && !IsUnder(t, wheels)) { looseOrder.Add(t); break; }
            }
            foreach (var w in view.Wheels) looseOrder.Add(w);
            foreach (var t in looseOrder) attached.Add(new Attached { t = t, parent = t.parent, pos = t.localPosition, rot = t.localRotation });
        }

        static bool IsUnder(Transform t, HashSet<Transform> set)
        {
            for (var p = t; p != null; p = p.parent) if (set.Contains(p)) return true;
            return false;
        }

        public void ResetDamage()
        {
            foreach (var d in parts) { d.mesh.vertices = d.orig; d.cur = (Vector3[])d.orig.Clone(); d.mesh.RecalculateNormals(); d.mesh.RecalculateBounds(); }
            foreach (var g in glass) { g.m.color = g.c; if (g.m.HasProperty("_Smoothness")) g.m.SetFloat("_Smoothness", g.smooth); }
            foreach (var a in attached) { a.t.SetParent(a.parent, false); a.t.localPosition = a.pos; a.t.localRotation = a.rot; }
            flying.Clear();
            Smoke = 0;
        }

        /// lx, ly: darbe yönü araç ekseninde (yerden/duvardan arabaya doğru). cost: darbenin hasar bedeli.
        public void Apply(float lx, float ly, float cost, Vector3 carVelocity)
        {
            if (view == null || view.Spec == null) return;
            float k = Mathf.Clamp(cost / 900000f, 0.12f, 1.3f);
            float L = view.Spec.length, H = view.Spec.height;
            // Darbe noktası: merkezden darbe yönünün tersine gövdenin kenarına
            float tt = Mathf.Min(L * 0.5f / Mathf.Max(1e-3f, Mathf.Abs(lx)), H * 0.5f / Mathf.Max(1e-3f, Mathf.Abs(ly)));
            var localHit = new Vector3(-lx * tt, H * 0.5f - ly * tt, 0);
            var worldHit = transform.TransformPoint(localHit);
            var worldPush = transform.TransformDirection(new Vector3(lx, ly, 0)).normalized;
            float R = 0.9f + k * 1.1f, depth = Mathf.Min(0.55f, 0.12f + k * 0.38f);

            foreach (var d in parts)
            {
                var tr = d.mf.transform;
                var localPush = tr.InverseTransformVector(worldPush * depth);
                bool changed = false;
                for (int i = 0; i < d.cur.Length; i++)
                {
                    var wp = tr.TransformPoint(d.cur[i]);
                    var delta = wp - worldHit;
                    var lat = Vector3.Dot(delta, transform.forward); // yanal mesafe daha az önemli
                    delta -= transform.forward * lat * 0.65f;
                    float dist = delta.magnitude;
                    if (dist > R) continue;
                    float f = (1 - dist / R); f *= f;
                    float n = 0.7f + 0.6f * Mathf.Abs(Mathf.Sin(d.cur[i].x * 13.1f + d.cur[i].z * 7.7f));
                    d.cur[i] += localPush * f * n;
                    changed = true;
                }
                if (changed) { d.mesh.vertices = d.cur; d.mesh.RecalculateNormals(); d.mesh.RecalculateBounds(); }
            }
            // Cam çatlar
            foreach (var g in glass)
            {
                g.m.color = Color.Lerp(g.m.color, new Color(0.73f, 0.78f, 0.83f, g.c.a), Mathf.Clamp01(0.25f + k * 0.5f));
                if (g.m.HasProperty("_Smoothness")) g.m.SetFloat("_Smoothness", Mathf.Max(0.1f, g.m.GetFloat("_Smoothness") - 0.3f * k - 0.1f));
            }
            // Büyük darbede parçalar kopar
            if (k > 0.35f)
            {
                int n = k > 0.9f ? 2 : 1;
                for (int i = 0; i < n; i++)
                {
                    // Önce kanat/ayna gibi gövde parçası, sonra rastgele bir tekerlek
                    Transform pick = null;
                    if (i == 0) foreach (var t in looseOrder) if (t && !IsWheel(t) && t.IsChildOf(transform)) { pick = t; break; }
                    if (pick == null) pick = RandomAttachedWheel();
                    if (pick == null) break;
                    Detach(pick, carVelocity, k);
                }
            }
            Smoke = Mathf.Min(1, Smoke + 0.35f + k * 0.4f);
        }

        bool IsWheel(Transform t) { foreach (var w in view.Wheels) if (w == t) return true; return false; }
        Transform RandomAttachedWheel()
        {
            var list = new List<Transform>();
            foreach (var w in view.Wheels) if (w.IsChildOf(transform)) list.Add(w);
            return list.Count == 0 ? null : list[Random.Range(0, list.Count)];
        }

        void Detach(Transform t, Vector3 carVel, float k)
        {
            t.SetParent(null, true);
            flying.Add(new Flying
            {
                t = t,
                v = carVel * 0.7f + new Vector3(Random.Range(-5f, 5f), 4 + Random.value * 8 * k, Random.Range(-6f, 6f)),
                w = Random.insideUnitSphere * 800f,
            });
        }

        void Update()
        {
            float dt = Time.deltaTime;
            foreach (var f in flying)
            {
                if (!f.t) continue;
                f.v.y -= 9.81f * dt;
                var p = f.t.position + f.v * dt;
                float gy = groundY != null ? groundY(p.x, p.z) + 0.3f : p.y;
                if (p.y < gy) { p.y = gy; f.v = new Vector3(f.v.x * 0.85f, Mathf.Abs(f.v.y) * 0.35f, f.v.z * 0.85f); f.w *= 0.8f; }
                f.t.position = p;
                f.t.Rotate(f.w * dt, Space.World);
            }
            Smoke = Mathf.Max(0, Smoke - dt * 0.02f);
        }
    }
}
