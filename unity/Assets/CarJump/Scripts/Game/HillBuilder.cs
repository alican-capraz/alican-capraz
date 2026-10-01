using System.Collections.Generic;
using CarJump.Core;
using UnityEngine;

namespace CarJump
{
    /// Fizik profilinden pisti ve çevresini üretir: buz rampa, iniş pisti, vadi yamaçları, nitro kapıları,
    /// mesafe tabelaları, K/HS çizgileri, ağaçlar, seyirci ve pist sonundaki reklam panosu duvarı.
    /// Dünya ekseni: X = ileri (fizik x), Y = yukarı (fizik y), Z = yanal.
    public class HillBuilder : MonoBehaviour
    {
        public GameAssets assets;
        [Tooltip("Mobilde ağaç sayısını düşürmek için.")]
        public int treeCount = 1600;
        public int crowdCount = 700;

        public Hill Hill { get; private set; }
        public readonly List<float> GateXs = new List<float>();
        public Material GateLightInstance { get; private set; }
        public Material NitroPaintInstance { get; private set; }
        public Vector3 ShowroomPoint { get; private set; }

        Transform root, beat;
        readonly List<Board> barrierBoards = new List<Board>();
        readonly List<Piece> pieces = new List<Piece>();
        readonly List<Transform> crowdPeople = new List<Transform>();
        Mesh pieceMesh;

        class Board { public Transform t; public float z; public Color color; }
        class Piece { public Transform t; public Vector3 v, w; public bool on; }

        // ---------- Profil yardımcıları ----------
        float TO => (float)Hill.TO;
        public float HalfW(float x) => x < TO ? 3.7f : Mathf.Lerp(3.7f, 17f, Smooth01((x - TO) / 45f));
        public float TrackY(float x) => x < 0 ? (float)Hill.Y(0) - x * Mathf.Tan(28f * Mathf.Deg2Rad) : (float)Hill.Y(x);
        static float Smooth01(float t) { t = Mathf.Clamp01(t); return t * t * (3 - 2 * t); }
        float[] smoothYs; float smoothX0;
        float SmoothY(float x)
        {
            float f = Mathf.Clamp(x - smoothX0, 0, smoothYs.Length - 1.001f);
            int i = (int)f;
            return Mathf.Lerp(smoothYs[i], smoothYs[i + 1], f - i);
        }
        static float Fbm(float x, float y) => Mathf.PerlinNoise(x, y) * 0.55f + Mathf.PerlinNoise(x * 2.1f + 7, y * 2.1f) * 0.3f + Mathf.PerlinNoise(x * 4.3f, y * 4.3f + 3) * 0.15f;

        public float TerrainY(float x, float z)
        {
            float hw = HalfW(x), d = Mathf.Abs(z) - hw, b = TrackY(x);
            if (d <= 0) return b;
            float wallH = x < TO ? 1.15f : 0.55f;
            float wb = Mathf.Clamp01((d - 4) / 30f);
            float yb = Mathf.Lerp(b, Mathf.Max(b, SmoothY(x)), wb);
            float h = wallH * Smooth01(d / 0.7f);
            if (d > 1.4f)
            {
                h += (d - 1.4f) * 0.16f + Mathf.Pow(Mathf.Max(0, d - 10) / 45f, 2) * 20f;
                h += (Fbm(x * 0.018f + 50, z * 0.018f + 50) - 0.45f) * Mathf.Clamp01((d - 10) / 30f) * 26f;
            }
            return yb + h;
        }
        public float SlopeAngle(float x) => (float)Hill.SlopeAngle(x);

        // ---------- Kurulum ----------
        public void Build(Hill hill)
        {
            Hill = hill;
            if (root) Destroy(root.gameObject);
            root = new GameObject("Generated").transform;
            root.SetParent(transform, false);

            smoothX0 = -160;
            int n = Mathf.CeilToInt((float)hill.XEnd - smoothX0) + 1;
            var raw = new float[n]; smoothYs = new float[n];
            for (int i = 0; i < n; i++) raw[i] = TrackY(smoothX0 + i);
            for (int i = 0; i < n; i++) { float s = 0; int c = 0; for (int k = -30; k <= 30; k += 3) { s += raw[Mathf.Clamp(i + k, 0, n - 1)]; c++; } smoothYs[i] = s / c; }

            BuildTerrain();
            BuildMarkings();
            BuildNitroGates();
            BuildTrackside();
            BuildStructures();
            BuildBarrier();
            BuildTrees();
            BuildCrowd();
            BuildMountains();
            float sx = (float)hill.XBarrier + 45;
            ShowroomPoint = new Vector3(sx, TrackY(sx), 0);
        }

        void BuildTerrain()
        {
            var xs = new List<float>();
            for (float x = -150; x <= (float)Hill.XEnd - 1;)
            {
                xs.Add(x);
                x += Mathf.Abs(x - TO) < 40 ? 0.5f : x < 0 ? 4 : 1.25f;
            }
            xs.Add(TO); xs.Add(TO + 0.26f);
            xs.Sort();
            float[] inner = { -1, -0.62f, -0.24f, 0, 0.24f, 0.62f, 1 };
            float[] outer = { 0.25f, 0.6f, 1.0f, 1.6f, 2.6f, 4.2f, 6.5f, 10, 15, 22, 31, 43, 58, 77, 100, 128, 162, 205, 260, 330 };

            // Alt meshler: 0 = buz rampa, 1 = iniş pisti ve yamaç karı, 2 = yan duvarlar
            var mb = new MeshBuilder(3);
            int cols = outer.Length * 2 + inner.Length;
            var zs = new float[cols];
            var idx = new int[xs.Count, cols];
            for (int i = 0; i < xs.Count; i++)
            {
                float x = xs[i], hw = HalfW(x);
                int k = 0;
                for (int j = outer.Length - 1; j >= 0; j--) zs[k++] = -(hw + outer[j]);
                foreach (var f in inner) zs[k++] = f * hw;
                foreach (var d in outer) zs[k++] = hw + d;
                for (int j = 0; j < cols; j++)
                    idx[i, j] = mb.Add(new Vector3(x, TerrainY(x, zs[j]), zs[j]), new Vector2(x * 0.08f, zs[j] * 0.08f));
            }
            int innerStart = outer.Length, innerEnd = outer.Length + inner.Length - 1;
            for (int i = 0; i < xs.Count - 1; i++)
            {
                bool inrun = xs[i] < TO;
                for (int j = 0; j < cols - 1; j++)
                {
                    int sub;
                    if (j >= innerStart && j < innerEnd) sub = inrun ? 0 : 1;
                    else if (j == innerStart - 1 || j == innerStart - 2 || j == innerEnd || j == innerEnd + 1) sub = 2;
                    else sub = 1;
                    mb.GridQuadUp(idx[i, j], idx[i + 1, j], idx[i + 1, j + 1], idx[i, j + 1], sub);
                }
            }
            var mesh = mb.Build("Terrain", true);
            MeshBuilder.Spawn("Terrain", root, mesh, new[] { assets.track, assets.snow, assets.wall });
        }

        // Pistin üstüne serilmiş şerit (nitro mavisi, burun kaldırma sarısı)
        GameObject Ribbon(string name, float x0, float x1, Material mat, float frac)
        {
            var mb = new MeshBuilder();
            int prevL = -1, prevR = -1;
            for (float x = x0; x <= x1 + 0.01f; x += 1)
            {
                float hw = HalfW(x) * frac, y = (float)Hill.Y(Mathf.Min(x, TO)) + 0.03f;
                int l = mb.Add(new Vector3(x, y, -hw), new Vector2(x * 0.2f, 0), Vector3.up);
                int r = mb.Add(new Vector3(x, y, hw), new Vector2(x * 0.2f, 1), Vector3.up);
                if (prevL >= 0) mb.GridQuadUp(prevL, l, r, prevR);
                prevL = l; prevR = r;
            }
            return MeshBuilder.Spawn(name, root, mb.Build(name), new[] { mat });
        }

        // Pist boyunca yanal çizgi (K, HS, 50 m'ler, çam dalı çizgileri)
        void SlopeLine(MeshBuilder mb, float s, float thick, float frac, int sub)
        {
            float x = (float)Hill.XAtArc(s), hw = HalfW(x) * frac;
            float y = (float)Hill.Y(x) + 0.04f, ang = SlopeAngle(x);
            var dir = new Vector3(Mathf.Cos(ang), Mathf.Sin(ang), 0) * thick * 0.5f;
            var c = new Vector3(x, y, 0);
            mb.QuadFacing(c - dir + Vector3.back * hw, c - dir + Vector3.forward * hw, c + dir + Vector3.forward * hw, c + dir + Vector3.back * hw, Vector3.up, sub);
        }

        void BuildMarkings()
        {
            NitroPaintInstance = new Material(assets.nitroPaint);
            Ribbon("NitroZone", (float)Hill.Cfg.nitroStart, (float)Hill.Cfg.nitroEnd, NitroPaintInstance, 0.92f);
            Ribbon("LiftZone", TO - (float)JumpRun.ZONE, TO - 0.6f, assets.liftPaint, 0.92f);
            var mb = new MeshBuilder(3);
            for (int s = 5; s <= Hill.HS + 120; s += 5) SlopeLine(mb, s, s % 50 == 0 ? 0.2f : 0.22f, 0.86f, 2);
            SlopeLine(mb, (float)Hill.K, 0.6f, 1f, 0);
            SlopeLine(mb, (float)Hill.HS, 0.45f, 1f, 1);
            MeshBuilder.Spawn("Lines", root, mb.Build("Lines"), new[] { assets.lineK, assets.lineHS, assets.lineMinor });

            // Geçilecek mesafe: yeşil çizgi + ışık perdesi
            beat = new GameObject("ToBeat").transform;
            beat.SetParent(root, false);
            var line = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(line.GetComponent<Collider>());
            line.transform.SetParent(beat, false);
            line.transform.localScale = new Vector3(0.5f, 0.02f, 1);
            line.GetComponent<MeshRenderer>().sharedMaterial = assets.beatLine;
            var wall = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(wall.GetComponent<Collider>());
            wall.transform.SetParent(beat, false);
            wall.transform.localRotation = Quaternion.Euler(0, 90, 0);
            wall.transform.localPosition = new Vector3(0, 3.5f, 0);
            wall.transform.localScale = new Vector3(1, 7, 1);
            wall.GetComponent<MeshRenderer>().sharedMaterial = assets.beatWall;
            beat.gameObject.SetActive(false);
        }

        public void SetBeat(double? dist)
        {
            if (!beat) return;
            if (dist == null) { beat.gameObject.SetActive(false); return; }
            float x = (float)Hill.XAtArc(dist.Value), w = HalfW(x) * 2;
            beat.gameObject.SetActive(true);
            beat.position = new Vector3(x, (float)Hill.Y(x) + 0.04f, 0);
            beat.rotation = Quaternion.Euler(0, 0, SlopeAngle(x) * Mathf.Rad2Deg);
            beat.GetChild(0).localScale = new Vector3(0.5f, 0.02f, w);
            beat.GetChild(1).localScale = new Vector3(w, 7, 1);
        }

        // Nitro kapıları: altından geçerken hız hissi veren ışıklı kemerler
        void BuildNitroGates()
        {
            GateLightInstance = new Material(assets.gateLight);
            var frame = new MeshBuilder(); var light = new MeshBuilder();
            for (float x = (float)Hill.Cfg.nitroStart; x <= Hill.Cfg.nitroEnd; x += 10)
            {
                GateXs.Add(x);
                float hw = HalfW(x) + 0.5f, y = TrackY(x);
                var basis = Matrix4x4.TRS(new Vector3(x, y, 0), Quaternion.Euler(0, 0, SlopeAngle(x) * Mathf.Rad2Deg), Vector3.one);
                foreach (int side in new[] { -1, 1 })
                {
                    frame.Box(basis * Matrix4x4.TRS(new Vector3(0, 2.3f, side * hw), Quaternion.identity, new Vector3(0.3f, 4.6f, 0.3f)));
                    light.Box(basis * Matrix4x4.TRS(new Vector3(-0.17f, 2.3f, side * (hw - 0.12f)), Quaternion.identity, new Vector3(0.12f, 4.2f, 0.1f)));
                }
                frame.Box(basis * Matrix4x4.TRS(new Vector3(0, 4.6f, 0), Quaternion.identity, new Vector3(0.4f, 0.35f, hw * 2 + 0.3f)));
                light.Box(basis * Matrix4x4.TRS(new Vector3(-0.22f, 4.45f, 0), Quaternion.identity, new Vector3(0.12f, 0.12f, hw * 2)));
            }
            MeshBuilder.Spawn("GateFrames", root, frame.Build("GateFrames"), new[] { assets.gateFrame }, true);
            MeshBuilder.Spawn("GateLights", root, light.Build("GateLights"), new[] { GateLightInstance });
            float nx = (float)Hill.Cfg.nitroStart;
            Label("NİTRO BÖLGESİ", new Vector3(nx - 0.3f, TrackY(nx) + 5.4f, 0), Quaternion.Euler(0, 90, 0), 0.5f, new Color(0.44f, 0.76f, 1f));
        }

        // İnişte iki yanda sık ışık direkleri ve reklam panoları: yanından akıp geçen nesneler hız hissi verir
        void BuildTrackside()
        {
            var poles = new MeshBuilder(); var lamps = new MeshBuilder();
            for (float x = 6; x < TO - 2; x += 7)
                foreach (int side in new[] { -1, 1 })
                {
                    float z = side * (HalfW(x) + 1.15f), y = TerrainY(x, z);
                    poles.Box(Matrix4x4.TRS(new Vector3(x, y + 1.6f, z), Quaternion.identity, new Vector3(0.14f, 3.2f, 0.14f)));
                    lamps.Box(Matrix4x4.TRS(new Vector3(x, y + 3.2f, z - side * 0.25f), Quaternion.identity, new Vector3(0.5f, 0.12f, 0.25f)));
                }
            MeshBuilder.Spawn("Poles", root, poles.Build("Poles"), new[] { assets.gateFrame });
            MeshBuilder.Spawn("Lamps", root, lamps.Build("Lamps"), new[] { assets.lamp });

            string[] texts = { "SUPERCAR JUMPING", "KARTAL TEPE", "NİTRO+", "SON GAZ", "DÜNYA KUPASI" };
            Color[] bgs = { new Color(0.04f, 0.09f, 0.19f), new Color(0.88f, 0.2f, 0.16f), new Color(0.96f, 0.72f, 0f), new Color(0.96f, 0.97f, 0.98f), new Color(0.11f, 0.31f, 0.75f) };
            int i = 0;
            for (float x = 14; x < TO - 6; x += 15, i++)
            {
                Banner(x, -1, 12, 1.05f, texts[i % 5], bgs[i % 5], 0.2f);
                Banner(x + 7, 1, 12, 1.05f, texts[(i + 2) % 5], bgs[(i + 2) % 5], 0.2f);
            }
            i = 0;
            for (int s = 10; s < Hill.HS + 90; s += 30, i++)
            {
                float x = (float)Hill.XAtArc(s);
                Banner(x, -1, 14, 1.6f, texts[(i + 1) % 5], bgs[(i + 1) % 5], 0.1f);
                Banner(x + 10, 1, 14, 1.6f, texts[(i + 3) % 5], bgs[(i + 3) % 5], 0.1f);
            }
            // Mesafe tabelaları
            for (int s = 20; s <= Hill.HS + 40; s += 10)
            {
                var col = s < Hill.K - 40 ? new Color(0.11f, 0.31f, 0.75f) : s < Hill.K ? new Color(0.12f, 0.62f, 0.3f) : s <= Hill.HS ? new Color(0.88f, 0.2f, 0.16f) : new Color(0.04f, 0.09f, 0.19f);
                float x = (float)Hill.XAtArc(s);
                Banner(x, -1, 1.9f, 1.15f, s.ToString(), col, 1.75f);
                Banner(x, 1, 1.9f, 1.15f, s.ToString(), col, 1.75f);
            }
        }

        Transform Banner(float x, int side, float w, float h, string text, Color bg, float lift)
        {
            float z = side * (HalfW(x) + 0.55f), y = TerrainY(x, z) + lift;
            var holder = new GameObject("Banner").transform;
            holder.SetParent(root, false);
            holder.position = new Vector3(x, y + h / 2 + 0.05f, z);
            holder.rotation = Quaternion.Euler(0, side < 0 ? 0 : 180, 0) * Quaternion.Euler(0, 0, 0);
            holder.RotateAround(holder.position, Vector3.forward, SlopeAngle(x) * Mathf.Rad2Deg);
            var quad = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(quad.GetComponent<Collider>());
            quad.transform.SetParent(holder, false);
            quad.transform.localScale = new Vector3(w, h, 1);
            quad.transform.localRotation = Quaternion.Euler(0, 180, 0);
            var mr = quad.GetComponent<MeshRenderer>();
            mr.sharedMaterial = assets.bannerBase;
            var mpb = new MaterialPropertyBlock();
            mpb.SetColor("_BaseColor", bg); mpb.SetColor("_Color", bg);
            mr.SetPropertyBlock(mpb);
            bool dark = bg.grayscale < 0.6f;
            var label = Label(text, Vector3.zero, Quaternion.identity, h * 0.11f, dark ? Color.white : new Color(0.04f, 0.09f, 0.19f));
            label.SetParent(holder, false);
            label.localPosition = new Vector3(0, 0, 0.02f);
            label.localRotation = Quaternion.Euler(0, 180, 0);
            return holder;
        }

        Transform Label(string text, Vector3 pos, Quaternion rot, float size, Color color)
        {
            var go = new GameObject("Label");
            go.transform.SetParent(root, false);
            go.transform.position = pos; go.transform.rotation = rot;
            var tm = go.AddComponent<TextMesh>();
            tm.text = text; tm.font = assets.font; tm.fontSize = 64; tm.characterSize = size * 0.15f;
            tm.anchor = TextAnchor.MiddleCenter; tm.alignment = TextAlignment.Center; tm.color = color; tm.fontStyle = FontStyle.Bold;
            if (assets.font) go.GetComponent<MeshRenderer>().sharedMaterial = assets.font.material;
            return go.transform;
        }

        void BuildStructures()
        {
            var steel = new MeshBuilder(); var red = new MeshBuilder(); var white = new MeshBuilder();
            float hw = HalfW(TO - 1);
            // Kalkış kenarı ve direkleri
            red.Box(Matrix4x4.TRS(new Vector3(TO - 0.35f, (float)Hill.YTO + 0.02f, 0), Quaternion.Euler(0, 0, SlopeAngle(TO - 1) * Mathf.Rad2Deg), new Vector3(0.7f, 0.12f, hw * 2 + 0.2f)));
            foreach (int side in new[] { -1, 1 })
                for (int k = 0; k < 6; k++)
                    (k % 2 == 0 ? red : white).Box(Matrix4x4.TRS(new Vector3(TO, (float)Hill.YTO + 1.2f + k * 0.6f, side * (hw + 0.9f)), Quaternion.identity, new Vector3(0.3f, 0.6f, 0.3f)));
            white.Box(Matrix4x4.TRS(new Vector3(TO - 0.75f, (float)Hill.YTO - ((float)Hill.Cfg.step + 1.2f) / 2, 0), Quaternion.identity, new Vector3(1.4f, (float)Hill.Cfg.step + 1.2f, hw * 2 + 3)));
            // Start kapısı (arabanın arkasında, yüksek)
            float gx = 0.5f, gy = TrackY(gx);
            foreach (int side in new[] { -1, 1 }) steel.Box(Matrix4x4.TRS(new Vector3(gx, gy + 4.3f, side * 4.9f), Quaternion.identity, new Vector3(0.45f, 8.6f, 0.45f)));
            steel.Box(Matrix4x4.TRS(new Vector3(gx, gy + 8.6f, 0), Quaternion.identity, new Vector3(0.7f, 1.5f, 10.3f)));
            Label("START · SUPERCAR JUMPING", new Vector3(gx - 0.37f, gy + 8.6f, 0), Quaternion.Euler(0, 90, 0), 0.9f, Color.white);
            // Hakem kulesi
            float tx = TO + 70, tz = HalfW(tx) + 12, ty = TerrainY(tx, tz);
            white.Box(Matrix4x4.TRS(new Vector3(tx, ty + 8, tz + 2), Quaternion.identity, new Vector3(8, 16, 6)));
            steel.Box(Matrix4x4.TRS(new Vector3(tx, ty + 13.8f, tz + 2), Quaternion.identity, new Vector3(8.2f, 2.6f, 6.2f)));
            MeshBuilder.Spawn("Steel", root, steel.Build("Steel"), new[] { assets.gateFrame }, true);
            MeshBuilder.Spawn("Red", root, red.Build("Red"), new[] { assets.lineK }, true);
            MeshBuilder.Spawn("White", root, white.Build("White"), new[] { assets.wall }, true);
        }

        // ---------- Pist sonu: reklam panosu duvarı ----------
        void BuildBarrier()
        {
            float xb = (float)Hill.XBarrier, yb = TrackY(xb), span = HalfW(xb) + 4;
            const float BW = 2.6f, BH = 2.1f;
            string[] texts = { "SUPERCAR JUMPING", "NİTRO+", "SON GAZ", "KARTAL TEPE", "DÜNYA KUPASI" };
            Color[] cols = { new Color(0.04f, 0.09f, 0.19f), new Color(0.88f, 0.2f, 0.16f), new Color(0.96f, 0.72f, 0f), new Color(0.96f, 0.97f, 0.98f), new Color(0.11f, 0.31f, 0.75f) };
            int i = 0;
            for (float z = -span + BW / 2; z <= span - BW / 2 + 0.01f; z += BW, i++)
            {
                var t = new GameObject("BarrierBoard").transform;
                t.SetParent(root, false);
                t.position = new Vector3(xb, yb + 0.1f, z);
                var body = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Destroy(body.GetComponent<Collider>());
                body.transform.SetParent(t, false);
                body.transform.localPosition = new Vector3(0, BH / 2, 0);
                body.transform.localScale = new Vector3(0.16f, BH, BW - 0.06f);
                var mr = body.GetComponent<MeshRenderer>();
                mr.sharedMaterial = assets.bannerBase;
                var mpb = new MaterialPropertyBlock(); mpb.SetColor("_BaseColor", cols[i % 5]); mpb.SetColor("_Color", cols[i % 5]);
                mr.SetPropertyBlock(mpb);
                var label = Label(texts[i % 5], Vector3.zero, Quaternion.identity, 0.13f, cols[i % 5].grayscale < 0.6f ? Color.white : new Color(0.04f, 0.09f, 0.19f));
                label.SetParent(t, false);
                label.localPosition = new Vector3(-0.09f, BH / 2, 0);
                label.localRotation = Quaternion.Euler(0, 90, 0);
                barrierBoards.Add(new Board { t = t, z = z, color = cols[i % 5] });
            }
            var bank = new MeshBuilder();
            // Fizikteki kar setiyle aynı ölçü
            float bh = (float)Hill.Cfg.bankHeight, bw = (float)Hill.Cfg.bankWidth;
            bank.Box(Matrix4x4.TRS(new Vector3(xb + bw / 2, yb + bh / 2 - 0.1f, 0), Quaternion.identity, new Vector3(bw, bh + 0.2f, span * 2 + 6)));
            MeshBuilder.Spawn("SnowBank", root, bank.Build("SnowBank"), new[] { assets.snow }, true);
            var pm = new MeshBuilder(); pm.Box(Matrix4x4.Scale(new Vector3(0.06f, 0.7f, 1.2f))); pieceMesh = pm.Build("BoardPiece");
        }

        public void ResetBarrier()
        {
            float xb = (float)Hill.XBarrier;
            foreach (var b in barrierBoards) { b.t.gameObject.SetActive(true); b.t.rotation = Quaternion.identity; b.t.position = new Vector3(xb, b.t.position.y, b.z); }
            foreach (var p in pieces) { p.on = false; p.t.gameObject.SetActive(false); }
        }

        /// Araba duvara çarptığında: çarpılan panolar parçalanıp uçar, komşular geriye devrilir.
        public void SmashBarrier(float speed, float carZ)
        {
            float xb = (float)Hill.XBarrier;
            foreach (var b in barrierBoards)
            {
                float near = Mathf.Abs(b.z - carZ);
                if (near < 4.2f)
                {
                    b.t.gameObject.SetActive(false);
                    for (int k = 0; k < 7; k++)
                    {
                        var p = GetPiece(b.color);
                        p.t.position = new Vector3(xb, b.t.position.y + 0.5f + Random.value * 1.8f, b.z + (Random.value - 0.5f) * 2);
                        p.t.rotation = Random.rotation;
                        p.v = new Vector3(speed * (0.25f + Random.value * 0.35f), 6 + Random.value * speed * 0.18f, (Random.value - 0.5f) * speed * 0.25f);
                        p.w = Random.insideUnitSphere * 900f;
                    }
                }
                else if (near < 8f)
                {
                    b.t.rotation = Quaternion.Euler(0, 0, -(30 + Random.value * 35) * (1 - near / 8f) * 1.6f);
                }
            }
        }

        Piece GetPiece(Color color)
        {
            Piece p = pieces.Find(x => !x.on);
            if (p == null)
            {
                var go = MeshBuilder.Spawn("BoardPiece", root, pieceMesh, new[] { assets.bannerBase }, true);
                p = new Piece { t = go.transform };
                pieces.Add(p);
            }
            var mpb = new MaterialPropertyBlock(); mpb.SetColor("_BaseColor", color); mpb.SetColor("_Color", color);
            p.t.GetComponent<MeshRenderer>().SetPropertyBlock(mpb);
            p.on = true; p.t.gameObject.SetActive(true);
            return p;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            foreach (var p in pieces)
            {
                if (!p.on) continue;
                p.v.y -= 9.81f * dt;
                p.v *= 1 - 0.35f * dt;
                var pos = p.t.position + p.v * dt;
                float gy = TerrainY(pos.x, pos.z) + 0.05f;
                if (pos.y < gy) { pos.y = gy; p.v = new Vector3(p.v.x * 0.5f, Mathf.Abs(p.v.y) * 0.2f, p.v.z * 0.5f); p.w *= 0.5f; }
                p.t.position = pos;
                p.t.Rotate(p.w * dt, Space.World);
            }
        }

        // ---------- Ağaçlar, seyirci, dağlar ----------
        void BuildTrees()
        {
            // Basit katmanlı çam: yeşil yan yüzler (alt mesh 0) ve kar kaplı üst yüzler (alt mesh 1)
            Vector2[] prof = { new Vector2(0.2f, 0.6f), new Vector2(1.8f, 0.6f), new Vector2(0.55f, 2.3f), new Vector2(1.35f, 2.0f), new Vector2(0.4f, 3.6f), new Vector2(0.95f, 3.4f), new Vector2(0, 5.4f) };
            var rnd = new System.Random(9);
            var parts = new List<MeshBuilder> { new MeshBuilder(2) };
            int placed = 0, tries = 0;
            while (placed < treeCount && tries < treeCount * 4)
            {
                tries++;
                float x = -140 + (float)rnd.NextDouble() * ((float)Hill.XEnd + 130);
                int side = rnd.NextDouble() < 0.5 ? -1 : 1;
                float d = 2.4f + Mathf.Pow((float)rnd.NextDouble(), 1.7f) * 230;
                if (x > Hill.XFlat - 50 && x < Hill.XBarrier + 80 && d < 26) continue;
                if (x > TO - 8 && x < TO + 60 && d < 8) continue;
                float z = side * (HalfW(x) + d);
                float s = 0.8f + (float)rnd.NextDouble() * 1.5f + (d > 60 ? 0.6f : 0);
                var basePos = new Vector3(x, TerrainY(x, z) - 0.2f, z);
                float rot = (float)rnd.NextDouble() * 6.28f;
                var mb = parts[parts.Count - 1];
                if (mb.verts.Count > 60000) { mb = new MeshBuilder(2); parts.Add(mb); }
                const int SEG = 7;
                for (int k = 0; k < prof.Length - 1; k++)
                    for (int a = 0; a < SEG; a++)
                    {
                        float a0 = rot + a * Mathf.PI * 2 / SEG, a1 = rot + (a + 1) * Mathf.PI * 2 / SEG;
                        Vector3 P(Vector2 pr, float ang) => basePos + new Vector3(Mathf.Cos(ang) * pr.x, pr.y, Mathf.Sin(ang) * pr.x) * s;
                        Vector3 p0 = P(prof[k], a0), p1 = P(prof[k], a1), p2 = P(prof[k + 1], a1), p3 = P(prof[k + 1], a0);
                        // Üst katmanların yukarı bakan yüzleri karlı
                        var nrm = Vector3.Cross(p3 - p0, p2 - p0).normalized;
                        int sub = nrm.y > 0.45f && prof[k].y > 2.2f ? 1 : 0;
                        mb.FlatTri(p0, p3, p2, sub); mb.FlatTri(p0, p2, p1, sub);
                    }
                placed++;
            }
            for (int i = 0; i < parts.Count; i++)
                MeshBuilder.Spawn("Trees" + i, root, parts[i].Build("Trees" + i), new[] { assets.pine, assets.snow });
        }

        void BuildCrowd()
        {
            Color[] palette = { new Color(0.88f, 0.2f, 0.16f), new Color(0.96f, 0.72f, 0f), new Color(0.13f, 0.35f, 0.79f), new Color(0.96f, 0.97f, 0.98f), new Color(0.16f, 0.8f, 0.39f), new Color(1f, 0.48f, 0.1f) };
            var mbs = new MeshBuilder[palette.Length];
            for (int i = 0; i < mbs.Length; i++) mbs[i] = new MeshBuilder();
            var rnd = new System.Random(77);
            for (int i = 0; i < crowdCount; i++)
            {
                float x = (float)Hill.XFlat - 45 + (float)rnd.NextDouble() * 200;
                int side = rnd.NextDouble() < 0.5 ? -1 : 1;
                float z = side * (HalfW(x) + 2.2f + (float)rnd.NextDouble() * 16);
                float y = TerrainY(x, z);
                var mb = mbs[rnd.Next(palette.Length)];
                mb.Box(Matrix4x4.TRS(new Vector3(x, y + 0.8f, z), Quaternion.Euler(0, (float)rnd.NextDouble() * 40, 0), new Vector3(0.45f, 1.6f, 0.34f)));
                mb.Box(Matrix4x4.TRS(new Vector3(x, y + 1.82f, z), Quaternion.identity, new Vector3(0.3f, 0.3f, 0.3f)));
            }
            for (int i = 0; i < mbs.Length; i++)
            {
                var mat = new Material(assets.crowd) { color = palette[i] };
                MeshBuilder.Spawn("Crowd" + i, root, mbs[i].Build("Crowd" + i), new[] { mat });
            }
        }

        void BuildMountains()
        {
            var mb = new MeshBuilder(2);
            var rnd = new System.Random(42);
            for (int i = 0; i < 26; i++)
            {
                float ang = -1.25f + i / 25f * 2.5f + ((float)rnd.NextDouble() - 0.5f) * 0.08f;
                float dist = 2600 + (float)rnd.NextDouble() * 1300, rad = 420 + (float)rnd.NextDouble() * 520, ht = 420 + (float)rnd.NextDouble() * 560;
                float cx = TO + 200 + Mathf.Cos(ang) * dist, cz = Mathf.Sin(ang) * dist;
                float by = SmoothY(Mathf.Min(cx, (float)Hill.XEnd)) - 260;
                const int SEG = 14, RINGS = 6;
                var pts = new Vector3[RINGS + 1, SEG];
                for (int r = 0; r <= RINGS; r++)
                    for (int a = 0; a < SEG; a++)
                    {
                        float f = r / (float)RINGS, aa = a * Mathf.PI * 2 / SEG;
                        float jitter = r == RINGS ? 0 : (float)rnd.NextDouble() * 0.4f - 0.2f;
                        float rr = rad * (1 - f) * (1 + jitter);
                        pts[r, a] = new Vector3(cx + Mathf.Cos(aa) * rr, by + ht * f * (1 + jitter * 0.3f), cz + Mathf.Sin(aa) * rr);
                    }
                for (int r = 0; r < RINGS; r++)
                    for (int a = 0; a < SEG; a++)
                    {
                        int b = (a + 1) % SEG;
                        int sub = r >= RINGS / 2 - (i % 2) ? 1 : 0;
                        mb.FlatTri(pts[r, a], pts[r + 1, a], pts[r + 1, b], sub);
                        mb.FlatTri(pts[r, a], pts[r + 1, b], pts[r, b], sub);
                    }
            }
            MeshBuilder.Spawn("Mountains", root, mb.Build("Mountains"), new[] { assets.rock, assets.snow }, false, false);
        }
    }
}
