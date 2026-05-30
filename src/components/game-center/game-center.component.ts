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
      description: 'タイミングを合わせてボールを打ち返せ！10球中何本ホームランを打てるかチャレンジ！',
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
      description: '指定されたコースに投げ分けろ！精密なコントロールで高得点を狙え！',
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
      description: '60秒間でフライボールをキャッチ！連続キャッチでコンボボーナス獲得！',
      icon: '🧤',
      thumbnail: 'assets/images/catch.png',
      route: '/game/catch',
      color: 'from-green-600 to-green-800'
    }
  ];

  ngOnInit(): void {
    this.seoService.updateSEO({
      title: 'ゲームセンター | 八戸西高校 野球部OB会',
      description: '八戸西高校野球部OB会公式サイトの野球ミニゲーム集。ホームランチャレンジ、ストライクピッチング、守備キャッチの3種類のゲームで遊ぼう！',
      keywords: '八戸西高校,野球部,OB会,野球ゲーム,ミニゲーム,ホームラン,ピッチング',
      url: 'https://hachinohenishibaseball.com/game'
    });
  }

  selectRankingGame(gameType: GameType): void {
    this.selectedRankingGame.set(gameType);
  }
}
