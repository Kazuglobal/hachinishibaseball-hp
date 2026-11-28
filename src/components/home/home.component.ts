import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit } from '@angular/core';
import { NgOptimizedImage, CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { HeroComponent } from '../hero/hero.component';
import { OwnersVoiceComponent } from '../owners-voice/owners-voice.component';
import { WorksComponent } from '../works/works.component';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { SponsorBannerStripComponent } from '../shared/sponsor-banner-strip/sponsor-banner-strip.component';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';
import { ScrollService } from '../../services/scroll.service';
import { SEOService } from '../../services/seo.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    NgOptimizedImage,
    HeroComponent,
    OwnersVoiceComponent,
    WorksComponent,
    SectionTitleComponent,
    SponsorBannerStripComponent,
    ObserveVisibilityDirective
  ],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  scrollService = inject(ScrollService);
  private seoService = inject(SEOService);

  ngOnInit(): void {
    this.seoService.updateSEO({
      title: '八戸西高校 野球部OB会 | 八戸西高等学校',
      description: '八戸西高校（八戸西高等学校）野球部OB会の公式ウェブサイト。活動報告、試合結果、OB活躍情報、現役チームへの支援情報などを掲載。八戸西高校野球部OBと現役選手、ファンを繋ぐ情報ハブです。八戸西高校野球部の歴史、伝統、そしてOBの活躍を紹介しています。',
      keywords: '八戸西高校,八戸西高等学校,八戸西高校野球部,八戸西高等学校野球部,野球部,OB会,八戸西野球,青森県野球,高校野球,OB活躍情報,試合結果,活動報告,福島蓮,日本ハムファイターズ,八戸西高校OB会,八戸西高等学校OB会',
      url: 'https://hachinohenishibaseball.com/'
    });
    
    // 構造化データを追加
    this.seoService.addStructuredData({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "八戸西高校 野球部OB会 | 八戸西高等学校",
      "description": "八戸西高校（八戸西高等学校）野球部OB会の公式ウェブサイト",
      "url": "https://hachinohenishibaseball.com/",
      "inLanguage": "ja-JP",
      "isPartOf": {
        "@type": "WebSite",
        "name": "八戸西高等学校野球OB会",
        "url": "https://hachinohenishibaseball.com"
      }
    });
  }

  meetingNoticeVisible = signal(true);
  brandStoryVisible = signal(false);
  galleryVisible = signal(false);
  buildingHouseVisible = signal(false);
  otherServiceVisible = signal(false);
  blogVisible = signal(false);

  readonly messageBgImages = [
    { src: '/assets/images/message-bg-1.jpg', width: 768, height: 1024, alt: '八戸西高等学校野球部 帽子' },
    { src: '/assets/images/message-bg-2.jpg', width: 768, height: 1024, alt: '八戸西高等学校野球部 室内練習場' },
    { src: '/assets/images/message-bg-3.jpg', width: 1024, height: 768, alt: '八戸西高等学校野球部 夜のグラウンド' },
    { src: '/assets/images/message-bg-4.jpg', width: 768, height: 1024, alt: '八戸西高等学校野球部 練習球' },
    { src: '/assets/images/message-bg-5.jpg', width: 768, height: 1024, alt: '八戸西高等学校野球部 バット' },
    { src: '/assets/images/message-bg-6.jpg', width: 768, height: 1024, alt: '八戸西高等学校野球部 練習用具' },
    { src: '/assets/images/message-bg-7.jpg', width: 768, height: 1024, alt: '八戸西高等学校野球部 ピッチングマシン' },
    { src: '/assets/images/message-bg-8.jpg', width: 768, height: 1024, alt: '八戸西高等学校野球部 防球ネット' },
  ];

  // Parallax effect for Brand Story
  parallaxImage1Transform = computed(() => `translateY(${Math.min(this.scrollService.scrollY() * 0.03, 30)}px)`);
  parallaxImage2Transform = computed(() => `translateY(${Math.min(this.scrollService.scrollY() * 0.015, 15)}px)`);
  
  // Rotating background text for "Building a House"
  bgTextTransform = computed(() => `translateX(-50%) translateY(-50%) rotate(${this.scrollService.scrollY() * 0.02}deg)`);
}
