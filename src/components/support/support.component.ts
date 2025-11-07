import { Component, ChangeDetectionStrategy, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, SectionTitleComponent, BackButtonComponent],
  templateUrl: './support.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SupportComponent implements OnInit {
  private route = inject(ActivatedRoute);
  isVisible = signal(true);

  ngOnInit() {
    // フラグメントがcreditの場合、スクロールして表示
    this.route.fragment.subscribe(fragment => {
      if (fragment === 'credit') {
        setTimeout(() => {
          const element = document.getElementById('credit');
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      }
    });
  }
}


