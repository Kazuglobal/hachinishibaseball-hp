import { Component, ChangeDetectionStrategy, signal, computed, OnInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-owners-voice',
  templateUrl: './owners-voice.component.html',
  imports: [SectionTitleComponent, ObserveVisibilityDirective, NgOptimizedImage, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnersVoiceComponent implements OnInit, OnDestroy {
  sectionVisible = signal(false);
  private isBrowser: boolean;

  voices = [
    {
      id: 'hayashino-satoshi',
      image: 'https://picsum.photos/seed/alumni1/800/1000',
      title: '野球部での経験が、今の自分の礎です。',
      family: '32期生 - 林野 智 様',
    },
    {
      id: 'coming-soon-2',
      image: 'https://picsum.photos/seed/alumni2/800/1000',
      title: '出会えたことに感謝しています。',
      family: '平成15年度卒 - 佐藤 次郎 様',
    },
    {
      id: 'coming-soon-3',
      image: 'https://picsum.photos/seed/alumni3/800/1000',
      title: '現役選手たちの活躍が、何よりの励みになります。',
      family: '平成20年度卒 - 鈴木 三郎 様',
    },
    {
      id: 'coming-soon-4',
      image: 'https://picsum.photos/seed/alumni4/800/1000',
      title: '八戸西の野球魂を、次の世代に繋いでいきたい。',
      family: '平成25年度卒 - 高橋 四郎 様',
    },
  ];
  
  currentIndex = signal(0);
  windowWidth = signal(1024);
  
  // 画面サイズに応じた表示カード数
  cardsPerView = computed(() => {
    const width = this.windowWidth();
    if (width < 768) return 1; // モバイル: 1カード
    if (width < 1024) return 2; // タブレット: 2カード
    return 4; // デスクトップ: 4カード
  });
  
  cardWidth = computed(() => `${100 / this.cardsPerView()}%`);
  carouselTransform = computed(() => {
    const cardsPerView = this.cardsPerView();
    const maxIndex = Math.max(0, this.voices.length - cardsPerView);
    const clampedIndex = Math.min(this.currentIndex(), maxIndex);
    return `translateX(-${clampedIndex * (100 / cardsPerView)}%)`;
  });

  private intervalId: any;
  private resizeListener?: () => void;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (this.isBrowser) {
      this.updateWindowWidth();
      this.resizeListener = () => this.updateWindowWidth();
      window.addEventListener('resize', this.resizeListener, { passive: true });
      // 次の画像を事前にプリロード
      this.preloadNextImages();
    }
    this.startAutoSlide();
  }

  private preloadNextImages(): void {
    // 表示される可能性のある画像を事前に読み込む
    const cardsPerView = this.cardsPerView();
    const preloadCount = Math.min(cardsPerView + 1, this.voices.length);
    
    for (let i = 0; i < preloadCount; i++) {
      const img = new Image();
      img.src = this.voices[i].image;
    }
  }

  ngOnDestroy(): void {
    this.stopAutoSlide();
    if (this.isBrowser && this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
  }

  private updateWindowWidth(): void {
    if (this.isBrowser) {
      this.windowWidth.set(window.innerWidth);
    }
  }

  advanceSlide(): void {
    const cardsPerView = this.cardsPerView();
    const maxIndex = Math.max(0, this.voices.length - cardsPerView);
    this.currentIndex.update(i => {
      const nextIndex = i + 1;
      const newIndex = nextIndex > maxIndex ? 0 : nextIndex;
      // 次の画像を事前にプリロード
      if (this.isBrowser) {
        this.preloadImageForIndex(newIndex + cardsPerView);
      }
      return newIndex;
    });
  }

  private preloadImageForIndex(index: number): void {
    // インデックスを範囲内に正規化
    const normalizedIndex = index >= 0 ? index % this.voices.length : (index % this.voices.length + this.voices.length) % this.voices.length;
    if (normalizedIndex >= 0 && normalizedIndex < this.voices.length) {
      const img = new Image();
      img.src = this.voices[normalizedIndex].image;
    }
  }

  next(): void {
    const cardsPerView = this.cardsPerView();
    const maxIndex = Math.max(0, this.voices.length - cardsPerView);
    this.currentIndex.update(i => {
      const nextIndex = i + 1;
      const newIndex = nextIndex > maxIndex ? 0 : nextIndex;
      // 次の画像を事前にプリロード
      if (this.isBrowser) {
        this.preloadImageForIndex(newIndex + cardsPerView);
      }
      return newIndex;
    });
    this.resetAutoSlide();
  }

  prev(): void {
    const cardsPerView = this.cardsPerView();
    const maxIndex = Math.max(0, this.voices.length - cardsPerView);
    this.currentIndex.update(i => {
      const prevIndex = i - 1;
      const newIndex = prevIndex < 0 ? maxIndex : prevIndex;
      // 前の画像を事前にプリロード（ループを考慮）
      if (this.isBrowser) {
        const preloadIndex = newIndex - 1;
        this.preloadImageForIndex(preloadIndex);
      }
      return newIndex;
    });
    this.resetAutoSlide();
  }

  startAutoSlide(): void {
    this.stopAutoSlide(); // Prevent multiple intervals
    this.intervalId = setInterval(() => {
      this.advanceSlide();
    }, 4000);
  }

  stopAutoSlide(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  resetAutoSlide(): void {
    this.startAutoSlide();
  }
}
