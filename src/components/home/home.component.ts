import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit } from '@angular/core';
import { NgOptimizedImage, CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { HeroComponent } from '../hero/hero.component';
import { OwnersVoiceComponent } from '../owners-voice/owners-voice.component';
import { WorksComponent } from '../works/works.component';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
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
      title: '八戸西高校 野球部OB会',
      description: '八戸西高校野球部OB会の公式ウェブサイト。活動報告、試合結果、OB活躍情報、現役チームへの支援情報などを掲載。八戸西高校野球部OBと現役選手、ファンを繋ぐ情報ハブです。',
      keywords: '八戸西高校,八戸西高等学校,野球部,OB会,八戸西野球,青森県野球,高校野球,OB活躍情報,試合結果,活動報告,福島蓮,日本ハムファイターズ',
      url: 'https://hachinishibaseball-ob.com/'
    });
  }

  brandStoryVisible = signal(false);
  galleryVisible = signal(false);
  buildingHouseVisible = signal(false);
  otherServiceVisible = signal(false);
  eventVisible = signal(false);
  aboutUsVisible = signal(false);
  blogVisible = signal(false);
  contactVisible = signal(false);

  // Parallax effect for Brand Story
  parallaxImage1Transform = computed(() => `translateY(${this.scrollService.scrollY() * 0.1}px)`);
  parallaxImage2Transform = computed(() => `translateY(${this.scrollService.scrollY() * 0.05}px)`);
  
  // Rotating background text for "Building a House"
  bgTextTransform = computed(() => `translateX(-50%) translateY(-50%) rotate(${this.scrollService.scrollY() * 0.02}deg)`);
}
