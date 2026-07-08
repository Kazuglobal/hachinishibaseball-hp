import { Component, ChangeDetectionStrategy, signal, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, PLATFORM_ID, Inject, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GameScoreService } from '../../../../services/game-score.service';
import { SEOService } from '../../../../services/seo.service';

type GameState = 'ready' | 'playing' | 'gameover';

interface Ball {
  id: number;
  x: number;
  y: number;
  z: number; // 高度（0=地面、100=最高点）
  vx: number;
  vy: number;
  vz: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  type: 'normal' | 'fast' | 'curve';
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

interface CatchEffect {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

@Component({
  selector: 'app-catch-fly',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './catch-fly.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatchFlyComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private animationId: number = 0;
  private gameLoopId: any;
  private isBrowser: boolean;
  private resizeHandler?: () => void;
  private resizeObserver?: ResizeObserver;

  private seoService = inject(SEOService);
  private gameScoreService = inject(GameScoreService);

  // ゲーム状態
  gameState = signal<GameState>('ready');
  score = signal(0);
  combo = signal(0);
  maxCombo = signal(0);
  timeLeft = signal(60);
  catchCount = signal(0);
  missCount = signal(0);

  // キャンバス
  private canvasWidth = 0;
  private canvasHeight = 0;

  // プレイヤー
  private playerX = 0;
  private playerY = 0;
  private playerWidth = 100;
  private playerHeight = 120;
  private playerSpeed = 18;
  private playerVx = 0;
  private isDiving = false;
  private diveDirection = 0;
  private diveProgress = 0;

  // ボール
  private balls: Ball[] = [];
  private ballIdCounter = 0;
  private spawnInterval: any;

  // エフェクト
  private particles: Particle[] = [];
  private catchEffects: CatchEffect[] = [];

  // 操作
  private leftPressed = false;
  private rightPressed = false;
  private touchStartX = 0;
  private targetX = -1;

  // アニメーション
  private frameCount = 0;
  private cloudOffset = 0;

  // スローモーション
  private gameTimeScale = 1.0;
  private isSlowMotion = false;
  private slowMotionTimer = 0;

  // ゲームオーバー
  nickname = '';
  savedRank = signal(0);
  scoreSaved = signal(false);
  highScore = signal(0);

  // サウンド
  private catchSound?: HTMLAudioElement;
  private missSound?: HTMLAudioElement;
  private timeupSound?: HTMLAudioElement;
  private bgm?: HTMLAudioElement;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.seoService.updateSEO({
      title: '守備キャッチ | 八戸西高校 野球部OB会',
      description: '60秒間でフライボールをキャッチ！連続キャッチでコンボボーナス獲得！',
      keywords: '野球ゲーム,守備,キャッチ,ミニゲーム',
      url: 'https://hachinohenishibaseball.com/game/catch'
    });
    this.highScore.set(this.gameScoreService.getHighScore('catch'));
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
    this.stopGame();
    if (this.isBrowser && this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.stopBgm();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (this.gameState() !== 'playing') return;

    if (event.key === 'ArrowLeft' || event.key === 'a') {
      this.leftPressed = true;
      event.preventDefault();
    }
    if (event.key === 'ArrowRight' || event.key === 'd') {
      this.rightPressed = true;
      event.preventDefault();
    }
    if (event.code === 'Space' && !this.isDiving) {
      this.dive();
      event.preventDefault();
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'a') {
      this.leftPressed = false;
    }
    if (event.key === 'ArrowRight' || event.key === 'd') {
      this.rightPressed = false;
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
      const aspectRatio = 16 / 11; // aspect-[16/11]に合わせる
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

      // プレイヤー位置を調整
      this.playerX = this.canvasWidth / 2;
      this.playerY = this.canvasHeight - 50;

      // ゲーム状態に応じて再描画
      const state = this.gameState();
      if (state === 'ready') {
        this.drawReadyScreen();
      }
    }
  }

  onTouchStart(event: TouchEvent): void {
    if (this.gameState() !== 'playing') return;
    event.preventDefault();

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const touchX = event.touches[0].clientX - rect.left;
    this.targetX = touchX;
  }

  onTouchMove(event: TouchEvent): void {
    if (this.gameState() !== 'playing') return;
    event.preventDefault();

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const touchX = event.touches[0].clientX - rect.left;
    this.targetX = touchX;
  }

  onTouchEnd(): void {
    this.targetX = -1;
  }

  movePlayer(direction: 'left' | 'right'): void {
    if (this.gameState() !== 'playing' || this.isDiving) return;

    const speed = this.playerSpeed * 2.5;
    if (direction === 'left') {
      this.playerX = Math.max(this.playerWidth / 2, this.playerX - speed);
    } else {
      this.playerX = Math.min(this.canvasWidth - this.playerWidth / 2, this.playerX + speed);
    }
  }

  dive(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (this.isDiving || this.gameState() !== 'playing') return;

    this.isDiving = true;
    this.diveProgress = 0;
    this.diveDirection = this.leftPressed ? -1 : this.rightPressed ? 1 : 0;

    // ダイブパーティクル
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: this.playerX + (Math.random() - 0.5) * 40,
        y: this.playerY,
        vx: (Math.random() - 0.5) * 5,
        vy: Math.random() * -3,
        life: 20,
        maxLife: 20,
        color: 'rgba(139,69,19,1)',
        size: 3 + Math.random() * 3
      });
    }
  }

  startGame(): void {
    // 連打による多重起動防止（gameLoop/spawnInterval/timerが上書きされ解除不能になるため）
    if (this.gameState() === 'playing') return;

    this.gameState.set('playing');
    this.score.set(0);
    this.combo.set(0);
    this.maxCombo.set(0);
    this.timeLeft.set(60);
    this.catchCount.set(0);
    this.missCount.set(0);
    this.balls = [];
    this.particles = [];
    this.catchEffects = [];
    this.savedRank.set(0);
    this.scoreSaved.set(false);
    this.playerX = this.canvasWidth / 2;
    this.isDiving = false;

    this.playBgm();
    this.startGameLoop();
    this.startSpawning();
    this.startTimer();
  }

  private startGameLoop(): void {
    const loop = () => {
      if (this.gameState() !== 'playing') return;

      this.frameCount++;
      this.updateGame();
      this.drawGame();

      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  }

  private startSpawning(): void {
    this.spawnBall();

    const spawn = () => {
      if (this.gameState() !== 'playing') return;

      const elapsed = 60 - this.timeLeft();
      const spawnCount = elapsed > 45 ? 2 : elapsed > 30 ? (Math.random() > 0.6 ? 2 : 1) : 1;

      for (let i = 0; i < spawnCount; i++) {
        setTimeout(() => this.spawnBall(), i * 300);
      }

      // スポーン間隔を徐々に短く
      const interval = Math.max(800, 1500 - elapsed * 15);
      this.spawnInterval = setTimeout(spawn, interval);
    };

    this.spawnInterval = setTimeout(spawn, 1500);
  }

  private spawnBall(): void {
    const elapsed = 60 - this.timeLeft();

    // ボールタイプ決定
    let type: Ball['type'] = 'normal';
    if (elapsed > 20 && Math.random() > 0.7) {
      type = Math.random() > 0.5 ? 'fast' : 'curve';
    }

    const startX = Math.random() * (this.canvasWidth * 0.8) + this.canvasWidth * 0.1;
    const startY = -50;

    // 高度(z)の変化量を先に決め、着地までのフレーム数を算出する
    const vz = -1.5 - Math.random() * 0.5 - elapsed * 0.02;
    const framesToLand = 100 / Math.abs(vz);

    // 着地地点(y)はキャッチ判定の基準点（プレイヤーの捕球エリア）を中心にばらつかせる。
    // canvasHeightに対して比率でばらつきを持たせることで、取れる球・取れない球の両方が発生する。
    const catchZoneY = this.playerY - 30;
    const landingSpread = this.canvasHeight * 0.12;
    const targetLandingY = catchZoneY + (Math.random() - 0.5) * 2 * landingSpread;
    const vy = (targetLandingY - startY) / framesToLand;

    const ball: Ball = {
      id: this.ballIdCounter++,
      x: startX,
      y: startY,
      z: 100, // 最高点からスタート
      vx: (Math.random() - 0.5) * (type === 'curve' ? 4 : 1),
      vy,
      vz,
      size: 18 + Math.random() * 6,
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      type
    };

    if (type === 'fast') {
      ball.vy *= 1.5;
      ball.vz *= 1.3;
    }

    this.balls.push(ball);
  }

  private startTimer(): void {
    this.gameLoopId = setInterval(() => {
      if (this.gameState() !== 'playing') return;

      this.timeLeft.update(t => t - 1);

      if (this.timeLeft() <= 0) {
        this.endGame();
      }
    }, 1000);
  }

  private updateGame(): void {
    // スローモーションタイマー更新
    if (this.isSlowMotion) {
      this.slowMotionTimer--;
      if (this.slowMotionTimer <= 0) {
        this.isSlowMotion = false;
        this.gameTimeScale = 1.0;
      }
    }

    const timeScale = this.gameTimeScale;

    // タッチ操作
    if (this.targetX >= 0 && !this.isDiving) {
      const diff = this.targetX - this.playerX;
      const moveSpeed = Math.min(Math.abs(diff), this.playerSpeed);
      this.playerX += Math.sign(diff) * moveSpeed;
    }

    // キーボード操作
    if (!this.isDiving) {
      if (this.leftPressed) {
        this.playerX = Math.max(this.playerWidth / 2, this.playerX - this.playerSpeed);
      }
      if (this.rightPressed) {
        this.playerX = Math.min(this.canvasWidth - this.playerWidth / 2, this.playerX + this.playerSpeed);
      }
    }

    // ダイブ更新
    if (this.isDiving) {
      this.diveProgress += 0.08 * timeScale;

      if (this.diveDirection !== 0) {
        this.playerX += this.diveDirection * this.playerSpeed * 1.5 * (1 - this.diveProgress) * timeScale;
        this.playerX = Math.max(this.playerWidth / 2, Math.min(this.canvasWidth - this.playerWidth / 2, this.playerX));
      }

      if (this.diveProgress >= 1) {
        this.isDiving = false;
        this.diveProgress = 0;
      }
    }

    // ボール更新
    const newBalls: Ball[] = [];

    for (const ball of this.balls) {
      // 位置更新（スローモーション適用）
      ball.x += ball.vx * timeScale;
      ball.y += ball.vy * timeScale;
      ball.z += ball.vz * timeScale;
      ball.rotation += ball.rotationSpeed * timeScale;

      // カーブボールの横移動
      if (ball.type === 'curve') {
        ball.vx += Math.sin(this.frameCount * 0.1) * 0.1 * timeScale;
      }

      // 高度が0以下で地面到達
      if (ball.z <= 0) {
        ball.z = 0;

        // キャッチ判定
        const catchZoneY = this.playerY - 30;
        const catchRadius = this.isDiving ? 80 : 55;
        const dx = Math.abs(ball.x - this.playerX);
        const dy = Math.abs(ball.y - catchZoneY);

        if (dx < catchRadius && dy < 50) {
          this.onCatch(ball);
        } else {
          this.onMiss(ball);
        }
        continue;
      }

      // 画面外チェック
      if (ball.y > this.canvasHeight + 100) {
        continue;
      }

      newBalls.push(ball);
    }

    this.balls = newBalls;

    // パーティクル更新
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.3;
      p.life--;
      return p.life > 0;
    });

    // キャッチエフェクト更新
    this.catchEffects = this.catchEffects.filter(e => {
      e.y -= 1.5;
      e.life--;
      return e.life > 0;
    });

    // 雲の動き
    this.cloudOffset += 0.3;
  }

  private onCatch(ball: Ball): void {
    this.catchCount.update(c => c + 1);
    this.combo.update(c => c + 1);

    if (this.combo() > this.maxCombo()) {
      this.maxCombo.set(this.combo());
    }

    // コンボボーナス
    const baseScore = ball.type === 'fast' ? 150 : ball.type === 'curve' ? 130 : 100;
    const comboBonus = Math.min(this.combo() * 20, 200);
    const diveBonus = this.isDiving ? 50 : 0;
    const totalScore = baseScore + comboBonus + diveBonus;

    this.score.update(s => s + totalScore);
    this.playSound(this.catchSound);

    // エフェクト
    let effectText = 'CATCH!';
    let effectColor = '#FFD700';

    if (this.combo() >= 10) {
      effectText = 'AMAZING!!';
      effectColor = '#FF00FF';
    } else if (this.combo() >= 5) {
      effectText = 'GREAT!';
      effectColor = '#00FF00';
    } else if (this.isDiving) {
      effectText = 'DIVING CATCH!';
      effectColor = '#00FFFF';

      // ダイビングキャッチ時のスローモーション演出
      this.isSlowMotion = true;
      this.gameTimeScale = 0.3;
      this.slowMotionTimer = 30; // 約0.5秒 (30フレーム × 0.3 = 実時間で0.5秒相当)
    }

    this.catchEffects.push({
      x: ball.x,
      y: ball.y,
      text: effectText,
      color: effectColor,
      life: 40
    });

    if (this.combo() > 1) {
      this.catchEffects.push({
        x: ball.x,
        y: ball.y + 25,
        text: `${this.combo()} COMBO +${comboBonus}`,
        color: '#FFA500',
        life: 35
      });
    }

    // パーティクル
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1'];
    for (let i = 0; i < 15; i++) {
      const angle = (Math.PI * 2 / 15) * i;
      const speed = 3 + Math.random() * 4;
      this.particles.push({
        x: ball.x,
        y: ball.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 25 + Math.random() * 10,
        maxLife: 35,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 3
      });
    }
  }

  private onMiss(ball: Ball): void {
    this.missCount.update(m => m + 1);
    this.combo.set(0);
    this.playSound(this.missSound);

    this.catchEffects.push({
      x: ball.x,
      y: this.canvasHeight - 50,
      text: 'MISS...',
      color: '#FF4444',
      life: 30
    });

    // 地面衝突パーティクル
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: ball.x + (Math.random() - 0.5) * 20,
        y: this.canvasHeight - 30,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 4 - 2,
        life: 20,
        maxLife: 20,
        color: 'rgba(139,69,19,1)',
        size: 2 + Math.random() * 2
      });
    }
  }

  private drawGame(): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    // 背景（夕暮れの空）
    const skyGradient = ctx.createLinearGradient(0, 0, 0, h * 0.5);
    skyGradient.addColorStop(0, '#1a1a2e');
    skyGradient.addColorStop(0.3, '#2d1b4e');
    skyGradient.addColorStop(0.6, '#4a1942');
    skyGradient.addColorStop(1, '#ff6b35');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, w, h * 0.5);

    // 太陽/月
    const sunX = w * 0.8;
    const sunY = h * 0.15;
    const sunGradient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 40);
    sunGradient.addColorStop(0, '#ffffff');
    sunGradient.addColorStop(0.5, '#ffdd88');
    sunGradient.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = sunGradient;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 40, 0, Math.PI * 2);
    ctx.fill();

    // 雲
    this.drawClouds();

    // スタジアム背景
    this.drawStadiumBackground();

    // フィールド
    this.drawField();

    // ターゲットサークル（落下地点）
    for (const ball of this.balls) {
      this.drawLandingTarget(ball);
    }

    // ボールの影
    for (const ball of this.balls) {
      this.drawBallShadow(ball);
    }

    // プレイヤー
    this.drawPlayer();

    // ボール
    for (const ball of this.balls) {
      this.drawBall(ball);
    }

    // パーティクル
    this.drawParticles();

    // キャッチエフェクト
    this.drawCatchEffects();

    // コンボメーター
    if (this.combo() > 0) {
      this.drawComboMeter();
    }

    // スローモーション時のビネット効果
    if (this.isSlowMotion) {
      const vignetteGradient = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h);
      vignetteGradient.addColorStop(0, 'rgba(0,255,255,0)');
      vignetteGradient.addColorStop(1, 'rgba(0,50,80,0.4)');
      ctx.fillStyle = vignetteGradient;
      ctx.fillRect(0, 0, w, h);

      // SLOW-MOTIONテキスト
      ctx.fillStyle = 'rgba(0,255,255,0.7)';
      ctx.font = `bold ${Math.min(w / 20, 20)}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('SLOW MOTION', w / 2, 30);
    }
  }

  private drawClouds(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;

    ctx.fillStyle = 'rgba(255,255,255,0.15)';

    for (let i = 0; i < 5; i++) {
      const x = ((i * 200 + this.cloudOffset) % (w + 200)) - 100;
      const y = 30 + i * 15 + Math.sin(i) * 10;

      ctx.beginPath();
      ctx.arc(x, y, 30, 0, Math.PI * 2);
      ctx.arc(x + 25, y - 10, 25, 0, Math.PI * 2);
      ctx.arc(x + 50, y, 28, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawStadiumBackground(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    // 観客席
    const standGradient = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.55);
    standGradient.addColorStop(0, '#1a1a1a');
    standGradient.addColorStop(1, '#2a2a2a');
    ctx.fillStyle = standGradient;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.quadraticCurveTo(w / 2, h * 0.3, w, h * 0.5);
    ctx.lineTo(w, h * 0.55);
    ctx.lineTo(0, h * 0.55);
    ctx.closePath();
    ctx.fill();

    // 観客ライト
    for (let i = 0; i < 60; i++) {
      const x = (w * 0.05) + (i % 15) * (w * 0.9 / 15);
      const row = Math.floor(i / 15);
      const y = h * 0.38 + row * 10 + Math.sin(x * 0.05) * 3;
      const flicker = Math.sin(this.frameCount * 0.15 + i * 0.7) > 0.2;

      if (flicker) {
        ctx.fillStyle = ['#ffcc00', '#ff6600', '#ffffff', '#ff3366'][i % 4];
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // フェンス
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.55);
    ctx.quadraticCurveTo(w / 2, h * 0.4, w, h * 0.55);
    ctx.stroke();
  }

  private drawField(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    // 芝生
    const fieldGradient = ctx.createLinearGradient(0, h * 0.55, 0, h);
    fieldGradient.addColorStop(0, '#1a5c1a');
    fieldGradient.addColorStop(0.5, '#228B22');
    fieldGradient.addColorStop(1, '#1a6b1a');
    ctx.fillStyle = fieldGradient;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.55);
    ctx.quadraticCurveTo(w / 2, h * 0.4, w, h * 0.55);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // 芝生ストライプ
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) {
        const startY = h * 0.55 + i * 20;
        ctx.beginPath();
        ctx.moveTo(w * 0.1, startY);
        ctx.lineTo(w * 0.9, startY);
        ctx.lineTo(w * 0.95, startY + 25);
        ctx.lineTo(w * 0.05, startY + 25);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 警告トラック
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, h - 20, w, 20);
  }

  private drawBallShadow(ball: Ball): void {
    const ctx = this.ctx;

    // 高度に応じた影のサイズと透明度
    const shadowScale = 1 - (ball.z / 100) * 0.7;
    const shadowAlpha = 0.3 * shadowScale;
    const shadowSize = ball.size * (0.5 + shadowScale * 0.5);

    // 影のY位置（ボールの真下、着地予定地点）
    const shadowY = ball.y;

    ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(ball.x, shadowY, shadowSize, shadowSize * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ターゲットサークル（落下地点表示）
  private drawLandingTarget(ball: Ball): void {
    const ctx = this.ctx;

    // 落下までの進行度（0=発生時、1=着地時）
    const progress = 1 - (ball.z / 100);
    const pulse = Math.sin(this.frameCount * 0.15) * 0.2 + 0.8;

    // 着地予測Y位置
    const landingY = ball.y;

    // 外枠（パルスアニメーション）
    const outerRadius = 40 + (1 - progress) * 20;
    ctx.strokeStyle = `rgba(255,255,0,${progress * pulse * 0.8})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ball.x, landingY, outerRadius * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // 内側の色変化（遠い=緑、近い=赤）
    const r = Math.floor(progress * 255);
    const g = Math.floor((1 - progress) * 255);
    ctx.fillStyle = `rgba(${r},${g},0,${0.2 + progress * 0.3})`;
    ctx.beginPath();
    ctx.arc(ball.x, landingY, 25, 0, Math.PI * 2);
    ctx.fill();

    // 中心ポイント
    ctx.fillStyle = `rgba(255,255,255,${0.5 + progress * 0.5})`;
    ctx.beginPath();
    ctx.arc(ball.x, landingY, 5, 0, Math.PI * 2);
    ctx.fill();

    // スローモーション時の追加演出
    if (this.isSlowMotion) {
      ctx.strokeStyle = `rgba(0,255,255,${pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(ball.x, landingY, outerRadius * 1.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawBall(ball: Ball): void {
    const ctx = this.ctx;

    // 高度に応じたY位置調整
    const visualY = ball.y - ball.z * 2;

    // サイズ（遠近法）
    const perspective = 0.7 + (1 - ball.z / 100) * 0.5;
    const size = ball.size * perspective;

    ctx.save();
    ctx.translate(ball.x, visualY);
    ctx.rotate(ball.rotation);

    // ボール本体
    const gradient = ctx.createRadialGradient(-size * 0.3, -size * 0.3, 0, 0, 0, size);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.7, '#e8e8e8');
    gradient.addColorStop(1, '#cccccc');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();

    // 縫い目
    ctx.strokeStyle = '#C41E3A';
    ctx.lineWidth = Math.max(1.5, size * 0.12);
    ctx.beginPath();
    ctx.arc(-size * 0.25, 0, size * 0.5, 0.5, 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(size * 0.25, 0, size * 0.5, 3.5, 5.5);
    ctx.stroke();

    // タイプ別エフェクト
    if (ball.type === 'fast') {
      // 速球の軌跡
      ctx.strokeStyle = 'rgba(255,100,100,0.5)';
      ctx.lineWidth = size * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(0, -size * 2.5);
      ctx.stroke();
    } else if (ball.type === 'curve') {
      // カーブの軌跡
      ctx.strokeStyle = 'rgba(100,100,255,0.4)';
      ctx.lineWidth = size * 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.5, 0, Math.PI, true);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawPlayer(): void {
    const ctx = this.ctx;
    const x = this.playerX;
    const y = this.playerY;

    ctx.save();
    ctx.translate(x, y);

    // ダイブアニメーション
    if (this.isDiving) {
      const diveAngle = this.diveDirection * Math.sin(this.diveProgress * Math.PI) * 0.5;
      const diveY = Math.sin(this.diveProgress * Math.PI) * 20;
      ctx.rotate(diveAngle);
      ctx.translate(0, -diveY);
    }

    // 足
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-15, 10, 12, 20, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(15, 10, 12, 20, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // 体
    ctx.fillStyle = '#002D62';
    ctx.beginPath();
    ctx.ellipse(0, -30, 25, 40, 0, 0, Math.PI * 2);
    ctx.fill();

    // 背番号（フォントサイズをcanvasサイズに応じて調整）
    const numberFontSize = Math.max(14, Math.min(this.canvasWidth / 20, 20));
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${numberFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('7', 0, -25);

    // 頭
    ctx.fillStyle = '#ffdbac';
    ctx.beginPath();
    ctx.arc(0, -80, 18, 0, Math.PI * 2);
    ctx.fill();

    // 帽子
    ctx.fillStyle = '#002D62';
    ctx.beginPath();
    ctx.ellipse(0, -92, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-20, -92, 40, -12);
    ctx.beginPath();
    ctx.ellipse(0, -104, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 帽子のつば
    ctx.fillRect(-25, -92, 50, 5);

    // グローブ（両手を上げる）
    const gloveY = this.isDiving ? -50 : -60;

    // 左腕
    ctx.strokeStyle = '#002D62';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-20, -50);
    ctx.quadraticCurveTo(-40, gloveY - 20, -45, gloveY - 40);
    ctx.stroke();

    // 左グローブ
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.ellipse(-45, gloveY - 55, 22, 28, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // グローブのウェブ
    ctx.fillStyle = '#654321';
    ctx.beginPath();
    ctx.ellipse(-45, gloveY - 55, 15, 20, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // 右腕（素手 - 投げる手）
    ctx.strokeStyle = '#002D62';
    ctx.beginPath();
    ctx.moveTo(20, -50);
    ctx.quadraticCurveTo(35, -65, 30, -85);
    ctx.stroke();

    // 右手（素手、肌色）
    ctx.fillStyle = '#ffdbac';
    ctx.beginPath();
    ctx.arc(30, -90, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawParticles(): void {
    const ctx = this.ctx;

    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.fillStyle = p.color.replace('1)', `${alpha})`);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCatchEffects(): void {
    const ctx = this.ctx;

    for (const effect of this.catchEffects) {
      const alpha = effect.life / 40;
      const scale = 1 + (1 - alpha) * 0.3;

      ctx.save();
      ctx.translate(effect.x, effect.y);
      ctx.scale(scale, scale);

      // エフェクトテキストのフォントサイズをcanvasサイズに応じて調整
      const effectFontSize = Math.max(16, Math.min(this.canvasWidth / 18, 22));
      ctx.fillStyle = effect.color;
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${effectFontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = Math.max(2, Math.min(this.canvasWidth / 150, 3));
      ctx.strokeText(effect.text, 0, 0);
      ctx.fillText(effect.text, 0, 0);

      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawComboMeter(): void {
    const ctx = this.ctx;
    const combo = this.combo();

    // コンボメーター背景
    const meterX = this.canvasWidth - 80;
    const meterY = 80;
    const meterHeight = 120;
    const meterWidth = 20;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(meterX, meterY, meterWidth, meterHeight);

    // コンボレベル
    const level = Math.min(combo / 10, 1);
    const fillHeight = meterHeight * level;

    const meterGradient = ctx.createLinearGradient(meterX, meterY + meterHeight, meterX, meterY + meterHeight - fillHeight);
    meterGradient.addColorStop(0, '#00ff00');
    meterGradient.addColorStop(0.5, '#ffff00');
    meterGradient.addColorStop(1, '#ff0000');
    ctx.fillStyle = meterGradient;
    ctx.fillRect(meterX, meterY + meterHeight - fillHeight, meterWidth, fillHeight);

    // コンボ数（フォントサイズをcanvasサイズに応じて調整）
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    const comboFontSize = Math.max(16, Math.min(w / 20, 24));
    const comboLabelFontSize = Math.max(8, Math.min(w / 40, 10));
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${comboFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const comboOffset = Math.max(8, Math.min(h / 30, 10));
    ctx.fillText(`${combo}`, meterX + meterWidth / 2, meterY - comboOffset);
    ctx.font = `bold ${comboLabelFontSize}px Arial`;
    ctx.textBaseline = 'top';
    const labelOffset = Math.max(12, Math.min(h / 25, 15));
    ctx.fillText('COMBO', meterX + meterWidth / 2, meterY + meterHeight + labelOffset);
  }

  private drawReadyScreen(): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    // 背景
    this.drawGame();

    // オーバーレイ
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, w, h);

    // フォントサイズをcanvasサイズに応じて調整
    const baseFontSize = Math.min(w / 12, h / 8);
    const titleFontSize = Math.max(20, Math.min(baseFontSize * 1.2, 32));
    const subtitleFontSize = Math.max(12, Math.min(baseFontSize * 0.5, 16));
    const instructionFontSize = Math.max(10, Math.min(baseFontSize * 0.4, 14));

    // タイトル
    ctx.fillStyle = '#4ECDC4';
    ctx.font = `bold ${titleFontSize}px "Oswald", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧤 CATCH FLY 🧤', w / 2, h / 2 - h * 0.2);

    ctx.fillStyle = '#ffffff';
    ctx.font = `${subtitleFontSize}px "Noto Sans JP", Arial`;
    ctx.fillText('60秒間でフライボールをキャッチ！', w / 2, h / 2 - h * 0.05);

    ctx.font = `${instructionFontSize}px Arial`;
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('← → キーで移動 / スペースでダイビング', w / 2, h / 2 + h * 0.1);
    ctx.fillText('スマホはタッチ＆スライドで操作', w / 2, h / 2 + h * 0.2);
  }

  private stopGame(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.gameLoopId) {
      clearInterval(this.gameLoopId);
    }
    if (this.spawnInterval) {
      clearTimeout(this.spawnInterval);
    }
  }

  private endGame(): void {
    this.stopGame();
    this.stopBgm();
    this.playSound(this.timeupSound);
    this.gameState.set('gameover');
  }

  private initSounds(): void {
    this.catchSound = new Audio('assets/sounds/catch.mp3');
    this.catchSound.volume = 0.8;

    this.missSound = new Audio('assets/sounds/catch-miss.mp3');
    this.missSound.volume = 0.7;

    this.timeupSound = new Audio('assets/sounds/timeup.mp3');
    this.timeupSound.volume = 0.8;

    // BGM
    try {
      this.bgm = new Audio('assets/sounds/background-music.mp3');
      this.bgm.loop = true;
      this.bgm.volume = 0.4;
      this.bgm.addEventListener('error', () => {
        // ファイルが見つからない場合はBGMを無効化
        this.bgm = undefined;
      });
    } catch {
      // 初期化エラーは無視
      this.bgm = undefined;
    }
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

  private playBgm(): void {
    if (!this.isBrowser || !this.bgm) return;
    try {
      void this.bgm.play();
    } catch {
      // 再生できない場合は無視
    }
  }

  private stopBgm(): void {
    if (!this.bgm) return;
    this.bgm.pause();
    this.bgm.currentTime = 0;
  }

  saveScore(): void {
    const rank = this.gameScoreService.addScore('catch', this.nickname, this.score());
    this.savedRank.set(rank);
    this.scoreSaved.set(true);
    this.highScore.set(this.gameScoreService.getHighScore('catch'));
  }

  getCatchRate(): number {
    const total = this.catchCount() + this.missCount();
    if (total === 0) return 0;
    return Math.round((this.catchCount() / total) * 100);
  }
}
