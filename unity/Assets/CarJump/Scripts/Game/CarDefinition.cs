using CarJump.Core;
using UnityEngine;

namespace CarJump
{
    /// Bir araba: fizik değerleri + Asset Store'dan gelen model. Create > CarJump > Car Definition ile oluşturulur.
    [CreateAssetMenu(menuName = "CarJump/Car Definition", fileName = "Car")]
    public class CarDefinition : ScriptableObject
    {
        public CarSpec spec = new CarSpec();

        [Header("Model")]
        [Tooltip("Asset Store paketindeki araba prefab'ı. Boş bırakılırsa basit yer tutucu model kullanılır.")]
        public GameObject prefab;
        [Tooltip("Model ters duruyorsa 180, yan duruyorsa 90/-90 yap. Unity modelleri genelde +Z'ye bakar.")]
        public float yawOffset = 0f;
        [Tooltip("Model, fizikteki araç uzunluğuna göre otomatik ölçeklenir.")]
        public bool autoScale = true;
        [Tooltip("Tekerlek nesnelerinin adında geçen kelime (büyük/küçük harf fark etmez).")]
        public string wheelNameContains = "wheel";

        [Header("Yer tutucu model rengi")]
        public Color paint = new Color(0.79f, 0.11f, 0.15f);
        public Color trim = new Color(0.08f, 0.08f, 0.08f);

        [Header("Ses (boşsa yerleşik sentez kullanılır)")]
        public AudioClip engineLowLoop;
        public AudioClip engineHighLoop;
    }
}
