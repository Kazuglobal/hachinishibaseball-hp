import { Component, ChangeDetectionStrategy, OnInit, OnDestroy, signal, computed, PLATFORM_ID, Inject, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';
import { NgOptimizedImage, isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-works',
  templateUrl: './works.component.html',
  imports: [SectionTitleComponent, ObserveVisibilityDirective, NgOptimizedImage, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksComponent implements OnInit, OnDestroy {
  sectionVisible = signal(false);
  currentIndex = signal(0);
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
    if (width < 768) return 1; // モバイル: 1カード（横スライド）
    if (width < 1024) return 2; // タブレット: 2カード
    return 3; // デスクトップ: 3カード（グリッド）
  });

  cardWidth = computed(() => `${100 / this.cardsPerView()}%`);

  carouselTransform = computed(() => {
    const cardsPerView = this.cardsPerView();
    const maxIndex = Math.max(0, this.works.length - cardsPerView);
    const clampedIndex = Math.min(this.currentIndex(), maxIndex);
    return `translateX(-${clampedIndex * (100 / cardsPerView)}%)`;
  });

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private cdr: ChangeDetectorRef
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    // 初期表示を有効にする（モバイル画面での表示問題を解決）
    this.sectionVisible.set(true);
    
    if (this.isBrowser) {
      this.updateWindowWidth();
      this.resizeListener = () => this.updateWindowWidth();
      window.addEventListener('resize', this.resizeListener, { passive: true });
      this.preloadNextImages();
    }
    
    // モバイルのみ自動スライドを開始
    if (this.isBrowser && this.windowWidth() < 768) {
      this.startAutoSlide();
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
      
      // モバイル/デスクトップ切り替え時に自動スライドを制御
      if (wasMobile && !isMobile) {
        this.stopAutoSlide();
      } else if (!wasMobile && isMobile) {
        this.startAutoSlide();
      }
      
      this.cdr.markForCheck();
    }
  }

  private preloadNextImages(): void {
    const cardsPerView = this.cardsPerView();
    const preloadCount = Math.min(cardsPerView + 2, this.works.length);
    
    for (let i = 0; i < preloadCount; i++) {
      const img = new Image();
      img.src = this.works[i].image;
    }
  }

  private preloadImageForIndex(index: number): void {
    const normalizedIndex = index >= 0 ? index % this.works.length : (index % this.works.length + this.works.length) % this.works.length;
    if (normalizedIndex >= 0 && normalizedIndex < this.works.length) {
      const img = new Image();
      img.src = this.works[normalizedIndex].image;
    }
  }

  advanceSlide(): void {
    const cardsPerView = this.cardsPerView();
    const maxIndex = Math.max(0, this.works.length - cardsPerView);
    this.currentIndex.update(i => {
      const nextIndex = i + 1;
      const newIndex = nextIndex > maxIndex ? 0 : nextIndex;
      if (this.isBrowser) {
        this.preloadImageForIndex(newIndex + cardsPerView);
      }
      return newIndex;
    });
    this.cdr.markForCheck();
  }

  next(): void {
    const cardsPerView = this.cardsPerView();
    const maxIndex = Math.max(0, this.works.length - cardsPerView);
    this.currentIndex.update(i => {
      const nextIndex = i + 1;
      const newIndex = nextIndex > maxIndex ? 0 : nextIndex;
      if (this.isBrowser) {
        this.preloadImageForIndex(newIndex + cardsPerView);
      }
      return newIndex;
    });
    this.resetAutoSlide();
    this.cdr.markForCheck();
  }

  prev(): void {
    const cardsPerView = this.cardsPerView();
    const maxIndex = Math.max(0, this.works.length - cardsPerView);
    this.currentIndex.update(i => {
      const prevIndex = i - 1;
      const newIndex = prevIndex < 0 ? maxIndex : prevIndex;
      if (this.isBrowser) {
        this.preloadImageForIndex(newIndex - 1);
      }
      return newIndex;
    });
    this.resetAutoSlide();
    this.cdr.markForCheck();
  }

  startAutoSlide(): void {
    // モバイルのみ自動スライド
    if (this.isBrowser && this.windowWidth() < 768) {
      this.stopAutoSlide();
      this.intervalId = setInterval(() => {
        this.advanceSlide();
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

  // スワイプ操作のハンドラー
  onTouchStart(event: TouchEvent): void {
    if (this.windowWidth() < 768) {
      this.touchStartX = event.touches[0].clientX;
      this.isTouching = true;
      this.stopAutoSlide();
    }
  }

  onTouchMove(event: TouchEvent): void {
    // スワイプ中は自動スライドを停止
    if (this.windowWidth() < 768) {
      this.isTouching = true;
    }
  }

  onTouchEnd(event: TouchEvent): void {
    if (this.windowWidth() < 768) {
      this.touchEndX = event.changedTouches[0].clientX;
      this.handleSwipe();
      this.isTouching = false;
      // タッチ操作後、少し遅延してから自動スライドを再開
      setTimeout(() => {
        if (!this.isTouching) {
          this.startAutoSlide();
        }
      }, 3000);
    }
  }

  private handleSwipe(): void {
    const swipeThreshold = 50; // スワイプの最小距離
    const diff = this.touchStartX - this.touchEndX;

    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        // 左にスワイプ（次へ）
        this.next();
      } else {
        // 右にスワイプ（前へ）
        this.prev();
      }
    }
  }

  // 現在のページ数を計算（インジケーター用）
  get totalPages(): number {
    return this.works.length;
  }

  get currentPage(): number {
    return this.currentIndex() + 1;
  }

  // インジケーター用の配列を生成
  get pages(): number[] {
    return Array.from({ length: this.works.length }, (_, i) => i);
  }

  // ページインジケーターをクリックした時の処理
  goToPage(page: number): void {
    this.currentIndex.set(page);
    this.stopAutoSlide();
    setTimeout(() => {
      if (this.isBrowser && this.windowWidth() < 768) {
        this.startAutoSlide();
      }
    }, 3000);
    this.cdr.markForCheck();
  }

  // ナビゲーションボタン用の処理
  handlePrev(): void {
    this.prev();
    this.stopAutoSlide();
    setTimeout(() => {
      if (this.isBrowser && this.windowWidth() < 768) {
        this.startAutoSlide();
      }
    }, 3000);
  }

  handleNext(): void {
    this.next();
    this.stopAutoSlide();
    setTimeout(() => {
      if (this.isBrowser && this.windowWidth() < 768) {
        this.startAutoSlide();
      }
    }, 3000);
  }
  works = [
    { 
      id: 'newyear-ob-2025',
      image: '/assets/images/newyear-ob-2025.jpg', 
      category: 'イベントレポート', 
      title: '新年OB会', 
      date: '2025年1月2日',
      content: '新年の幕開けとともに、パークホテルに野球部OBの皆様が集いました。毎年恒例となっている八戸西高校野球部OB会が、今年も1月2日午後3時より開催され、世代を超えた絆を深める貴重な機会となりました。会場にはOBで現役プロ野球選手の日本ハムファイターズ福島投手も駆けつけ、OBたちとの交流を深めました。また、現役大学生も参加し、先輩OBたちから貴重な経験談に熱心に耳を傾ける姿が印象的でした。',
      additionalImages: ['/assets/images/newyear-ob-2025-2.jpg'],
      delay: '' 
    },
    { 
      id: 'gonohe-festival-2024',
      image: '/assets/images/gonohe-festival-2024.jpg', 
      category: '支援活動', 
      title: '五戸まつりへの参加', 
      date: '2024年12月18日',
      content: '私たち硬式野球部は、今年の五戸まつりで山車の引き子として参加させていただきました。坂道の多い町で山車を引くのは想像以上に力が必要でしたが、日頃の野球部での体力トレーニングが活きたと感じています。部員一同、地域の伝統行事に携われたことを誇りに思っています。そんな私たちの活動を評価していただき、18日に五戸お祭りライオンズクラブ（三浦浩会長）から、活動に必要な練習球約10万円相当を寄贈いただきました。',
      delay: 'delay-200' 
    },
    { 
      id: 'support-school-exchange-2024',
      image: '/assets/images/support-school-exchange-2024.jpg', 
      category: '交流会', 
      title: '八戸高等支援学校との交流', 
      date: '2024年11月11日',
      content: '今日は八戸高等支援学校との交流を行いました。午前中は7つの班に分かれて普通科の生徒さんと一緒に作業をし、昼食は産業科の生徒さんが作ったカレーをいただきました。午後は普段使っているボールの修繕も体験できました。感謝の気持ち、人に優しく接する事、道具を大切にする事、インクルーシブ教育の大切さ等、たくさん学んだ一日でした。',
      delay: 'delay-400' 
    },
    { 
      id: 'practice-game-komadai-2024',
      image: '/assets/images/practice-game-komadai-2024.jpg', 
      category: '練習試合', 
      title: '今年最後の練習試合（駒大苫小牧）', 
      date: '2024年11月9日',
      content: '今年最後の練習試合は駒大苫小牧高校さんと行いました。試合後は両校合同で本校の合宿所に泊まり、楽しい夕食を共に過ごしました。また、試合後にはメンタルトレーナーの津村さんにも振り返りをしていただき、充実した内容の合宿になりそうです。この合宿では、洗濯や布団の準備、部屋の掃除など、生活力の向上も目的としています。',
      delay: '' 
    },
    { 
      id: 'ground-closing-2024',
      image: '/assets/images/ground-closing-2024.jpg', 
      category: 'イベントレポート', 
      title: 'グランド納めと３年生を送る会', 
      date: '2024年11月3日',
      content: '11月3日(日)グラウンド納めと3年生を送る会が行われました。グラウンド納めでは3年生対OBチームの試合が行われ、結果は6対7でOBチームのサヨナラ勝ちとなりました！3年生もOBも久しぶりの試合を楽しみ、全力でプレーしていました。3年生を送る会では1、2年生から色紙のプレゼントや余興などがありました。OB会からは榎本会長(10期生)より印鑑の贈呈と祝辞がありました。',
      delay: 'delay-200' 
    },
    { 
      id: 'anniversary-lecture-2024',
      image: '/assets/images/anniversary-lecture-2024.jpg', 
      category: 'イベントレポート', 
      title: '記念講演 斎藤寛仁さん(25期)', 
      date: '2024年11月1日',
      content: '11月1日(金)八戸西高校50周年記念式典、記念講演が行われました。記念講演の中では野球部OBの斎藤寛仁さん(25期生)が声優としての経験談や実際にアフレコなどをしてくださいました。目の前で見るプロのアフレコは圧巻でした。八戸西高校50周年おめでとうございます。',
      delay: 'delay-400' 
    },
    { 
      id: 'ai-workshop-2024',
      image: '/assets/images/ai-workshop-2024.jpg', 
      category: 'その他', 
      title: 'AIワークショップ', 
      date: '2024年8月8日',
      content: '8月8日（木）、AIを活用した質問力向上のワークショップを開催しました。この取り組みは、限られた練習時間を有効活用するためのAI導入を目的としています。ワークショップには、テクノロジー法務の専門家である金子晋輔弁護士と大舘さん（30期）が講師として参加し、AIの可能性や法的・倫理的側面について指導しました。部員たちは、AIを活用して練習メニューを作成し、その提案を批判的に評価することで、AIの効果的な活用方法を学びました。',
      additionalImages: ['/assets/images/ai-workshop-2024-2.jpg'],
      delay: '' 
    },
  ];
}