import { Component, ChangeDetectionStrategy, OnInit, OnDestroy, signal, computed, PLATFORM_ID, Inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NgOptimizedImage } from '@angular/common';

interface ActiveAlumni {
  period: string;
  name: string;
  team: string;
  position: string;
  note: string;
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
  
  // 福島蓮選手のメイン情報
  fukushimaInfo = {
    period: '45期',
    name: '福島 蓮',
    team: '北海道日本ハムファイターズ',
    position: '投手',
    description: '今季５勝を挙げ勝率1.000の好成績をおさめクライマックスシリーズにも登板しました！私たちOB会一同、福島選手の活躍を心から祝福し、更なる飛躍を期待しています。',
    message: '目指せ、日本ハムのエース！来シーズンも福島蓮選手への熱い応援をよろしくお願いします！',
    profileUrl: 'https://media.fighters.co.jp/player/94/',
    mainVideo: 'https://www.youtube.com/embed/qwNSVgz7pPY',
    videos: [
      'https://www.youtube.com/embed/0gzmhnoMEtc',
      'https://www.youtube.com/embed/5nEeOwuVlyg',
      'https://www.youtube.com/embed/e-WA7cYmV5I',
      'https://www.youtube.com/embed/FIGkQhN6YIk',
      'https://www.youtube.com/embed/GY1X0xAQ2i8'
    ]
  };

  // 現役活躍OB情報
  activeAlumni: ActiveAlumni[] = [
    { period: '34期', name: '長井 正哉', team: '北海道日本ハムファイターズ', position: 'トレーナー', note: '3年目' },
    { period: '40期', name: '竹本 祐瑛', team: 'JR東日本東北', position: '投手', note: '4年目' },
    { period: '44期', name: '沢田 浩太', team: '札幌国際大学', position: '内野手', note: '4年' },
    { period: '45期', name: '相前 雄一朗', team: '城西大学', position: '内野手', note: '3年' },
    { period: '45期', name: '宮崎 一綺', team: '清和大学', position: '内野手', note: '3年' },
    { period: '45期', name: '福島 蓮', team: '北海道日本ハムファイターズ', position: '投手', note: '3年目' },
    { period: '45期', name: '大釜 温斗', team: '清和大学', position: '捕手', note: '3年' },
    { period: '45期', name: '藤本 楓都', team: '帝京平成大学', position: '捕手', note: '3年' },
    { period: '45期', name: '村上 歩夢', team: '獨協大学', position: '外野手', note: '3年' },
    { period: '45期', name: '平内 友悠', team: '青森中央学院大学', position: '投手', note: '3年' },
    { period: '45期', name: '津嶋 優吉', team: '青森中央学院大学', position: '外野手', note: '3年' },
    { period: '45期', name: '廣田 大和', team: '東北マークス', position: '投手', note: '3年目' },
    { period: '45期', name: '桐山 大空', team: '青森中央学院大学', position: '内野手', note: '3年' },
    { period: '46期', name: '椛木 聡斗', team: '札幌国際大学', position: '投手', note: '2年' },
    { period: '47期', name: '吉田 知史', team: '札幌国際大学', position: '外野手', note: '1年' },
    { period: '47期', name: '大平 翔琉', team: '青森中央学院大学', position: '外野手', note: '1年' },
    { period: '47期', name: '村上 流聖', team: '清和大学', position: '内野手', note: '1年' },
    { period: '47期', name: '小山石 花隠', team: '中央学院大学', position: 'マネージャー', note: '1年' }
  ];

  // OB情報カード（4人分）
  alumniCards: AlumniCard[] = [
    {
      period: '21期',
      name: '中村 渉',
      team: '中村畳工店',
      position: '代表',
      achievement: 'nakamuratatami.jimdofree.com/',
      image: 'https://picsum.photos/seed/alumni-nakamura/800/600'
    },
    {
      period: '25期',
      name: '宝田 賀充',
      team: '株式会社たから',
      position: '代表',
      achievement: 'takara229.base.shop/',
      image: 'https://picsum.photos/seed/alumni-takara/800/600'
    },
    {
      period: '29期',
      name: '児玉 淳一郎',
      team: '株式会社サン・ベンディング',
      position: '代表',
      achievement: 'sunvending-hachinohe.jp/',
      image: 'https://picsum.photos/seed/alumni-kodama/800/600'
    },
    {
      period: '33期',
      name: '上野 衆',
      team: '株式会社創電工業',
      position: '代表',
      achievement: 'souden-kougyou.site/',
      image: 'https://picsum.photos/seed/alumni-ueno/800/600'
    }
  ];

  constructor(
    private sanitizer: DomSanitizer,
    @Inject(PLATFORM_ID) platformId: object,
    private cdr: ChangeDetectorRef
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    this.isVisible.set(true);
    
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

  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}

