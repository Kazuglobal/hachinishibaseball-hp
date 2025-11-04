import { Component, ChangeDetectionStrategy, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-owners-voice',
  templateUrl: './owners-voice.component.html',
  imports: [SectionTitleComponent, ObserveVisibilityDirective, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnersVoiceComponent implements OnInit, OnDestroy {
  sectionVisible = signal(false);

  voices = [
    {
      image: 'https://picsum.photos/seed/alumni1/800/1000',
      title: '野球部での経験が、今の自分の礎です。',
      family: '平成10年度卒 - 山田 太郎 様',
    },
    {
      image: 'https://picsum.photos/seed/alumni2/800/1000',
      title: '出会えたことに感謝しています。',
      family: '平成15年度卒 - 佐藤 次郎 様',
    },
    {
      image: 'https://picsum.photos/seed/alumni3/800/1000',
      title: '現役選手たちの活躍が、何よりの励みになります。',
      family: '平成20年度卒 - 鈴木 三郎 様',
    },
    {
      image: 'https://picsum.photos/seed/alumni4/800/1000',
      title: '八戸西の野球魂を、次の世代に繋いでいきたい。',
      family: '平成25年度卒 - 高橋 四郎 様',
    },
  ];
  
  currentIndex = signal(0);
  
  carouselTransform = computed(() => `translateX(-${this.currentIndex() * 100 / this.voices.length}%)`);
  cardWidth = computed(() => `${100 / this.voices.length}%`);

  private intervalId: any;

  ngOnInit(): void {
    this.startAutoSlide();
  }

  ngOnDestroy(): void {
    this.stopAutoSlide();
  }

  advanceSlide(): void {
    this.currentIndex.update(i => (i + 1) % this.voices.length);
  }

  next(): void {
    this.advanceSlide();
    this.resetAutoSlide();
  }

  prev(): void {
    this.currentIndex.update(i => (i - 1 + this.voices.length) % this.voices.length);
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
