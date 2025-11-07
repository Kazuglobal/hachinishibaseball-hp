import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { ScrollService } from '../../services/scroll.service';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-side-ui',
  templateUrl: './side-ui.component.html',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SideUiComponent {
  scrollService = inject(ScrollService);

  scrollProgress = computed(() => {
    const scrollY = this.scrollService.scrollY();
    const docHeight = this.scrollService.documentHeight();
    const winHeight = this.scrollService.windowHeight();
    if (docHeight <= winHeight) return 0;
    return (scrollY / (docHeight - winHeight)) * 100;
  });
  
  showFloatingCta = computed(() => this.scrollService.scrollY() > (this.scrollService.windowHeight() * 0.8));
}
