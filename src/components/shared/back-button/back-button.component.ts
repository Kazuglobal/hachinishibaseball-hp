import { Component, ChangeDetectionStrategy, HostBinding } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-back-button',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      (click)="onBack()"
      class="inline-flex items-center gap-2 px-3 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
      aria-label="戻る"
    >
      <span aria-hidden="true">←</span>
      戻る
    </button>
  `
})
export class BackButtonComponent {
  constructor(private location: Location, private router: Router) {}

  private get canGoBack(): boolean {
    // history.length は環境により振る舞いが異なるため、最低限の判定
    return (window.history?.length ?? 0) > 1;
  }

  onBack(): void {
    try {
      if (this.canGoBack) {
        this.location.back();
      } else {
        this.router.navigate(['/']);
      }
    } catch {
      this.router.navigate(['/']);
    }
  }
}


