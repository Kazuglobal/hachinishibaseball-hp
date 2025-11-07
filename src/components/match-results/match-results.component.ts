import { Component, ChangeDetectionStrategy, signal, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';

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
  imports: [CommonModule, SectionTitleComponent, BackButtonComponent, ObserveVisibilityDirective],
  templateUrl: './match-results.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchResultsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  isVisible = signal(false);
  viewMode = signal<'practice' | 'official'>('practice');

  ngOnInit() {
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
    { date: '', ourScore: 4, opponentScore: 3, opponent: '盛岡市立', result: 'win', notes: '日付不明' },
    { date: '3月9日', ourScore: 0, opponentScore: 18, opponent: '仙台育英', result: 'loss' },
    { date: '3月17日', ourScore: 14, opponentScore: 2, opponent: '盛岡市立', result: 'win' },
    { date: '3月17日', ourScore: 2, opponentScore: 25, opponent: '仙台育英', result: 'loss' },
    { date: '3月23日', ourScore: 2, opponentScore: 15, opponent: '弘前東', result: 'loss' },
    { date: '3月24日', ourScore: 9, opponentScore: 4, opponent: '久慈東', result: 'win' },
    { date: '3月28日', ourScore: 15, opponentScore: 11, opponent: '青森', result: 'win' },
    { date: '3月30日', ourScore: 3, opponentScore: 1, opponent: '久慈', result: 'win' },
    { date: '3月30日', ourScore: 9, opponentScore: 8, opponent: '久慈東', result: 'win' },
    { date: '3月30日', ourScore: 4, opponentScore: 7, opponent: '弘前東', result: 'loss' },
    { date: '3月30日', ourScore: 13, opponentScore: 12, opponent: '青森', result: 'win' },
    { date: '3月30日', ourScore: 4, opponentScore: 10, opponent: '久慈', result: 'loss' },
    { date: '4月6日', ourScore: 6, opponentScore: 5, opponent: '鹿角', result: 'win' },
    { date: '4月6日', ourScore: 4, opponentScore: 23, opponent: '盛岡第三', result: 'loss' },
    { date: '4月6日', ourScore: 12, opponentScore: 1, opponent: '鹿角', result: 'win' },
    { date: '4月7日', ourScore: 2, opponentScore: 3, opponent: '盛岡第三', result: 'loss' },
    { date: '4月13日', ourScore: 10, opponentScore: 0, opponent: '八戸東', result: 'win' },
    { date: '4月13日', ourScore: 17, opponentScore: 9, opponent: '八戸東', result: 'win' },
    { date: '4月21日', ourScore: 1, opponentScore: 0, opponent: 'ウルスラ', result: 'win' },
    { date: '4月27日', ourScore: 13, opponentScore: 6, opponent: '工大二', result: 'win' },
    { date: '4月28日', ourScore: 2, opponentScore: 9, opponent: '仙台育英', result: 'loss' },
    { date: '4月28日', ourScore: 11, opponentScore: 14, opponent: '工大二', result: 'loss' },
    { date: '5月3日', ourScore: 3, opponentScore: 4, opponent: '工大二', result: 'loss' },
    { date: '5月3日', ourScore: 11, opponentScore: 10, opponent: '工大二', result: 'win' },
    { date: '5月3日', ourScore: 0, opponentScore: 11, opponent: '仙台育英', result: 'loss' },
    { date: '5月4日', ourScore: 12, opponentScore: 5, opponent: '酒田南', result: 'win' },
    { date: '5月4日', ourScore: 6, opponentScore: 13, opponent: '工大二', result: 'loss' },
    { date: '5月4日', ourScore: 5, opponentScore: 9, opponent: '駒大苫小牧', result: 'loss' },
    { date: '5月4日', ourScore: 7, opponentScore: 8, opponent: '酒田南', result: 'loss' },
    { date: '5月5日', ourScore: 2, opponentScore: 3, opponent: '駒大苫小牧', result: 'loss' },
    { date: '5月19日', ourScore: 0, opponentScore: 12, opponent: '青森山田', result: 'loss' },
    { date: '5月25日', ourScore: 4, opponentScore: 7, opponent: '久慈', result: 'loss' },
    { date: '', ourScore: 13, opponentScore: 1, opponent: '青森', result: 'win', notes: '日付不明' },
    { date: '6月1日', ourScore: 3, opponentScore: 1, opponent: '仙台東', result: 'win' },
    { date: '6月1日', ourScore: 6, opponentScore: 4, opponent: '仙台東', result: 'win' },
    { date: '6月1日', ourScore: 24, opponentScore: 15, opponent: '青森', result: 'win' },
    { date: '6月1日', ourScore: 1, opponentScore: 12, opponent: '久慈', result: 'loss' },
    { date: '6月2日', ourScore: 5, opponentScore: 4, opponent: '気仙沼', result: 'win' },
    { date: '6月2日', ourScore: 4, opponentScore: 5, opponent: '気仙沼向洋', result: 'loss' },
    { date: '6月8日', ourScore: 6, opponentScore: 7, opponent: '盛岡商業', result: 'loss' },
    { date: '6月8日', ourScore: 18, opponentScore: 5, opponent: '名久井農業', result: 'win' },
    { date: '6月8日', ourScore: 1, opponentScore: 4, opponent: '能代松陽', result: 'loss' },
    { date: '6月9日', ourScore: 0, opponentScore: 2, opponent: '山形中央', result: 'loss' },
    { date: '6月9日', ourScore: 11, opponentScore: 4, opponent: '三沢', result: 'win' },
    { date: '6月9日', ourScore: 2, opponentScore: 9, opponent: '盛岡商業', result: 'loss' },
    { date: '6月9日', ourScore: 1, opponentScore: 3, opponent: '一関学院', result: 'loss' },
    { date: '6月15日', ourScore: 4, opponentScore: 1, opponent: '能代松陽', result: 'win' },
    { date: '6月16日', ourScore: 9, opponentScore: 6, opponent: '五所川原農', result: 'win' },
    { date: '', ourScore: 11, opponentScore: 4, opponent: '八戸', result: 'win', notes: '日付不明' },
    { date: '7月21日', ourScore: 2, opponentScore: 3, opponent: '三沢商業', result: 'loss' },
    { date: '7月21日', ourScore: 7, opponentScore: 6, opponent: '三沢商業', result: 'win' },
    { date: '8月3日', ourScore: 17, opponentScore: 11, opponent: '福岡', result: 'win' },
    { date: '8月3日', ourScore: 15, opponentScore: 12, opponent: '福岡', result: 'win' },
    { date: '8月3日', ourScore: 5, opponentScore: 7, opponent: '久慈', result: 'loss' },
    { date: '8月4日', ourScore: 3, opponentScore: 3, opponent: '久慈', result: 'draw', notes: '分' },
    { date: '8月10日', ourScore: 4, opponentScore: 5, opponent: '盛岡商業', result: 'loss' },
    { date: '8月18日', ourScore: 14, opponentScore: 1, opponent: '八戸東', result: 'win' },
    { date: '8月24日', ourScore: 8, opponentScore: 9, opponent: '工大二', result: 'loss' },
    { date: '8月31日', ourScore: 5, opponentScore: 0, opponent: '八戸', result: 'win' },
    { date: '8月31日', ourScore: 4, opponentScore: 5, opponent: '市立函館', result: 'loss' },
    { date: '10月5日', ourScore: 3, opponentScore: 15, opponent: '八戸', result: 'loss' },
    { date: '10月6日', ourScore: 1, opponentScore: 4, opponent: '青森北', result: 'loss' },
    { date: '10月6日', ourScore: 6, opponentScore: 7, opponent: 'ウルスラ', result: 'loss' },
    { date: '10月6日', ourScore: 10, opponentScore: 10, opponent: '青森北', result: 'draw', notes: '分' },
    { date: '10月14日', ourScore: 2, opponentScore: 3, opponent: 'ウルスラ', result: 'loss' },
    { date: '10月27日', ourScore: 18, opponentScore: 2, opponent: '大間', result: 'win' },
    { date: '10月27日', ourScore: 2, opponentScore: 8, opponent: '駒大苫小牧', result: 'loss' },
    { date: '10月27日', ourScore: 24, opponentScore: 1, opponent: '大間', result: 'win' },
    { date: '11月9日', ourScore: 3, opponentScore: 8, opponent: '駒大苫小牧', result: 'loss' }
  ];

  // 公式戦データ（大会ごとに分類）
  readonly officialTournaments: Tournament[] = [
    {
      name: '室岡杯',
      matches: [
        { date: '4月14日', ourScore: 0, opponentScore: 2, opponent: '工大一', result: 'loss' },
        { date: '4月20日', ourScore: 8, opponentScore: 1, opponent: '八戸北', result: 'win' }
      ]
    },
    {
      name: '春季県大会',
      matches: [
        { date: '5月12日', ourScore: 6, opponentScore: 3, opponent: '弘前実業', result: 'win' },
        { date: '5月12日', ourScore: 4, opponentScore: 11, opponent: '駒大苫小牧', result: 'loss' },
        { date: '5月18日', ourScore: 5, opponentScore: 3, opponent: '弘前南', result: 'win' }
      ]
    },
    {
      name: '甲子園予選',
      matches: [
        { date: '6月29日', ourScore: 8, opponentScore: 1, opponent: '北三陸連合', result: 'win' },
        { date: '6月29日', ourScore: 7, opponentScore: 3, opponent: '北三陸連合', result: 'win' },
        { date: '6月29日', ourScore: 4, opponentScore: 1, opponent: '青森工業', result: 'win' },
        { date: '7月6日', ourScore: 9, opponentScore: 6, opponent: '青森工業', result: 'win' },
        { date: '7月13日', ourScore: 0, opponentScore: 7, opponent: '東奥義塾', result: 'loss' },
        { date: '7月20日', ourScore: 1, opponentScore: 2, opponent: '八戸', result: 'loss' },
        { date: '8月1日', ourScore: 2, opponentScore: 7, opponent: '知内', result: 'loss' }
      ]
    },
    {
      name: '秋季リーグ戦',
      matches: [
        { date: '9月8日', ourScore: 2, opponentScore: 3, opponent: '木造', result: 'loss' }
      ]
    },
    {
      name: '秋季県大会',
      matches: [
        { date: '9月29日', ourScore: 5, opponentScore: 18, opponent: '工大二', result: 'loss' }
      ]
    },
    {
      name: '1年生大会',
      matches: [
        { date: '10月5日', ourScore: 12, opponentScore: 2, opponent: '八戸', result: 'win' },
        { date: '10月20日', ourScore: 6, opponentScore: 10, opponent: '八戸北', result: 'loss' },
        { date: '10月20日', ourScore: 7, opponentScore: 14, opponent: '工大二', result: 'loss' }
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
      case 'win': return 'bg-green-100 text-green-800 border-green-300';
      case 'loss': return 'bg-red-100 text-red-800 border-red-300';
      case 'draw': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return '';
    }
  }

  getResultText(result: string): string {
    switch (result) {
      case 'win': return '勝';
      case 'loss': return '負';
      case 'draw': return '分';
      default: return '';
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
}
