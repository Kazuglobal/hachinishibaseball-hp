import { Component, OnInit, signal } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { filter, map } from 'rxjs/operators';

export interface BreadcrumbItem {
  label: string;
  url: string;
}

@Component({
  selector: 'app-breadcrumb',
  templateUrl: './breadcrumb.component.html',
  styleUrls: ['./breadcrumb.component.css'],
  imports: [CommonModule, RouterModule]
})
export class BreadcrumbComponent implements OnInit {
  breadcrumbs = signal<BreadcrumbItem[]>([]);

  private routeLabels: { [key: string]: string } = {
    '': 'ホーム',
    'about': '野球部について',
    'alumni-activities': 'OB活躍情報',
    'match-results': '試合結果',
    'support': 'ご支援のお願い',
    'contact': 'お問い合わせ',
    'activities': '活動報告一覧',
    'activity': '活動報告詳細',
    'alumni-voice': 'OBの声',
    'privacy-policy': 'プライバシーポリシー',
    'game': 'ゲームセンター',
    'homerun': 'ホームランチャレンジ',
    'pitching': 'ストライク投球',
    'catch': 'フライキャッチ'
  };

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        map(() => this.buildBreadcrumbs(this.activatedRoute.root))
      )
      .subscribe(breadcrumbs => {
        this.breadcrumbs.set(breadcrumbs);
      });

    // Initial breadcrumbs
    this.breadcrumbs.set(this.buildBreadcrumbs(this.activatedRoute.root));
  }

  private buildBreadcrumbs(
    route: ActivatedRoute,
    url: string = '',
    breadcrumbs: BreadcrumbItem[] = []
  ): BreadcrumbItem[] {
    // Always include home
    if (breadcrumbs.length === 0) {
      breadcrumbs.push({ label: 'ホーム', url: '/' });
    }

    const children: ActivatedRoute[] = route.children;

    if (children.length === 0) {
      return breadcrumbs;
    }

    for (const child of children) {
      const routeURL: string = child.snapshot.url.map(segment => segment.path).join('/');
      if (routeURL !== '') {
        url += `/${routeURL}`;

        const segments = routeURL.split('/');
        const mainSegment = segments[0];

        const label = this.routeLabels[mainSegment] || mainSegment;

        // Skip if it's the home page
        if (url !== '/') {
          breadcrumbs.push({ label, url });
        }
      }

      return this.buildBreadcrumbs(child, url, breadcrumbs);
    }

    return breadcrumbs;
  }
}
