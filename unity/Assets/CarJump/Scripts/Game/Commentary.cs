using UnityEngine;

namespace CarJump
{
    /// Spiker cümleleri (Türkçe). Yerelleştirme eklenirse buradan çevrilir.
    public static class Commentary
    {
        static string Pick(params string[] s) => s[Random.Range(0, s.Length)];

        public static string Start(string car, float wind) =>
            $"{car} start kapısında. Rüzgâr {Mathf.Abs(wind):0.0} metre {(wind < 0 ? "önden, atlayış için iyi haber" : "arkadan, işi zor")}.";
        public static string Nitro() => Pick("Nitro açıldı! Motor bağırıyor!", "Ve nitro! Mavi alev arkada!", "Nitroya bastı, hız tavan yapıyor!");
        public static string NitroEnd(float kmh) => $"Nitro bitti, {kmh:0} km/sa! Şimdi bırak ve kenarı bekle.";
        public static string Takeoff(double? q, float kmh)
        {
            if (q == null) return $"Kenarda {kmh:0} km/sa ama burnu hiç kaldırmadı!";
            if (q > 0.85) return $"Kusursuz kalkış! Tam kenardan, {kmh:0} km/sa!";
            if (q > 0.5) return $"İyi zamanlama, {kmh:0} km/sa ile havada.";
            return $"Biraz erken kaldırdı. {kmh:0} km/sa ile havalandı.";
        }
        public static string Late() => "Geç bastı! Kenarı kaçırdı, zayıf bir itiş.";
        public static string PassK() => "K noktasını geçti! Hâlâ havada!";
        public static string PassBeat() => "Yeşil çizgiyi geçiyor! Liderliğe uçuyor!";
        public static string PassHS() => "HS sınırını aştı! Bu iniş çok tehlikeli!";
        public static string Land(double diff, double vn)
        {
            if (diff < 6 && vn < 6) return Pick("Yumuşacık iniş! Hakemler bunu sever.", "Telemark gibi! Dört teker aynı anda!", "Kusursuz iniş, tüy gibi!");
            if (diff < 15) return Pick("Dengeli bir iniş.", "Biraz sert ama kontrol onda.");
            return "Burun önde indi, stil puanı gidecek!";
        }
        public static string Ice() => Pick("Pist buz gibi, durmuyor... panolar geliyor!", "Fren yok, buzda kayıyor! Panolara dikkat!");
        public static string Crash(bool dnf) => dnf ? "Ve kaza! İnişte kontrolü kaybetti, diskalifiye!" :
            Pick("Ve kaza! Araç takla atıyor!", "Olamaz! Sert iniş, araba paramparça!", "Kaza! Mesafe sayılır ama stil puanı uçtu.");
        public static string Wall(float kmh) => Pick($"Ve panolara {kmh:0} km/sa ile daldı! Ortalık savaş alanı!", "Panolar paramparça! Bu reklamın faturası ağır olacak!", "Duvara tam gaz! Araba takla atıyor!");
    }
}
