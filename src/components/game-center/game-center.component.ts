import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GameScoreService, GameType } from '../../services/game-score.service';
import { SEOService } from '../../services/seo.service';
import { RankingBoardComponent } from './shared/ranking-board/ranking-board.component';

interface GameInfo {
  id: string;
  type: GameType;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  thumbnail: string;
  route: string;
  color: string;
}

@Component({
  selector: 'app-game-center',
  standalone: true,
  imports: [CommonModule, RouterLink, RankingBoardComponent],
  templateUrl: './game-center.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameCenterComponent implements OnInit {
  private seoService = inject(SEOService);
  gameScoreService = inject(GameScoreService);

  selectedRankingGame = signal<GameType>('homerun');

  games: GameInfo[] = [
    {
      id: 'homerun',
      type: 'homerun',
      title: 'ホームランチャレンジ',
      subtitle: 'HOMERUN CHALLENGE',
      description: '球種とコースを見極めてタイミングを合わせろ！打球初速・角度から飛距離が決まる本格バッティング。5打席勝負。',
      icon: '⚾',
      thumbnail: 'assets/images/homerun.png',
      route: '/game/homerun',
      color: 'from-red-600 to-red-800'
    },
    {
      id: 'pitching',
      type: 'pitching',
      title: 'ストライクピッチング',
      subtitle: 'STRIKE PITCHING',
      description: '球種・コース・球威・制球を選んで投げ分けろ！打者3人を抑えて無失点で切り抜けられるか。',
      icon: '🎯',
      thumbnail: 'assets/images/piching.png',
      route: '/game/pitching',
      color: 'from-blue-800 to-blue-950'
    },
    {
      id: 'catch',
      type: 'catch',
      title: '守備キャッチ',
      subtitle: 'CATCH FLY',
      description: '打球の落下点を読んで走れ！前後左右に動く本格的な外野守備。ダイビングキャッチで高得点。',
      icon: '🧤',
      thumbnail: 'assets/images/catch.png',
      route: '/game/catch',
      color: 'from-green-600 to-green-800'
    }
  ];

  ngOnInit(): void {
    this.seoService.updateSEO({
      title: 'ゲームセンター | 八戸西高校 野球部OB会',
      description: '八戸西高校野球部OB会公式サイトの野球ミニゲーム集。実際の野球の物理とルールを再現したホームランチャレンジ、ストライクピッチング、守備キャッチの3種類で遊ぼう！',
      keywords: '八戸西高校,野球部,OB会,野球ゲーム,ミニゲーム,ホームラン,ピッチング',
      url: 'https://hachinohenishibaseball.com/game'
    });
  }

  selectRankingGame(gameType: GameType): void {
    this.selectedRankingGame.set(gameType);
  }
}
