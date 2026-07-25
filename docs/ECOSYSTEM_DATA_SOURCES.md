# Monad Ecosystem Projeleri – Veri ve Görseller Nasıl Çekilir?

[Monad Vision Ecosystem](https://monadvision.com/ecosystem?type=project) sayfasında 268 proje (isim, kategori, açıklama, logo, TVL) listeleniyor. Bu veriyi kendi projenizde kullanmak için aşağıdaki yöntemler kullanılabilir.

---

## BlockVision Dokümantasyonu Nasıl Kullanılır?

- **Ana site:** [blockvision.org](https://blockvision.org)  
- **API dokümantasyonu:** [docs.blockvision.org](https://docs.blockvision.org)  
- **API Reference (Monad dahil):** [docs.blockvision.org/reference](https://docs.blockvision.org/reference)  
- **Monad Indexing API:** [docs.blockvision.org/reference/monad-indexing-api](https://docs.blockvision.org/reference/monad-indexing-api)  
- **API key almak:** [dashboard.blockvision.org](https://dashboard.blockvision.org/welcome)

BlockVision dokümanlarından **çekebileceğiniz** veriler:
- **RPC Node:** `eth_*` çağrıları, geçmiş veri, Flashbot, MemPool, trace
- **Indexing API:** Account Tokens, Account DeFi, Account NFTs, Account Transactions, Token Holders, NFT Collection Holders, Contract Source Code, Token Trades, Token Pools, Portfolio API, Price API

**Ecosystem projeler listesi (268 proje, logo, açıklama)** BlockVision’ın **dokümante API’lerinde yok**. Bu liste yalnızca Monad Vision explorer arayüzünde kullanılıyor; public dokümante bir “ecosystem projects” endpoint’i sunulmuyor. Proje görselleri ve açıklamaları için aşağıdaki yöntemlere bakın.

---

## Proje Görselleri ve Açıklamalarını Nasıl Çekersiniz?

BlockVision dokümanında “ecosystem projects” endpoint’i olmadığı için görsel ve açıklamaları şu yollarla alabilirsiniz:

| Yöntem | Görsel | Açıklama |
|--------|--------|----------|
| **1. Monad Vision API’yi bulmak** | API response’ta genelde `logo` / `image` alanı vardır | Aynı response’ta `description` alanı |
| **2. Statik JSON** | Monad Vision sayfasında F12 → Elements ile karttaki `<img src="...">` değerini kopyalayın | Sayfadaki metni kopyalayıp JSON’a yapıştırın |
| **3. Network sekmesi** | Sayfa yüklenirken **Img** filtresinde logo isteklerinin URL’sini görürsünüz | **XHR** ile gelen JSON’da `description` olur |

**Görsel URL’sini tek tek almak:** [monadvision.com/ecosystem?type=project](https://monadvision.com/ecosystem?type=project) sayfasında F12 → **Elements** → bir proje kartındaki logo `<img>` etiketine sağ tık → Copy → Copy attribute value (`src`). Bu URL’yi statik JSON’daki `logo` alanına yazabilirsiniz.

---

## 1. Tarayıcıdan API Adresini Bulmak (Önerilen)

Monad Vision sayfası proje listesini büyük ihtimalle bir istekten alıyor. Gerçek endpoint’i bulmak için:

1. **Chrome/Edge** ile https://monadvision.com/ecosystem?type=project sayfasını açın.
2. **F12** → **Network** sekmesi → **Fetch/XHR** filtresi.
3. Sayfayı **yenileyin** (F5).
4. Listede proje verisi gibi görünen, **JSON** dönen isteği bulun (URL’de genelde `ecosystem`, `project`, `apps` vb. geçer).
5. İsteğe tıklayın → **Response** sekmesinde proje listesini (id, name, logo, description, category vb.) kontrol edin.
6. Bu isteğin **tam URL**’sini kopyalayın (sorgu parametreleriyle birlikte).

**API key gerekiyorsa:** İstekte **Headers** sekmesinde `Authorization` veya `x-api-key` gibi bir header görebilirsiniz; kendi uygulamanızda da aynı header’ı kullanmanız gerekir.

Bulduğunuz URL’yi `src/utils/ecosystemApi.js` içindeki `ECOSYSTEM_API_URL` değişkenine yazın. Response yapısına göre aynı dosyadaki alan eşlemesini (name, logo, description, category) güncelleyin.

---

## 2. Statik JSON ile Kullanım

API bulunana kadar veya API hiç yoksa:

1. Proje listesini kendiniz bir JSON dosyasına aktarın (isim, açıklama, kategori, logo URL, website).
2. Dosyayı projede tutun: **`public/data/ecosystemProjects.json`** (örnek yapı: `public/data/ecosystemProjects.sample.json`).
3. `src/utils/ecosystemApi.js` içinde `ECOSYSTEM_API_URL` boş bırakıldığında bu dosyadan okuma yapılır.

Logo URL’leri için: Tarayıcıda Network sekmesinde sayfa yüklenirken proje kartlarına ait **img** isteklerine bakarak logo URL’lerini alabilirsiniz; veya sayfa kaynağında / DevTools Elements’ta proje kartındaki `img` etiketinin `src` değerini kopyalayabilirsiniz.

---

## 3. Backend’de Scraping (Kendi Sorumluluğunuzda)

Public API yoksa ve statik JSON da kullanmak istemiyorsanız:

- **Puppeteer** veya **Playwright** ile Monad Vision ecosystem sayfasını açıp, render olduktan sonra DOM’dan proje kartlarını (isim, açıklama, kategori, logo `src`, link) okuyabilirsiniz.
- Bu işi **Node.js backend** veya **build-time script** ile yapın; frontend’de değil.
- Site kullanım koşullarına (ToS) ve `robots.txt` kurallarına uyun, aşırı istek atmayın.

---

## 4. Projede Kullanım

- **API URL bulunduysa:** `src/utils/ecosystemApi.js` içinde `ECOSYSTEM_API_URL` ve gerekirse header (API key) tanımlayın; response alanlarına göre mapping’i güncelleyin.
- **Statik JSON kullanıyorsanız:** `public/data/ecosystemProjects.json` oluşturun (veya `public/data/ecosystemProjects.sample.json` dosyasını kopyalayıp `ecosystemProjects.json` yapıp doldurun); `fetchEcosystemProjects()` bu dosyadan okur.
- Görseller: Logo URL’leri CORS veya rate limit nedeniyle sorun çıkarırsa, kendi sunucunuzda veya bir CDN’de image proxy kullanabilirsiniz.

Örnek kullanım ve alan yapısı için `src/utils/ecosystemApi.js` ve `src/data/ecosystemProjects.sample.json` dosyalarına bakın.

---

## 5. Ecosystem Sayfası: Proje Tıklanınca Siteye Gitme

Ecosystem sayfası (`/ecosystem`) proje görsellerini `public/ecosystem/` klasöründen alır. **Tıklanınca projenin sitesine gitmek** için web adresleri `public/data/ecosystemProjects.json` dosyasında tutulur.

**Dosya yapısı:** Her proje bir obje: `{ "filename": "blockvision.png", "name": "BlockVision", "website": "https://blockvision.org" }`.  
- `filename`: `public/ecosystem/` içindeki dosya adı (görsel).  
- `name`: Tooltip’te görünen proje adı (opsiyonel; yoksa dosya adından türetilir).  
- `website`: Tıklanınca açılacak URL. Boş veya yoksa tıklama etkisiz.

**Web sitelerini toplama yöntemleri:**  
1. **Manuel:** [Monad Vision Ecosystem](https://monadvision.com/ecosystem?type=project) sayfasında projeye tıklayıp adres çubuğundaki veya sayfadaki site linkini kopyalayın; `public/data/ecosystemProjects.json` içinde ilgili projenin `website` alanına yapıştırın.  
2. **Monad Vision API:** Eğer ecosystem API endpoint’ini bulursanız (bkz. bölüm 1), response’taki `website` / `url` alanını kullanarak bu JSON’u script ile doldurabilirsiniz.  
3. **Tarayıcıdan tek tek:** F12 → Elements ile proje kartındaki `<a href="...">` veya “Visit” butonunun `href` değerini kopyalayıp JSON’a ekleyin.

Yeni proje eklerken: Görseli `public/ecosystem/` içine koyun, `ecosystemProjects.json` dizisine `{ "filename": "dosya.png", "name": "Proje Adı", "website": "https://..." }` ekleyin.
