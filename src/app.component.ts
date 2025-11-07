import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { HeaderComponent } from './components/header/header.component';
import { SideUiComponent } from './components/side-ui/side-ui.component';
import { FooterComponent } from './components/footer/footer.component';
import { MenuComponent } from './components/menu/menu.component';
import { ScrollService } from './services/scroll.service';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    HeaderComponent,
    SideUiComponent,
    FooterComponent,
    MenuComponent,
  ]
})
export class AppComponent {
  scrollService = inject(ScrollService);

  navItems = [
    '野球部について',
    '活動報告',
    '試合結果',
    'OB活躍情報',
    'ご支援のお願い',
    'お問い合わせ'
  ];

  constructor() {
    this.scrollService.init();
  }
}
