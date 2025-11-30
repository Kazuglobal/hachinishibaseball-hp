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
  private resizeHandler?: () => void;
  private resizeObserver?: ResizeObserver;

  private seoService = inject(SEOService);
  private gameScoreService = inject(GameScoreService);

  // キャンバス
  private canvasWidth = 0;
  private canvasHeight = 0;

  // ゲーム状態
  gameState = signal<GameState>('ready');
  currentPitch = signal(0);
  // 1ゲームで投げられる球数
  totalPitches = 6;
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

  // 画像アセット
  private stadiumImage = new Image();
  private mittImage = new Image();
  private ballImage = new Image();
  private imagesLoaded = false;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.loadImages();
    }
  }

  private loadImages(): void {
    let loadedCount = 0;
    const onLoad = () => {
      loadedCount++;
      if (loadedCount >= 3) {
        this.imagesLoaded = true;
        if (this.gameState() === 'ready') {
          this.drawReadyScreen();
        }
      }
    };

    this.stadiumImage.src = 'assets/images/stadium_background.png';
    this.stadiumImage.onload = onLoad;

    this.mittImage.src = 'assets/images/catcher_mitt.png';
    this.mittImage.onload = onLoad;

    this.ballImage.src = 'assets/images/baseball-ball.png';
    this.ballImage.onload = onLoad;
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

      // 初期サイズ設定（少し遅延を入れて確実にコンテナサイズを取得）
      setTimeout(() => {
        this.resizeCanvas();
        this.drawReadyScreen();
      }, 0);

      // ウィンドウリサイズ監視
      this.resizeHandler = () => this.resizeCanvas();
      window.addEventListener('resize', this.resizeHandler);

      // ResizeObserverでコンテナのサイズ変更を監視
      const container = canvas.parentElement;
      if (container && typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          this.resizeCanvas();
        });
        this.resizeObserver.observe(container);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.powerInterval) {
      clearInterval(this.powerInterval);
    }
    if (this.isBrowser && this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private resizeCanvas(): void {
    if (!this.isBrowser) return;

    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (container) {
      // コンテナの実際のサイズを取得
      const containerWidth = container.clientWidth || container.offsetWidth;
      const containerHeight = container.clientHeight || container.offsetHeight;

      // アスペクト比を維持しながらサイズを設定
      const aspectRatio = 4 / 3; // aspect-[4/3]に合わせる
      let width = containerWidth;
      let height = width / aspectRatio;

      // コンテナの高さを超えないように調整
      if (height > containerHeight) {
        height = containerHeight;
        width = height * aspectRatio;
      }

      // 実際のピクセルサイズを設定（高DPIディスプレイ対応）
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;

      // CSSサイズを設定
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';

      // コンテキストのスケールをリセットしてから調整
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);

      // 内部サイズを保存
      this.canvasWidth = width;
      this.canvasHeight = height;

      // レイアウト変更時に現在の状態に応じて静的画面のみ再描画する
      const state = this.gameState();
      if (state === 'ready') {
        this.drawReadyScreen();
      } else if (state === 'gameover') {
        // ゲームオーバー時は静的な最終結果画面のみ再描画
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
      // アニメーションループでの再呼び出しを防ぐため、即座に状態を変更
      this.gameState.set('result');
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

  onCanvasClick(event: MouseEvent): void {
    if (this.gameState() !== 'selecting') return;

    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const zone = this.getZoneFromPosition(x, y);
    if (zone > 0) {
      this.selectZone(zone);
    }
  }

  onCanvasTouch(event: TouchEvent): void {
    if (this.gameState() !== 'selecting') return;

    event.preventDefault();
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const touch = event.touches[0] || event.changedTouches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const zone = this.getZoneFromPosition(x, y);
    if (zone > 0) {
      this.selectZone(zone);
    }
  }

  private getZoneFromPosition(x: number, y: number): number {
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    const zoneWidth = w * 0.4;
    const zoneHeight = h * 0.4;
    const startX = w * 0.3;
    const startY = h * 0.35;

    // ストライクゾーン内かチェック
    if (x < startX || x > startX + zoneWidth || y < startY || y > startY + zoneHeight) {
      return 0;
    }

    const cellWidth = zoneWidth / 3;
    const cellHeight = zoneHeight / 3;

    const col = Math.floor((x - startX) / cellWidth);
    const row = Math.floor((y - startY) / cellHeight);

    // 範囲チェック
    if (col < 0 || col >= 3 || row < 0 || row >= 3) {
      return 0;
    }

    return row * 3 + col + 1;
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
      // this.gameState.set('result'); // 既にupdateThrowingで変更済み

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

    if (this.imagesLoaded && this.stadiumImage.complete) {
      // 画像を描画（アスペクト比を維持してカバーするように描画）
      const imgRatio = this.stadiumImage.width / this.stadiumImage.height;
      const canvasRatio = w / h;

      let drawW, drawH, offsetX, offsetY;

      if (canvasRatio > imgRatio) {
        drawW = w;
        drawH = w / imgRatio;
        offsetX = 0;
        offsetY = (h - drawH) / 2; // 中央配置
      } else {
        drawH = h;
        drawW = h * imgRatio;
        offsetX = (w - drawW) / 2; // 中央配置
        offsetY = 0;
      }

      // 少し暗くするフィルター
      ctx.filter = 'brightness(0.7) contrast(1.1)';
      ctx.drawImage(this.stadiumImage, offsetX, offsetY, drawW, drawH);
      ctx.filter = 'none';

    } else {
      // フォールバック：夜空
      const skyGradient = ctx.createLinearGradient(0, 0, 0, h * 0.3);
      skyGradient.addColorStop(0, '#0a0a1a');
      skyGradient.addColorStop(1, '#1a1a3a');
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, w, h * 0.3);

      // 地面
      const groundGradient = ctx.createLinearGradient(0, h * 0.35, 0, h);
      groundGradient.addColorStop(0, '#8B4513');
      groundGradient.addColorStop(0.2, '#A0522D');
      groundGradient.addColorStop(1, '#654321');
      ctx.fillStyle = groundGradient;
      ctx.fillRect(0, h * 0.75, w, h * 0.25);
    }
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

    // ゾーン番号/ラベル（フォントサイズをcanvasサイズに応じて調整）
    if (this.gameState() === 'selecting') {
      const zoneFontSize = Math.max(10, Math.min(w / 25, 14));
      ctx.font = `bold ${zoneFontSize}px Arial`;
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
      const targetFontSize = Math.max(12, Math.min(w / 20, 16));
      ctx.fillStyle = '#FFD700';
      ctx.font = `bold ${targetFontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const targetOffset = Math.max(10, Math.min(h / 30, 15));
      ctx.fillText(`TARGET: ${this.getZoneLabel(this.targetZone())}`, w / 2, startY - targetOffset);
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

    if (this.imagesLoaded && this.mittImage.complete) {
      const size = w * 0.15; // 画面幅の15%
      ctx.drawImage(this.mittImage, mittX - size / 2, mittY - size / 2, size, size);
    } else {
      // フォールバック
      ctx.fillStyle = '#8B4513';
      ctx.beginPath();
      ctx.arc(mittX, mittY, w * 0.05, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#4A2511';
      ctx.beginPath();
      ctx.arc(mittX, mittY, w * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
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
    if (this.imagesLoaded && this.ballImage.complete) {
      ctx.save();
      ctx.translate(this.ballX, this.ballY);
      // 回転アニメーション
      ctx.rotate(this.throwProgress * 20);
      ctx.drawImage(this.ballImage, -size, -size, size * 2, size * 2);
      ctx.restore();
    } else {
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

    // ラベル（フォントサイズをcanvasサイズに応じて調整）
    const powerLabelFontSize = Math.max(9, Math.min(w / 35, 12));
    const powerValueFontSize = Math.max(9, Math.min(w / 35, 12));
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${powerLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const labelOffset = Math.max(8, Math.min(h / 40, 10));
    ctx.fillText('POWER', gaugeX + gaugeWidth / 2, gaugeY - labelOffset);
    ctx.font = `bold ${powerValueFontSize}px Arial`;
    ctx.textBaseline = 'top';
    const valueOffset = Math.max(15, Math.min(h / 25, 20));
    ctx.fillText(`${Math.round(this.power())}`, gaugeX + gaugeWidth / 2, gaugeY + gaugeHeight + valueOffset);
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

    // フォントサイズをcanvasサイズに応じて調整
    const baseFontSize = Math.min(w / 12, h / 8);
    const titleFontSize = Math.max(20, Math.min(baseFontSize * 1.2, 32));
    const subtitleFontSize = Math.max(12, Math.min(baseFontSize * 0.5, 16));
    const instructionFontSize = Math.max(10, Math.min(baseFontSize * 0.4, 14));

    // タイトル
    ctx.fillStyle = '#00BFFF';
    ctx.font = `bold ${titleFontSize}px "Oswald", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎯 STRIKE PITCHING 🎯', w / 2, h / 2 - h * 0.15);

    ctx.fillStyle = '#ffffff';
    ctx.font = `${subtitleFontSize}px "Noto Sans JP", Arial`;
    ctx.fillText('ターゲットのコースにボールを投げ込め！', w / 2, h / 2);

    ctx.font = `${instructionFontSize}px Arial`;
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('1. ゾーンを選択 → 2. パワーゲージを止める', w / 2, h / 2 + h * 0.15);
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
