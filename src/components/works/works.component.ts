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
    
    // 日付順にソート（最新が上）
    this.works.sort((a, b) => {
      const dateA = this.parseDate(a.date);
      const dateB = this.parseDate(b.date);
      return dateB.getTime() - dateA.getTime(); // 降順（新しい順）
    });
    
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

  // 日付文字列をDateオブジェクトに変換
  private parseDate(dateString: string): Date {
    // "2025年10月5日" または "2025年6月7日（土）8日（日）" の形式をパース
    // 最初の日付（開始日）を使用
    const match = dateString.match(/(\d+)年(\d+)月(\d+)日/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // 月は0から始まる
      const day = parseInt(match[3], 10);
      return new Date(year, month, day);
    }
    return new Date(0); // パースに失敗した場合は古い日付を返す
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
    { 
      id: 'freeblaze-support-2025',
      image: '/assets/images/freeblaze-support-2025.jpg', 
      category: '応援活動', 
      title: 'フリーブレイズ応援', 
      date: '2025年1月11日',
      content: '八戸フリーブレイズの試合に応援に行きました。八戸フリーブレイズは地元にあるアイスホッケーチームです。部員一同、アイスホッケーの迫力あるプレーに大興奮でした。スピード感あふれる試合展開と選手たちの熱いプレーに、会場全体が一体となって応援する姿が印象的でした。地元のプロスポーツチームを応援することで、部員たちのモチベーションも大きく向上しました。',
      delay: 'delay-200' 
    },
    { 
      id: 'elementary-baseball-clinic-2025',
      image: '/assets/images/elementary-baseball-clinic-2025.jpg', 
      category: '地域貢献', 
      title: '小学生向け野球教室', 
      date: '2025年2月22日(土)',
      content: '2025年2月22日(土)ダイヤモンドクラブ八戸さんとの野球教室が行われました。八西野球部の練習を一緒にし、藤田トレーナーのウォーミングアップや津村さんのメンタルトレーニング、ポジション別の守備練習やバッティングなどを体験していただきました。選手も人に教えるという貴重な経験ができる良い機会となりました。ありがとうございました。',
      delay: 'delay-400' 
    },
    { 
      id: 'graduation-ceremony-2025',
      image: '/assets/images/graduation-ceremony-2025.jpg', 
      category: 'イベントレポート', 
      title: '卒業式', 
      date: '2025年3月1日(土)',
      content: '3月1日(土)卒業式が行われました。1、2年生からは3年生に向けて激励のハカを送り、その後応援歌と共に胴上げをし、卒業を祝福しました。3年生の皆さん、ご卒業おめでとうございます。新たなステージでの更なる活躍期待しています！！',
      delay: '' 
    },
    { 
      id: 'hachikoshi-practice-2025',
      image: '/assets/images/hachikoshi-practice-2025.jpg', 
      category: '練習', 
      title: '八高支練習', 
      date: '2025年11月10日',
      content: '八戸高等支援学校の生徒さんたちと交流しました。お互いに刺激を受けながら、楽しく練習に取り組みました。この交流を通じて、部員たちは多様性を理解し、お互いを尊重することの大切さを学びました。',
      delay: 'delay-200' 
    },
    { 
      id: 'sansha-festival-2025',
      image: '/assets/images/sansha-festival-2025.jpg', 
      category: '地域貢献', 
      title: '三社大祭', 
      date: '2025年7月20日',
      content: '三社大祭に参加しました。地域の伝統行事に参加し、地域の方々との交流を深めることができました。',
      delay: 'delay-400' 
    },
    { 
      id: 'training-camp-2025',
      image: '/assets/images/training-camp-2025.jpg', 
      category: '練習', 
      title: '合宿', 
      date: '2025年4月5日',
      content: '夏季合宿を行いました。集中した練習と生活を通じて、技術面だけでなく精神面も大きく成長しました。',
      delay: '' 
    },
    { 
      id: 'exchange-activity-2025',
      image: '/assets/images/exchange-activity-2025.jpg', 
      category: '練習', 
      title: '冬季練習', 
      date: '2025年3月6日',
      content: '2025年3月6日、冬季練習を行いました。寒さに負けず、部員一同が集中して練習に取り組みました。基礎体力の向上を目的としたランニングや筋力トレーニング、そして技術面の向上のための守備練習やバッティング練習など、多岐にわたるメニューを実施しました。冬季の厳しい環境の中での練習は、部員たちの精神面も鍛え、チーム全体の結束を深める良い機会となりました。春季大会に向けて、この冬季練習で培った体力と技術を活かし、さらなる成長を目指していきます。',
      delay: 'delay-200' 
    },
    { 
      id: 'sendai-expedition-2025',
      image: '/assets/images/sendai-expedition-2025.jpg', 
      category: '遠征', 
      title: '仙台遠征', 
      date: '2025年6月7日（土）8日（日）',
      content: '2025年6月7日（土）8日（日）の2日間、甲子園予選に向けた強化合宿として仙台遠征に行きました。今回の試合を通して、春季大会から成長した所とこれからの課題が明確になった試合となりました。千葉経済大学附属高校さん、仙台育英学園高校さんありがとうございました！',
      delay: 'delay-400' 
    },
    { 
      id: 'yoga-training-2025',
      image: '/assets/images/yoga-training-2025.jpg', 
      category: 'トレーニング', 
      title: 'ヨガトレーニング', 
      date: '2025年6月18日',
      content: '2025年6月18日　ヨガ・瞑想トレーナーの恵先生から呼吸法やストレッチ、ヨガを教えていただきました。柔軟性と集中力の向上を目的とし、部員たちも積極的に取り組みました。心身のバランスを整えることで、パフォーマンスの向上にもつながっています。',
      delay: '' 
    },
  ];
}