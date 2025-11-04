import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { NgOptimizedImage, CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { HeroComponent } from '../hero/hero.component';
import { OwnersVoiceComponent } from '../owners-voice/owners-voice.component';
import { WorksComponent } from '../works/works.component';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';
import { ScrollService } from '../../services/scroll.service';

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
export class HomeComponent {
  scrollService = inject(ScrollService);

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
