import { Component, ChangeDetectionStrategy, signal, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { NgOptimizedImage, CommonModule } from '@angular/common';

@Component({
  selector: 'app-hero',
  templateUrl: './hero.component.html',
  imports: [CommonModule, NgOptimizedImage],
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
  private gifTimeout?: number;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // GIFのパスを設定（キャッシュを有効活用）
    this.gifSrc.set('/assets/images/hero-loading.gif');
    // ベース画像とGIFを並行してプリロード
    this.preloadImages();
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
    }, 3000); // 3秒後に静止画に切り替え
  }

  ngOnDestroy() {
    // タイマーをクリーンアップ
    if (this.gifTimeout) {
      clearTimeout(this.gifTimeout);
    }
  }

  onGifError(event: any) {
    // GIFの読み込みエラー時は静止画に切り替え
    console.error('GIF error:', event);
    console.error('GIF path:', this.gifSrc());
    this.gifError.set(true);
    this.showGif.set(false);
    this.cdr.markForCheck();
  }
}
