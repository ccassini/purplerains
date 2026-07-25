# Konsol ve Geliştirici Araçları

Tarayıcı konsolunu veya DevTools’u **tamamen kapatmak mümkün değildir**. Tarayıcılar güvenlik ve erişilebilirlik nedeniyle sitelere bu yetkiyi vermez. Yapılanlar yalnızca **görünürlüğü azaltmak** ve **açmayı zorlaştırmak** içindir.

## Yapılanlar

### 1. Production build’da `console` kaldırma

- **vite.config.js** içinde Terser ayarları:
  - `drop_console: true` → Tüm `console.log`, `console.info`, `console.warn`, `console.debug` çağrıları production bundle’dan **silinir**.
  - `drop_debugger: true` → `debugger` ifadeleri kaldırılır.
- Sonuç: Kullanıcı F12 ile konsolu açsa bile sizin yazdığınız log’lar **görünmez**; sadece tarayıcı veya eklentilerden gelen mesajlar kalır.

### 2. Sağ tık (context menu) engelleme

- **Sadece production’da** (`import.meta.env.PROD`): `contextmenu` olayında `preventDefault()` çağrılıyor.
- Sonuç: Sayfada sağ tıklayınca “İncele” / “Inspect” menüsü **varsayılan olarak çıkmaz** (kullanıcı menü çubuğundan veya kısayolla yine açabilir).

### 3. Kısayol engelleme (kısmen)

- **Sadece production’da** aşağıdaki tuşlarda `preventDefault()` uygulanıyor:
  - **F12**
  - **Ctrl+Shift+I** (Windows/Linux)
  - **Ctrl+Shift+J** (Windows/Linux)
  - **Ctrl+Shift+C** (Windows/Linux – bazı tarayıcılarda Inspect)
  - **Cmd+Option+I** (macOS)
- Sonuç: Bu kısayollarla DevTools açılması **bazı tarayıcılarda** engellenir; tüm tarayıcı/versiyonlarda garanti değildir.

## Sınırlar

- Kullanıcı **menüden** (Chrome: Üç nokta → Diğer araçlar → Geliştirici araçları) konsolu açabilir.
- Kısayol engellemesi **her tarayıcıda/OS’ta** aynı şekilde çalışmayabilir.
- **Erişilebilirlik:** Sağ tık engeli, metin kopyalama veya “Bağlantıyı yeni sekmede aç” gibi kullanımları etkileyebilir. Gerekirse sadece belirli alanlarda (ör. canvas) uygulanabilir.

## Dev ortamı

- **Geliştirme** (`npm run dev`): Console ve sağ tık **engellenmez**; log’lar normal çalışır.
- **Production build** (`npm run build`): Console çıktıları kaldırılır, sağ tık ve kısayol engelleri devreye girer.

## İsteğe bağlı: Sadece log kaldırma

Sağ tık ve kısayol engelini istemiyorsanız, **App.jsx** içindeki “Production: kullanıcıların konsolu…” ile başlayan `useEffect` bloğunu silebilirsiniz. Terser ile `drop_console` ayarı build’da kalmaya devam eder; yalnızca konsol çıktıları production’da görünmez.
