import { Component, ChangeDetectionStrategy, OnInit, OnDestroy, signal, computed, PLATFORM_ID, Inject, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NgOptimizedImage } from '@angular/common';
import { SEOService } from '../../services/seo.service';

interface ActiveAlumni {
  period: string;
  name: string;
  team: string;
  position: string;
  note: string;
  links?: string[];
}

interface AlumniCard {
  period: string;
  name: string;
  team: string;
  position: string;
  achievement?: string;
  image: string;
}

@Component({
  selector: 'app-alumni-activities',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    SectionTitleComponent,
    BackButtonComponent,
    ObserveVisibilityDirective,
    NgOptimizedImage
  ],
  templateUrl: './alumni-activities.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlumniActivitiesComponent implements OnInit, OnDestroy {
  isVisible = signal(false);
  cardIndex = signal(0);
  windowWidth = signal(1024);
  private isBrowser: boolean;
  private readonly YOUTUBE_EMBED_HOST = 'www.youtube.com';
  private intervalId: any;
  private resizeListener?: () => void;
  private touchStartX = 0;
  private touchEndX = 0;
  private isTouching = false;

  // 画面サイズに応じた表示カード数
  cardsPerView = computed(() => {
    const width = this.windowWidth();
    if (width < 768) return 1.2; // モバイル: 1.2カード（横スライド、少し見える）
    if (width < 1024) return 2; // タブレット: 2カード
    return 4; // デスクトップ: 4カード（グリッド）
  });

  cardWidth = computed(() => {
    const cardsPerView = this.cardsPerView();
    return `${100 / cardsPerView}%`;
  });

  carouselTransform = computed(() => {
    const cardsPerView = this.cardsPerView();
    const maxIndex = Math.max(0, this.alumniCards.length - Math.floor(cardsPerView));
    const clampedIndex = Math.min(this.cardIndex(), maxIndex);
    return `translateX(-${clampedIndex * (100 / cardsPerView)}%)`;
  });

  // モバイル判定
  isMobile = computed(() => {
    return this.windowWidth() < 768;
  });
  
  // 福島蓮選手のメイン情報
  fukushimaInfo = {
    period: '45期',
    name: '福島 蓮',
    team: '北海道日本ハムファイターズ',
    position: '投手',
    description: '今季５勝を挙げ勝率1.000の好成績をおさめクライマックスシリーズにも登板しました！私たちOB会一同、福島選手の活躍を心から祝福し、更なる飛躍を期待しています。',
    message: '目指せ、日本ハムのエース！来シーズンも福島蓮選手への熱い応援をよろしくお願いします！',
    profileUrl: 'https://media.fighters.co.jp/player/94/',
    mainVideo: 'https://youtu.be/qwNSVgz7pPY',
    videos: [
      'https://youtu.be/0gzmhnoMEtc',
      'https://youtu.be/5nEeOwuVlyg',
      'https://youtu.be/e-WA7cYmV5I',
      'https://youtu.be/FIGkQhN6YIk',
      'https://youtu.be/GY1X0xAQ2i8'
    ]
  };

  // 竹本祐瑛選手のメイン情報
  takemotoInfo = {
    period: '40期',
    name: '竹本 祐瑛',
    team: 'JR東日本東北',
    position: '投手',
    note: '4年目',
    description: 'JR東日本東北で活躍する竹本祐瑛選手。4年目を迎え、チームの主力投手として活躍しています。',
    message: '竹本祐瑛選手の更なる活躍を期待しています！',
    image: '/assets/images/takemoto.png',
    imageSource: 'nikkansports.com',
    links: [
      'https://sports.yahoo.co.jp/official/detail/2025063000149-spnaviow',
      'https://www.nikkansports.com/baseball/news/202509030000882.html'
    ]
  };

  // 現役活躍OB情報
  activeAlumni: ActiveAlumni[] = [
    { period: '34期', name: '長井 正哉', team: '北海道日本ハムファイターズ', position: 'トレーナー', note: '3年目' },
    { period: '45期', name: '相前 雄一朗', team: '城西大学', position: '内野手', note: '4年' },
    { period: '45期', name: '宮崎 一綺', team: '清和大学', position: '内野手', note: '4年' },
    { period: '45期', name: '大釜 温斗', team: '清和大学', position: '捕手', note: '4年' },
    { period: '45期', name: '藤本 楓都', team: '帝京平成大学', position: '捕手', note: '4年' },
    { period: '45期', name: '村上 歩夢', team: '獨協大学', position: '外野手', note: '4年' },
    { period: '45期', name: '平内 友悠', team: '青森中央学院大学', position: '投手', note: '4年' },
    { period: '45期', name: '津嶋 優吉', team: '青森中央学院大学', position: '外野手', note: '4年' },
    { period: '45期', name: '廣田 大和', team: '東北マークス', position: '投手', note: '4年目' },
    { period: '45期', name: '桐山 大空', team: '青森中央学院大学', position: '内野手', note: '4年' },
    { period: '46期', name: '椛木 聡斗', team: '札幌国際大学', position: '投手', note: '3年' },
    { period: '47期', name: '吉田 知史', team: '札幌国際大学', position: '外野手', note: '2年' },
    { period: '47期', name: '大平 翔琉', team: '青森中央学院大学', position: '外野手', note: '2年' },
    { period: '47期', name: '村上 流聖', team: '清和大学', position: '内野手', note: '2年' },
    { period: '47期', name: '小山石 花隠', team: '中央学院大学', position: 'マネージャー', note: '2年' },
    { period: '48期', name: '工藤 柊也', team: '八戸工業大学', position: '投手', note: '1年' },
    { period: '48期', name: '田中 咲多', team: '八戸工業大学', position: '捕手', note: '1年' },
    { period: '48期', name: '田中 我空', team: '八戸工業大学', position: '外野手', note: '1年' },
    { period: '48期', name: '大沢 瑛太郎', team: '東北学院大学', position: '投手', note: '1年' }
  ];

  // OB情報カード（4人分）
  alumniCards: AlumniCard[] = [
    {
      period: '21期',
      name: '中村 渉',
      team: '中村畳工店',
      position: '代表',
      achievement: 'nakamuratatami.jimdofree.com/',
      image: '/assets/images/alumni-nakamura.jpg'
    },
    {
      period: '25期',
      name: '宝田 賀充',
      team: '株式会社たから',
      position: '代表',
      achievement: 'takara229.base.shop/',
      image: '/assets/images/alumni-takara.jpg'
    },
    {
      period: '29期',
      name: '児玉 淳一郎',
      team: '株式会社サン・ベンディング',
      position: '代表',
      achievement: 'sunvending-hachinohe.jp/',
      image: '/assets/images/alumni-kodama.jpg'
    },
    {
      period: '33期',
      name: '上野 衆',
      team: '株式会社創電工業',
      position: '代表',
      achievement: 'souden-kougyou.site/',
      image: '/assets/images/alumni-ueno.jpg'
    }
  ];

  private seoService = inject(SEOService);

  constructor(
    private sanitizer: DomSanitizer,
    @Inject(PLATFORM_ID) platformId: object,
    private cdr: ChangeDetectorRef
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    this.isVisible.set(true);
    
    // SEO設定
    this.seoService.updateSEO({
      title: 'OB活躍情報',
      description: '八戸西高等学校野球部OBの活躍情報を掲載。プロ野球で活躍する福島蓮選手（日本ハムファイターズ）をはじめ、現役で活躍するOBの情報を動画とプロフィールで紹介しています。',
      keywords: 'OB活躍情報,福島蓮,日本ハムファイターズ,八戸西野球OB,プロ野球選手,高校野球OB,青森県野球',
      url: 'https://hachinishibaseball-ob.com/alumni-activities'
    });

    // 動画ページ用の構造化データを追加
    if (this.fukushimaInfo.mainVideo) {
      const videoId = this.getVideoId(this.fukushimaInfo.mainVideo);
      this.seoService.addVideoStructuredData({
        name: `福島蓮選手の活躍動画 - ${this.fukushimaInfo.name}`,
        description: this.fukushimaInfo.description,
        thumbnailUrl: this.getThumbnailUrl(videoId, 'high'),
        uploadDate: new Date().toISOString(),
        contentUrl: this.getWatchUrl(this.fukushimaInfo.mainVideo)
      });
    }
    
    if (this.isBrowser) {
      this.updateWindowWidth();
      this.resizeListener = () => this.updateWindowWidth();
      window.addEventListener('resize', this.resizeListener, { passive: true });
      // モバイルのみ自動スライドを開始
      if (this.windowWidth() < 768) {
        this.startAutoSlide();
      }
    }
  }

  ngOnDestroy() {
    this.stopAutoSlide();
    if (this.isBrowser && this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
  }

  private updateWindowWidth(): void {
    if (this.isBrowser) {
      const newWidth = window.innerWidth;
      const wasMobile = this.windowWidth() < 768;
      const isMobile = newWidth < 768;
      
      this.windowWidth.set(newWidth);
      
      if (wasMobile && !isMobile) {
        this.stopAutoSlide();
      } else if (!wasMobile && isMobile) {
        this.startAutoSlide();
      }
      
      this.cdr.markForCheck();
    }
  }

  // スワイプ操作のハンドラー
  onTouchStart(event: TouchEvent): void {
    if (this.windowWidth() < 768) {
      this.touchStartX = event.touches[0].clientX;
      this.isTouching = true;
      this.stopAutoSlide();
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (this.windowWidth() < 768) {
      this.isTouching = true;
    }
  }

  onTouchEnd(event: TouchEvent): void {
    if (this.windowWidth() < 768) {
      this.touchEndX = event.changedTouches[0].clientX;
      this.handleSwipe();
      this.isTouching = false;
      setTimeout(() => {
        if (!this.isTouching) {
          this.startAutoSlide();
        }
      }, 3000);
    }
  }

  private handleSwipe(): void {
    const swipeThreshold = 50;
    const diff = this.touchStartX - this.touchEndX;

    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        this.nextCard();
      } else {
        this.prevCard();
      }
    }
  }

  nextCard(): void {
    const cardsPerView = this.cardsPerView();
    const maxIndex = Math.max(0, this.alumniCards.length - Math.floor(cardsPerView));
    this.cardIndex.update(i => {
      const nextIndex = i + 1;
      return nextIndex > maxIndex ? 0 : nextIndex;
    });
    this.resetAutoSlide();
    this.cdr.markForCheck();
  }

  prevCard(): void {
    const cardsPerView = this.cardsPerView();
    const maxIndex = Math.max(0, this.alumniCards.length - Math.floor(cardsPerView));
    this.cardIndex.update(i => {
      const prevIndex = i - 1;
      return prevIndex < 0 ? maxIndex : prevIndex;
    });
    this.resetAutoSlide();
    this.cdr.markForCheck();
  }

  goToCard(index: number): void {
    this.cardIndex.set(index);
    this.stopAutoSlide();
    setTimeout(() => {
      if (this.isBrowser && this.windowWidth() < 768) {
        this.startAutoSlide();
      }
    }, 3000);
    this.cdr.markForCheck();
  }

  advanceCard(): void {
    const cardsPerView = this.cardsPerView();
    const maxIndex = Math.max(0, this.alumniCards.length - Math.floor(cardsPerView));
    this.cardIndex.update(i => {
      const nextIndex = i + 1;
      return nextIndex > maxIndex ? 0 : nextIndex;
    });
    this.cdr.markForCheck();
  }

  startAutoSlide(): void {
    if (this.isBrowser && this.windowWidth() < 768) {
      this.stopAutoSlide();
      this.intervalId = setInterval(() => {
        this.advanceCard();
      }, 4000);
    }
  }

  stopAutoSlide(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  resetAutoSlide(): void {
    if (this.isBrowser && this.windowWidth() < 768) {
      this.startAutoSlide();
    }
  }

  get totalCardPages(): number {
    return this.alumniCards.length;
  }

  get pages(): number[] {
    return Array.from({ length: this.alumniCards.length }, (_, i) => i);
  }

  // YouTubeのvideoIdを抽出
  getVideoId(url: string): string {
    if (!url || typeof url !== 'string') {
      return '';
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      if (hostname === 'youtu.be') {
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        return pathParts[0]?.split('?')[0].split('#')[0].trim() || '';
      } else if (hostname.includes('youtube.com')) {
        const segments = urlObj.pathname.split('/').filter(Boolean);
        if (segments[0] === 'embed' && segments[1]) {
          return segments[1];
        } else if (urlObj.pathname === '/watch') {
          return urlObj.searchParams.get('v') || '';
        }
      }
    } catch (e) {
      // URL解析に失敗した場合のフォールバック
      const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|watch\?v=))([^?&#]+)/);
      return match ? match[1] : '';
    }

    return '';
  }

  // YouTubeのサムネイル画像URLを取得
  getThumbnailUrl(videoId: string, quality: 'default' | 'medium' | 'high' | 'maxres' = 'maxres'): string {
    if (!videoId) {
      return '';
    }
    // maxresdefault.jpgが存在しない場合は、hqdefault.jpgにフォールバック
    const qualityMap: Record<string, string> = {
      'maxres': 'maxresdefault',
      'high': 'hqdefault',
      'medium': 'mqdefault',
      'default': 'default'
    };
    return `https://i.ytimg.com/vi/${videoId}/${qualityMap[quality] || 'hqdefault'}.jpg`;
  }

  // 画像エラーハンドリング
  handleImageError(event: Event, videoId: string): void {
    const img = event.target as HTMLImageElement;
    if (img && videoId) {
      // 高解像度が失敗した場合は、中解像度にフォールバック
      if (img.src.includes('hqdefault')) {
        img.src = this.getThumbnailUrl(videoId, 'medium');
      } else if (img.src.includes('mqdefault')) {
        img.src = this.getThumbnailUrl(videoId, 'default');
      }
    }
  }

  // YouTubeの再生URLを取得（モバイル用）
  getWatchUrl(url: string): string {
    const videoId = this.getVideoId(url);
    if (!videoId) {
      return url;
    }
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  getSafeUrl(url: string): SafeResourceUrl {
    // モバイルではiframeを使用しないため、空のURLを返す
    if (this.isMobile()) {
      return this.sanitizer.bypassSecurityTrustResourceUrl('');
    }

    // YouTubeのURLパラメータを最適化（確実に動作する最小限の設定）
    if (!url || typeof url !== 'string') {
      return this.sanitizer.bypassSecurityTrustResourceUrl('');
    }

    try {
      // 完全なURLかどうかを確認
      let urlObj: URL;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        urlObj = new URL(url);
      } else {
        // 相対URLの場合は、https://www.youtube.comをベースにする
        urlObj = new URL(url, 'https://www.youtube.com');
      }
      
      urlObj = this.ensureNoCookieEmbedUrl(urlObj);
      
      // 既存のパラメータをクリアして、確実に動作する最小限のパラメータのみ設定
      urlObj.search = ''; // 既存のパラメータをクリア
      
      // 確実に動作する最小限のパラメータ
      urlObj.searchParams.set('rel', '0'); // 関連動画を非表示
      urlObj.searchParams.set('playsinline', '1'); // iOS Safariでインライン再生を有効化（必須）
      urlObj.searchParams.set('controls', '1'); // コントロールを表示
      urlObj.searchParams.set('modestbranding', '1'); // YouTubeロゴを小さく
      urlObj.searchParams.set('enablejsapi', '0'); // JavaScript APIを無効化（モバイルでの問題を回避）
      
      const finalUrl = urlObj.toString();
      return this.sanitizer.bypassSecurityTrustResourceUrl(finalUrl);
    } catch (e) {
      // URL解析に失敗した場合は、シンプルなフォールバック処理
      const baseParams = 'rel=0&playsinline=1&controls=1&modestbranding=1';
      const fallbackUrl = this.ensureFallbackNoCookieUrl(url);
      const separator = fallbackUrl.includes('?') ? '&' : '?';
      const optimizedUrl = `${fallbackUrl}${separator}${baseParams}`;
      return this.sanitizer.bypassSecurityTrustResourceUrl(optimizedUrl);
    }
  }

  private ensureNoCookieEmbedUrl(urlObj: URL): URL {
    const hostname = urlObj.hostname.toLowerCase();
    const isYouTubeHost = hostname.includes('youtube.com') || hostname === 'youtu.be';
    if (!isYouTubeHost) {
      return urlObj;
    }

    let videoId = '';

    if (hostname === 'youtu.be') {
      // youtu.be/VIDEO_ID の形式からvideoIdを抽出
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      videoId = pathParts[0] || '';
      // クエリパラメータやハッシュが含まれている場合は除去
      if (videoId) {
        videoId = videoId.split('?')[0].split('#')[0].trim();
      }
    } else {
      const segments = urlObj.pathname.split('/').filter(Boolean);
      if (segments[0] === 'embed' && segments[1]) {
        videoId = segments[1];
      } else if (segments[0] === 'shorts' && segments[1]) {
        videoId = segments[1];
      } else if (urlObj.pathname === '/watch') {
        videoId = urlObj.searchParams.get('v') ?? '';
      }
    }

    // videoIdが取得できない場合は元のURLを返す
    if (!videoId) {
      return urlObj;
    }

    // 新しいURLオブジェクトを作成（通常のyoutube.comを使用して確実に動作）
    const sanitizedUrl = new URL(`https://${this.YOUTUBE_EMBED_HOST}/embed/${videoId}`);
    
    return sanitizedUrl;
  }

  private ensureFallbackNoCookieUrl(url: string): string {
    if (!url) {
      return '';
    }

    const trimmed = url.trim();
    const shortUrlNeedle = 'youtu.be/';

    if (trimmed.includes(shortUrlNeedle)) {
      const parts = trimmed.split(shortUrlNeedle);
      const rest = parts[1] ?? '';
      const videoId = rest.split(/[?&#]/)[0];
      if (videoId) {
        return `https://${this.YOUTUBE_EMBED_HOST}/embed/${videoId}`;
      }
    }

    return trimmed.replace(/https?:\/\/(?:www\.)?youtube\.com/gi, `https://${this.YOUTUBE_EMBED_HOST}`);
  }
}

