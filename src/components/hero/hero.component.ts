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
  showGif = signal(true); // 初期状態ではGIFを表示
  gifLoaded = signal(false);
  gifSrc = signal('/assets/images/hero-loading.gif');
  private gifTimeout?: number;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // 初期状態ではGIFを表示
    this.showGif.set(true);
    // GIFのパスを設定（タイムスタンプを追加してキャッシュを回避）
    const timestamp = new Date().getTime();
    this.gifSrc.set(`/assets/images/hero-loading.gif?t=${timestamp}`);
  }

  ngAfterViewInit() {
    // GIFが読み込まれたら、一定時間後に静止画に切り替え
    // GIFアニメーションは通常ループするので、一定時間（例：3秒）後に切り替え
    if (this.gifLoaded()) {
      this.startGifTimer();
    }
  }

  onGifLoaded() {
    // GIFが読み込まれたら表示を開始
    console.log('GIF loaded');
    this.gifLoaded.set(true);
    this.showGif.set(true);
    this.cdr.markForCheck();
    // 一定時間後に静止画に切り替え（GIFアニメーションの長さに応じて調整）
    this.startGifTimer();
  }

  private startGifTimer() {
    // GIFアニメーションを3秒間表示した後、静止画に切り替え
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
