# Supercar Jumping (prototip)

Kayakla atlama, ama atlayan süper araba. Rampadan son gaz in, engebeleri aş, kenarda zıpla, olabildiğince uzağa süzül.

- `physics.js`: DOM'dan bağımsız fizik ve puanlama (Node'da da çalışır, ayarlama simülasyonları için)
- `game.js`: Three.js ile 3D sahne (arazi, ağaçlar, seyirci, araba modelleri), arkadan takip kamerası, arayüz, spiker ve ses
- `index.html`: arayüz ve stiller

## Oynanış

1. İnişte bir kez dokun: nitro (2,6 sn).
2. Sarı kalkış bölgesinde dokun: zıpla. Kenara ne kadar yakınsa itiş o kadar güçlü.
3. Havada basılı tut: burun kalkar, araba süzülür. Bırak: burun düşer. Yokuşa paralel in.

Puanlama gerçek kayakla atlamadaki gibi: mesafe puanı (K noktasında 60, her metre 1,2), beş hakemin stil puanı (en yüksek ve en düşük atılır) ve rüzgâr düzeltmesi.

## Çalıştırma

Dosyalar Claude Artifact olarak yayınlanacak biçimde yazıldı. Yerelde `index.html` dosyasını tarayıcıda açmak da yeterli.
