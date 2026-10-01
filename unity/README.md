# CarJump: Unity projesi

Web prototipiyle aynı oyun: aynı fizik, aynı pist, aynı puanlama. Fizik çekirdeği (`Scripts/Core/JumpSim.cs`) web sürümündeki `physics.js` ile birebir aynı sonuçları verir. 4 araba ve tüm rüzgâr/kalkış senaryolarında mesafeler eşleşiyor.

## Kurulum (yaklaşık 10 dakika)

1. **Unity Hub**'dan **Unity 6 LTS** sürümünü kur. Android ve/veya iOS Build Support modüllerini de seç.
2. Yeni proje oluştur: şablon olarak **Universal 3D** (URP) seç.
3. Bu repodaki `unity/Assets/CarJump` klasörünü projenin `Assets` klasörüne kopyala.
4. Unity'nin üst menüsünden **CarJump → Oyun sahnesini kur**'a tıkla.
5. **Play**'e bas. Oyun yer tutucu arabalarla çalışır.

Sahne kurulumu her şeyi kodla oluşturur: pist, ağaçlar, seyirci, nitro kapıları, pano duvarı, ışık, efektler, arayüz. Sahneye elle bir şey eklemen gerekmez.

## Kendi araba modellerini eklemek (Asset Store)

1. Asset Store'dan paketi al (ör. *Mobile Optimize Free Low Poly Cars*). Unity'de **Window → Package Manager → My Assets** üzerinden içe aktar.
2. **CarJump → Araba tanımlarını oluştur (4 araba)** menüsüne tıkla. `Assets/CarJump/Cars` klasöründe 4 tanım dosyası oluşur.
3. Her tanımı seç ve paketteki bir araba prefab'ını **Prefab** alanına sürükle.
   - Model otomatik olarak döndürülür, fizikteki araç uzunluğuna ölçeklenir ve yere oturtulur.
   - Tekerlekler adında "wheel" geçen nesnelerden otomatik bulunur. Pakette farklı adlandırılmışsa **Wheel Name Contains** alanını değiştir (ör. "tire").
   - Araba ters duruyorsa **Yaw Offset** = 180 yap.
4. Görsel hasar (göçük) için: modeli Project penceresinde seç, **Model** sekmesinde **Read/Write** kutusunu işaretle, **Apply**'a bas.
5. **CarJump → Oyun sahnesini kur**'u tekrar çalıştır.

Fizik değerleri (ağırlık, güç, süzülme, dayanıklılık) aynı tanım dosyasında, **Spec** altında düzenlenebilir.

## Sesler

`Car` nesnesindeki **CarAudio** bileşeninin alanları boşken yerleşik sentez sesler çalar. Bunlar yer tutucudur. Gerçek his için Asset Store'dan bir motor sesi paketi al ve şu alanlara ata:

- **Engine Low / Engine High:** düşük ve yüksek devir döngüleri (loop).
- **Wind:** rüzgâr uğultusu.
- **Nitro Loop / Nitro Blast:** nitro uğultusu ve ateşleme patlaması.
- **Shift Pop:** vites geçişindeki egzoz patlaması.
- **Gate Whoosh:** nitro kapısının altından geçiş.
- **Land Thump / Crash:** iniş darbesi ve kaza.
- **Crowd:** seyirci tezahüratı.

Devir, vites, geçiş ve ses seviyeleri kodda hesaplanır; sadece kayıtları atamak yeterli.

## Telefona yükleme

**File → Build Profiles** → Android veya iOS → **Switch Platform** → **Build And Run**. Ekran yönü dikey (portrait) ayarlıdır.

## Dosyalar

| Dosya | Görev |
|---|---|
| `Core/JumpSim.cs` | Fizik ve puanlama (Unity'den bağımsız, web ile birebir aynı) |
| `Game/GameManager.cs` | Oyun akışı, olaylar, sonuç ekranı, rekorlar |
| `Game/HillBuilder.cs` | Pist, vadi, nitro kapıları, tabelalar, ağaçlar, seyirci, pano duvarı |
| `Game/CarView.cs` | Araba modeli: otomatik hizalama, tekerlek dönüşü, nitro alevi |
| `Game/CarDamage.cs` | Göçük, çatlak cam, kopan parçalar, duman |
| `Game/ChaseCamera.cs` | Arkadan takip kamerası, görüş açısı, sarsıntı, nitro savrulması |
| `Game/SpeedEffects.cs` | Hareket bulanıklığı, renk sapması, hız çizgileri, kar tozu, enkaz |
| `Game/CarAudio.cs` | Vitesli motor sesi, rüzgâr, nitro, darbe sesleri |
| `Game/Hud.cs` | Kodla kurulan arayüz: skor bandı, garaj, sonuç ekranı |
| `Game/Haptics.cs` | Titreşim |
| `Editor/SceneBuilder.cs` | "Oyun sahnesini kur" menüsü |

## Bilinen durum

Kod, Unity'nin referans kütüphanelerine karşı hatasız derlendi. Ama gerçek bir Unity editöründe çalıştırılmadı. İlk açılışta küçük düzeltmeler gerekebilir. Bir hata görürsen Console penceresindeki mesajı olduğu gibi gönder; hemen düzeltirim.
