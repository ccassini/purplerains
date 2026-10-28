# VPS mimarisi — 50 GB, 7/24 geçmiş veri (1 saat / 24 saat / 7 gün)

**Durum:** tasarım. Henüz kod yok. Rakamlar ölçüm değil, varsayımdır; doğrulama adımları en altta.

## Hedef

Site bugün tamamen tarayıcıda canlı çalışıyor ve hiçbir şey saklamıyor. VPS ile eklenecek şey: sitenin her özelliği için **1 saat, 24 saat ve 7 günlük geçmişi** sunan bir API. Canlı yol (tarayıcı → RPC WebSocket) olduğu gibi kalır; geçmiş yolu onun üstüne eklenir. Geçmiş API'si çökerse site bugünkü gibi canlı çalışmaya devam eder.

## Kararlar

| Konu | Karar | Neden |
|---|---|---|
| Canlı yol | Dokunulmaz | `MonadContext` zaten WS + HTTP failover ile çalışıyor; 728 test onu koruyor |
| Geçmiş yolu | Yeni: toplayıcı işçi + veritabanı + API | Vercel fonksiyonu 7/24 çalışamaz (`perpl-stream` en çok 60 sn) |
| Veritabanı | PostgreSQL + TimescaleDB | Zaman serisi sıkıştırma, otomatik saklama süresi, sürekli toplulaştırma; tek servis |
| Pencere modeli | Yalnız 7 günlük ham katman + uzun ömürlü toplulaştırılmış katmanlar | 1 saat ve 24 saat, 7 günün dilimidir; ayrı kopya yok |
| RPC | Ayrı, ücretli/ayrılmış uç nokta | Monad düğümü 50 GB'a sığmaz; halka açık uçlar 3,3 blok/sn'de 429 verir |
| Canlı akış | Mevcut SSE aktarıcısı (Perpl) aynen taşınır | Yeni protokol yok |
| Ters vekil | Caddy | TLS otomatik, `dist/` statik sunumu, `/api` vekili, `vercel.json` başlıkları buraya taşınır |
| Çalıştırma | Docker Compose, tek makine | Basit; 4 servis |

## Servisler

```
 Monad RPC (WS newHeads + HTTP)      Borsa/DEX/Perpl/gmonads/DefiLlama
            │                                     │
            ▼                                     ▼
      ┌───────────┐  idempotent upsert   ┌──────────────┐
      │ collector │ ───────────────────▶ │ TimescaleDB  │
      └───────────┘                      └──────┬───────┘
            ▲ metrics                           │ okuma
            │                              ┌────▼─────┐
      ┌─────┴─────┐                        │   api    │  /api/v1/*
      │  caddy    │ ◀──────────────────────┴────┬─────┘
      └───────────┘   dist/ + TLS + /api        │
            ▲                                   ▼
        tarayıcı  ◀──── canlı: doğrudan RPC WS ─┘ (değişmez)
```

- **collector** (Node, tek süreç, yeniden başlatma güvenli). Kod tekrarını önlemek için mevcut saf modülleri paylaşır: `txEnrichment`, `monadUtils`, `agoraApi` log taraması, `stakingApi`, `perplMarketData`, `rpcFailover`, `requestBudget`.
- **api** (Node, salt okunur DB kullanıcısı). Mevcut `api/*.js` işleyicileriyle aynı `(req, res)` imzası; `vite.config.js` ara katmanı ve prod aynı işleyicileri kullanmaya devam eder.
- **timescaledb**. Tek yazan: collector. Tek okuyan: api.
- **caddy**. Gzip/brotli, `Cache-Control` kuralları ve güvenlik başlıkları `vercel.json`'dan birebir taşınır.

## Toplayıcı kuralları

1. **Sıra:** WS `newHeads` blok numarasını duyurur; blok `eth_getBlockByNumber` ile aynı soketten çekilir (bugünkü desen). Bloklar numarayla sıralanır, yazma anahtarı `block_number`.
2. **Boşluk kapatma:** başlangıçta `MAX(block_number)` ile zincir başı arasını HTTP ile doldurur. Yeniden başlatma ve kopma veri kaybettirmez.
3. **İdempotans:** her tablo doğal anahtarla `INSERT … ON CONFLICT DO NOTHING`. Aynı blok iki kez gelirse sorun yok.
4. **Kesinlik:** yalnız kesinleşmiş blokları yaz. RPC'nin `finalized`/`safe` etiketi desteği ve Monad'ın kesinlik gecikmesi **uygulamadan önce doğrulanacak**; desteklenmiyorsa `baş − N` geride yazılır.
5. **Bütçe:** blok çağrıları ayrı bütçeyle korunur (günde ~288 bin çağrı + önerici `eth_call`). İsteğe bağlı zenginleştirme (token, swap) önceliksiz bütçeden gider, blok akışını açlığa itemez (bugünkü `requestBudget` önceliklendirmesi).
6. **Geri basınç:** DB yazımı yavaşlarsa toplu (batch) yazım; kuyruk üst sınırı aşılırsa en eski zenginleştirme düşer, blok başlıkları asla düşmez.
7. **Sağlık:** `collector_lag_blocks`, `last_block_age_s`, `rpc_errors_total` metrikleri; `last_block_age_s > 30` alarm.

## Veri modeli ve saklama

Ham katman 7 gün tutulur; üstündeki katmanlar sürekli toplulaştırma ile üretilir.

| Tablo | Satır başına | Ham katman | Uzun katman |
|---|---|---|---|
| `blocks` | no, zaman, tx sayısı, gas, base fee, önerici, yakılan | 7 g, her blok | 1 dk → 90 g, 1 sa → 2 yıl |
| `tx_agg_1s` | tx, swap, transfer, gas toplamı | 7 g | 1 dk → 90 g |
| `tx_notable` | büyük swap/transfer (eşik ayarlanabilir) | 30 g | — |
| `price_1s` | 6 borsa OHLC | 7 g | 1 dk → 90 g |
| `pools` | havuz anlık görüntüsü | 7 g (60 sn) | en üst 20 havuz 5 dk → 90 g |
| `perpl_state`, `perpl_trades` | 14 piyasa | 7 g (5 sn) | 5 dk → 90 g |
| `validators_epoch` | stake, komisyon, APY | epoch başına | tümü, süresiz |
| `validator_perf` | uptime vb. | 7 g (2 dk) | 1 sa → 2 yıl |
| `agora_transfers` | AUSD transfer | 7 g | 1 sa toplam → 2 yıl |
| `ecosystem_tvl` | proje TVL | 7 g (10 dk) | 1 sa → 2 yıl |

Ham her tx **saklanmaz**: sitedeki hiçbir ekran bunu istemez ve 200 TPS'te yalnız 7 gün için ~24 GB eder.

### 50 GB bütçesi

| Kalem | GB |
|---|---|
| İşletim sistemi, Docker imajları, günlükler | 8 |
| 7 günlük ham katman (indeksli, sıkıştırma öncesi üst sınır) | 4 |
| 90 g / 2 yıl toplulaştırılmış katmanlar | ~0,6 |
| `tx_notable` 30 gün (2 tx/sn, 200 B varsayımı) | ~1 |
| Yedekler (sıkıştırılmış, 7 günlük; VPS dışına da kopya) | 3 |
| WAL ve geçici alan | 3 |
| **Toplam** | **~19,6** |
| **Boş pay** | **~30** |

Disk %70'te (35 GB) alarm. Boş pay, TPS tahminim yanlış çıkarsa tampondur: ham tx boyutu 4× büyürse de sığar.

## API sözleşmesi (öneri)

```
GET /api/v1/blocks?window=1h|24h|7d          → { res, points:[{t, txs, gas, util, baseFee}] }
GET /api/v1/tx/activity?window=…             → { res, points:[{t, tx, swap, transfer}] }
GET /api/v1/price?window=…&venue=…           → { res, points:[{t,o,h,l,c,v}] }
GET /api/v1/terminal/pools/:id?window=…
GET /api/v1/perpl/:market?window=…
GET /api/v1/staking/validators?epoch=…
GET /api/v1/validators/:id/performance?window=…
GET /api/v1/agora/transfers?window=…
GET /api/v1/ecosystem/tvl?window=…
GET /api/v1/health                           → { lagBlocks, lastBlockAgeS, diskUsedPct }
```

Çözünürlük sunucu tarafında sabittir: `1h → 1 sn` (≤3.600 nokta), `24h → 1 dk` (≤1.440), `7d → 5 dk` (≤2.016). Yanıt her zaman `res` ve `generatedAt` taşır. Önbellek: pencereye göre kısa `s-maxage` (1h: 5 sn, 24h: 30 sn, 7d: 5 dk). Ham veri tarayıcıya hiç gönderilmez.

İstemci kuralı: geçmiş isteği başarısız olursa özellik bugünkü canlı moduna düşer ve "geçmiş şu an yok" ibaresi gösterir; sayfa bozulmaz.

## Güvenlik

- SSH yalnız anahtarla, parola kapalı; `ufw` yalnız 22/80/443; `fail2ban`.
- DB dışarıya kapalı; api salt okunur kullanıcı, collector yazma kullanıcısı. Sırlar `.env`'de, repoda değil (`.gitignore` `.env*` kapsıyor).
- Mevcut CSP `connect-src 'self' https: wss: ws:` geniş; VPS'te `connect-src`, kullanılan RPC/borsa uç noktalarıyla daralacak.
- `validator-performance` işleyicisi `itrocket` HTML'ini kazıyor: collector'a taşınırken oran sınırlı, `User-Agent` açık yazılı, hata durumunda son iyi değer saklanır.
- API girdileri: `window` beyaz listeli, `nodeId` mevcut regex ile doğrulanır, sorgu başına zaman aşımı.

## Geçiş sırası

1. VPS kurulumu, Caddy + statik `dist/` (geçmiş API'si olmadan; site birebir bugünkü gibi).
2. TimescaleDB + collector yalnız `blocks` ile; 24 saat boyunca `collector_lag_blocks` izlenir.
3. Tablolar tek tek eklenir (tx_agg → price → pools → perpl → staking → agora → ecosystem).
4. API uç noktaları ve istemci grafikleri, özellik başına bir bayrakla açılır.
5. DNS geçişi; Vercel bir hafta yedek kalır.

## Doğrulama (kod yazmadan önce)

- [ ] Gerçek TPS: 24 saatlik örneklemeyle ortalama ve tepe tx/sn ölçülür; `tx_notable` eşiği ve `tx_agg_1s` boyutu buna göre sabitlenir.
- [ ] Seçilen RPC'nin oran sınırı ve `finalized` etiketi desteği denenir.
- [ ] Satır boyutları (varsayılan 100–300 B) gerçek şema ile `pg_column_size` ölçülür; bütçe tablosu güncellenir.
- [ ] Timescale sıkıştırma oranı 24 saatlik gerçek veriyle ölçülür.
- [ ] Yedekten geri yükleme bir kez denenir.

## Kapsam dışı

Ham tx arşivi, kendi Monad düğümü, çok bölgeli kurulum, kullanıcı hesapları.
