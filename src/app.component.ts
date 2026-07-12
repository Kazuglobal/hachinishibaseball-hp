import { Component, ChangeDetectionStrategy, inject, OnInit, PLATFORM_ID, Inject } from '@angular/core';
import { HeaderComponent } from './components/header/header.component';
import { SideUiComponent } from './components/side-ui/side-ui.component';
import { FooterComponent } from './components/footer/footer.component';
import { MenuComponent } from './components/menu/menu.component';
import { BreadcrumbComponent } from './components/breadcrumb/breadcrumb.component';
import { ScrollService } from './services/scroll.service';
import { SEOService } from './services/seo.service';
import { RouterOutlet, NavigationEnd, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { filter } from 'rxjs';

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
    BreadcrumbComponent,
  ]
})
export class AppComponent implements OnInit {
  scrollService = inject(ScrollService);
  private seoService = inject(SEOService);
  router = inject(Router);
  private isBrowser: boolean;

  navItems = [
    '野球部について',
    '活動報告',
    '試合結果',
    'OB活躍情報',
    'ゲーム',
    'ご支援のお願い',
    'お問い合わせ'
  ];

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.scrollService.init();
  }

  ngOnInit() {
    if (this.isBrowser) {
      // ルーティング完了後にフラグメントにスクロール、またはページ上部にスクロール
      this.router.events
        .pipe(filter(event => event instanceof NavigationEnd))
        .subscribe(() => {
          // 遷移先ページが独自の構造化データを設定しない場合に、前ページの
          // JSON-LDが残留しないようクリアしておく（必要なら各ページが再度設定する）
          this.seoService.removeStructuredData();

          setTimeout(() => {
            // コンテンツ描画後にドキュメント高さを再計測（スクロール進捗バー用）
            this.scrollService.refreshDocumentHeight();

            const url = this.router.url;
            const fragmentIndex = url.indexOf('#');
            if (fragmentIndex !== -1) {
              // フラグメントがある場合は、フラグメントにスクロール
              const fragment = url.substring(fragmentIndex + 1);
              const element = document.getElementById(fragment);
              if (element) {
                const headerOffset = 80; // ヘッダーの高さ
                const elementPosition = element.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                  top: offsetPosition,
                  behavior: 'smooth'
                });
              }
            } else {
              // フラグメントがない場合は、ページの上部にスクロール
              window.scrollTo({
                top: 0,
                behavior: 'smooth'
              });
            }
          }, 100);
        });
    }
  }
}
