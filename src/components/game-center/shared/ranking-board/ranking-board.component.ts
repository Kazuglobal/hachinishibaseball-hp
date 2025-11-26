import { Component, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameScoreService, GameType, GameScore } from '../../../../services/game-score.service';

@Component({
  selector: 'app-ranking-board',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6">
      @if (scores().length === 0) {
        <div class="text-center py-10">
          <div class="text-4xl mb-3 opacity-30">🎮</div>
          <p class="text-white/40 text-sm">
            まだ記録がありません
          </p>
          <p class="text-white/30 text-xs mt-1">
            プレイしてスコアを残そう！
          </p>
        </div>
      } @else {
        <div class="space-y-2">
          @for (score of scores(); track $index; let i = $index) {
            <div 
              class="flex items-center gap-4 p-4 rounded-xl transition-all duration-300 hover:scale-[1.02]"
              [class.bg-gradient-to-r]="i < 3"
              [class.from-yellow-500/20]="i === 0"
              [class.to-orange-500/10]="i === 0"
              [class.from-gray-400/20]="i === 1"
              [class.to-gray-500/10]="i === 1"
              [class.from-orange-600/20]="i === 2"
              [class.to-orange-700/10]="i === 2"
              [class.bg-white/5]="i > 2"
              [class.border-l-4]="i < 3"
              [class.border-yellow-400]="i === 0"
              [class.border-gray-400]="i === 1"
              [class.border-orange-500]="i === 2">
              
              <!-- 順位 -->
              <div 
                class="w-10 h-10 rounded-full flex items-center justify-center font-oswald font-bold text-lg shadow-lg"
                [class.bg-gradient-to-br]="i < 3"
                [class.from-yellow-400]="i === 0"
                [class.to-yellow-600]="i === 0"
                [class.text-black]="i < 3"
                [class.from-gray-300]="i === 1"
                [class.to-gray-500]="i === 1"
                [class.from-orange-400]="i === 2"
                [class.to-orange-600]="i === 2"
                [class.bg-white/10]="i > 2"
                [class.text-white/50]="i > 2">
                @if (i === 0) {
                  <span class="drop-shadow">👑</span>
                } @else {
                  {{i + 1}}
                }
              </div>
              
              <!-- 名前・日付 -->
              <div class="flex-1 min-w-0">
                <p class="font-bold truncate"
                   [class.text-yellow-300]="i === 0"
                   [class.text-gray-300]="i === 1"
                   [class.text-orange-300]="i === 2"
                   [class.text-white/70]="i > 2">
                  {{score.nickname}}
                </p>
                <p class="text-xs text-white/30">{{score.date}}</p>
              </div>
              
              <!-- スコア -->
              <div class="font-oswald text-2xl font-bold drop-shadow-lg"
                   [class.text-yellow-400]="i === 0"
                   [class.text-gray-300]="i === 1"
                   [class.text-orange-400]="i === 2"
                   [class.text-white/60]="i > 2">
                {{score.score | number}}
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RankingBoardComponent {
  private gameScoreService = inject(GameScoreService);
  
  gameType = input.required<GameType>();

  scores(): GameScore[] {
    return this.gameScoreService.getScores(this.gameType());
  }
}
