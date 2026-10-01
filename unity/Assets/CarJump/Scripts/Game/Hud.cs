using System;
using UnityEngine;
using UnityEngine.UI;

namespace CarJump
{
    /// Tüm arayüz kodla kurulur (sahneye elle bir şey eklemek gerekmez): yayın tarzı skor bandı, hız, mesafe, rüzgâr,
    /// rampa göstergesi, yönlendirme, spiker bandı, garaj paneli ve sonuç ekranı.
    public class Hud : MonoBehaviour
    {
        public static readonly Color Ink = new Color32(11, 23, 48, 255);
        public static readonly Color Glass = new Color32(9, 18, 38, 205);
        public static readonly Color Paper = new Color32(245, 248, 251, 255);
        public static readonly Color Snow = new Color32(214, 226, 238, 255);
        public static readonly Color Muted = new Color32(129, 147, 171, 255);
        public static readonly Color Red = new Color32(225, 52, 42, 255);
        public static readonly Color Gold = new Color32(245, 183, 0, 255);
        public static readonly Color Go = new Color32(41, 204, 99, 255);
        public static readonly Color NitroBlue = new Color32(111, 195, 255, 255);

        Font font;
        RectTransform safe, hudRoot, garageRoot, resultRoot;
        Text hill, carName, speed, dist, wind, beat, prompt, ticker, muteLabel;
        Image distBg, meterNitro, meterCar, windBg;
        RectTransform meter, meterNitroRt, meterZoneRt, meterCarRt;
        Image[] lights;
        Text gCls, gName, gDesc, gPb, gLeader, gDots, gEyebrow;
        Text[] statLabel = new Text[4], statValue = new Text[4];
        RectTransform[] statBar = new RectTransform[4];
        Text rTag, rWho, rDist, rTotal, rNote, rDamage, rDamageNote;
        Image rTagBg;
        RectTransform rDamageRow;
        Text[] rJudges = new Text[5];
        Text[] rPts = new Text[4];
        float tickerT, promptPulse;
        bool promptHot;
        Rect lastSafe;

        // ---------- Kurulum ----------
        public void Build(Font f, Action onStart, Action onPrev, Action onNext, Action onRetry, Action onGarage, Action onMute)
        {
            font = f;
            var canvasGo = new GameObject("UI");
            canvasGo.transform.SetParent(transform, false);
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            scaler.matchWidthOrHeight = 0.5f;
            canvasGo.AddComponent<GraphicRaycaster>();
            safe = Rt("Safe", canvasGo.transform);
            Stretch(safe);

            BuildHud(onMute);
            BuildGarage(onStart, onPrev, onNext);
            BuildResult(onRetry, onGarage);
        }

        void BuildHud(Action onMute)
        {
            hudRoot = Rt("Hud", safe); Stretch(hudRoot);
            // Sol üst: yayın bandı
            var live = Box(hudRoot, Red, new Vector2(0, 1), new Vector2(24, -24), new Vector2(130, 46));
            Label(live, "CANLI", 26, Paper, TextAnchor.MiddleCenter, true);
            var hillBox = Box(hudRoot, Paper, new Vector2(0, 1), new Vector2(154, -24), new Vector2(420, 46));
            hill = Label(hillBox, "", 26, Ink, TextAnchor.MiddleLeft, true, 14);
            var sp = Box(hudRoot, Ink, new Vector2(0, 1), new Vector2(24, -70), new Vector2(550, 112));
            carName = Label(sp, "", 34, Paper, TextAnchor.MiddleLeft, true, 22);
            speed = Label(sp, "0", 86, Paper, TextAnchor.MiddleRight, true, 22);
            speed.rectTransform.offsetMax = new Vector2(-110, 0);
            var unit = Label(sp, "km/sa", 26, Muted, TextAnchor.MiddleRight, true, 18);
            unit.rectTransform.offsetMin = new Vector2(0, -22);
            distBg = Box(hudRoot, Gold, new Vector2(0, 1), new Vector2(24, -182), new Vector2(320, 92)).GetComponent<Image>();
            dist = Label(distBg.rectTransform, "0.0 m", 64, Ink, TextAnchor.MiddleLeft, true, 18);

            // Sağ üst: rüzgâr, geçilecek mesafe, ses
            windBg = Box(hudRoot, Glass, new Vector2(1, 1), new Vector2(-24, -24), new Vector2(400, 64)).GetComponent<Image>();
            wind = Label(windBg.rectTransform, "", 32, Paper, TextAnchor.MiddleCenter, true);
            var beatBox = Box(hudRoot, Go, new Vector2(1, 1), new Vector2(-24, -96), new Vector2(400, 50));
            beat = Label(beatBox, "", 26, Ink, TextAnchor.MiddleCenter, true);
            var mute = Button(hudRoot, Glass, new Vector2(1, 1), new Vector2(-24, -154), new Vector2(220, 60), "SES: AÇIK", 24, Paper, onMute);
            muteLabel = mute.GetComponentInChildren<Text>();

            // Alt: rampa göstergesi, yönlendirme, spiker
            meter = Box(hudRoot, new Color(0.04f, 0.09f, 0.19f, 0.65f), new Vector2(0.5f, 0), new Vector2(0, 360), new Vector2(900, 26));
            meterNitro = Box(meter, NitroBlue, new Vector2(0, 0.5f), Vector2.zero, new Vector2(0, 26)).GetComponent<Image>();
            meterNitroRt = meterNitro.rectTransform;
            meterZoneRt = Box(meter, Gold, new Vector2(0, 0.5f), Vector2.zero, new Vector2(0, 26));
            meterCar = Box(meter, Paper, new Vector2(0, 0.5f), Vector2.zero, new Vector2(8, 46)).GetComponent<Image>();
            meterCarRt = meterCar.rectTransform;
            var ml = Label(meter, "START", 22, Paper, TextAnchor.UpperLeft, true);
            ml.rectTransform.offsetMin = new Vector2(0, -40); ml.rectTransform.offsetMax = new Vector2(0, -28);
            var mr = Label(meter, "BURNU KALDIR · KENAR", 22, Gold, TextAnchor.UpperRight, true);
            mr.rectTransform.offsetMin = new Vector2(0, -40); mr.rectTransform.offsetMax = new Vector2(0, -28);

            var pr = Rt("Prompt", hudRoot);
            pr.anchorMin = new Vector2(0, 0); pr.anchorMax = new Vector2(1, 0); pr.pivot = new Vector2(0.5f, 0);
            pr.anchoredPosition = new Vector2(0, 230); pr.sizeDelta = new Vector2(-40, 90);
            prompt = Label(pr, "", 54, Paper, TextAnchor.MiddleCenter, true);
            var o = prompt.gameObject.AddComponent<Outline>(); o.effectColor = new Color(0.04f, 0.09f, 0.19f, 0.7f); o.effectDistance = new Vector2(3, -3);

            var tk = Rt("Ticker", hudRoot);
            tk.anchorMin = new Vector2(0.5f, 0); tk.anchorMax = new Vector2(0.5f, 0); tk.pivot = new Vector2(0.5f, 0);
            tk.anchoredPosition = new Vector2(0, 110); tk.sizeDelta = new Vector2(1000, 96);
            var tag = Box(tk, Red, new Vector2(0, 0.5f), Vector2.zero, new Vector2(170, 96));
            Label(tag, "SPİKER", 26, Paper, TextAnchor.MiddleCenter, true);
            var tb = Box(tk, Paper, new Vector2(0, 0.5f), new Vector2(170, 0), new Vector2(830, 96));
            ticker = Label(tb, "", 32, Ink, TextAnchor.MiddleLeft, false, 20);

            lights = new Image[3];
            var lb = Box(hudRoot, Ink, new Vector2(0.5f, 0.62f), Vector2.zero, new Vector2(260, 90));
            for (int i = 0; i < 3; i++) lights[i] = Box(lb, new Color(0.16f, 0.24f, 0.37f), new Vector2(0, 0.5f), new Vector2(20 + i * 80, 0), new Vector2(60, 60)).GetComponent<Image>();
            lb.gameObject.SetActive(false);
        }

        void BuildGarage(Action onStart, Action onPrev, Action onNext)
        {
            garageRoot = Rt("Garage", safe); Stretch(garageRoot);
            var eb = Box(garageRoot, Red, new Vector2(0, 1), new Vector2(32, -36), new Vector2(330, 48));
            Label(eb, "DÜNYA KUPASI", 28, Paper, TextAnchor.MiddleCenter, true);
            var eb2 = Box(garageRoot, Paper, new Vector2(0, 1), new Vector2(32, -84), new Vector2(560, 48));
            gEyebrow = Label(eb2, "", 28, Ink, TextAnchor.MiddleLeft, true, 14);
            var title = Rt("Title", garageRoot);
            title.anchorMin = title.anchorMax = new Vector2(0, 1); title.pivot = new Vector2(0, 1);
            title.anchoredPosition = new Vector2(28, -140); title.sizeDelta = new Vector2(1000, 260);
            var t = Label(title, "SUPERCAR\n<color=#F5B700>JUMPING</color>", 120, Paper, TextAnchor.UpperLeft, true);
            t.fontStyle = FontStyle.BoldAndItalic; t.supportRichText = true; t.lineSpacing = 0.8f;
            var lead = Box(garageRoot, Go, new Vector2(0, 1), new Vector2(32, -410), new Vector2(760, 48));
            gLeader = Label(lead, "", 26, Ink, TextAnchor.MiddleLeft, true, 14);

            var panel = Box(garageRoot, Glass, new Vector2(0.5f, 0), new Vector2(0, 24), new Vector2(1030, 760));
            Box(panel, Gold, new Vector2(0.5f, 1), Vector2.zero, new Vector2(1030, 6));
            Button(panel, new Color(1, 1, 1, 0.08f), new Vector2(0, 1), new Vector2(32, -40), new Vector2(110, 110), "‹", 80, Paper, onPrev);
            Button(panel, new Color(1, 1, 1, 0.08f), new Vector2(1, 1), new Vector2(-32, -40), new Vector2(110, 110), "›", 80, Paper, onNext);
            gCls = Label(Strip(panel, -36, 44), "", 30, Gold, TextAnchor.MiddleCenter, true);
            gName = Label(Strip(panel, -80, 86), "", 76, Paper, TextAnchor.MiddleCenter, true);
            gName.fontStyle = FontStyle.BoldAndItalic;
            gDots = Label(Strip(panel, -164, 30), "", 30, Gold, TextAnchor.MiddleCenter, true);
            gDesc = Label(Strip(panel, -210, 90, 40), "", 32, Snow, TextAnchor.UpperLeft, false);
            for (int i = 0; i < 4; i++)
            {
                float x = i % 2 == 0 ? 40 : 535, y = -320 - (i / 2) * 92;
                var cell = Box(panel, new Color(0, 0, 0, 0), new Vector2(0, 1), new Vector2(x, y), new Vector2(455, 80));
                statLabel[i] = Label(cell, "", 24, Muted, TextAnchor.UpperLeft, true);
                statValue[i] = Label(cell, "", 30, Paper, TextAnchor.UpperRight, true);
                var bg = Box(cell, new Color(1, 1, 1, 0.14f), new Vector2(0, 0), new Vector2(0, 14), new Vector2(455, 8));
                statBar[i] = Box(bg, Paper, new Vector2(0, 0.5f), Vector2.zero, new Vector2(0, 8));
            }
            gPb = Label(Strip(panel, -520, 50, 40), "", 30, Snow, TextAnchor.MiddleLeft, true);
            Button(panel, Gold, new Vector2(0.5f, 0), new Vector2(0, 110), new Vector2(950, 120), "START KAPISINA GEÇ", 52, Ink, onStart);
            var how = Label(Strip(panel, -720, 60, 40), "Mavi kapılarda basılı tut: nitro · Sarı bölgede bas: burnu kaldır · Basılı tut: süzül, HS'den önce bırak", 22, Muted, TextAnchor.MiddleCenter, false);
            how.rectTransform.anchoredPosition = new Vector2(0, 50);
        }

        void BuildResult(Action onRetry, Action onGarage)
        {
            resultRoot = Rt("Result", safe); Stretch(resultRoot);
            var panel = Rt("Panel", resultRoot);
            panel.anchorMin = panel.anchorMax = new Vector2(0.5f, 0); panel.pivot = new Vector2(0.5f, 0);
            panel.anchoredPosition = new Vector2(0, 24); panel.sizeDelta = new Vector2(1030, 1000);
            rTagBg = Box(panel, Red, new Vector2(0, 1), Vector2.zero, new Vector2(300, 52)).GetComponent<Image>();
            rTag = Label(rTagBg.rectTransform, "", 28, Paper, TextAnchor.MiddleCenter, true);
            var who = Box(panel, Paper, new Vector2(0, 1), new Vector2(300, 0), new Vector2(560, 52));
            rWho = Label(who, "", 28, Ink, TextAnchor.MiddleLeft, true, 16);
            var main = Box(panel, Ink, new Vector2(0, 1), new Vector2(0, -52), new Vector2(1030, 420));
            rDist = Label(main, "", 170, Paper, TextAnchor.UpperLeft, true, 30);
            rDist.fontStyle = FontStyle.BoldAndItalic; rDist.rectTransform.offsetMax = new Vector2(-300, -10);
            var tot = Label(main, "TOPLAM PUAN", 26, Muted, TextAnchor.UpperRight, true, 30);
            tot.rectTransform.offsetMax = new Vector2(-30, -30);
            rTotal = Label(main, "", 96, Gold, TextAnchor.UpperRight, true, 30);
            rTotal.rectTransform.offsetMax = new Vector2(-30, -60);
            rNote = Label(Strip(main, -210, 70, 30), "", 30, Snow, TextAnchor.UpperLeft, false);
            rDamageRow = Strip(main, -290, 110, 30);
            Label(rDamageRow, "HASAR BEDELİ", 24, Muted, TextAnchor.UpperLeft, true);
            rDamage = Label(rDamageRow, "", 64, Go, TextAnchor.UpperLeft, true);
            rDamage.rectTransform.offsetMax = new Vector2(0, -26);
            rDamageNote = Label(rDamageRow, "", 24, Muted, TextAnchor.UpperRight, true);

            var table = Box(panel, Paper, new Vector2(0, 1), new Vector2(0, -472), new Vector2(1030, 270));
            Label(Strip(table, -20, 40, 30), "HAKEMLER", 24, Muted, TextAnchor.MiddleLeft, true);
            for (int i = 0; i < 5; i++)
            {
                var j = Box(table, Snow, new Vector2(0, 1), new Vector2(230 + i * 150, -14), new Vector2(130, 56));
                rJudges[i] = Label(j, "", 36, Ink, TextAnchor.MiddleCenter, true);
            }
            string[] names = { "MESAFE PUANI", "STİL PUANI", "RÜZGÂR DÜZELTMESİ", "K FARKI" };
            for (int i = 0; i < 4; i++)
            {
                var c = Box(table, new Color(0, 0, 0, 0), new Vector2(0, 1), new Vector2(30 + i * 250, -100), new Vector2(240, 150));
                Label(c, names[i], 22, Muted, TextAnchor.UpperLeft, true);
                rPts[i] = Label(c, "", 52, Ink, TextAnchor.MiddleLeft, true);
            }
            Button(panel, Gold, new Vector2(0, 1), new Vector2(0, -770), new Vector2(560, 120), "TEKRAR ATLA", 52, Ink, onRetry);
            Button(panel, new Color(1, 1, 1, 0.12f), new Vector2(1, 1), new Vector2(0, -770), new Vector2(440, 120), "GARAJA DÖN", 40, Paper, onGarage);
        }

        // ---------- UI yardımcıları ----------
        static RectTransform Rt(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            return (RectTransform)go.transform;
        }
        static void Stretch(RectTransform r) { r.anchorMin = Vector2.zero; r.anchorMax = Vector2.one; r.offsetMin = r.offsetMax = Vector2.zero; }

        /// anchor köşesine göre konumlanan dolu kutu
        static RectTransform Box(Transform parent, Color c, Vector2 anchor, Vector2 pos, Vector2 size)
        {
            var r = Rt("Box", parent);
            r.anchorMin = r.anchorMax = anchor; r.pivot = anchor;
            r.anchoredPosition = pos; r.sizeDelta = size;
            var img = r.gameObject.AddComponent<Image>();
            img.color = c; img.raycastTarget = false;
            return r;
        }
        static RectTransform Strip(Transform parent, float top, float height, float pad = 0)
        {
            var r = Rt("Strip", parent);
            r.anchorMin = new Vector2(0, 1); r.anchorMax = new Vector2(1, 1); r.pivot = new Vector2(0.5f, 1);
            r.offsetMin = new Vector2(pad, top - height); r.offsetMax = new Vector2(-pad, top);
            return r;
        }
        Text Label(Transform parent, string text, int size, Color color, TextAnchor align, bool bold, float pad = 0)
        {
            var r = Rt("Text", parent);
            Stretch(r);
            r.offsetMin = new Vector2(pad, 0); r.offsetMax = new Vector2(-pad, 0);
            var t = r.gameObject.AddComponent<Text>();
            t.font = font; t.text = text; t.fontSize = size; t.color = color; t.alignment = align;
            t.fontStyle = bold ? FontStyle.Bold : FontStyle.Normal;
            t.horizontalOverflow = HorizontalWrapMode.Wrap; t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            return t;
        }
        RectTransform Button(Transform parent, Color c, Vector2 anchor, Vector2 pos, Vector2 size, string text, int fontSize, Color textColor, Action onClick)
        {
            var r = Box(parent, c, anchor, pos, size);
            var img = r.GetComponent<Image>(); img.raycastTarget = true;
            var b = r.gameObject.AddComponent<Button>();
            b.targetGraphic = img;
            b.onClick.AddListener(() => onClick?.Invoke());
            Label(r, text, fontSize, textColor, TextAnchor.MiddleCenter, true);
            return r;
        }

        // ---------- Güncelleme API'si ----------
        public void Show(bool hud, bool garage, bool result)
        {
            hudRoot.gameObject.SetActive(hud);
            garageRoot.gameObject.SetActive(garage);
            resultRoot.gameObject.SetActive(result);
        }

        public void SetHill(string name, double k, double hs)
        {
            hill.text = $"{name.ToUpperInvariant()} · HS{hs:0}";
            gEyebrow.text = $"{name.ToUpperInvariant()} · K-{k:0} · HS-{hs:0}";
        }

        public void SetGarage(string cls, string name, string desc, int idx, int count, (string label, string value, float frac)[] stats, string pb, string leader)
        {
            gCls.text = cls.ToUpperInvariant(); gName.text = name.ToUpperInvariant(); gDesc.text = desc;
            gDots.text = $"{idx + 1} / {count}";
            for (int i = 0; i < 4 && i < stats.Length; i++)
            {
                statLabel[i].text = stats[i].label.ToUpperInvariant(); statValue[i].text = stats[i].value;
                statBar[i].sizeDelta = new Vector2(455 * Mathf.Clamp01(stats[i].frac), 8);
            }
            gPb.text = pb;
            gLeader.transform.parent.gameObject.SetActive(!string.IsNullOrEmpty(leader));
            gLeader.text = leader;
        }

        public void SetRun(string car, float windValue, string beatText)
        {
            carName.text = car.ToUpperInvariant();
            bool head = windValue < 0;
            wind.text = $"RÜZGÂR {(head ? "←" : "→")} {Mathf.Abs(windValue):0.0} m/s {(head ? "önden" : "arkadan")}";
            windBg.color = Glass;
            wind.color = head ? Go : new Color(1f, 0.6f, 0.55f);
            beat.transform.parent.gameObject.SetActive(beatText != null);
            beat.text = beatText ?? "";
            distBg.gameObject.SetActive(false);
        }

        public void SetSpeed(float kmh, bool nitro)
        {
            speed.text = Mathf.RoundToInt(kmh).ToString();
            speed.color = nitro ? NitroBlue : Paper;
        }

        public void SetDistance(float? d, bool over)
        {
            distBg.gameObject.SetActive(d.HasValue);
            if (!d.HasValue) return;
            dist.text = $"{d.Value:0.0} m";
            distBg.color = over ? Go : Gold;
        }

        public void SetMeter(bool visible, float car, float n0, float n1, float zone, bool burning)
        {
            meter.gameObject.SetActive(visible);
            if (!visible) return;
            const float W = 900;
            meterNitroRt.anchoredPosition = new Vector2(n0 * W, 0); meterNitroRt.sizeDelta = new Vector2((n1 - n0) * W, burning ? 34 : 26);
            meterNitro.color = burning ? Color.Lerp(NitroBlue, Color.white, Mathf.PingPong(Time.time * 6, 0.5f)) : NitroBlue;
            meterZoneRt.anchoredPosition = new Vector2(zone * W, 0); meterZoneRt.sizeDelta = new Vector2((1 - zone) * W, 26);
            meterCarRt.anchoredPosition = new Vector2(car * W - 4, 0);
        }

        public void SetPrompt(string text, bool hot) { prompt.text = text.ToUpperInvariant(); promptHot = hot; }

        public void Say(string text, float duration = 2.8f)
        {
            ticker.text = text;
            ticker.transform.parent.parent.gameObject.SetActive(true);
            tickerT = duration;
        }

        public void SetLights(int state) // -1 kapalı, 0..2 kırmızı sayısı, 3 yeşil
        {
            lights[0].transform.parent.gameObject.SetActive(state >= 0);
            for (int i = 0; i < 3; i++)
                lights[i].color = state >= 3 ? Go : i <= state ? Red : new Color(0.16f, 0.24f, 0.37f);
        }

        public void SetMuted(bool muted) => muteLabel.text = muted ? "SES: KAPALI" : "SES: AÇIK";

        public struct ResultData
        {
            public string tag, who, dist, total, note, damage, damageNote;
            public bool record, showTable, showDamage;
            public double[] judges; public int dropLow, dropHigh;
            public string distPts, stylePts, windPts, kDiff;
        }

        public void SetResult(ResultData d)
        {
            rTag.text = d.tag.ToUpperInvariant();
            rTagBg.color = d.record ? Gold : Red;
            rTag.color = d.record ? Ink : Paper;
            rWho.text = d.who.ToUpperInvariant();
            rDist.text = d.dist;
            rTotal.text = d.total;
            rNote.text = d.note;
            rDamageRow.gameObject.SetActive(d.showDamage);
            rDamage.text = d.damage; rDamageNote.text = d.damageNote?.ToUpperInvariant();
            rJudges[0].transform.parent.parent.gameObject.SetActive(d.showTable);
            if (d.showTable)
            {
                for (int i = 0; i < 5; i++)
                {
                    rJudges[i].text = d.judges[i].ToString("0.0");
                    bool drop = i == d.dropLow || i == d.dropHigh;
                    rJudges[i].color = drop ? Muted : Ink;
                    rJudges[i].transform.parent.GetComponent<Image>().color = drop ? new Color(0, 0, 0, 0) : Snow;
                }
                rPts[0].text = d.distPts; rPts[1].text = d.stylePts; rPts[2].text = d.windPts; rPts[3].text = d.kDiff;
            }
        }

        void Update()
        {
            if (tickerT > 0) { tickerT -= Time.unscaledDeltaTime; if (tickerT <= 0) ticker.transform.parent.parent.gameObject.SetActive(false); }
            if (prompt != null)
            {
                promptPulse += Time.unscaledDeltaTime;
                float s = promptHot ? 1 + Mathf.Abs(Mathf.Sin(promptPulse * 9)) * 0.08f : 1;
                prompt.rectTransform.localScale = new Vector3(s, s, 1);
                prompt.color = promptHot ? Gold : Paper;
            }
            // Çentikli ekranlar için güvenli alan
            if (safe != null && Screen.safeArea != lastSafe)
            {
                lastSafe = Screen.safeArea;
                var a = lastSafe;
                safe.anchorMin = new Vector2(a.xMin / Screen.width, a.yMin / Screen.height);
                safe.anchorMax = new Vector2(a.xMax / Screen.width, a.yMax / Screen.height);
            }
        }
    }
}
