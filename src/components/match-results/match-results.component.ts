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
      url: 'https://hachinohenishibaseball.com/match-results'
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
      // 年度（デフォルトは令和8年）
      this.selectedSeason.set(params['year'] === 'r7' ? 'r7' : 'r8');
      this.cdr.markForCheck();
    });
  }

  // 練習試合データ
  readonly practiceMatchesR7: Match[] = [
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
  readonly officialTournamentsR7: Tournament[] = [
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

  // ===== 令和8年（2026年）=====
  // 練習試合データ（対戦校, 日付, 八戸西の得点, 相手の得点）
  readonly practiceMatchesR8: Match[] = [
    ['3月14日', 6, 3, '青森山田'], ['3月14日', 0, 1, '青森山田'],
    ['3月20日', 1, 10, '久慈'], ['3月20日', 6, 14, '久慈'],
    ['3月22日', 0, 6, '弘前東'], ['3月22日', 1, 3, '弘前東'],
    ['3月28日', 6, 0, '上北連合'], ['3月28日', 4, 3, '上北連合'],
    ['3月29日', 6, 5, '青森'], ['3月29日', 8, 7, '青森'],
    ['4月4日', 0, 0, '青森南'], ['4月4日', 14, 4, '青森南'],
    ['4月5日', 5, 5, '明の星'],
    ['4月26日', 3, 5, '横手'], ['4月26日', 12, 4, '横手'],
    ['4月29日', 2, 2, '能代松陽'], ['4月29日', 1, 20, '盛岡大学附属'],
    ['5月3日', 0, 9, '酒田南'], ['5月3日', 7, 5, '酒田南'],
    ['5月4日', 10, 1, '三本木'], ['5月4日', 3, 5, '三本木'],
    ['5月24日', 6, 2, '久慈'], ['5月24日', 6, 3, '久慈'],
    ['5月24日', 5, 9, '八戸商業'], ['5月24日', 0, 4, '八戸東'],
    ['5月30日', 12, 8, '東青連合'], ['5月30日', 8, 3, '東青連合'],
    ['5月31日', 6, 4, '盛岡誠桜'], ['5月31日', 8, 11, '盛岡誠桜'],
    ['6月6日', 6, 2, '三沢'], ['6月6日', 11, 5, '三沢'],
    ['6月7日', 8, 7, '千葉経大附属'], ['6月7日', 1, 2, '仙台育英'],
    ['6月7日', 0, 6, '光星'], ['6月7日', 6, 7, '光星'],
    ['6月21日', 7, 2, '黒沢尻北'],
    ['6月27日', 14, 11, '青森商業'], ['6月27日', 4, 4, '青森商業'],
    ['6月28日', 12, 14, '福岡'], ['6月28日', 13, 10, '福岡'],
    ['7月4日', 6, 9, '青森工業'], ['7月4日', 14, 0, '青森工業'],
    ['7月5日', 3, 6, '盛岡第四'], ['7月5日', 6, 4, '盛岡第四'],
    ['7月31日', 6, 1, '千葉経大附属'], ['7月31日', 4, 10, '千葉経大附属'],
    ['8月29日', 1, 0, '工大二'], ['8月29日', 7, 4, '工大二'],
    ['9月19日', 10, 8, '三沢商業'],
    ['10月4日', 9, 3, '八戸東'], ['10月4日', 5, 3, '八戸東'],
    ['10月10日', 11, 3, '青森北'], ['10月10日', 3, 8, '青森北'],
    ['10月18日', 12, 6, '明の星'], ['10月18日', 7, 5, '明の星'],
    ['11月1日', 3, 4, '工大二'], ['11月1日', 9, 0, '工大二'],
    ['11月7日', 6, 2, '聖ウルスラ'], ['11月7日', 3, 4, '聖ウルスラ'],
    ['11月8日', 5, 8, '青森商業'], ['11月8日', 5, 1, '青森商業'], ['11月8日', 20, 7, '八戸商業']
  ].map(([date, o, p, opponent]) => MatchResultsComponent.toMatch(date as string, o as number, p as number, opponent as string));

  // 公式戦データ（大会ごとに分類）
  readonly officialTournamentsR8: Tournament[] = [
    {
      name: '室岡杯',
      matches: [
        MatchResultsComponent.toMatch('4月11日', 12, 0, '八戸連合'),
        MatchResultsComponent.toMatch('4月12日', 3, 8, '工大一'),
        MatchResultsComponent.toMatch('4月18日', 11, 0, '八戸高専'),
        MatchResultsComponent.toMatch('4月19日', 8, 9, '聖ウルスラ')
      ]
    },
    {
      name: '春季県大会',
      matches: [
        MatchResultsComponent.toMatch('5月8日', 7, 3, '八戸工業'),
        MatchResultsComponent.toMatch('5月10日', 1, 3, '青森工業')
      ]
    },
    {
      name: '甲子園予選',
      matches: [
        MatchResultsComponent.toMatch('7月14日', 8, 0, '上北連合'),
        MatchResultsComponent.toMatch('7月15日', 3, 5, '三沢商業')
      ]
    },
    {
      name: '秋季リーグ戦',
      matches: [
        MatchResultsComponent.toMatch('8月8日', 5, 10, '工大一'),
        MatchResultsComponent.toMatch('8月16日', 16, 3, '八戸北'),
        MatchResultsComponent.toMatch('8月22日', 7, 6, '八戸'),
        MatchResultsComponent.toMatch('8月23日', 6, 5, '工大二')
      ]
    },
    {
      name: '秋季県大会',
      matches: [
        MatchResultsComponent.toMatch('9月7日', 6, 2, '八戸東'),
        MatchResultsComponent.toMatch('9月12日', 11, 1, '青森'),
        MatchResultsComponent.toMatch('9月13日', 1, 2, '東奥義塾')
      ]
    },
    {
      name: '1年生大会',
      matches: [
        MatchResultsComponent.toMatch('10月3日', 6, 2, '工大一'),
        MatchResultsComponent.toMatch('10月24日', 2, 3, '工大二'),
        MatchResultsComponent.toMatch('10月25日', 4, 1, '聖ウルスラ')
      ]
    }
  ];

  static toMatch(date: string, ourScore: number, opponentScore: number, opponent: string): Match {
    const result = ourScore > opponentScore ? 'win' : ourScore < opponentScore ? 'loss' : 'draw';
    return { date, ourScore, opponentScore, opponent, result };
  }

  // ===== 年度切り替え =====
  readonly seasons = [
    { key: 'r8' as const, label: '令和8年' },
    { key: 'r7' as const, label: '令和7年' }
  ];
  // 令和8年がメイン（デフォルト）
  selectedSeason = signal<'r8' | 'r7'>('r8');

  get selectedSeasonLabel(): string {
    return this.seasons.find(s => s.key === this.selectedSeason())?.label ?? '';
  }

  get practiceMatches(): Match[] {
    return this.selectedSeason() === 'r8' ? this.practiceMatchesR8 : this.practiceMatchesR7;
  }

  get officialTournaments(): Tournament[] {
    return this.selectedSeason() === 'r8' ? this.officialTournamentsR8 : this.officialTournamentsR7;
  }

  switchSeason(key: 'r8' | 'r7') {
    this.selectedSeason.set(key);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: key },
      queryParamsHandling: 'merge'
    });
  }

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

