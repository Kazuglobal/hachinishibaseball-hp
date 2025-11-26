import { Component, ChangeDetectionStrategy, signal, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GameScoreService } from '../../../../services/game-score.service';
import { SEOService } from '../../../../services/seo.service';

type GameState = 'ready' | 'selecting' | 'power' | 'throwing' | 'result' | 'gameover';

interface PitchResult {
  targetZone: number;
  hitZone: number;
  accuracy: number;
  score: number;
  rating: 'perfect' | 'great' | 'good' | 'ok' | 'miss';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

@Component({
  selector: 'app-strike-pitching',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './strike-pitching.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StrikePitchingComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private ctx!: CanvasRenderingContext2D;
  private animationId: number = 0;
  private isBrowser: boolean;
  private powerInterval: any;
  
  private seoService = inject(SEOService);
  private gameScoreService = inject(GameScoreService);

  // キャンバス
  private canvasWidth = 0;
  private canvasHeight = 0;

  // ゲーム状態
  gameState = signal<GameState>('ready');
  currentPitch = signal(0);
  // 1ゲームで投げられる球数（デフォルト5→10球に増量）
  totalPitches = 10;
  score = signal(0);
  results = signal<PitchResult[]>([]);
  
  // ターゲットとプレイヤー選択
  targetZone = signal(0);
  selectedZone = signal(0);
  hoveredZone = signal(0);
  
  // パワーゲージ
  power = signal(0);
  powerDirection = 1;
  optimalPower = signal(0);
  
  // 投球アニメーション
  private ballX = 0;
  private ballY = 0;
  private ballZ = 0; // 0=投手、1000=キャッチャー
  private ballTargetX = 0;
  private ballTargetY = 0;
  private throwProgress = 0;
  
  // パーティクル
  private particles: Particle[] = [];
  
  // 投球結果
  hitZone = signal(0);
  showResult = signal(false);
  currentResult = signal<PitchResult | null>(null);
  
  // アニメーション
  private frameCount = 0;
  private gloveShake = 0;
  
  // ゲームオーバー
  nickname = '';
  savedRank = signal(0);
  highScore = signal(0);

  // サウンド
  private throwSound?: HTMLAudioElement;
  private perfectSound?: HTMLAudioElement;
  private missSound?: HTMLAudioElement;

  zones = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.seoService.updateSEO({
      title: 'ストライクピッチング | 八戸西高校 野球部OB会',
      description: '指定されたコースに投げ分けろ！精密なコントロールで高得点を狙え！',
      keywords: '野球ゲーム,ピッチング,投球,ミニゲーム',
      url: 'https://hachinishibaseball-ob.com/game/pitching'
    });
    this.highScore.set(this.gameScoreService.getHighScore('pitching'));
    if (this.isBrowser) {
      this.initSounds();
    }
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      this.ctx = canvas.getContext('2d')!;
      this.resizeCanvas();
      this.drawReadyScreen();
      
      window.addEventListener('resize', () => this.resizeCanvas());
    }
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.powerInterval) {
      clearInterval(this.powerInterval);
    }
  }

  private resizeCanvas(): void {
    if (!this.isBrowser) return;
    
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.75, 500);
      this.canvasWidth = canvas.width;
      this.canvasHeight = canvas.height;

      // レイアウト変更時に現在の状態に応じて再描画してレスポンシブ性を保つ
      const state = this.gameState();
      if (state === 'ready') {
        this.drawReadyScreen();
      } else if (state === 'selecting' || state === 'power' || state === 'throwing' || state === 'result') {
        // ゲーム進行中は現在フレームを再描画
        this.drawGame();
      } else if (state === 'gameover') {
        // ゲームオーバー時も背景/ゾーン/ミットを最新サイズで描画
        this.drawGame();
      }
    }
  }

  startGame(): void {
    this.gameState.set('ready');
    this.currentPitch.set(0);
    this.score.set(0);
    this.results.set([]);
    this.savedRank.set(0);
    this.nextPitch();
  }

  private nextPitch(): void {
    if (this.currentPitch() >= this.totalPitches) {
      this.endGame();
      return;
    }

    this.currentPitch.update(v => v + 1);
    this.showResult.set(false);
    this.currentResult.set(null);
    this.selectedZone.set(0);
    this.hoveredZone.set(0);
    this.power.set(0);
    this.hitZone.set(0);
    this.particles = [];
    
    // ランダムなターゲットゾーン
    this.targetZone.set(Math.floor(Math.random() * 9) + 1);
    
    // 最適パワー
    this.optimalPower.set(60 + Math.floor(Math.random() * 25));
    
    this.gameState.set('selecting');
    this.animateGame();
  }

  private animateGame(): void {
    this.frameCount++;
    
    const state = this.gameState();
    if (state === 'gameover' || state === 'ready') return;
    
    if (state === 'throwing') {
      this.updateThrowing();
    }
    
    this.updateParticles();
    this.drawGame();
    
    this.animationId = requestAnimationFrame(() => this.animateGame());
  }

  private updateThrowing(): void {
    this.throwProgress += 0.04;
    
    // ボール位置更新（放物線）
    const t = this.throwProgress;
    this.ballZ = t * 1000;
    
    // 始点から終点への補間
    const startX = this.canvasWidth / 2;
    const startY = this.canvasHeight * 0.1;
    
    this.ballX = startX + (this.ballTargetX - startX) * t;
    this.ballY = startY + (this.ballTargetY - startY) * t - Math.sin(t * Math.PI) * 50;
    
    // ボールの軌跡パーティクル
    if (this.frameCount % 2 === 0) {
      this.particles.push({
        x: this.ballX,
        y: this.ballY,
        vx: 0,
        vy: 0,
        life: 15,
        maxLife: 15,
        color: 'rgba(255,255,255,0.5)',
        size: 5
      });
    }
    
    // 投球完了
    if (this.throwProgress >= 1) {
      cancelAnimationFrame(this.animationId);
      this.onThrowComplete();
    }
  }

  private updateParticles(): void {
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      return p.life > 0;
    });
  }

  selectZone(zone: number): void {
    if (this.gameState() !== 'selecting') return;
    
    this.selectedZone.set(zone);
    this.gameState.set('power');
    this.startPowerGauge();
  }

  hoverZone(zone: number): void {
    if (this.gameState() === 'selecting') {
      this.hoveredZone.set(zone);
    }
  }

  private startPowerGauge(): void {
    if (!this.isBrowser) return;
    
    this.power.set(0);
    this.powerDirection = 1;
    
    this.powerInterval = setInterval(() => {
      this.power.update(p => {
        const newPower = p + this.powerDirection * 2.5;
        if (newPower >= 100) {
          this.powerDirection = -1;
          return 100;
        }
        if (newPower <= 0) {
          this.powerDirection = 1;
          return 0;
        }
        return newPower;
      });
    }, 20);
  }

  throwBall(): void {
    if (this.gameState() !== 'power') return;
    
    clearInterval(this.powerInterval);
    this.gameState.set('throwing');
    this.playSound(this.throwSound);
    
    // パワーによる精度計算
    const powerDiff = Math.abs(this.power() - this.optimalPower());
    const powerAccuracy = Math.max(0, 100 - powerDiff * 2);
    
    // 着弾位置計算
    let finalZone = this.selectedZone();
    
    if (powerAccuracy < 50) {
      const offset = Math.random() > 0.5 ? 1 : -1;
      const row = Math.floor((this.selectedZone() - 1) / 3);
      const col = (this.selectedZone() - 1) % 3;
      
      if (Math.random() > 0.5 && col + offset >= 0 && col + offset <= 2) {
        finalZone = row * 3 + (col + offset) + 1;
      } else if (row + offset >= 0 && row + offset <= 2) {
        finalZone = (row + offset) * 3 + col + 1;
      }
    }
    
    this.hitZone.set(finalZone);
    
    // ボールの目標位置設定
    const zonePos = this.getZonePosition(finalZone);
    this.ballTargetX = zonePos.x;
    this.ballTargetY = zonePos.y;
    this.throwProgress = 0;
    this.ballX = this.canvasWidth / 2;
    this.ballY = this.canvasHeight * 0.1;
    this.ballZ = 0;
  }

  private getZonePosition(zone: number): { x: number, y: number } {
    const row = Math.floor((zone - 1) / 3);
    const col = (zone - 1) % 3;
    
    const zoneWidth = this.canvasWidth * 0.4 / 3;
    const zoneHeight = this.canvasHeight * 0.4 / 3;
    const startX = this.canvasWidth * 0.3 + zoneWidth / 2;
    const startY = this.canvasHeight * 0.35 + zoneHeight / 2;
    
    return {
      x: startX + col * zoneWidth,
      y: startY + row * zoneHeight
    };
  }

  private onThrowComplete(): void {
    const hitZoneDiff = this.calculateZoneDiff(this.hitZone(), this.targetZone());
    const powerDiff = Math.abs(this.power() - this.optimalPower());
    const powerAccuracy = Math.max(0, 100 - powerDiff * 2);
    
    let accuracy = 0;
    let pitchScore = 0;
    let rating: PitchResult['rating'] = 'miss';
    
    if (hitZoneDiff === 0) {
      accuracy = 100;
      pitchScore = 1000 + Math.floor(powerAccuracy * 5);
      rating = powerAccuracy >= 80 ? 'perfect' : 'great';
    } else if (hitZoneDiff === 1) {
      accuracy = 70;
      pitchScore = 500 + Math.floor(powerAccuracy * 2);
      rating = 'good';
    } else if (hitZoneDiff === 2) {
      accuracy = 40;
      pitchScore = 200;
      rating = 'ok';
    } else {
      accuracy = 10;
      pitchScore = 50;
      rating = 'miss';
    }
    
    const result: PitchResult = {
      targetZone: this.targetZone(),
      hitZone: this.hitZone(),
      accuracy,
      score: pitchScore,
      rating
    };

    // サウンド
    if (rating === 'perfect' || rating === 'great') {
      this.playSound(this.perfectSound);
    } else if (rating === 'miss') {
      this.playSound(this.missSound);
    }
    
    this.currentResult.set(result);
    this.results.update(r => [...r, result]);
    this.score.update(s => s + pitchScore);
    
    // エフェクト
    this.addResultParticles(rating);
    this.gloveShake = 10;
    
    setTimeout(() => {
      this.showResult.set(true);
      this.gameState.set('result');
      
      setTimeout(() => {
        this.nextPitch();
      }, 2000);
    }, 300);
  }

  private addResultParticles(rating: PitchResult['rating']): void {
    const colors = {
      perfect: ['#FFD700', '#FF6B6B', '#4ECDC4'],
      great: ['#00FF00', '#00DD00'],
      good: ['#4444FF', '#6666FF'],
      ok: ['#888888'],
      miss: ['#FF0000']
    };
    
    const particleCount = rating === 'perfect' ? 30 : rating === 'great' ? 20 : 10;
    const targetPos = this.getZonePosition(this.hitZone());
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 / particleCount) * i;
      const speed = 3 + Math.random() * 5;
      const colorSet = colors[rating];
      
      this.particles.push({
        x: targetPos.x,
        y: targetPos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 30 + Math.random() * 15,
        maxLife: 45,
        color: colorSet[Math.floor(Math.random() * colorSet.length)],
        size: 3 + Math.random() * 3
      });
    }
  }

  private calculateZoneDiff(zone1: number, zone2: number): number {
    const row1 = Math.floor((zone1 - 1) / 3);
    const col1 = (zone1 - 1) % 3;
    const row2 = Math.floor((zone2 - 1) / 3);
    const col2 = (zone2 - 1) % 3;
    
    return Math.abs(row1 - row2) + Math.abs(col1 - col2);
  }

  private drawGame(): void {
    if (!this.ctx) return;
    
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    
    // 背景（キャッチャー視点の球場）
    this.drawStadiumBackground();
    
    // ストライクゾーン
    this.drawStrikeZone();
    
    // キャッチャーミット
    this.drawCatcherMitt();
    
    // ボール（投球中）
    if (this.gameState() === 'throwing' && this.throwProgress < 1) {
      this.drawBall();
    }
    
    // パーティクル
    this.drawParticles();
    
    // パワーゲージ
    if (this.gameState() === 'power') {
      this.drawPowerGauge();
    }
  }

  private drawStadiumBackground(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    
    // 夜空
    const skyGradient = ctx.createLinearGradient(0, 0, 0, h * 0.3);
    skyGradient.addColorStop(0, '#0a0a1a');
    skyGradient.addColorStop(1, '#1a1a3a');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, w, h * 0.3);
    
    // 星
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 30; i++) {
      const x = (i * 137.5) % w;
      const y = (i * 89.3) % (h * 0.25);
      const twinkle = Math.sin(this.frameCount * 0.05 + i) * 0.3 + 0.7;
      ctx.globalAlpha = twinkle * 0.8;
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // 照明
    for (let i = 0; i < 4; i++) {
      const lx = w * 0.15 + i * (w * 0.23);
      const ly = h * 0.05;
      
      ctx.fillStyle = '#ffff88';
      ctx.beginPath();
      ctx.arc(lx, ly, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // 光の筋
      const lightGradient = ctx.createRadialGradient(lx, ly, 0, lx, h * 0.4, h * 0.5);
      lightGradient.addColorStop(0, 'rgba(255,255,200,0.15)');
      lightGradient.addColorStop(1, 'rgba(255,255,200,0)');
      ctx.fillStyle = lightGradient;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx - w * 0.15, h * 0.5);
      ctx.lineTo(lx + w * 0.15, h * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    
    // 観客席
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, h * 0.2, w, h * 0.15);
    
    // 観客のシルエット
    for (let i = 0; i < 40; i++) {
      const x = (i * 30) % w;
      const y = h * 0.28 + Math.sin(i) * 3;
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // ピッチャーマウンド（遠景）
    ctx.fillStyle = '#c4a484';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.15, 40, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // ピッチャー（シルエット）
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.12, 15, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.08, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // 地面
    const groundGradient = ctx.createLinearGradient(0, h * 0.35, 0, h);
    groundGradient.addColorStop(0, '#8B4513');
    groundGradient.addColorStop(0.2, '#A0522D');
    groundGradient.addColorStop(1, '#654321');
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, h * 0.75, w, h * 0.25);
  }

  private drawStrikeZone(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    
    const zoneWidth = w * 0.4;
    const zoneHeight = h * 0.4;
    const startX = w * 0.3;
    const startY = h * 0.35;
    
    // ストライクゾーン背景（半透明）
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(startX, startY, zoneWidth, zoneHeight);
    
    // 外枠
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(startX, startY, zoneWidth, zoneHeight);
    
    // 9分割グリッド
    const cellWidth = zoneWidth / 3;
    const cellHeight = zoneHeight / 3;
    
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const zone = row * 3 + col + 1;
        const x = startX + col * cellWidth;
        const y = startY + row * cellHeight;
        
        // ターゲットゾーンのハイライト
        if (zone === this.targetZone()) {
          ctx.fillStyle = 'rgba(255,215,0,0.4)';
          ctx.fillRect(x, y, cellWidth, cellHeight);
          
          // パルスエフェクト
          const pulse = Math.sin(this.frameCount * 0.1) * 0.2 + 0.8;
          ctx.strokeStyle = `rgba(255,215,0,${pulse})`;
          ctx.lineWidth = 4;
          ctx.strokeRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
        }
        
        // ホバーゾーン
        if (zone === this.hoveredZone() && this.gameState() === 'selecting') {
          ctx.fillStyle = 'rgba(100,150,255,0.3)';
          ctx.fillRect(x, y, cellWidth, cellHeight);
        }
        
        // 選択ゾーン
        if (zone === this.selectedZone()) {
          ctx.fillStyle = 'rgba(0,200,255,0.4)';
          ctx.fillRect(x, y, cellWidth, cellHeight);
          ctx.strokeStyle = '#00CCFF';
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
        }
        
        // 着弾位置
        if (zone === this.hitZone() && this.throwProgress >= 1) {
          const result = this.currentResult();
          const isHit = result && result.hitZone === result.targetZone;
          
          ctx.fillStyle = isHit ? 'rgba(0,255,0,0.5)' : 'rgba(255,100,100,0.5)';
          ctx.fillRect(x, y, cellWidth, cellHeight);
          
          // ボールマーク
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x + cellWidth / 2, y + cellHeight / 2, 12, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.strokeStyle = '#C41E3A';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x + cellWidth / 2 - 3, y + cellHeight / 2, 5, 0.5, 2.5);
          ctx.stroke();
        }
        
        // グリッド線
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellWidth, cellHeight);
      }
    }
    
    // ゾーン番号/ラベル
    if (this.gameState() === 'selecting') {
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const zone = row * 3 + col + 1;
          const x = startX + col * cellWidth + cellWidth / 2;
          const y = startY + row * cellHeight + cellHeight / 2;
          
          ctx.fillStyle = zone === this.targetZone() ? '#FFD700' : 'rgba(255,255,255,0.6)';
          ctx.fillText(this.getZoneLabel(zone), x, y);
        }
      }
    }
    
    // ターゲット指示
    if (this.gameState() === 'selecting') {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`TARGET: ${this.getZoneLabel(this.targetZone())}`, w / 2, startY - 15);
    }
  }

  private drawCatcherMitt(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    
    const mittX = w / 2 + this.gloveShake * (Math.random() - 0.5);
    const mittY = h * 0.85 + this.gloveShake * (Math.random() - 0.5);
    
    if (this.gloveShake > 0) {
      this.gloveShake *= 0.9;
    }
    
    // ミットの影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(mittX + 5, mittY + 5, 80, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // ミット本体
    const mittGradient = ctx.createRadialGradient(mittX - 20, mittY - 20, 0, mittX, mittY, 80);
    mittGradient.addColorStop(0, '#D2691E');
    mittGradient.addColorStop(0.5, '#8B4513');
    mittGradient.addColorStop(1, '#654321');
    ctx.fillStyle = mittGradient;
    ctx.beginPath();
    ctx.ellipse(mittX, mittY, 75, 55, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // ミットのポケット
    ctx.fillStyle = '#4a3728';
    ctx.beginPath();
    ctx.ellipse(mittX, mittY + 5, 50, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // ポケット内側
    ctx.fillStyle = '#3a2718';
    ctx.beginPath();
    ctx.ellipse(mittX, mittY + 8, 35, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 縫い目
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mittX, mittY - 15, 60, 0.8, 2.4);
    ctx.stroke();
  }

  private drawBall(): void {
    const ctx = this.ctx;
    
    // 遠近法でサイズ調整
    const perspective = 0.3 + (this.ballZ / 1000) * 0.7;
    const size = 8 + perspective * 18;
    
    // ボールの影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(this.ballX + 3, this.ballY + 3, size, size * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // ボール本体
    const ballGradient = ctx.createRadialGradient(
      this.ballX - size * 0.3, this.ballY - size * 0.3, 0,
      this.ballX, this.ballY, size
    );
    ballGradient.addColorStop(0, '#ffffff');
    ballGradient.addColorStop(0.8, '#e0e0e0');
    ballGradient.addColorStop(1, '#cccccc');
    ctx.fillStyle = ballGradient;
    ctx.beginPath();
    ctx.arc(this.ballX, this.ballY, size, 0, Math.PI * 2);
    ctx.fill();
    
    // 縫い目
    ctx.strokeStyle = '#C41E3A';
    ctx.lineWidth = Math.max(1.5, size * 0.12);
    const rotation = this.frameCount * 0.5;
    
    ctx.beginPath();
    ctx.arc(this.ballX - size * 0.25, this.ballY, size * 0.5, rotation + 0.5, rotation + 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.ballX + size * 0.25, this.ballY, size * 0.5, rotation + 3.5, rotation + 5.5);
    ctx.stroke();
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.fillStyle = typeof p.color === 'string' && p.color.startsWith('rgba') 
        ? p.color.replace(/[\d.]+\)$/, `${alpha})`)
        : p.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawPowerGauge(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    
    const gaugeWidth = 30;
    const gaugeHeight = h * 0.5;
    const gaugeX = w - 60;
    const gaugeY = (h - gaugeHeight) / 2;
    
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(gaugeX - 5, gaugeY - 30, gaugeWidth + 10, gaugeHeight + 60);
    
    // ゲージ背景
    ctx.fillStyle = '#333333';
    ctx.fillRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);
    
    // 最適ゾーンマーカー
    const optimalY = gaugeY + gaugeHeight - (this.optimalPower() / 100) * gaugeHeight;
    ctx.fillStyle = 'rgba(0,255,0,0.3)';
    ctx.fillRect(gaugeX, optimalY - 15, gaugeWidth, 30);
    
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gaugeX - 5, optimalY);
    ctx.lineTo(gaugeX + gaugeWidth + 5, optimalY);
    ctx.stroke();
    
    // パワーバー
    const powerHeight = (this.power() / 100) * gaugeHeight;
    const powerY = gaugeY + gaugeHeight - powerHeight;
    
    const powerGradient = ctx.createLinearGradient(gaugeX, gaugeY + gaugeHeight, gaugeX, gaugeY);
    powerGradient.addColorStop(0, '#00FF00');
    powerGradient.addColorStop(0.5, '#FFFF00');
    powerGradient.addColorStop(1, '#FF0000');
    ctx.fillStyle = powerGradient;
    ctx.fillRect(gaugeX, powerY, gaugeWidth, powerHeight);
    
    // 現在位置インジケーター
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(gaugeX - 10, powerY);
    ctx.lineTo(gaugeX, powerY - 8);
    ctx.lineTo(gaugeX, powerY + 8);
    ctx.closePath();
    ctx.fill();
    
    // ラベル
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('POWER', gaugeX + gaugeWidth / 2, gaugeY - 10);
    ctx.fillText(`${Math.round(this.power())}`, gaugeX + gaugeWidth / 2, gaugeY + gaugeHeight + 20);
  }

  private drawReadyScreen(): void {
    if (!this.ctx) return;
    
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    
    // 背景
    this.drawStadiumBackground();
    this.drawStrikeZone();
    this.drawCatcherMitt();
    
    // オーバーレイ
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, w, h);
    
    // タイトル
    ctx.fillStyle = '#00BFFF';
    ctx.font = 'bold 32px "Oswald", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎯 STRIKE PITCHING 🎯', w / 2, h / 2 - 40);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px "Noto Sans JP", Arial';
    ctx.fillText('ターゲットのコースにボールを投げ込め！', w / 2, h / 2);
    
    ctx.font = '14px Arial';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('1. ゾーンを選択 → 2. パワーゲージを止める', w / 2, h / 2 + 35);
  }

  private endGame(): void {
    this.gameState.set('gameover');
  }

  private initSounds(): void {
    this.throwSound = new Audio('assets/sounds/pitch-throw.mp3');
    this.throwSound.volume = 0.7;

    this.perfectSound = new Audio('assets/sounds/pitch-perfect.mp3');
    this.perfectSound.volume = 0.8;

    this.missSound = new Audio('assets/sounds/pitch-miss.mp3');
    this.missSound.volume = 0.7;
  }

  private playSound(sound?: HTMLAudioElement): void {
    if (!this.isBrowser || !sound) return;
    try {
      sound.currentTime = 0;
      void sound.play();
    } catch {
      // 再生できない場合は無視
    }
  }

  saveScore(): void {
    const rank = this.gameScoreService.addScore('pitching', this.nickname, this.score());
    this.savedRank.set(rank);
    this.highScore.set(this.gameScoreService.getHighScore('pitching'));
  }

  getZoneLabel(zone: number): string {
    const labels = ['', '外高', '真高', '内高', '外', '真中', '内', '外低', '真低', '内低'];
    return labels[zone];
  }

  getPerfectPitchCount(): number {
    return this.results().filter(r => r.rating === 'perfect' || r.rating === 'great').length;
  }

  getAverageAccuracy(): number {
    const results = this.results();
    if (results.length === 0) return 0;
    return Math.round(results.reduce((sum, r) => sum + r.accuracy, 0) / results.length);
  }

  getPowerBarColor(): string {
    const power = this.power();
    const optimal = this.optimalPower();
    const diff = Math.abs(power - optimal);
    
    if (diff <= 10) return 'bg-green-500';
    if (diff <= 25) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  getRatingColor(rating: string): string {
    switch (rating) {
      case 'perfect': return 'text-yellow-400';
      case 'great': return 'text-green-400';
      case 'good': return 'text-blue-400';
      case 'ok': return 'text-gray-400';
      default: return 'text-red-400';
    }
  }

  getRatingText(rating: string): string {
    switch (rating) {
      case 'perfect': return 'PERFECT!';
      case 'great': return 'GREAT!';
      case 'good': return 'GOOD';
      case 'ok': return 'OK';
      default: return 'MISS';
    }
  }
}
