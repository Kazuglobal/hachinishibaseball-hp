
import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
  selector: 'app-section-title',
  templateUrl: './section-title.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionTitleComponent {
  mainTitle = input.required<string>();
  subTitle = input.required<string>();
}
