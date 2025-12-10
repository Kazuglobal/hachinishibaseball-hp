import { Component, ChangeDetectionStrategy, signal, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';
import { SEOService } from '../../services/seo.service';
import { TiltDirective } from '../../directives/tilt.directive';

interface Match {
  date: string;
  ourScore: number;
  opponentScore: number;
  opponent: string;
  result: 'win' | 'loss' | 'draw';
  notes?: string;
}

interface Tournament {
  name: string;
  matches: Match[];
}

@Component({
  selector: 'app-match-results',
  standalone: true,
  imports: [CommonModule, SectionTitleComponent, BackButtonComponent, ObserveVisibilityDirective, TiltDirective],
  templateUrl: './match-results.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchResultsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private seoService = inject(SEOService);
  isVisible = signal(false);
  viewMode = signal<'practice' | 'official'>('practice');

  ngOnInit() {
    // SEO設定
    this.seoService.updateSEO({
      title: '試合結果',
      description: '八戸西高等学校野球部の試合結果を掲載。公式戦（室岡杯、春季県大会、甲子園予選、秋季リーグ戦、秋季県大会、1年生大会）と練習試合の結果を詳しく紹介しています。',
      keywords: '八戸西高等学校,野球部,試合結果,公式戦,練習試合,甲子園予選,春季県大会,秋季県大会',
      url: 'https://hachinishibaseball-ob.com/match-results'
    });

    // 初期表示を有効にする
    this.isVisible.set(true);

    // クエリパラメータからタブを設定
    this.route.queryParams.subscribe(params => {
      if (params['tab'] === 'official') {
        this.viewMode.set('official');
      } else if (params['tab'] === 'practice') {
        this.viewMode.set('practice');
      } else {
        // デフォルトは練習試合
        this.viewMode.set('practice');
      }
      this.cdr.markForCheck();
    });
  }

  // 練習試合データ
  readonly practiceMatches: Match[] = [
    { date: '3月15日', ourScore: 4, opponentScore: 2, opponent: '久慈', result: 'win' },
    { date: '3月15日', ourScore: 8, opponentScore: 6, opponent: '聖ウルスラ', result: 'win' },
    { date: '3月20日', ourScore: 5, opponentScore: 4, opponent: '弘前東', result: 'win' },
    { date: '3月20日', ourScore: 1, opponentScore: 8, opponent: '弘前東', result: 'loss' },
    { date: '3月22日', ourScore: 5, opponentScore: 8, opponent: '青森北', result: 'loss' },
    { date: '3月22日', ourScore: 7, opponentScore: 10, opponent: '青森北', result: 'loss' },
    { date: '3月23日', ourScore: 4, opponentScore: 5, opponent: '久慈', result: 'loss' },
    { date: '3月23日', ourScore: 1, opponentScore: 12, opponent: '久慈', result: 'loss' },
    { date: '3月27日', ourScore: 0, opponentScore: 4, opponent: '駒大苫小牧', result: 'loss' },
    { date: '3月27日', ourScore: 3, opponentScore: 7, opponent: '駒大苫小牧', result: 'loss' },
    { date: '3月29日', ourScore: 6, opponentScore: 9, opponent: '木造', result: 'loss' },
    { date: '3月29日', ourScore: 2, opponentScore: 11, opponent: '木造', result: 'loss' },
    { date: '3月30日', ourScore: 12, opponentScore: 8, opponent: '八戸北', result: 'win' },
    { date: '3月30日', ourScore: 1, opponentScore: 0, opponent: '八戸北', result: 'win' },
    { date: '3月31日', ourScore: 11, opponentScore: 12, opponent: '鹿角', result: 'loss' },
    { date: '3月31日', ourScore: 9, opponentScore: 3, opponent: '駒大苫小牧', result: 'win' },
    { date: '4月5日', ourScore: 1, opponentScore: 0, opponent: '明の星', result: 'win' },
    { date: '4月5日', ourScore: 1, opponentScore: 3, opponent: '青森南', result: 'loss' },
    { date: '4月6日', ourScore: 1, opponentScore: 1, opponent: '盛岡第三', result: 'draw' },
    { date: '4月6日', ourScore: 6, opponentScore: 7, opponent: '盛岡第三', result: 'loss' },
    { date: '4月26日', ourScore: 5, opponentScore: 10, opponent: '札幌創成', result: 'loss' },
    { date: '4月26日', ourScore: 1, opponentScore: 2, opponent: '一関学院', result: 'loss' },
    { date: '4月26日', ourScore: 3, opponentScore: 7, opponent: '光星', result: 'loss' },
    { date: '4月26日', ourScore: 1, opponentScore: 12, opponent: '光星', result: 'loss' },
    { date: '4月27日', ourScore: 2, opponentScore: 7, opponent: '知内', result: 'loss' },
    { date: '4月27日', ourScore: 1, opponentScore: 11, opponent: '知内', result: 'loss' },
    { date: '4月27日', ourScore: 5, opponentScore: 6, opponent: '工大二', result: 'loss' },
    { date: '4月27日', ourScore: 6, opponentScore: 11, opponent: '工大二', result: 'loss' },
    { date: '5月3日', ourScore: 6, opponentScore: 1, opponent: '三沢商業', result: 'win' },
    { date: '5月3日', ourScore: 3, opponentScore: 7, opponent: '三本木農業', result: 'loss' },
    { date: '5月3日', ourScore: 15, opponentScore: 1, opponent: '三本木農業', result: 'win' },
    { date: '5月4日', ourScore: 3, opponentScore: 7, opponent: '酒田南', result: 'loss' },
    { date: '5月4日', ourScore: 14, opponentScore: 5, opponent: '三本木', result: 'win' },
    { date: '5月5日', ourScore: 0, opponentScore: 5, opponent: '駒大苫小牧', result: 'loss' },
    { date: '5月5日', ourScore: 3, opponentScore: 2, opponent: '駒大苫小牧', result: 'win' },
    { date: '5月6日', ourScore: 4, opponentScore: 5, opponent: '鹿角', result: 'loss' },
    { date: '5月6日', ourScore: 7, opponentScore: 5, opponent: '鹿角', result: 'win' },
    { date: '5月24日', ourScore: 2, opponentScore: 6, opponent: '東奥義塾', result: 'loss' },
    { date: '5月24日', ourScore: 4, opponentScore: 9, opponent: '東奥義塾', result: 'loss' },
    { date: '5月31日', ourScore: 3, opponentScore: 2, opponent: '青森商業', result: 'win' },
    { date: '5月31日', ourScore: 5, opponentScore: 2, opponent: '青森商業', result: 'win' },
    { date: '6月1日', ourScore: 3, opponentScore: 2, opponent: '盛岡誠桜', result: 'win' },
    { date: '6月1日', ourScore: 3, opponentScore: 6, opponent: '盛岡誠桜', result: 'loss' },
    { date: '6月7日', ourScore: 15, opponentScore: 1, opponent: '青森中央', result: 'win' },
    { date: '6月7日', ourScore: 11, opponentScore: 6, opponent: '青森中央', result: 'win' },
    { date: '6月8日', ourScore: 2, opponentScore: 9, opponent: '千葉経済', result: 'loss' },
    { date: '6月8日', ourScore: 6, opponentScore: 10, opponent: '仙台育英', result: 'loss' },
    { date: '6月8日', ourScore: 9, opponentScore: 8, opponent: '八戸工業', result: 'win' },
    { date: '6月8日', ourScore: 24, opponentScore: 2, opponent: '八戸工業', result: 'win' },
    { date: '6月15日', ourScore: 0, opponentScore: 2, opponent: '大崎中央', result: 'loss' },
    { date: '6月15日', ourScore: 7, opponentScore: 11, opponent: '盛岡大付', result: 'loss' },
    { date: '6月28日', ourScore: 12, opponentScore: 1, opponent: '大間', result: 'win' },
    { date: '6月28日', ourScore: 13, opponentScore: 5, opponent: '大間', result: 'win' },
    { date: '6月29日', ourScore: 9, opponentScore: 3, opponent: '福岡', result: 'win' },
    { date: '6月29日', ourScore: 14, opponentScore: 4, opponent: '福岡', result: 'win' },
    { date: '7月5日', ourScore: 7, opponentScore: 1, opponent: '青森工業', result: 'win' },
    { date: '7月5日', ourScore: 7, opponentScore: 3, opponent: '青森工業', result: 'win' },
    { date: '7月6日', ourScore: 4, opponentScore: 1, opponent: '盛岡第四', result: 'win' },
    { date: '7月6日', ourScore: 5, opponentScore: 1, opponent: '盛岡第四', result: 'win' },
    { date: '7月26日', ourScore: 5, opponentScore: 9, opponent: '三沢商業', result: 'loss' },
    { date: '7月26日', ourScore: 5, opponentScore: 6, opponent: '三沢商業', result: 'loss' },
    { date: '8月2日', ourScore: 8, opponentScore: 22, opponent: '福岡', result: 'loss' },
    { date: '8月2日', ourScore: 5, opponentScore: 11, opponent: '福岡', result: 'loss' },
    { date: '8月3日', ourScore: 4, opponentScore: 9, opponent: '千葉経済', result: 'loss' },
    { date: '8月3日', ourScore: 3, opponentScore: 7, opponent: '千葉経済', result: 'loss' },
    { date: '8月18日', ourScore: 1, opponentScore: 11, opponent: 'クラーク', result: 'loss' },
    { date: '8月18日', ourScore: 0, opponentScore: 8, opponent: 'クラーク', result: 'loss' },
    { date: '8月30日', ourScore: 6, opponentScore: 4, opponent: '明の星', result: 'win' },
    { date: '8月30日', ourScore: 4, opponentScore: 9, opponent: '明の星', result: 'loss' },
    { date: '8月31日', ourScore: 7, opponentScore: 6, opponent: '三本木', result: 'win' },
    { date: '8月31日', ourScore: 18, opponentScore: 3, opponent: '東奥義塾', result: 'win' },
    { date: '10月4日', ourScore: 5, opponentScore: 5, opponent: '光星', result: 'draw' },
    { date: '10月5日', ourScore: 4, opponentScore: 0, opponent: '八戸', result: 'win' },
    { date: '10月5日', ourScore: 6, opponentScore: 14, opponent: '八戸', result: 'loss' },
    { date: '11月8日', ourScore: 9, opponentScore: 1, opponent: '八戸工業', result: 'win' },
    { date: '11月8日', ourScore: 21, opponentScore: 7, opponent: '八戸工業', result: 'win' }
  ];

  // 公式戦データ（大会ごとに分類）
  readonly officialTournaments: Tournament[] = [
    {
      name: '室岡杯',
      matches: [
        { date: '4月12日', ourScore: 15, opponentScore: 5, opponent: '八戸工業', result: 'win' },
        { date: '4月19日', ourScore: 0, opponentScore: 3, opponent: '工大一', result: 'loss' },
        { date: '4月20日', ourScore: 3, opponentScore: 5, opponent: 'ウルスラ', result: 'loss' }
      ]
    },
    {
      name: '春季県大会',
      matches: [
        { date: '5月10日', ourScore: 6, opponentScore: 0, opponent: '青森', result: 'win' },
        { date: '5月12日', ourScore: 3, opponentScore: 6, opponent: '光星', result: 'loss' }
      ]
    },
    {
      name: '甲子園予選',
      matches: [
        { date: '7月13日', ourScore: 1, opponentScore: 3, opponent: '下山学園', result: 'loss' }
      ]
    },
    {
      name: '秋季リーグ戦',
      matches: [
        { date: '8月9日', ourScore: 2, opponentScore: 3, opponent: '工大二', result: 'loss' },
        { date: '8月10日', ourScore: 12, opponentScore: 2, opponent: '八戸北', result: 'win' },
        { date: '8月16日', ourScore: 22, opponentScore: 1, opponent: '八商・八水', result: 'win' },
        { date: '8月17日', ourScore: 7, opponentScore: 3, opponent: 'ウルスラ', result: 'win' },
        { date: '8月23日', ourScore: 8, opponentScore: 0, opponent: '八戸東', result: 'win' }
      ]
    },
    {
      name: '秋季県大会',
      matches: [
        { date: '9月8日', ourScore: 10, opponentScore: 0, opponent: '東奥学園', result: 'win' },
        { date: '9月14日', ourScore: 5, opponentScore: 7, opponent: '青森北', result: 'loss' }
      ]
    },
    {
      name: '1年生大会',
      matches: [
        { date: '10月4日', ourScore: 3, opponentScore: 7, opponent: '光星', result: 'loss' }
      ]
    }
  ];

  // 統計情報
  get practiceStats() {
    const total = this.practiceMatches.length;
    const wins = this.practiceMatches.filter(m => m.result === 'win').length;
    const losses = this.practiceMatches.filter(m => m.result === 'loss').length;
    const draws = this.practiceMatches.filter(m => m.result === 'draw').length;
    return { total, wins, losses, draws };
  }

  get officialStats() {
    const allMatches = this.officialTournaments.flatMap(t => t.matches);
    const total = allMatches.length;
    const wins = allMatches.filter(m => m.result === 'win').length;
    const losses = allMatches.filter(m => m.result === 'loss').length;
    return { total, wins, losses };
  }

  getResultClass(result: string): string {
    switch (result) {
      case 'win': return 'bg-white border-l-4 border-l-blue-600 shadow-md hover:shadow-xl';
      case 'loss': return 'bg-white border-l-4 border-l-red-500 shadow-md hover:shadow-xl opacity-90';
      case 'draw': return 'bg-white border-l-4 border-l-yellow-500 shadow-md hover:shadow-xl';
      default: return '';
    }
  }

  getResultText(result: string): string {
    switch (result) {
      case 'win': return 'WIN';
      case 'loss': return 'LOSE';
      case 'draw': return 'DRAW';
      default: return '';
    }
  }

  getScoreClass(result: string): string {
    switch (result) {
      case 'win': return 'text-blue-700';
      case 'loss': return 'text-red-600';
      case 'draw': return 'text-yellow-600';
      default: return 'text-gray-800';
    }
  }

  switchTab(tab: 'practice' | 'official') {
    this.viewMode.set(tab);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge'
    });
  }

  scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}

