# Anti-AI UI/UX Design Directives & System Standards

Bu yönerge, üretilen tüm arayüzlerin yapay zeka klişelerinden uzak, kıdemli bir ürün tasarımcısı tarafından kodlanmış ve insan ergonomisine tam uyumlu hissettirmesi için belirlenmiş katı tasarım kurallarını içerir.

---

## 1. Kesin Olarak Yasaklananlar (Negative Constraints)

Aşağıdaki öğeler ve yaklaşımlar, arayüzün "üretken yapay zeka şablonu" gibi algılanmasına yol açtığı için **asla kullanılmamalıdır**:

* **Klişe Renk Paletleri:**
  * Mor / Neon Magenta / Parlak Cyan vurgu ve gradyan kombinasyonları.
  * Aşırı koyu, kontrastı zayıf ve arkası mor sisli (glow) arka planlar.
* **Aşırı Glassmorphism:**
  * Okunabilirliği ve kontrastı bozan ağır bulanık (backdrop-blur) şeffaf kartlar, neon parlak kenarlıklar.
* **İşlevsiz 3D ve Hologramlar:**
  * Boşluk doldurmak için konulan havada yüzen 3D küreler, kristaller, anlamsız parlamalar veya soyut teknoloji halkaları.
* **Jenerik Bento-Grid:**
  * 6-8 kutulu, her kutuda anlamsız bir ikon ve soyut sayaç bulunan tekdüze bento kutu düzenleri.
* **Sahte / İçi Boş Metrikler:**
  * "%100 Growth", anlamsız sinüs dalgası şeklindeki veri grafikleri, bağlamı olmayan progress bar'lar.

---

## 2. Tipografi ve Ritim Standartları

* **Yazı Tipi Seçimi:** 
  * Modern, nötr ve endüstri standardı neo-grotesque tipografiler tercih edilmelidir: `Geist`, `Inter`, `Satoshi`, `SF Pro Text` veya `Public Sans`.
* **Hiyerarşi ve Ölçek:**
  * Tipografik hiyerarşi katı kurallara bağlı olmalıdır:
    * `H1 / Başlık`: Net, güçlü ağırlık (Semibold/Bold), kontrollü satır aralığı (tight leading).
    * `Gövde`: Rahat okunabilir, yüksek kontrast (WCAG AAA uyumlu), gereksiz büyük fontlardan kaçınma.
    * `Etiketler / Meta Veriler`: Küçük puntolu (`text-xs` / `text-sm`), hafif opaklık azaltılmış (`text-muted-foreground`), dengeli harf aralığı (tracking/letter-spacing).
* **Boşluk (Whitespace) ve Nefes Alma Alanı:**
  * Ekranın her pikselini doldurma baskısından kaçınılmalıdır. Bilinçli negatif alan (whitespace), asimetri ve temiz grid düzeni korunmalıdır.

---

## 3. Renk ve Yüzey Mimarisi

* **Palet:**
  * Nötr temelli (Monochrome / Slate / Zinc / Neutral) yüzeyler.
  * Aksan renk tek ve amaca yönelik olmalıdır (Örn: yalnızca ana aksiyon butonunda veya kritik durum bildiriminde).
* **Kenarlık ve Gölgeler:**
  * Parlayan neon hatlar yerine ince, net ve zarif 1px kenarlıklar (`border-slate-200` veya dark modda `border-neutral-800`).
  * Ağır gölgeler yerine mikro-gölgeler (subtle drop-shadow) ve derinlik hissi veren katmanlama.

---

## 4. Gerçek Dünya Fonksiyonelliği ve Durumlar (States)

Yapay zekanın yalnızca "ideal / en mutlu anı" (happy path) tasarlama eğilimi kırılmalıdır:

* **Gerçekçi Veri ve Bileşenler:**
  * Tablolarda gerçek dünya sütunları (Kullanıcı durumu, son etkinlik zamanı, IP adresi, etiketler, aksiyon menüleri).
  * Gerçek filtreleme açılır menüleri (dropdowns), sayfalama (pagination) ve arama çubukları.
* **Uç Durumlar (Edge Cases):**
  * Boş durum ekranları (Empty states - rehberlik eden çizim veya metinle).
  * Hata ve doğrulama durumları (Form inline validation, warning toasts, error banners).
  * Yüklenme durumları (Skeleton loading screens, disabled button states).

---

## 5. Referans Tasarım Sistemleri

Tasarım kararları alınırken şu sistemlerin minimalizmi, ergonomisi ve veri yoğunluğu kılavuz alınmalıdır:

1. **Linear Design System:** Mikro-kontrastlar, klavye kısayolu vurguları, karanlık modda kusursuz griler.
2. **Stripe Dashboard / Vercel:** Temiz, işlev odaklı, tipografiye dayalı ve okunabilir veri sunumu.
3. **Apple Human Interface Guidelines (HIG):** İnsan ergonomisine uygun dokunma alanları (min 44px/40px hedef alanları), doğal boşluklar.
4. **Swiss / International Typographic Style:** Asimetrik düzenler, grid disiplini ve gereksiz süslemelerden tamamen arındırılmış yapı.

---

## 6. Antigravity Prompt / İstek Formatı Şablonu

Arayüz üretilirken kullanılacak temel direktif formatı:

> **Rol:** Senior Product Designer & Frontend Engineer  
> **Hedef:** [Proje/Ekran Tipi - Örn: ZeroPulse Analytics Dashboard]  
> **Stil:** Swiss typography & Linear-inspired minimal UI.  
> **Kısıtlamalar:** Zero purple/cyan neon glow, no floating 3D spheres, no generic bento cards, no artificial glassmorphism.  
> **Görsel Dil:** Strict 1px borders, slate/neutral color scale, precise typography hierarchy, realistic data tables, human-ergonomic whitespace, clear hover/active states.