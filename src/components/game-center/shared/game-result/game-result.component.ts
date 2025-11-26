import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-game-result',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="absolute inset-0 flex items-center justify-center bg-black/80 animate-fade-in z-20">
      <div class="bg-white rounded-2xl p-8 mx-4 max-w-md w-full text-center">
        <h2 class="text-3xl font-bold font-serif-jp text-gray-800 mb-4">{{title()}}</h2>
        
        <div 
          class="rounded-xl p-6 mb-6"
          [style.background]="'linear-gradient(135deg, ' + themeColor() + ', ' + themeColorDark() + ')'">
          <p class="text-white text-sm mb-1">最終スコア</p>
          <p class="text-5xl font-oswald font-bold text-white">{{score() | number}}</p>
        </div>
        
        <!-- カスタムスタッツ -->
        <ng-content></ng-content>
        
        @if (savedRank() === 0) {
          <div class="mb-6">
            <label class="block text-sm text-gray-600 mb-2">ニックネーム（任意）</label>
            <input 
              type="text" 
              [ngModel]="nickname()"
              (ngModelChange)="nicknameChange.emit($event)"
              placeholder="名無し"
              maxlength="10"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none"
              [style.--tw-ring-color]="themeColor()">
            <button 
              (click)="save.emit()"
              class="w-full mt-3 text-white py-3 rounded-lg font-bold transition-colors"
              [style.backgroundColor]="themeColor()">
              スコアを保存
            </button>
          </div>
        } @else {
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p class="text-yellow-800">🏆 ランキング {{savedRank()}}位にランクイン！</p>
          </div>
        }
        
        <div class="flex gap-4">
          <button 
            (click)="retry.emit()"
            class="flex-1 bg-gray-800 text-white py-3 rounded-lg font-bold hover:bg-gray-700 transition-colors">
            もう一度
          </button>
          <a 
            routerLink="/game"
            class="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-bold hover:bg-gray-300 transition-colors text-center">
            ゲーム選択
          </a>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameResultComponent {
  title = input<string>('ゲーム終了！');
  score = input.required<number>();
  themeColor = input<string>('#002D62');
  themeColorDark = input<string>('#001a3d');
  nickname = input<string>('');
  savedRank = input<number>(0);
  
  nicknameChange = output<string>();
  save = output<void>();
  retry = output<void>();
}
