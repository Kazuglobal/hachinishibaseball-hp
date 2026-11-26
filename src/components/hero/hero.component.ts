import { Component, ChangeDetectionStrategy, signal, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef, PLATFORM_ID, Inject } from '@angular/core';
import { NgOptimizedImage, CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-hero',
  templateUrl: './hero.component.html',
  imports: [CommonModule, NgOptimizedImage, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true
})
export class HeroComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('heroGif', { static: false }) gifElement!: ElementRef<HTMLImageElement>;
  
  gifError = signal(false);
  showGif = signal(false); // 初期状態では非表示（プリロード完了後に表示）
  gifLoaded = signal(false);
  baseImageLoaded = signal(false);
  gifSrc = signal('/assets/images/hero-loading.gif');
  showSupportPopup = signal(false); // ご支援のお願いポップアップの表示状態
  private gifTimeout?: number;
  private popupTimeout?: number;
  private fallbackTimeout?: number;
  private gifErrorPopupTimeout?: number;
  private savedScrollY = 0;
  private isBrowser: boolean;

  constructor(
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    // GIFのパスを設定（キャッシュを有効活用）
    this.gifSrc.set('/assets/images/hero-loading.gif');
    // ベース画像とGIFを並行してプリロード
    this.preloadImages();
    
    if (this.isBrowser) {
      // 過去のlocalStorageロックが残っている場合は解除してポップアップを確実に復元
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('support-popup-closed');
        }
      } catch (e) {
        // ignore
      }

      // フォールバック: 一定時間後にポップアップを表示（GIFが読み込まれない・遅延した場合の対策）
      this.fallbackTimeout = window.setTimeout(() => {
        if (!this.showSupportPopup()) {
          this.showGif.set(false);
          this.cdr.markForCheck();
          this.triggerSupportPopup();
        }
      }, 4000); // 4秒後にフォールバックで確実に表示
    }
  }

  private preloadImages(): void {
    // ベース画像をプリロード
    const baseImg = new Image();
    baseImg.onload = () => {
      this.baseImageLoaded.set(true);
      this.cdr.markForCheck();
    };
    baseImg.src = '/assets/images/hero-first-view.jpg';

    // GIFを事前に読み込んでスムーズな表示を実現
    const gifImg = new Image();
    gifImg.onload = () => {
      // プリロード完了後、少し遅延してからGIFを表示（スムーズなフェードイン）
      setTimeout(() => {
        this.gifLoaded.set(true);
        this.showGif.set(true);
        this.cdr.markForCheck();
        // GIF表示開始に合わせてタイマーを起動
        this.startGifTimer();
      }, 100); // 100ms遅延でスムーズな表示
    };
    gifImg.onerror = () => {
      // プリロード失敗時は静止画を表示
      this.gifError.set(true);
      this.showGif.set(false);
      this.cdr.markForCheck();
      this.onGifError('preload error');
    };
    gifImg.src = '/assets/images/hero-loading.gif';
  }

  ngAfterViewInit() {
    // GIFが既に読み込まれていてタイマー未起動なら開始
    if (this.gifLoaded() && !this.gifTimeout) {
      this.startGifTimer();
    }
  }

  onGifLoaded() {
    // GIFが読み込まれたら表示を開始（HTMLのimg要素からの読み込み完了時）
    this.gifLoaded.set(true);
    if (!this.showGif()) {
      this.showGif.set(true);
      this.cdr.markForCheck();
    }
    // タイマーが未起動であれば確実に起動
    if (!this.gifTimeout) {
      this.startGifTimer();
    }
  }

  private startGifTimer() {
    // 既存のタイマーをクリア
    if (this.gifTimeout) {
      clearTimeout(this.gifTimeout);
    }
    // GIFアニメーションを3秒間表示した後、静止画にスムーズに切り替え
    this.gifTimeout = window.setTimeout(() => {
      this.showGif.set(false);
      this.cdr.markForCheck();
      // アニメーション終了後、少し遅延してからポップアップを表示
      this.popupTimeout = window.setTimeout(() => {
        this.triggerSupportPopup();
      }, 500); // 500ms遅延でスムーズに表示
    }, 3000); // 3秒後に静止画に切り替え
  }

  private triggerSupportPopup(): void {
    if (!this.isBrowser) return;
    // 同一タブセッション内で一度明示的に閉じたかのみを判定（リロードや別タブでは復元）
    const isClosedInSession = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('support-popup-closed') === 'true';
    if (!isClosedInSession && !this.showSupportPopup()) {
      this.showSupportPopup.set(true);
      // bodyのスクロールを無効化（ポップアップ表示中）
      this.enableBodyScroll(false);
      this.cdr.markForCheck();
    }
  }

  closeSupportPopup() {
    this.showSupportPopup.set(false);
    // セッションストレージに保存（同一セッション内でのみ再表示を抑制）
    if (this.isBrowser) {
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('support-popup-closed', 'true');
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('support-popup-closed');
        }
      } catch (e) {
        // ignore
      }
    }
    // bodyのスクロールを再有効化
    this.enableBodyScroll(true);
    this.cdr.markForCheck();
  }

  private enableBodyScroll(enable: boolean) {
    if (this.isBrowser && typeof document !== 'undefined') {
      if (enable) {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, this.savedScrollY);
      } else {
        this.savedScrollY = window.scrollY;
        document.body.style.overflow = 'hidden';
        // モバイルでのスクロール位置を保持
        document.body.style.position = 'fixed';
        document.body.style.top = `-${this.savedScrollY}px`;
        document.body.style.width = '100%';
      }
    }
  }

  ngOnDestroy() {
    // タイマーをクリーンアップ
    if (this.gifTimeout) {
      clearTimeout(this.gifTimeout);
    }
    if (this.popupTimeout) {
      clearTimeout(this.popupTimeout);
    }
    if (this.fallbackTimeout) {
      clearTimeout(this.fallbackTimeout);
    }
    if (this.gifErrorPopupTimeout) {
      clearTimeout(this.gifErrorPopupTimeout);
    }
    // ポップアップ表示中に破棄された場合、bodyのスクロールロックを解除する
    if (this.showSupportPopup()) {
      this.enableBodyScroll(true);
    }
  }

  onGifError(event: any) {
    // GIFの読み込みエラー時は静止画に切り替え
    this.gifError.set(true);
    this.showGif.set(false);
    this.cdr.markForCheck();
    // エラー時もポップアップを表示
    if (this.isBrowser) {
      this.gifErrorPopupTimeout = window.setTimeout(() => {
        const popupClosed = typeof localStorage !== 'undefined' ? localStorage.getItem('support-popup-closed') : null;
        const today = new Date().toDateString();
        // 今日閉じた場合は再表示しない
        if (popupClosed !== today) {
          this.showSupportPopup.set(true);
          // bodyのスクロールを無効化（ポップアップ表示中）
          this.enableBodyScroll(false);
          this.cdr.markForCheck();
        }
      }, 500);
    }
  }
}
