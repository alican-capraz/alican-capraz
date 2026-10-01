using UnityEngine;

namespace CarJump
{
    /// Çalışma zamanında üretilen pist, efekt ve yer tutucu modellerin kullandığı malzemeler.
    /// "CarJump > Oyun sahnesini kur" menüsü bu varlığı oluşturur ve doldurur; istersen malzemeleri kendi malzemelerinle değiştirebilirsin.
    [CreateAssetMenu(menuName = "CarJump/Game Assets", fileName = "GameAssets")]
    public class GameAssets : ScriptableObject
    {
        [Header("Pist")]
        public Material snow;
        public Material track;
        public Material wall;
        public Material rock;
        public Material nitroPaint;
        public Material liftPaint;
        public Material lineK;
        public Material lineHS;
        public Material lineMinor;
        public Material beatLine;
        public Material beatWall;

        [Header("Yapılar")]
        public Material gateFrame;
        public Material gateLight;
        public Material lamp;
        public Material pine;
        public Material crowd;
        public Material bannerBase;

        [Header("Araba ve efektler")]
        public Material carPaint;
        public Material carTrim;
        public Material carGlass;
        public Material tire;
        public Material tailLight;
        public Material flame;
        public Material snowParticle;
        public Material speedLine;
        public Material debris;

        [Header("Yazı")]
        public Font font;
    }
}
