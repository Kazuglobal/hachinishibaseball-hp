import { Component, ChangeDetectionStrategy, signal, computed, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SEOService } from '../../services/seo.service';

type GameState = 'idle' | 'pitching' | 'ready' | 'swinging' | 'result' | 'finished';
type HitResult = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './game.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameComponent implements OnInit, OnDestroy {
  private seoService = inject(SEOService);
  
  // ゲーム状態
  gameState = signal<GameState>('idle');
  currentBall = signal(0);
  totalBalls = 10;
  score = signal(0);
  highScore = signal(0);
  
  // タイミング関連
  ballPosition = signal(0); // 0-100 (0: 投手位置, 100: 打者位置)
  perfectZone = signal(45); // ストライクゾーン到達位置
  perfectZoneWidth = 5; // パーフェクトゾーンの幅
  swingTiming = signal<number | null>(null);
  lastResult = signal<HitResult | null>(null);
  
  // アニメーション
  private animationFrameId: number | null = null;
  private pitchStartTime = 0;
  private pitchDuration = 2000; // 2秒で投球
  private scheduledTimeouts: number[] = [];
  
  // 計算プロパティ
  remainingBalls = computed(() => this.totalBalls - this.currentBall());
  isGameActive = computed(() => 
    this.gameState() === 'pitching' || 
    this.gameState() === 'ready' || 
    this.gameState() === 'swinging'
  );
  
  ngOnInit(): void {
    this.seoService.updateSEO({
      title: 'ホームラン王チャレンジ | 八戸西高校 野球部OB会',
      description: 'タイミングを合わせてホームランを打とう！10球勝負でハイスコアを目指す野球ゲーム。',
      keywords: '野球ゲーム,ホームラン,バッティングゲーム,八戸西高校',
      url: 'https://hachinishibaseball-ob.com/game'
    });
    
    // ハイスコアを読み込み
    this.loadHighScore();
  }
  
  ngOnDestroy(): void {
    this.stopAnimation();
    // 登録済みのタイマーを全てクリア
    for (const id of this.scheduledTimeouts) {
      clearTimeout(id);
    }
    this.scheduledTimeouts = [];
  }

  private scheduleTimeout(callback: () => void, delay: number): void {
    const id = window.setTimeout(callback, delay);
    this.scheduledTimeouts.push(id);
  }
  
  startGame(): void {
    this.gameState.set('idle');
    this.currentBall.set(0);
    this.score.set(0);
    this.lastResult.set(null);
    this.nextPitch();
  }
  
  nextPitch(): void {
    if (this.currentBall() >= this.totalBalls) {
      this.finishGame();
      return;
    }
    
    this.currentBall.update(v => v + 1);
    this.gameState.set('pitching');
    this.ballPosition.set(0);
    this.swingTiming.set(null);
    this.lastResult.set(null);
    
    // ストライクゾーンの位置をランダムに変更（35-55%の間）
    this.perfectZone.set(35 + Math.random() * 20);
    
    // ランダムなタイミングでストライクゾーンに到達（1.5秒〜2.5秒の間）
    const randomDelay = 500 + Math.random() * 1000;
    this.pitchDuration = 1500 + randomDelay;
    this.pitchStartTime = Date.now();
    
    this.startAnimation();
    
    // ストライクゾーン到達を検知
    this.scheduleTimeout(() => {
      if (this.gameState() === 'pitching') {
        this.gameState.set('ready');
        // 0.3秒以内に打たないとMISS
        this.scheduleTimeout(() => {
          if (this.gameState() === 'ready') {
            this.processSwing(null);
          }
        }, 300);
      }
    }, this.pitchDuration - 300);
  }
  
  startAnimation(): void {
    const animate = () => {
      if (this.gameState() === 'pitching' || this.gameState() === 'ready') {
        const elapsed = Date.now() - this.pitchStartTime;
        const progress = Math.min(elapsed / this.pitchDuration, 1);
        this.ballPosition.set(progress * 100);
        
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        this.stopAnimation();
      }
    };
    
    this.animationFrameId = requestAnimationFrame(animate);
  }
  
  stopAnimation(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  swing(): void {
    if (this.gameState() !== 'ready' && this.gameState() !== 'pitching') {
      return;
    }
    
    const currentPos = this.ballPosition();
    this.swingTiming.set(currentPos);
    this.gameState.set('swinging');
    this.stopAnimation();
    
    this.scheduleTimeout(() => {
      this.processSwing(currentPos);
    }, 100);
  }
  
  processSwing(timing: number | null): void {
    if (timing === null) {
      // タイムアウトでMISS
      this.lastResult.set('MISS');
      this.gameState.set('result');
    } else {
      const zoneCenter = this.perfectZone();
      const distance = Math.abs(timing - zoneCenter);
      
      let result: HitResult;
      let points = 0;
      
      if (distance <= this.perfectZoneWidth) {
        result = 'PERFECT';
        points = 100;
      } else if (distance <= this.perfectZoneWidth * 2) {
        result = 'GREAT';
        points = 50;
      } else if (distance <= this.perfectZoneWidth * 4) {
        result = 'GOOD';
        points = 20;
      } else {
        result = 'MISS';
        points = 0;
      }
      
      this.lastResult.set(result);
      this.score.update(s => s + points);
      this.gameState.set('result');
    }
    
    // 結果表示後、次の投球へ
    this.scheduleTimeout(() => {
      if (this.currentBall() < this.totalBalls) {
        this.nextPitch();
      } else {
        this.finishGame();
      }
    }, 1500);
  }
  
  finishGame(): void {
    this.gameState.set('finished');
    this.stopAnimation();
    
    const finalScore = this.score();
    if (finalScore > this.highScore()) {
      this.highScore.set(finalScore);
      this.saveHighScore(finalScore);
    }
  }
  
  loadHighScore(): void {
    try {
      const saved = localStorage.getItem('baseball-game-highscore');
      if (saved) {
        this.highScore.set(parseInt(saved, 10));
      }
    } catch (e) {
      console.error('Failed to load high score:', e);
    }
  }
  
  saveHighScore(score: number): void {
    try {
      localStorage.setItem('baseball-game-highscore', score.toString());
    } catch (e) {
      console.error('Failed to save high score:', e);
    }
  }
  
  getResultMessage(result: HitResult | null): string {
    switch (result) {
      case 'PERFECT':
        return 'ホームラン！';
      case 'GREAT':
        return '長打！';
      case 'GOOD':
        return 'ヒット！';
      case 'MISS':
        return '空振り...';
      default:
        return '';
    }
  }
  
  getResultColor(result: HitResult | null): string {
    switch (result) {
      case 'PERFECT':
        return 'text-yellow-400';
      case 'GREAT':
        return 'text-orange-400';
      case 'GOOD':
        return 'text-green-400';
      case 'MISS':
        return 'text-gray-400';
      default:
        return '';
    }
  }
}

