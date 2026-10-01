using System.IO;
using CarJump.Core;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace CarJump.EditorTools
{
    /// Unity menüsü: CarJump > Oyun sahnesini kur.
    /// Malzemeleri, efekt profilini ve sahneyi tek tıkla oluşturur; Play'e basınca oyun çalışır.
    public static class SceneBuilder
    {
        const string Root = "Assets/CarJump";
        const string Gen = Root + "/Generated";
        const string CarsDir = Root + "/Cars";

        [MenuItem("CarJump/Oyun sahnesini kur", priority = 1)]
        public static void BuildScene()
        {
            if (GraphicsSettings.currentRenderPipeline == null)
                EditorUtility.DisplayDialog("CarJump", "Proje URP kullanmıyor görünüyor. Projeyi 'Universal 3D' şablonuyla oluşturman önerilir; efektler URP gerektirir.", "Tamam");
            EnsureFolder(Gen);
            EnsureFolder(Root + "/Scenes");

            var assets = CreateAssets();
            var profile = CreateProfile();

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // Işık ve gökyüzü
            var sunGo = new GameObject("Sun");
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.93f, 0.82f);
            sun.intensity = 1.6f;
            sun.shadows = LightShadows.Soft;
            sunGo.transform.rotation = Quaternion.LookRotation(-new Vector3(-0.35f, 0.5f, 0.8f).normalized);
            var sky = new Material(Shader.Find("Skybox/Procedural"));
            sky.SetFloat("_SunSize", 0.04f); sky.SetFloat("_AtmosphereThickness", 0.8f); sky.SetFloat("_Exposure", 1.25f);
            sky.SetColor("_SkyTint", new Color(0.45f, 0.62f, 0.85f)); sky.SetColor("_GroundColor", new Color(0.86f, 0.9f, 0.95f));
            AssetDatabase.CreateAsset(sky, Gen + "/Sky.mat");
            RenderSettings.skybox = sky;
            RenderSettings.sun = sun;
            RenderSettings.ambientMode = AmbientMode.Skybox;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.79f, 0.86f, 0.93f);
            RenderSettings.fogStartDistance = 500; RenderSettings.fogEndDistance = 4600;

            // Kamera ve efekt profili
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.nearClipPlane = 0.3f; cam.farClipPlane = 6000; cam.fieldOfView = 58;
            camGo.AddComponent<AudioListener>();
            var camData = camGo.AddComponent<UniversalAdditionalCameraData>();
            camData.renderPostProcessing = true;
            camData.antialiasing = AntialiasingMode.FastApproximateAntialiasing;
            var chase = camGo.AddComponent<ChaseCamera>();

            var volGo = new GameObject("PostFX");
            var vol = volGo.AddComponent<Volume>();
            vol.isGlobal = true; vol.sharedProfile = profile;

            var fxGo = new GameObject("Effects");
            fxGo.transform.SetParent(camGo.transform, false);
            var fx = fxGo.AddComponent<SpeedEffects>();
            fx.assets = assets; fx.volume = vol;

            var hillGo = new GameObject("Hill");
            var hb = hillGo.AddComponent<HillBuilder>();
            hb.assets = assets;

            var carGo = new GameObject("Car");
            var view = carGo.AddComponent<CarView>();
            var dmg = carGo.AddComponent<CarDamage>();
            var audio = carGo.AddComponent<CarAudio>();

            var uiGo = new GameObject("HUD");
            var hud = uiGo.AddComponent<Hud>();

            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
#if ENABLE_INPUT_SYSTEM
            es.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
#else
            es.AddComponent<StandaloneInputModule>();
#endif

            var gmGo = new GameObject("GameManager");
            var gm = gmGo.AddComponent<GameManager>();
            gm.assets = assets; gm.hillBuilder = hb; gm.chaseCamera = chase; gm.effects = fx;
            gm.carAudio = audio; gm.hud = hud; gm.carView = view; gm.carDamage = dmg;
            foreach (var guid in AssetDatabase.FindAssets("t:CarDefinition"))
            {
                var def = AssetDatabase.LoadAssetAtPath<CarDefinition>(AssetDatabase.GUIDToAssetPath(guid));
                if (def != null) gm.cars.Add(def);
            }

            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            QualitySettings.shadowDistance = 140;

            string scenePath = Root + "/Scenes/CarJump.unity";
            EditorSceneManager.SaveScene(scene, scenePath);
            var list = new System.Collections.Generic.List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            if (!list.Exists(s => s.path == scenePath)) list.Insert(0, new EditorBuildSettingsScene(scenePath, true));
            EditorBuildSettings.scenes = list.ToArray();
            AssetDatabase.SaveAssets();
            Debug.Log("CarJump: sahne kuruldu. Play'e bas. Arabalar: " + (gm.cars.Count == 0 ? "yer tutucu modeller" : gm.cars.Count + " tanım"));
        }

        [MenuItem("CarJump/Araba tanımlarını oluştur (4 araba)", priority = 2)]
        public static void CreateCarDefinitions()
        {
            EnsureFolder(CarsDir);
            Color[] paints = { new Color(0.79f, 0.11f, 0.15f), new Color(0.13f, 0.35f, 0.79f), new Color(0.23f, 0.25f, 0.29f), new Color(0.95f, 0.75f, 0.17f) };
            var specs = CarSpec.Defaults();
            for (int i = 0; i < specs.Length; i++)
            {
                string path = $"{CarsDir}/{specs[i].displayName}.asset";
                if (File.Exists(path)) continue;
                var def = ScriptableObject.CreateInstance<CarDefinition>();
                def.spec = specs[i];
                def.paint = paints[i];
                AssetDatabase.CreateAsset(def, path);
            }
            AssetDatabase.SaveAssets();
            EditorUtility.DisplayDialog("CarJump",
                "4 araba tanımı Assets/CarJump/Cars klasörüne eklendi.\n\nHer birine Asset Store paketindeki bir araba prefab'ını sürükle (Prefab alanı), sonra 'Oyun sahnesini kur' menüsünü tekrar çalıştır.\n\nModel ters duruyorsa Yaw Offset = 180 yap.", "Tamam");
        }

        // ---------- Malzemeler ----------
        static GameAssets CreateAssets()
        {
            string path = Gen + "/GameAssets.asset";
            var a = AssetDatabase.LoadAssetAtPath<GameAssets>(path);
            if (a == null) { a = ScriptableObject.CreateInstance<GameAssets>(); AssetDatabase.CreateAsset(a, path); }
            var dot = SoftDot();

            a.snow = Lit("Snow", new Color(0.96f, 0.975f, 0.99f), 0.25f);
            a.track = Lit("IceTrack", new Color(0.86f, 0.91f, 0.97f), 0.75f);
            a.wall = Lit("Wall", new Color(0.82f, 0.87f, 0.92f), 0.2f);
            a.rock = Lit("Rock", new Color(0.43f, 0.5f, 0.58f), 0.1f);
            a.nitroPaint = Unlit("NitroPaint", new Color(0.18f, 0.49f, 1f, 0.28f), true);
            a.liftPaint = Unlit("LiftPaint", new Color(0.96f, 0.72f, 0f, 0.4f), true);
            a.lineK = Unlit("LineK", new Color(0.88f, 0.2f, 0.16f), false);
            a.lineHS = Unlit("LineHS", new Color(0.04f, 0.09f, 0.19f), false);
            a.lineMinor = Unlit("LineMinor", new Color(0.18f, 0.35f, 0.27f, 0.5f), true);
            a.beatLine = Unlit("BeatLine", new Color(0.16f, 1f, 0.48f), false);
            a.beatWall = Particle("BeatWall", new Color(0.16f, 1f, 0.48f, 0.35f), dot, true);
            a.gateFrame = Lit("GateFrame", new Color(0.09f, 0.14f, 0.23f), 0.6f, 0.7f);
            a.gateLight = Lit("GateLight", new Color(0.62f, 0.84f, 1f), 0.5f, 0, new Color(0.18f, 0.55f, 1f) * 2.4f);
            a.lamp = Lit("Lamp", Color.white, 0.5f, 0, new Color(1f, 0.95f, 0.78f) * 2f);
            a.pine = Lit("Pine", new Color(0.12f, 0.24f, 0.2f), 0.1f);
            a.crowd = Lit("Crowd", Color.white, 0.3f);
            a.bannerBase = Lit("Banner", Color.white, 0.35f);
            a.carPaint = Lit("CarPaint", new Color(0.79f, 0.11f, 0.15f), 0.85f, 0.4f);
            a.carTrim = Lit("CarTrim", new Color(0.08f, 0.08f, 0.08f), 0.5f, 0.3f);
            a.carGlass = Lit("CarGlass", new Color(0.05f, 0.09f, 0.15f), 0.95f, 0.1f);
            a.tire = Lit("Tire", new Color(0.07f, 0.07f, 0.08f), 0.15f);
            a.tailLight = Lit("TailLight", new Color(0.35f, 0.04f, 0.03f), 0.6f, 0, new Color(1f, 0.15f, 0.08f) * 2f);
            a.flame = Particle("NitroFlame", new Color(0.25f, 0.55f, 1f, 0.8f), dot, true);
            a.snowParticle = Particle("SnowParticle", Color.white, dot, false);
            a.speedLine = Particle("SpeedLine", Color.white, dot, true);
            a.debris = Lit("Debris", new Color(0.14f, 0.15f, 0.17f), 0.4f, 0.4f);
            a.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (a.font == null) a.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
            EditorUtility.SetDirty(a);
            return a;
        }

        static Shader Find(params string[] names) { foreach (var n in names) { var s = Shader.Find(n); if (s != null) return s; } return null; }

        static Material Save(Material m, string name)
        {
            string path = $"{Gen}/{name}.mat";
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null) { existing.shader = m.shader; existing.CopyPropertiesFromMaterial(m); EditorUtility.SetDirty(existing); return existing; }
            AssetDatabase.CreateAsset(m, path);
            return m;
        }

        static Material Lit(string name, Color c, float smooth, float metal = 0, Color? emission = null)
        {
            var m = new Material(Find("Universal Render Pipeline/Lit", "Standard"));
            m.SetColor("_BaseColor", c); m.color = c;
            m.SetFloat("_Smoothness", smooth); m.SetFloat("_Glossiness", smooth); m.SetFloat("_Metallic", metal);
            if (emission.HasValue)
            {
                m.EnableKeyword("_EMISSION");
                m.SetColor("_EmissionColor", emission.Value);
                m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            }
            m.enableInstancing = true;
            return Save(m, name);
        }

        static Material Unlit(string name, Color c, bool transparent)
        {
            var m = new Material(Find("Universal Render Pipeline/Unlit", "Unlit/Color"));
            m.SetColor("_BaseColor", c); m.color = c;
            if (transparent) MakeTransparent(m, false);
            return Save(m, name);
        }

        static Material Particle(string name, Color c, Texture2D tex, bool additive)
        {
            var m = new Material(Find("Universal Render Pipeline/Particles/Unlit", "Particles/Standard Unlit", "Unlit/Transparent"));
            m.SetColor("_BaseColor", c); m.color = c;
            m.SetTexture("_BaseMap", tex); m.mainTexture = tex;
            MakeTransparent(m, additive);
            return Save(m, name);
        }

        static void MakeTransparent(Material m, bool additive)
        {
            m.SetFloat("_Surface", 1);
            m.SetFloat("_Blend", additive ? 2 : 0);
            m.SetOverrideTag("RenderType", "Transparent");
            m.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
            m.SetInt("_DstBlend", (int)(additive ? BlendMode.One : BlendMode.OneMinusSrcAlpha));
            m.SetInt("_ZWrite", 0);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = (int)RenderQueue.Transparent;
        }

        static Texture2D SoftDot()
        {
            string path = Gen + "/SoftDot.png";
            if (!File.Exists(path))
            {
                var t = new Texture2D(64, 64, TextureFormat.RGBA32, false);
                for (int y = 0; y < 64; y++)
                    for (int x = 0; x < 64; x++)
                    {
                        float d = Vector2.Distance(new Vector2(x, y), new Vector2(31.5f, 31.5f)) / 32f;
                        float a = Mathf.Clamp01(1 - d); a *= a;
                        t.SetPixel(x, y, new Color(1, 1, 1, a));
                    }
                File.WriteAllBytes(path, t.EncodeToPNG());
                AssetDatabase.ImportAsset(path);
                var imp = (TextureImporter)AssetImporter.GetAtPath(path);
                imp.alphaIsTransparency = true; imp.mipmapEnabled = false; imp.SaveAndReimport();
            }
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        // ---------- Efekt profili ----------
        static VolumeProfile CreateProfile()
        {
            string path = Gen + "/SpeedFX.asset";
            var p = AssetDatabase.LoadAssetAtPath<VolumeProfile>(path);
            if (p == null) { p = ScriptableObject.CreateInstance<VolumeProfile>(); AssetDatabase.CreateAsset(p, path); }
            T Add<T>() where T : VolumeComponent
            {
                if (!p.TryGet(out T c)) { c = p.Add<T>(true); AssetDatabase.AddObjectToAsset(c, p); }
                c.active = true;
                return c;
            }
            var tone = Add<Tonemapping>(); tone.mode.Override(TonemappingMode.ACES);
            var bloom = Add<Bloom>(); bloom.threshold.Override(1f); bloom.intensity.Override(0.8f);
            var blur = Add<MotionBlur>(); blur.quality.Override(MotionBlurQuality.Low); blur.intensity.Override(0.1f);
            var chroma = Add<ChromaticAberration>(); chroma.intensity.Override(0);
            var lens = Add<LensDistortion>(); lens.intensity.Override(0);
            var vig = Add<Vignette>(); vig.intensity.Override(0.18f); vig.smoothness.Override(0.5f);
            var color = Add<ColorAdjustments>(); color.contrast.Override(10); color.saturation.Override(12);
            EditorUtility.SetDirty(p);
            return p;
        }

        static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }
    }
}
