export interface NavColumn {
  title: string;
  links: { label: string; href: string }[];
}

export const NAV_COLUMNS: NavColumn[] = [
  {
    title: 'Zeropulse',
    links: [
      { label: 'Neden Zeropulse?', href: '#neden' },
      { label: 'Nasıl Çalışır?', href: '#nasil-calisir' },
      { label: 'Mimari & Bileşenler', href: '#mimari' },
      { label: 'Avantajlar', href: '#avantajlar' },
    ],
  },
  {
    title: 'Kural Motoru',
    links: [
      { label: 'Telemetri & Eşik Analizi', href: '#kural-motoru' },
      { label: 'Flapping & Cooldown', href: '#anomali-onleme' },
      { label: 'Çalışma Modları', href: '#calisma-modlari' },
      { label: 'Canlı Kural Stüdyosu', href: '#kurulum' },
    ],
  },
  {
    title: 'Geliştirici',
    links: [
      { label: 'Metrikler & Çıktı', href: '#telemetri' },
      { label: 'Kural Oluşturucu', href: '/studyo' },
      { label: 'Sık Sorulan Sorular', href: '#sss' },
      { label: 'GitHub Repo', href: 'https://github.com/yasin2dev/zeropulse' },
    ],
  },
];

export const HERO_CONTENT = {
  title: [
    { w: 'Telemetride' },
    { w: 'gürültüyü', br: true },
    { w: 'sıfıra' },
    { w: 'indir.', accent: true },
  ],
  lead: 'Zeropulse; Docker konteynerleri ve Standalone Linux/FreeBSD sistemleri için hafif, sıfır harici servis bağımlılığına sahip, gerçek zamanlı telemetri toplayıcı ve anomali tespit kural motorudur.',
  primary: { label: 'Kural Stüdyosunu Aç', href: '#kurulum' },
  secondary: { label: "Zeropulse'ı Keşfet", href: '#neden' },
  journey: [
    'Collector',
    'Docker & Standalone',
    'ConfigLoader (YAML / JSON)',
    'RuleEngine',
    'StateTracker',
    'CooldownTracker',
    'Dry-Run Simülasyonu',
    'Self-Healing (RESTART)',
    'JSONL stdout Akışı',
  ],
};

export const OVERVIEW_CONTENT = {
  title: ['Sistemleri izlemek kolay.', 'Gerçek anomaliyi yakalamak daha zor.'],
  text: 'Konteynerlerin ve sunucuların her 5 saniyede bir yoğun telemetri üretir. Ancak anlık dalgalanmalarla gerçek darboğazları ayırt etmek, alarm yorgunluğunu önlemek ve devasa izleme yığınları kurmadan otonom aksiyon almak kolay değil.',
  questions: [
    {
      title: 'Spike mı, Kriz mi?',
      text: 'Anlık CPU sıçraması yanlış alarm mı üretiyor, yoksa ardışık periyotlar boyunca süren gerçek bir anomali mi var?',
    },
    {
      title: 'Hangi Ortamda?',
      text: 'Docker socket üzerinden konteynerleri mi izliyorsun, yoksa bare-metal / VM Linux & FreeBSD sunucuları mı?',
    },
    {
      title: 'Nasıl Müdahale Etmeli?',
      text: 'Alarm fırtınasına (flapping) girmeden nasıl güvenli aksiyon (NOTIFY, RESTART) tetiklersin?',
    },
  ],
  screen: {
    title: 'Anomalileri anında',
    accent: 'yakala.',
    cta: './zeropulse --config rules.yaml',
  },
};

export const HOW_IT_WORKS_CONTENT = {
  title: 'Nasıl çalışır?',
  rows: [
    {
      id: 'kural-motoru',
      title: 'Zeropulse, ham metrikleri toplamakla kalmaz.',
      visual: 'readiness' as const,
      steps: [
        {
          n: 1,
          title: 'Ortamı Algıla & Topla',
          text: 'Docker socket veya /.dockerenv varlığına göre otomatik olarak Docker veya Standalone moduna geçer; her 5 saniyede bir sıfır yükle metrik toplar.',
        },
        {
          n: 2,
          title: 'Kuralları Değerlendir',
          text: 'YAML veya JSON ile tanımladığın CPU, bellek, throttling ve ağ eşiklerini (GT / GTE) kod değişikliği gerektirmeden her döngüde denetler.',
        },
      ],
    },
    {
      id: 'anomali-onleme',
      title: 'Yanlış alarmları eler, güvenli müdahale eder.',
      visual: 'plan' as const,
      steps: [
        {
          n: 3,
          title: 'Ardışık Eşik & Cooldown',
          text: 'StateTracker ile geçici spike’ları görmezden gelir; CooldownTracker ile aynı kural ve konteyner için peş peşe tetiklemeyi (flapping) engeller.',
        },
        {
          n: 4,
          title: 'Dry-Run & Otonom Aksiyon',
          text: 'Kuralları --dry-run modunda güvenle simüle et; hazır olduğunda NOTIFY veya RESTART aksiyonlarıyla kendi kendini iyileştiren (self-healing) yapı kur.',
        },
      ],
    },
  ],
};

export const TELEMETRY_VIZ_DATA = {
  label: 'Collector & RuleEngine',
  note: '5s döngü · in-memory',
  total: 98,
  dimensions: [
    { name: 'CPU_PERCENT', score: 91 },
    { name: 'MEM_PERCENT', score: 84 },
    { name: 'CPU_THROTTLED', score: 62 },
    { name: 'NET_RX_BYTES', score: 78 },
    { name: 'NET_TX_BYTES', score: 74 },
    { name: 'StateTracker', score: 100 },
    { name: 'CooldownTracker', score: 100 },
    { name: 'Panic İzolasyonu', score: 100 },
    { name: 'JSONL Çıktı Akışı', score: 96 },
  ],
};

export const PIPELINE_VIZ_DATA = {
  label: 'Anomali Değerlendirme Hattı',
  done: 5,
  total: 5,
  tasks: [
    { title: 'Ortam tespiti: Docker / Standalone', area: 'Collector', done: true },
    { title: 'YAML / JSON şema ve enum doğrulaması', area: 'ConfigLoader', done: true },
    { title: 'Ardışık periyot eşik takibi (3/3)', area: 'StateTracker', done: true },
    { title: 'Flapping önleme ve cooldown kilidi', area: 'CooldownTracker', done: true },
    { title: 'AnomalyEvent JSONL stdout yayını', area: 'RuleEngine', done: true },
  ],
};

export const STICKY_JOURNEY_CONTENT = {
  label: 'Zeropulse telemetri ve anomali döngüsü',
  steps: [
    'Ortamı Algıla',
    'Metrikleri Topla',
    'Kuralları Yükle',
    'Ardışık İhlal İzle',
    'Cooldown Kontrolü',
    'Dry-Run Simülasyonu',
    'Otomatik İyileştir',
  ],
  thresholds: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9],
};

export type IconName =
  | 'flask'
  | 'buildings'
  | 'rocket'
  | 'handshake'
  | 'trend'
  | 'flag'
  | 'puzzle'
  | 'listChecks'
  | 'medal'
  | 'compass'
  | 'path'
  | 'lightbulb'
  | 'usersThree'
  | 'chartBar'
  | 'presentationChart'
  | 'folderOpen'
  | 'sealCheck'
  | 'megaphone'
  | 'scales'
  | 'linkedin'
  | 'github';

export const ARCHITECTURE_CARDS_CONTENT: {
  title: string[];
  text: string;
  categories: { title: string; icon: IconName }[];
  cta: { label: string; href: string };
} = {
  title: ['Sıfır harici servis.', 'Tam gözlemlenebilirlik.'],
  text: 'Zeropulse; veritabanı, zaman serisi sunucusu veya mesaj kuyruğu gerektirmeden tüm durum ve cooldown takibini bellek içinde (in-memory) yürütür.',
  categories: [
    { title: 'Otomatik Ortam Tespiti', icon: 'compass' },
    { title: 'StateTracker Filtresi', icon: 'chartBar' },
    { title: 'CooldownTracker Kilidi', icon: 'sealCheck' },
    { title: 'Panic İzolasyonu', icon: 'scales' },
    { title: 'Dry-Run Simülasyonu', icon: 'flask' },
    { title: 'YAML & JSON Kuralları', icon: 'folderOpen' },
    { title: 'stdout / stderr Ayrımı', icon: 'presentationChart' },
    { title: 'Self-Healing Aksiyonlar', icon: 'rocket' },
  ],
  cta: { label: 'Kural Konfigürasyonu Oluştur', href: '#kurulum' },
};

export const BENTO_CONTENT = {
  title: ['Metrik toplamak kolay.', 'Sistemi ayakta tutmak asıl mesele.'],
  text: 'Zeropulse sana yalnızca ham sayılar vermez. Geçici sıçramaları eler, gerçek anomalileri yapılandırılmış olaylara dönüştürür ve kesintisiz çalışır.',
  next: {
    title: 'Sıfır Bağımlılık & Tek Binary',
    text: 'Go 1.22+ ile derlenen tek bir çalıştırılabilir dosya; harici veritabanı veya ajan orkestrasyonu gerektirmez.',
  },
  growth: {
    title: 'Ardışık Periyot & Cooldown Koruması',
    text: 'Anlık spike’ları filtreleyerek yanlış alarmları sıfıra indirir; cooldown süresiyle alarm fırtınalarını önler.',
    word: 'KARARLILIK',
    rings: [
      { from: 33, value: 66, label: '1. İhlal → İzle', size: 'sm' as const },
      { from: 66, value: 100, label: '3/3 Ardışık → Tetikle', size: 'lg' as const },
      { from: 100, value: 99, label: 'Cooldown → Koru', size: 'sm' as const },
    ],
  },
  process: {
    title: 'Gözlemlenebilirlik bir yük değil, sistem refleksi olmalıdır.',
    text: 'Collector’dan akan her snapshot, RuleEngine içinde milisaniyeler mertebesinde değerlendirilir ve doğrudan JSONL olarak stdout’a yazılır.',
  },
  gaps: {
    title: 'Panic İzolasyonu (recover)',
    text: 'Beklenmedik durumdaki tek bir kural motoru çökertemez; izole edilerek diğer kuralların izlenmesine devam edilir.',
  },
};

export const OPERATING_MODES_CONTENT: {
  title: string;
  text: string;
  paths: { icon: IconName; title: string; text: string }[];
} = {
  title: 'Her altyapının izleme ve müdahale modu aynı değildir.',
  text: 'Zeropulse; yerel geliştirmeden üretimdeki Docker kümelerine ve bare-metal sunuculara kadar ihtiyacın olan çalışma moduna anında uyum sağlar.',
  paths: [
    {
      icon: 'buildings',
      title: 'Docker Modu',
      text: 'Docker socket veya /.dockerenv üzerinden konteyner bazlı CPU, bellek, throttling ve ağ (RX/TX) metriklerini toplar.',
    },
    {
      icon: 'compass',
      title: 'Standalone Modu',
      text: 'Bare-metal ve VM Linux/FreeBSD sistemlerde host ve süreç bazlı CPU_PERCENT ile MEM_PERCENT izlemesi yapar.',
    },
    {
      icon: 'chartBar',
      title: 'Salt Telemetri (Varsayılan)',
      text: '--config verilmediğinde kural motorunu devre dışı bırakır; her 5 saniyede bir temiz JSON snapshot akışı üretir.',
    },
    {
      icon: 'flask',
      title: 'Simülasyon Modu (--dry-run)',
      text: 'Kuralları üretimde canlıya almadan önce test et; anomaliler "mode": "dry-run" etiketiyle aksiyon alınmadan loglansın.',
    },
    {
      icon: 'rocket',
      title: 'Remediation (Self-Healing)',
      text: 'Ardışık eşik aşıldığında ve cooldown uygun olduğunda olayı panele ve JSONL akışına yazar (NOTIFY) ya da adı verilen konteyneri yeniden başlatır (RESTART).',
    },
    {
      icon: 'presentationChart',
      title: 'UNIX stdout / stderr Ayrımı',
      text: 'Ham telemetri ve AnomalyEvent nesneleri stdout’a JSONL olarak, operasyonel slog kayıtları ise stderr’e yazılır.',
    },
  ],
};

export type MicroVizConfig =
  | { kind: 'segments'; value: number }
  | { kind: 'dots'; filled: number; total: number }
  | { kind: 'ticks'; count: number }
  | { kind: 'spark'; points: number[] }
  | { kind: 'bar'; value: number };

export const METRICS_SHOWCASE_CONTENT: {
  title: string;
  metrics: {
    label: string;
    value: number;
    start?: number;
    prefix?: string;
    unit?: string;
    icon: IconName;
    viz: MicroVizConfig;
  }[];
  statement: {
    lines: string[];
    icon: IconName;
  };
} = {
  title: 'Zeropulse ile sistem nabzını görünür hale getir.',
  metrics: [
    {
      label: 'Toplama Periyodu',
      value: 5,
      start: 0,
      unit: 'saniye',
      icon: 'flag',
      viz: { kind: 'segments', value: 100 },
    },
    {
      label: 'Desteklenen Metrik',
      value: 5,
      unit: 'kritik metrik',
      icon: 'puzzle',
      viz: { kind: 'dots', filled: 5, total: 5 },
    },
    {
      label: 'Durum Takibi',
      value: 100,
      unit: '% in-memory',
      icon: 'listChecks',
      viz: { kind: 'ticks', count: 12 },
    },
    {
      label: 'Gürültü Azaltma',
      value: 94,
      prefix: '%',
      unit: 'spike filtresi',
      icon: 'trend',
      viz: { kind: 'spark', points: [40, 55, 68, 79, 88, 94] },
    },
    {
      label: 'Çalışma Süresi',
      value: 100,
      start: 85,
      unit: '% panic-safe',
      icon: 'medal',
      viz: { kind: 'bar', value: 100 },
    },
  ],
  statement: {
    lines: ['Ortamını algıla.', 'Kurallarını tanımla.', 'Anomalileri yakala.'],
    icon: 'compass',
  },
};

export interface RulePreset {
  id: string;
  label: string;
  name: string;
  metric_type: 'CPU_PERCENT' | 'MEM_PERCENT' | 'CPU_THROTTLED_PERIODS' | 'NET_RX_BYTES' | 'NET_TX_BYTES';
  operator: 'GT' | 'GTE';
  threshold: number;
  consecutive_periods: number;
  action: 'NOTIFY' | 'RESTART';
  cooldown_seconds: number;
  container_filter: string;
  dry_run: boolean;
}

export const RULE_PRESETS: RulePreset[] = [
  {
    id: 'high-cpu',
    label: 'Yüksek CPU Uyarısı',
    name: 'high-cpu-alert',
    metric_type: 'CPU_PERCENT',
    operator: 'GTE',
    threshold: 85.0,
    consecutive_periods: 3,
    action: 'NOTIFY',
    cooldown_seconds: 60,
    container_filter: '',
    dry_run: true,
  },
  {
    id: 'critical-restart',
    label: 'Kritik CPU Yeniden Başlatma',
    name: 'critical-cpu-restart',
    metric_type: 'CPU_PERCENT',
    operator: 'GT',
    threshold: 95.0,
    consecutive_periods: 2,
    action: 'RESTART',
    cooldown_seconds: 300,
    container_filter: 'api-server',
    dry_run: false,
  },
  {
    id: 'high-memory',
    label: 'Bellek Sızıntısı Koruması',
    name: 'high-memory-warn',
    metric_type: 'MEM_PERCENT',
    operator: 'GTE',
    threshold: 90.0,
    consecutive_periods: 2,
    action: 'NOTIFY',
    cooldown_seconds: 120,
    container_filter: 'worker-node',
    dry_run: true,
  },
  {
    id: 'net-spike',
    label: 'Ağ Trafik Sıçraması (100 MB)',
    name: 'network-rx-spike',
    metric_type: 'NET_RX_BYTES',
    operator: 'GT',
    threshold: 104857600,
    consecutive_periods: 1,
    action: 'NOTIFY',
    cooldown_seconds: 30,
    container_filter: '',
    dry_run: true,
  },
];

export const FAQ_CONTENT = {
  title: 'Sık sorulan sorular.',
  items: [
    {
      question: 'Zeropulse çalışmak için veritabanı veya harici bir servis gerektirir mi?',
      answer:
        'Hayır. Zeropulse sıfır harici servis bağımlılığıyla tasarlanmıştır. Ardışık ihlal sayacı (StateTracker) ve bekleme süresi (CooldownTracker) tamamen bellek içinde (in-memory) tutulur.',
    },
    {
      question: 'Docker ve Standalone modları arasında nasıl geçiş yapılır?',
      answer:
        'Herhangi bir bayrak vermenize gerek yoktur. Zeropulse başlangıçta Docker socket veya /.dockerenv varlığını kontrol ederek ortamı otomatik tespit eder ve uygun toplayıcı döngüsünü başlatır.',
    },
    {
      question: 'Geçici CPU sıçramalarının (spike) yanlış alarm üretmesi nasıl engellenir?',
      answer:
        'Her kuralda tanımlanan consecutive_periods alanı sayesinde bir eşiğin yalnızca anlık aşılması yetmez; ardışık N toplama döngüsü boyunca eşik üzerinde kalması gerekir. Araya giren tek bir normal ölçüm sayacı sıfırlar.',
    },
    {
      question: 'Dry-run modu üretim ortamında nasıl kullanılır?',
      answer:
        './zeropulse --config rules.yaml --dry-run komutuyla çalıştırıldığında tüm kurallar gerçek zamanlı değerlendirilir ve AnomalyEvent nesneleri "mode": "dry-run" etiketiyle stdout akışına yazılır, ancak konteynerlere müdahale edilmez.',
    },
    {
      question: 'stdout ve stderr çıktıları neden ayrılmıştır?',
      answer:
        'UNIX felsefesine uygun olarak stdout yalnızca saf JSON metrik snapshot’larını ve AnomalyEvent nesnelerini taşır; böylece doğrudan jq veya log toplayıcılara pipe (|) edilebilir. Operasyonel log/slog mesajları ise stderr akışına yönlendirilir.',
    },
  ],
  delays: [0, 0, 103, 204, 303],
};

export const FOOTER_CONTENT = {
  brandTitle: 'ZEROPULSE',
  brandText:
    'Docker konteynerleri ve Standalone sistemler için hafif, sıfır bağımlılıklı gerçek zamanlı telemetri toplayıcı ve anomali tespit kural motoru.',
  columns: NAV_COLUMNS,
  wordmark: 'ZEROPULSE',
  credit: '© 2026 Zeropulse. MIT Lisansı altında açık kaynak.',
  social: [
    {
      label: 'Zeropulse GitHub',
      href: 'https://github.com/yasin2dev/zeropulse',
      icon: 'github' as IconName,
    },
  ],
};
