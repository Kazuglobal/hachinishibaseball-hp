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
    
    // フォールバック: 一定時間後にポップアップを表示（GIFが読み込まれない場合の対策）
    if (this.isBrowser) {
      setTimeout(() => {
        if (!this.showSupportPopup() && !this.showGif()) {
          const popupClosed = typeof localStorage !== 'undefined' ? localStorage.getItem('support-popup-closed') : null;
          const today = new Date().toDateString();
          if (popupClosed !== today) {
            console.log('Fallback: Showing popup after timeout');
            this.showSupportPopup.set(true);
            this.enableBodyScroll(false);
            this.cdr.markForCheck();
          }
        }
      }, 5000); // 5秒後にフォールバック
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
      }, 100); // 100ms遅延でスムーズな表示
    };
    gifImg.onerror = () => {
      // プリロード失敗時は静止画を表示
      this.gifError.set(true);
      this.showGif.set(false);
      this.cdr.markForCheck();
    };
    gifImg.src = '/assets/images/hero-loading.gif';
  }

  ngAfterViewInit() {
    // GIFが読み込まれたら、一定時間後に静止画に切り替え
    // GIFアニメーションは通常ループするので、一定時間（例：3秒）後に切り替え
    if (this.gifLoaded()) {
      this.startGifTimer();
    }
  }

  onGifLoaded() {
    // GIFが読み込まれたら表示を開始（HTMLのimg要素からの読み込み完了時）
    if (!this.gifLoaded()) {
    this.gifLoaded.set(true);
      // プリロードが完了していない場合は、ここで表示を開始
      if (!this.showGif()) {
        setTimeout(() => {
    this.showGif.set(true);
          this.cdr.markForCheck();
        }, 50);
      }
    this.cdr.markForCheck();
    // 一定時間後に静止画に切り替え（GIFアニメーションの長さに応じて調整）
    this.startGifTimer();
    }
  }

  private startGifTimer() {
    // 既存のタイマーをクリア
    if (this.gifTimeout) {
      clearTimeout(this.gifTimeout);
    }
    // GIFアニメーションを3秒間表示した後、静止画にスムーズに切り替え
    // 必要に応じて時間を調整してください
    this.gifTimeout = window.setTimeout(() => {
      this.showGif.set(false);
      this.cdr.markForCheck();
      // アニメーション終了後、少し遅延してからポップアップを表示
      this.popupTimeout = window.setTimeout(() => {
        if (!this.isBrowser) return;
        // ローカルストレージをチェック（今日閉じた場合は再表示しない）
        const popupClosed = typeof localStorage !== 'undefined' ? localStorage.getItem('support-popup-closed') : null;
        const today = new Date().toDateString();
        console.log('Animation ended. Popup closed:', popupClosed, 'Today:', today);
        if (popupClosed !== today) {
          console.log('Showing support popup');
          this.showSupportPopup.set(true);
          // bodyのスクロールを無効化（ポップアップ表示中）
          this.enableBodyScroll(false);
          this.cdr.markForCheck();
        } else {
          console.log('Popup already closed today, skipping');
        }
      }, 500); // 500ms遅延でスムーズに表示
    }, 3000); // 3秒後に静止画に切り替え
  }

  closeSupportPopup() {
    this.showSupportPopup.set(false);
    // ローカルストレージに保存（今日は再表示しない）
    if (this.isBrowser && typeof localStorage !== 'undefined') {
      const today = new Date().toDateString();
      localStorage.setItem('support-popup-closed', today);
    }
    // bodyのスクロールを再有効化
    this.enableBodyScroll(true);
    this.cdr.markForCheck();
  }

  private enableBodyScroll(enable: boolean) {
    if (this.isBrowser && typeof document !== 'undefined') {
      if (enable) {
        document.body.style.overflow = '';
        // モバイルでのスクロール位置を保持
        document.body.style.position = '';
      } else {
        document.body.style.overflow = 'hidden';
        // モバイルでのスクロール位置を保持
        document.body.style.position = 'fixed';
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
  }

  onGifError(event: any) {
    // GIFの読み込みエラー時は静止画に切り替え
    console.error('GIF error:', event);
    console.error('GIF path:', this.gifSrc());
    this.gifError.set(true);
    this.showGif.set(false);
    this.cdr.markForCheck();
    // エラー時もポップアップを表示
    if (this.isBrowser) {
      setTimeout(() => {
        const popupClosed = typeof localStorage !== 'undefined' ? localStorage.getItem('support-popup-closed') : null;
        const today = new Date().toDateString();
        console.log('GIF error. Popup closed:', popupClosed, 'Today:', today);
        // 今日閉じた場合は再表示しない
        if (popupClosed !== today) {
          console.log('Showing support popup after GIF error');
          this.showSupportPopup.set(true);
          // bodyのスクロールを無効化（ポップアップ表示中）
          this.enableBodyScroll(false);
          this.cdr.markForCheck();
        }
      }, 500);
    }
  }
}
