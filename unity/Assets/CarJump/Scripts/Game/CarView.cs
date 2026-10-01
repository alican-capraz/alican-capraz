using System.Collections.Generic;
using CarJump.Core;
using UnityEngine;

namespace CarJump
{
    /// Arabanın görünümü. Asset Store prefab'ını otomatik olarak yönlendirir, fizikteki boya ölçekler,
    /// tekerlekleri bulup döndürür, nitro alevi ve stop lambası ekler. Prefab yoksa basit yer tutucu model kurar.
    public class CarView : MonoBehaviour
    {
        Transform pivot;
        readonly List<(Transform t, Vector3 localCenter)> wheels = new List<(Transform, Vector3)>();
        readonly List<Transform> flames = new List<Transform>();
        readonly List<Renderer> tails = new List<Renderer>();
        Material tailMat;
        CarSpec spec;
        readonly List<GameObject> owned = new List<GameObject>(); // yalnızca bu bileşenin kurduğu nesneler (ses kaynakları vb. korunur)

        public Transform Model => pivot;
        public CarSpec Spec => spec;
        public IEnumerable<Transform> Wheels { get { foreach (var w in wheels) if (w.t) yield return w.t; } }
        public IEnumerable<Transform> Flames => flames;

        public void Setup(CarDefinition def, CarSpec carSpec, GameAssets assets)
        {
            spec = carSpec;
            foreach (var o in owned) if (o) Destroy(o);
            owned.Clear();
            wheels.Clear(); flames.Clear(); tails.Clear();
            transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
            pivot = new GameObject("Model").transform;
            pivot.SetParent(transform, false);
            owned.Add(pivot.gameObject);

            if (def != null && def.prefab != null) FitPrefab(def);
            else BuildPlaceholder(def, assets);

            // Nitro alevleri ve stop lambaları arka tampona
            float rearX = -spec.length / 2f;
            tailMat = new Material(assets.tailLight);
            foreach (int side in new[] { -1, 1 })
            {
                var flame = MeshBuilder.Spawn("NitroFlame", transform, ConeMesh(), new[] { assets.flame });
                flame.transform.localPosition = new Vector3(rearX - 0.05f, 0.32f, side * 0.38f);
                flame.transform.localRotation = Quaternion.Euler(0, 0, 90);
                flame.SetActive(false);
                flames.Add(flame.transform);
                owned.Add(flame);
                if (def == null || def.prefab == null)
                {
                    var tl = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    Destroy(tl.GetComponent<Collider>());
                    tl.transform.SetParent(transform, false);
                    tl.transform.localPosition = new Vector3(rearX - 0.02f, spec.height * 0.55f, side * 0.62f);
                    tl.transform.localScale = new Vector3(0.05f, 0.1f, 0.45f);
                    var r = tl.GetComponent<Renderer>(); r.sharedMaterial = tailMat; tails.Add(r);
                    owned.Add(tl);
                }
            }
        }

        void FitPrefab(CarDefinition def)
        {
            var inst = Instantiate(def.prefab, pivot);
            // Paketteki fizik ve sürüş betikleri bizim simülasyonumuzla çakışmasın
            foreach (var rb in inst.GetComponentsInChildren<Rigidbody>(true)) Destroy(rb);
            foreach (var wc in inst.GetComponentsInChildren<WheelCollider>(true)) Destroy(wc);
            foreach (var col in inst.GetComponentsInChildren<Collider>(true)) Destroy(col);
            foreach (var mb in inst.GetComponentsInChildren<MonoBehaviour>(true)) mb.enabled = false;
            inst.transform.localPosition = Vector3.zero;
            inst.transform.localRotation = Quaternion.identity;
            // Unity modelleri genelde +Z'ye bakar; oyunda ileri yön +X
            pivot.localRotation = Quaternion.Euler(0, 90 + def.yawOffset, 0);

            var b = WorldBounds(inst);
            if (def.autoScale && b.size.x > 0.01f) pivot.localScale = Vector3.one * (spec.length / b.size.x);
            b = WorldBounds(inst);
            pivot.localPosition -= new Vector3(b.center.x, b.min.y, b.center.z);

            // Tekerlekler: adında anahtar kelime geçen en alt seviyedeki nesneler
            string key = string.IsNullOrEmpty(def.wheelNameContains) ? "wheel" : def.wheelNameContains.ToLowerInvariant();
            var all = inst.GetComponentsInChildren<Transform>(true);
            foreach (var t in all)
            {
                string n = t.name.ToLowerInvariant();
                if (!n.Contains(key) || n.Contains("collider") || n.Contains("steer")) continue;
                bool hasMatchingChild = false;
                foreach (var c in t.GetComponentsInChildren<Transform>(true))
                    if (c != t && c.name.ToLowerInvariant().Contains(key)) { hasMatchingChild = true; break; }
                if (hasMatchingChild) continue;
                var rend = t.GetComponentInChildren<Renderer>();
                if (rend == null) continue;
                wheels.Add((t, t.InverseTransformPoint(rend.bounds.center)));
            }
        }

        static Bounds WorldBounds(GameObject go)
        {
            var rs = go.GetComponentsInChildren<Renderer>();
            if (rs.Length == 0) return new Bounds(go.transform.position, Vector3.one);
            var b = rs[0].bounds;
            for (int i = 1; i < rs.Length; i++) b.Encapsulate(rs[i].bounds);
            return b;
        }

        // Yer tutucu araba: gövde, kabin, tekerlekler (Asset Store modeli eklenene kadar)
        void BuildPlaceholder(CarDefinition def, GameAssets assets)
        {
            var paint = new Material(assets.carPaint) { color = def != null ? def.paint : new Color(0.8f, 0.1f, 0.15f) };
            var trim = new Material(assets.carTrim) { color = def != null ? def.trim : Color.black };
            float L = spec.length, H = spec.height, W = 1.95f, r = spec.wheelRadius;
            // Sürüş yüksekliği ve gövdeden taşan lastikler: arkadan bakan kamerada tekerlekler görünür
            Part(PrimitiveType.Cube, new Vector3(0, r + H * 0.22f, 0), new Vector3(L, H * 0.42f, W - 0.1f), paint);
            Part(PrimitiveType.Cube, new Vector3(-L * 0.08f, r + H * 0.52f, 0), new Vector3(L * 0.5f, H * 0.36f, W * 0.82f), assets.carGlass);
            Part(PrimitiveType.Cube, new Vector3(-L * 0.08f, r + H * 0.71f, 0), new Vector3(L * 0.46f, 0.05f, W * 0.78f), paint);
            Part(PrimitiveType.Cube, new Vector3(0, r * 0.75f, 0), new Vector3(L * 0.97f, 0.14f, W + 0.02f), trim);
            foreach (float x in new[] { -spec.wheelbase / 2, spec.wheelbase / 2 })
                foreach (int side in new[] { -1, 1 })
                {
                    var w = Part(PrimitiveType.Cylinder, new Vector3(x, r, side * (W / 2 + 0.02f)), new Vector3(r * 2, 0.16f, r * 2), assets.tire);
                    w.localRotation = Quaternion.Euler(90, 0, 0);
                    wheels.Add((w, Vector3.zero));
                }
        }

        Transform Part(PrimitiveType type, Vector3 pos, Vector3 scale, Material mat)
        {
            var go = GameObject.CreatePrimitive(type);
            Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(pivot, false);
            go.transform.localPosition = pos; go.transform.localScale = scale;
            go.GetComponent<Renderer>().sharedMaterial = mat;
            return go.transform;
        }

        static Mesh coneMesh;
        static Mesh ConeMesh()
        {
            if (coneMesh) return coneMesh;
            var mb = new MeshBuilder();
            const int SEG = 10;
            for (int i = 0; i < SEG; i++)
            {
                float a0 = i * Mathf.PI * 2 / SEG, a1 = (i + 1) * Mathf.PI * 2 / SEG;
                var p0 = new Vector3(Mathf.Cos(a0) * 0.11f, 0, Mathf.Sin(a0) * 0.11f);
                var p1 = new Vector3(Mathf.Cos(a1) * 0.11f, 0, Mathf.Sin(a1) * 0.11f);
                var tip = new Vector3(0, 1, 0);
                mb.FlatTri(p0, tip, p1); mb.FlatTri(p0, p1, tip);
            }
            coneMesh = mb.Build("Flame");
            return coneMesh;
        }

        /// bottomCenter: arabanın alt orta noktası (dünya). phi: burun açısı (radyan, yukarı pozitif). roll: kaza takla açısı (derece).
        public void SetPose(Vector3 bottomCenter, float phi, float rollDeg)
        {
            transform.position = bottomCenter;
            transform.rotation = Quaternion.Euler(0, 0, phi * Mathf.Rad2Deg) * Quaternion.Euler(rollDeg, 0, 0);
        }

        public void SpinWheels(float distance)
        {
            if (spec == null) return;
            float deg = -distance / spec.wheelRadius * Mathf.Rad2Deg;
            var axis = transform.forward; // yanal eksen
            foreach (var (t, c) in wheels)
            {
                if (!t || !t.IsChildOf(transform)) continue;
                t.RotateAround(t.TransformPoint(c), axis, deg);
            }
        }

        public void SetNitro(bool on)
        {
            foreach (var f in flames)
            {
                f.gameObject.SetActive(on);
                if (on) { float s = 0.7f + Random.value * 0.6f; f.localScale = new Vector3(1.25f, s * 1.5f, 1.25f); }
            }
        }

        public void SetBrake(bool on)
        {
            if (tailMat == null) return;
            tailMat.SetColor("_EmissionColor", new Color(1f, 0.15f, 0.08f) * (on ? 6f : 2f));
        }
    }
}
