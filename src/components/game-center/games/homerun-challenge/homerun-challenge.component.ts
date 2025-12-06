import { Component, ChangeDetectionStrategy, signal, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, PLATFORM_ID, Inject, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GameScoreService } from '../../../../services/game-score.service';
import { SEOService } from '../../../../services/seo.service';

type GameState = 'ready' | 'pitching' | 'swing' | 'flying' | 'result' | 'gameover';

interface BallResult {
  type: 'homerun' | 'hit' | 'foul' | 'strike' | 'miss';
  distance: number;
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

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

@Component({
  selector: 'app-homerun-challenge',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './homerun-challenge.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomerunChallengeComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private animationId: number = 0;
  private isBrowser: boolean;
  private resizeHandler?: () => void;
  private resizeObserver?: ResizeObserver;

  private seoService = inject(SEOService);
  private gameScoreService = inject(GameScoreService);

  // ゲーム状態
  gameState = signal<GameState>('ready');
  currentBall = signal(0);
  totalBalls = 10;
  score = signal(0);
  results = signal<BallResult[]>([]);

  // キャンバスサイズ
  private canvasWidth = 0;
  private canvasHeight = 0;

  // ボールの3D位置（z=奥行き）
  private ballX = 0;
  private ballY = 0;
  private ballZ = 0; // 0=投手、1000=バッター
  private ballVx = 0;
  private ballVy = 0;
  private ballVz = 0;

  // 打球の飛行
  private hitBallX = 0;
  private hitBallY = 0;
  private hitBallZ = 0;
  private hitBallVx = 0;
  private hitBallVy = 0;
  private hitBallVz = 0;

  // ボールの軌跡
  private ballTrail: TrailPoint[] = [];

  // パーティクル
  private particles: Particle[] = [];

  // バッター
  private batAngle = 0;
  private isSwinging = false;
  private swingStartTime = 0;

  // 現在のプレイ
  currentResult = signal<BallResult | null>(null);
  showResultMessage = signal(false);
  swingTiming = signal<'perfect' | 'good' | 'early' | 'late' | null>(null);

  // ゲームオーバー
  nickname = '';
  savedRank = signal(0);
  highScore = signal(0);
  nicknameError = signal<string | null>(null);

  // サウンド
  private swingSound?: HTMLAudioElement;
  private homerunSound?: HTMLAudioElement;
  private hitSound?: HTMLAudioElement;
  private foulSound?: HTMLAudioElement;
  private missSound?: HTMLAudioElement;
  private bgm?: HTMLAudioElement;
  // アニメーション用
  private frameCount = 0;
  private slowMotion = false;
  private slowMotionFactor = 1;
  private flyingTimeoutId: number | null = null;
  private resultTimeoutId: number | null = null;

  // Iteration 2: Game Feel Enhancement
  private screenShakeX = 0;
  private screenShakeY = 0;
  private screenShakeIntensity = 0;
  private impactFlashAlpha = 0;
  private motionBlurAlpha = 0;
  private comboCount = 0;
  private lastHitType: BallResult['type'] | null = null;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault();
      this.swing();
    }
  }

  ngOnInit(): void {
    this.seoService.updateSEO({
      title: 'ホームランチャレンジ | 八戸西高校 野球部OB会',
      description: 'タイミングを合わせてホームランを打て！10球中何本ホームランを打てるかチャレンジ！',
      keywords: '野球ゲーム,ホームラン,バッティング,ミニゲーム',
      url: 'https://hachinishibaseball-ob.com/game/homerun'
    });
    this.highScore.set(this.gameScoreService.getHighScore('homerun'));
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
    if (this.isBrowser && this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.flyingTimeoutId !== null) {
      clearTimeout(this.flyingTimeoutId);
      this.flyingTimeoutId = null;
    }
    if (this.resultTimeoutId !== null) {
      clearTimeout(this.resultTimeoutId);
      this.resultTimeoutId = null;
    }
    this.stopBgm();
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
      const aspectRatio = 16 / 10; // aspect-[16/10]に合わせる
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

      // ゲーム状態に応じて再描画
      const state = this.gameState();
      if (state === 'ready') {
        this.drawReadyScreen();
      } else if (state === 'pitching' || state === 'swing' || state === 'flying' || state === 'result' || state === 'gameover') {
        // ゲーム中は次のフレームで再描画される
      }
    }
  }

  startGame(): void {
    this.gameState.set('ready');
    this.currentBall.set(0);
    this.score.set(0);
    this.results.set([]);
    this.savedRank.set(0);
    this.playBgm();
    this.nextPitch();
  }

  private nextPitch(): void {
    if (this.currentBall() >= this.totalBalls) {
      this.endGame();
      return;
    }

    // キャンバスサイズがまだ取得できていない場合のガード
    // （初回描画前に startGame()/nextPitch() が呼ばれると width/height が 0 のことがある）
    if (this.canvasWidth <= 0 || this.canvasHeight <= 0) {
      // 可能なら実際の要素サイズで再計算
      if (this.isBrowser && this.canvasRef?.nativeElement) {
        this.resizeCanvas();
      }

      // それでも 0 の場合はデフォルトサイズを使用して、ボールが (0,0) にならないようにする
      const DEFAULT_WIDTH = 800;
      const DEFAULT_HEIGHT = 450;
      if (this.canvasWidth <= 0) {
        this.canvasWidth = DEFAULT_WIDTH;
      }
      if (this.canvasHeight <= 0) {
        this.canvasHeight = DEFAULT_HEIGHT;
      }
    }

    this.currentBall.update(v => v + 1);
    this.currentResult.set(null);
    this.showResultMessage.set(false);
    this.swingTiming.set(null);
    this.ballTrail = [];
    this.particles = [];
    this.isSwinging = false;
    this.batAngle = -Math.PI / 4;
    this.slowMotion = false;
    this.slowMotionFactor = 1;

    // ボール初期位置（投手マウンド）
    this.ballX = this.canvasWidth / 2;
    this.ballY = this.canvasHeight * 0.35;
    this.ballZ = 0;

    // 投球速度（ランダム変化）
    const speed = 12 + Math.random() * 8 + (this.currentBall() * 0.5);
    this.ballVz = speed;
    this.ballVx = (Math.random() - 0.5) * 2;
    this.ballVy = (Math.random() - 0.5) * 1;

    this.gameState.set('pitching');
    this.animateGame();
  }

  private animateGame(): void {
    this.frameCount++;

    const state = this.gameState();
    if (state !== 'pitching' && state !== 'swing' && state !== 'flying') return;

    // スローモーション処理
    const deltaMultiplier = this.slowMotion ? this.slowMotionFactor : 1;

    // スクリーンシェイク更新
    this.updateScreenShake();

    // インパクトフラッシュ減衰
    if (this.impactFlashAlpha > 0) {
      this.impactFlashAlpha *= 0.85;
      if (this.impactFlashAlpha < 0.01) this.impactFlashAlpha = 0;
    }

    // モーションブラー減衰
    if (this.motionBlurAlpha > 0 && !this.slowMotion) {
      this.motionBlurAlpha *= 0.9;
      if (this.motionBlurAlpha < 0.01) this.motionBlurAlpha = 0;
    }

    if (state === 'pitching' || state === 'swing') {
      this.updatePitching(deltaMultiplier);
    } else if (state === 'flying') {
      this.updateFlying(deltaMultiplier);
    }

    this.updateParticles(deltaMultiplier);
    this.drawGame();

    this.animationId = requestAnimationFrame(() => this.animateGame());
  }

  private updateScreenShake(): void {
    if (this.screenShakeIntensity > 0.1) {
      this.screenShakeX = (Math.random() - 0.5) * this.screenShakeIntensity;
      this.screenShakeY = (Math.random() - 0.5) * this.screenShakeIntensity;
      this.screenShakeIntensity *= 0.88;
    } else {
      this.screenShakeX = 0;
      this.screenShakeY = 0;
      this.screenShakeIntensity = 0;
    }
  }

  private triggerImpactEffects(type: BallResult['type']): void {
    if (type === 'homerun') {
      this.screenShakeIntensity = 25;
      this.impactFlashAlpha = 0.8;
      this.motionBlurAlpha = 0.5;
    } else if (type === 'hit') {
      this.screenShakeIntensity = 12;
      this.impactFlashAlpha = 0.4;
      this.motionBlurAlpha = 0.3;
    } else if (type === 'foul') {
      this.screenShakeIntensity = 6;
      this.impactFlashAlpha = 0.2;
    }
  }

  private updatePitching(delta: number): void {
    // ボール移動
    this.ballZ += this.ballVz * delta;
    this.ballX += this.ballVx * delta;
    this.ballY += this.ballVy * delta;

    // 軌跡追加
    if (this.frameCount % 2 === 0) {
      this.ballTrail.push({
        x: this.ballX,
        y: this.ballY,
        alpha: 1
      });
      if (this.ballTrail.length > 15) {
        this.ballTrail.shift();
      }
    }

    // 軌跡フェード
    this.ballTrail.forEach(t => t.alpha *= 0.92);

    // バットスイングアニメーション
    if (this.isSwinging) {
      const elapsed = Date.now() - this.swingStartTime;
      const swingDuration = 150;

      if (elapsed < swingDuration) {
        const progress = elapsed / swingDuration;
        this.batAngle = -Math.PI / 4 + (Math.PI * 0.9) * this.easeOutQuad(progress);
      } else {
        this.batAngle = Math.PI * 0.65;

        // スイング完了時の判定
        if (!this.currentResult()) {
          this.checkSwingResult();
        }
      }
    }

    // ボールがバッターを通過
    if (this.ballZ > 1000 && !this.currentResult()) {
      this.handleResult('strike', 0, 'late');
    }
  }

  private updateFlying(delta: number): void {
    // 打球の飛行物理
    this.hitBallX += this.hitBallVx * delta;
    this.hitBallY += this.hitBallVy * delta;
    this.hitBallZ += this.hitBallVz * delta;

    // 重力
    this.hitBallVy += 0.3 * delta;

    // スローモーション徐々に解除
    if (this.slowMotion) {
      this.slowMotionFactor = Math.min(1, this.slowMotionFactor + 0.02);
      if (this.slowMotionFactor >= 1) {
        this.slowMotion = false;
      }
    }

    // 軌跡追加
    if (this.frameCount % 2 === 0) {
      this.ballTrail.push({
        x: this.hitBallX,
        y: this.hitBallY,
        alpha: 1
      });
      if (this.ballTrail.length > 20) {
        this.ballTrail.shift();
      }
    }
    this.ballTrail.forEach(t => t.alpha *= 0.9);

    // ホームランの場合パーティクル追加
    if (this.currentResult()?.type === 'homerun' && this.frameCount % 3 === 0) {
      this.addFireworkParticles(this.hitBallX, this.hitBallY);
    }

    // 飛行終了判定
    if (this.hitBallZ > 2000 || this.hitBallY > this.canvasHeight + 100) {
      cancelAnimationFrame(this.animationId);
      this.showResultMessage.set(true);
      this.gameState.set('result');

      if (this.flyingTimeoutId !== null) {
        clearTimeout(this.flyingTimeoutId);
      }
      this.flyingTimeoutId = window.setTimeout(() => {
        this.showResultMessage.set(false);
        this.nextPitch();
        this.flyingTimeoutId = null;
      }, 2000);
    }
  }

  private updateParticles(delta: number): void {
    this.particles = this.particles.filter(p => {
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.vy += 0.2 * delta; // 重力
      p.life -= delta;
      return p.life > 0;
    });
  }

  swing(): void {
    if (this.gameState() !== 'pitching' || this.isSwinging) return;

    this.playSound(this.swingSound);
    this.isSwinging = true;
    this.swingStartTime = Date.now();
    this.gameState.set('swing');

    // スイング開始パーティクル
    this.addSwingParticles();
  }

  private checkSwingResult(): void {
    // タイミング判定（ballZ: 0=投手, 1000=バッター, 最適=800-900）
    const optimalZone = 850;
    const diff = Math.abs(this.ballZ - optimalZone);

    let type: BallResult['type'];
    let distance: number;
    let timing: 'perfect' | 'good' | 'early' | 'late';

    if (diff <= 50) {
      // パーフェクト
      type = 'homerun';
      distance = 120 + Math.floor(Math.random() * 30);
      timing = 'perfect';
      this.slowMotion = true;
      this.slowMotionFactor = 0.3;
    } else if (diff <= 100) {
      // グッド
      type = Math.random() > 0.3 ? 'homerun' : 'hit';
      distance = type === 'homerun' ? 100 + Math.floor(Math.random() * 20) : 80 + Math.floor(Math.random() * 30);
      timing = 'good';
    } else if (diff <= 180) {
      // ヒット/ファウル
      type = Math.random() > 0.5 ? 'hit' : 'foul';
      distance = type === 'hit' ? 50 + Math.floor(Math.random() * 40) : 20 + Math.floor(Math.random() * 30);
      timing = this.ballZ < optimalZone ? 'early' : 'late';
    } else if (diff <= 280) {
      // ファウル
      type = 'foul';
      distance = 10 + Math.floor(Math.random() * 20);
      timing = this.ballZ < optimalZone ? 'early' : 'late';
    } else {
      // 空振り
      type = 'miss';
      distance = 0;
      timing = this.ballZ < optimalZone ? 'early' : 'late';
    }

    this.handleResult(type, distance, timing);
  }

  private handleResult(type: BallResult['type'], distance: number, timing: 'perfect' | 'good' | 'early' | 'late'): void {
    const result: BallResult = { type, distance };
    this.currentResult.set(result);
    this.swingTiming.set(timing);
    this.results.update(r => [...r, result]);

    // インパクトエフェクト発動
    this.triggerImpactEffects(type);

    // コンボ管理
    if (type === 'homerun' || type === 'hit') {
      if (this.lastHitType === 'homerun' || this.lastHitType === 'hit') {
        this.comboCount++;
      } else {
        this.comboCount = 1;
      }
      this.lastHitType = type;
    } else {
      this.comboCount = 0;
      this.lastHitType = null;
    }

    // スコア計算 & サウンド（コンボボーナス付き）
    const comboMultiplier = 1 + (this.comboCount > 1 ? (this.comboCount - 1) * 0.2 : 0);

    if (type === 'homerun') {
      const bonusScore = Math.floor(distance * 10 * comboMultiplier);
      this.score.update(s => s + bonusScore);
      this.addHomerunParticles();
      this.playSound(this.homerunSound);
    } else if (type === 'hit') {
      const bonusScore = Math.floor(distance * 5 * comboMultiplier);
      this.score.update(s => s + bonusScore);
      this.playSound(this.hitSound);
    } else if (type === 'foul') {
      this.playSound(this.foulSound);
    } else if (type === 'strike' || type === 'miss') {
      this.playSound(this.missSound);
    }

    // 打球飛行開始
    if (type === 'homerun' || type === 'hit') {
      this.startBallFlight(type, distance);
    } else {
      // ファウル、空振り、見逃しの場合
      this.showResultMessage.set(true);
      this.gameState.set('result');

      if (this.resultTimeoutId !== null) {
        clearTimeout(this.resultTimeoutId);
      }
      this.resultTimeoutId = window.setTimeout(() => {
        this.showResultMessage.set(false);
        this.nextPitch();
        this.resultTimeoutId = null;
      }, 1500);
    }
  }

  private initSounds(): void {
    // 実際の音声ファイルは assets/sounds 配下に配置してください
    this.swingSound = new Audio('assets/sounds/bat-swing.mp3');
    this.swingSound.volume = 0.6;

    this.homerunSound = new Audio('assets/sounds/homerun.mp3');
    this.homerunSound.volume = 0.8;

    this.hitSound = new Audio('assets/sounds/hit.mp3');
    this.hitSound.volume = 0.7;

    this.foulSound = new Audio('assets/sounds/foul.mp3');
    this.foulSound.volume = 0.6;

    this.missSound = new Audio('assets/sounds/miss.mp3');
    this.missSound.volume = 0.6;

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
      // 自動再生ブロックなどは無視
    }
  }

  private playBgm(): void {
    if (!this.isBrowser || !this.bgm) return;
    try {
      void this.bgm.play();
    } catch {
      // 自動再生ブロックなどは無視
    }
  }

  private stopBgm(): void {
    if (!this.bgm) return;
    this.bgm.pause();
    this.bgm.currentTime = 0;
  }

  private startBallFlight(type: BallResult['type'], distance: number): void {
    this.gameState.set('flying');
    this.ballTrail = [];

    // 打球初期位置（バッター位置）
    this.hitBallX = this.canvasWidth / 2;
    this.hitBallY = this.canvasHeight * 0.75;
    this.hitBallZ = 0;

    // 打球速度
    const power = type === 'homerun' ? 1.2 : 0.8;
    this.hitBallVx = (Math.random() - 0.5) * 8;
    this.hitBallVy = -12 * power;
    this.hitBallVz = 15 * power;
  }

  private drawGame(): void {
    if (!this.ctx) return;

    const ctx = this.ctx;

    // スクリーンシェイク適用
    ctx.save();
    ctx.translate(this.screenShakeX, this.screenShakeY);

    // 背景（野球場）
    this.drawStadium();

    const state = this.gameState();

    if (state === 'pitching' || state === 'swing') {
      // 投球中
      this.drawPitcher();
      this.drawBallTrail();
      this.drawBall3D(this.ballX, this.ballY, this.ballZ);
      this.drawBatter();
    } else if (state === 'flying') {
      // 打球飛行中
      this.drawBallTrail();
      this.drawFlyingBall();
    }

    // パーティクル
    this.drawParticles();

    // タイミングインジケーター
    if (state === 'pitching' || state === 'swing') {
      this.drawTimingIndicator();
    }

    // コンボ表示
    if (this.comboCount >= 2 && (state === 'flying' || this.showResultMessage())) {
      this.drawComboDisplay();
    }

    // モーションブラー効果
    if (this.motionBlurAlpha > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.motionBlurAlpha * 0.3})`;
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

      // ラジアルブラー代わりに放射状のライン
      if (this.slowMotion && this.motionBlurAlpha > 0.2) {
        ctx.strokeStyle = `rgba(255,255,255,${this.motionBlurAlpha * 0.1})`;
        ctx.lineWidth = 2;
        const centerX = this.canvasWidth / 2;
        const centerY = this.canvasHeight * 0.7;
        for (let i = 0; i < 20; i++) {
          const angle = (i / 20) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(centerX + Math.cos(angle) * 50, centerY + Math.sin(angle) * 30);
          ctx.lineTo(centerX + Math.cos(angle) * 200, centerY + Math.sin(angle) * 120);
          ctx.stroke();
        }
      }
    }

    // インパクトフラッシュ
    if (this.impactFlashAlpha > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.impactFlashAlpha})`;
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    ctx.restore();
  }

  private drawComboDisplay(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;

    // コンボ背景
    const comboY = 60;
    const pulseScale = 1 + Math.sin(this.frameCount * 0.2) * 0.05;

    ctx.save();
    ctx.translate(w - 80, comboY);
    ctx.scale(pulseScale, pulseScale);

    // グラデーション背景
    const gradient = ctx.createLinearGradient(-40, -20, 40, 20);
    gradient.addColorStop(0, 'rgba(255,100,0,0.9)');
    gradient.addColorStop(0.5, 'rgba(255,50,0,0.95)');
    gradient.addColorStop(1, 'rgba(200,0,0,0.9)');
    ctx.fillStyle = gradient;

    // 角丸四角形
    ctx.beginPath();
    ctx.roundRect(-50, -25, 100, 50, 10);
    ctx.fill();

    // 枠線
    ctx.strokeStyle = 'rgba(255,200,0,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // テキスト
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('COMBO', 0, -8);

    ctx.font = 'bold 20px Oswald, Arial';
    ctx.fillStyle = '#ffcc00';
    ctx.fillText(`×${this.comboCount}`, 0, 12);

    ctx.restore();
  }

  private drawStadium(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    // 空（グラデーション - より深みのある夜空）
    const skyGradient = ctx.createLinearGradient(0, 0, 0, h * 0.4);
    skyGradient.addColorStop(0, '#0a0a18');
    skyGradient.addColorStop(0.3, '#12122a');
    skyGradient.addColorStop(0.6, '#1a1a3e');
    skyGradient.addColorStop(1, '#0f2847');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, w, h * 0.4);

    // 星（より多く、より美しく）
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 80; i++) {
      const x = (i * 137.5 + this.frameCount * 0.01) % w;
      const y = (i * 89.3) % (h * 0.35);
      const size = 0.3 + (i % 5) * 0.4;
      const twinkle = Math.sin(this.frameCount * 0.08 + i * 0.7) * 0.4 + 0.6;
      ctx.globalAlpha = twinkle * (i % 3 === 0 ? 1 : 0.6);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // スタジアム照明塔（左右）
    this.drawLightTower(w * 0.08, h * 0.05);
    this.drawLightTower(w * 0.92, h * 0.05);
    this.drawLightTower(w * 0.25, h * 0.08);
    this.drawLightTower(w * 0.75, h * 0.08);

    // 電光掲示板（センター）
    this.drawScoreboard(w / 2, h * 0.12);

    // 観客席（外野 - より立体的に）
    const standGradient = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.5);
    standGradient.addColorStop(0, '#3a3a4a');
    standGradient.addColorStop(0.5, '#2a2a3a');
    standGradient.addColorStop(1, '#1a1a28');
    ctx.fillStyle = standGradient;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.4);
    ctx.quadraticCurveTo(w / 2, h * 0.22, w, h * 0.4);
    ctx.lineTo(w, h * 0.52);
    ctx.quadraticCurveTo(w / 2, h * 0.34, 0, h * 0.52);
    ctx.closePath();
    ctx.fill();

    // 観客席の段（立体感）
    for (let row = 0; row < 4; row++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.05 - row * 0.01})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const yOffset = h * 0.35 + row * 12;
      ctx.moveTo(0, yOffset);
      ctx.quadraticCurveTo(w / 2, yOffset - 8, w, yOffset);
      ctx.stroke();
    }

    // 観客のペンライト/スマホライト（波打つ演出）
    for (let i = 0; i < 120; i++) {
      const col = i % 30;
      const row = Math.floor(i / 30);
      const x = (w * 0.05) + col * (w * 0.9 / 30);
      const baseY = h * 0.28 + row * 10;
      const waveOffset = Math.sin(this.frameCount * 0.05 + col * 0.3) * 3;
      const y = baseY + waveOffset;

      const intensity = Math.sin(this.frameCount * 0.15 + i * 0.3);
      if (intensity > 0.2) {
        const colors = ['#ffcc00', '#ff6600', '#ffffff', '#00ff88', '#ff66cc', '#66ccff'];
        ctx.fillStyle = colors[i % colors.length];
        ctx.globalAlpha = 0.4 + intensity * 0.4;
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + intensity, 0, Math.PI * 2);
        ctx.fill();

        // グロー効果
        if (intensity > 0.7) {
          ctx.globalAlpha = 0.2;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;

    // 照明効果（フィールドへの光）
    this.drawFieldLighting();

    // フェンス（ホームランライン - よりリアルに）
    const fenceGradient = ctx.createLinearGradient(0, h * 0.48, 0, h * 0.52);
    fenceGradient.addColorStop(0, '#ffdd44');
    fenceGradient.addColorStop(0.5, '#ffcc00');
    fenceGradient.addColorStop(1, '#cc9900');
    ctx.strokeStyle = fenceGradient;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.quadraticCurveTo(w / 2, h * 0.34, w, h * 0.5);
    ctx.stroke();

    // フェンス下の広告帯
    ctx.fillStyle = '#1a4a8a';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.quadraticCurveTo(w / 2, h * 0.34, w, h * 0.5);
    ctx.lineTo(w, h * 0.54);
    ctx.quadraticCurveTo(w / 2, h * 0.38, 0, h * 0.54);
    ctx.closePath();
    ctx.fill();

    // フィールド（芝生 - よりリアルな色合い）
    const fieldGradient = ctx.createLinearGradient(0, h * 0.54, 0, h);
    fieldGradient.addColorStop(0, '#1a5a20');
    fieldGradient.addColorStop(0.2, '#228B22');
    fieldGradient.addColorStop(0.5, '#2a9a32');
    fieldGradient.addColorStop(1, '#1a7a22');
    ctx.fillStyle = fieldGradient;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.54);
    ctx.quadraticCurveTo(w / 2, h * 0.38, w, h * 0.54);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // 芝生のストライプ（より詳細に）
    for (let i = 0; i < 15; i++) {
      const alpha = i % 2 === 0 ? 0.06 : 0.02;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      const startY = h * 0.55 + i * 12;
      const curve = 8 - i * 0.3;
      ctx.beginPath();
      ctx.moveTo(w * 0.15, startY);
      ctx.quadraticCurveTo(w / 2, startY - curve, w * 0.85, startY);
      ctx.lineTo(w * 0.88, startY + 12);
      ctx.quadraticCurveTo(w / 2, startY + 12 - curve * 0.8, w * 0.12, startY + 12);
      ctx.closePath();
      ctx.fill();
    }

    // ダイヤモンド（内野）のライン
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.88);
    ctx.lineTo(w * 0.35, h * 0.7);
    ctx.moveTo(w / 2, h * 0.88);
    ctx.lineTo(w * 0.65, h * 0.7);
    ctx.stroke();

    // 投手マウンド（よりリアルに）
    const moundGradient = ctx.createRadialGradient(w / 2, h * 0.46, 0, w / 2, h * 0.46, 40);
    moundGradient.addColorStop(0, '#d4b896');
    moundGradient.addColorStop(0.7, '#c4a484');
    moundGradient.addColorStop(1, '#a08060');
    ctx.fillStyle = moundGradient;
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.46, 40, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // ピッチャープレート
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w / 2 - 10, h * 0.455, 20, 3);

    // ホームベース（よりリアルに）
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.87);
    ctx.lineTo(w / 2 - 12, h * 0.90);
    ctx.lineTo(w / 2 - 12, h * 0.93);
    ctx.lineTo(w / 2 + 12, h * 0.93);
    ctx.lineTo(w / 2 + 12, h * 0.90);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // バッターボックス（両側）
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(w / 2 + 20, h * 0.84, 45, 70);
    ctx.strokeRect(w / 2 - 65, h * 0.84, 45, 70);

    // キャッチャーボックス
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeRect(w / 2 - 25, h * 0.94, 50, 30);
  }

  private drawLightTower(x: number, y: number): void {
    const ctx = this.ctx;
    const h = this.canvasHeight;

    // 照明塔の支柱
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x - 3, y, 6, h * 0.15);

    // 照明パネル
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x - 20, y - 5, 40, 12);

    // ライト（複数）
    const lightOn = Math.sin(this.frameCount * 0.02 + x) > -0.5;
    if (lightOn) {
      for (let i = 0; i < 5; i++) {
        const lx = x - 15 + i * 8;

        // ライトの光源
        ctx.fillStyle = '#ffffee';
        ctx.beginPath();
        ctx.arc(lx, y, 3, 0, Math.PI * 2);
        ctx.fill();

        // レンズフレア効果
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ffffaa';
        ctx.beginPath();
        ctx.arc(lx, y, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.1;
        ctx.beginPath();
        ctx.arc(lx, y, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // 光線（フィールドへ）
      ctx.globalAlpha = 0.03;
      ctx.fillStyle = '#ffffee';
      ctx.beginPath();
      ctx.moveTo(x - 20, y + 5);
      ctx.lineTo(x - 80, h * 0.6);
      ctx.lineTo(x + 80, h * 0.6);
      ctx.lineTo(x + 20, y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawScoreboard(x: number, y: number): void {
    const ctx = this.ctx;
    const w = 120;
    const h = 40;

    // スコアボードの枠
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);

    // 枠線
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);

    // LEDディスプレイ風の背景
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x - w / 2 + 5, y - h / 2 + 5, w - 10, h - 10);

    // スコア表示
    const fontSize = 14;
    ctx.font = `bold ${fontSize}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // BALL表示
    ctx.fillStyle = '#00ff00';
    ctx.fillText(`BALL: ${this.currentBall()}/${this.totalBalls}`, x - 30, y - 5);

    // SCORE表示
    ctx.fillStyle = '#ffcc00';
    ctx.fillText(`${this.score()}`, x + 35, y - 5);

    // 点滅効果
    if (this.frameCount % 60 < 30) {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(x + w / 2 - 12, y - h / 2 + 10, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFieldLighting(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    // フィールドへの照明効果（グラデーション）
    const lightGradient = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.5, w * 0.6);
    lightGradient.addColorStop(0, 'rgba(255,255,240,0.08)');
    lightGradient.addColorStop(0.5, 'rgba(255,255,220,0.03)');
    lightGradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lightGradient;
    ctx.fillRect(0, 0, w, h);
  }

  private drawPitcher(): void {
    const ctx = this.ctx;
    const x = this.canvasWidth / 2;
    const y = this.canvasHeight * 0.42;

    // 投球モーションのフェーズ
    const pitchProgress = Math.min(1, this.ballZ / 200);
    const windupAngle = Math.sin(this.frameCount * 0.15) * 0.1;

    ctx.save();
    ctx.translate(x, y);

    // 足（踏み出し）
    ctx.fillStyle = '#1a1a1a';
    const legKick = pitchProgress < 0.3 ? Math.sin(pitchProgress * Math.PI / 0.3) * 15 : 0;
    ctx.beginPath();
    ctx.ellipse(-8, 25 - legKick, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8, 25, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 体（ユニフォーム風）
    const bodyGradient = ctx.createLinearGradient(-15, -25, 15, 25);
    bodyGradient.addColorStop(0, '#1e3a5f');
    bodyGradient.addColorStop(0.5, '#2a4a7f');
    bodyGradient.addColorStop(1, '#1e3a5f');
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.ellipse(0, 0 + windupAngle * 10, 15, 25, windupAngle, 0, Math.PI * 2);
    ctx.fill();

    // 背番号
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('18', 0, 5);

    // 頭（キャップ付き）
    ctx.fillStyle = '#f5deb3';
    ctx.beginPath();
    ctx.arc(0, -30, 12, 0, Math.PI * 2);
    ctx.fill();

    // キャップ
    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath();
    ctx.ellipse(0, -38, 14, 8, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-14, -38, 28, 5);

    // キャップのつば
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(15, -35);
    ctx.lineTo(15, -32);
    ctx.lineTo(0, -35);
    ctx.closePath();
    ctx.fill();

    // 腕（投球モーション - よりダイナミックに）
    const armPhase = pitchProgress < 0.5 ? pitchProgress * 2 : 1;
    const armAngle = -Math.PI / 4 + armPhase * Math.PI * 0.8;
    const armLength = 25;

    ctx.strokeStyle = '#f5deb3';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    // 左腕（グラブ側）
    ctx.beginPath();
    ctx.moveTo(-12, -15);
    ctx.lineTo(-12 - Math.cos(armAngle - 0.5) * 20, -15 + Math.sin(armAngle - 0.5) * 15);
    ctx.stroke();

    // 右腕（投げる側 - メイン）
    ctx.beginPath();
    ctx.moveTo(12, -15);
    const elbowX = 12 + Math.cos(armAngle) * armLength * 0.6;
    const elbowY = -15 + Math.sin(armAngle) * armLength * 0.4;
    ctx.lineTo(elbowX, elbowY);
    ctx.stroke();

    // 前腕（リリースポイント）
    const forearmAngle = armAngle + Math.sin(pitchProgress * Math.PI) * 0.5;
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(elbowX + Math.cos(forearmAngle) * armLength * 0.5, elbowY + Math.sin(forearmAngle) * armLength * 0.3);
    ctx.stroke();

    ctx.restore();
  }

  private drawBatter(): void {
    const ctx = this.ctx;
    const x = this.canvasWidth / 2 + 50;
    const y = this.canvasHeight * 0.85;

    ctx.save();
    ctx.translate(x, y);

    // スイングによる体の回転
    const bodyRotation = this.isSwinging ? this.easeOutQuad(Math.min(1, (Date.now() - this.swingStartTime) / 150)) * 0.3 : 0;
    ctx.rotate(bodyRotation);

    // 足
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(-12, 30, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(12, 30, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // ユニフォーム（パンツ）
    const pantsGradient = ctx.createLinearGradient(-18, 0, 18, 35);
    pantsGradient.addColorStop(0, '#1e3a5f');
    pantsGradient.addColorStop(1, '#152a4f');
    ctx.fillStyle = pantsGradient;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(-15, 30);
    ctx.lineTo(15, 30);
    ctx.lineTo(18, 0);
    ctx.closePath();
    ctx.fill();

    // 体（ユニフォーム）
    const bodyGradient = ctx.createLinearGradient(-18, -35, 18, 0);
    bodyGradient.addColorStop(0, '#ffffff');
    bodyGradient.addColorStop(0.5, '#e8e8e8');
    bodyGradient.addColorStop(1, '#d0d0d0');
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.ellipse(0, -20, 18, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // 背番号
    ctx.fillStyle = '#1e3a5f';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('7', 0, -15);

    // 頭
    ctx.fillStyle = '#f5deb3';
    ctx.beginPath();
    ctx.arc(0, -55, 14, 0, Math.PI * 2);
    ctx.fill();

    // ヘルメット（よりリアルに）
    const helmetGradient = ctx.createRadialGradient(-5, -62, 0, 0, -55, 20);
    helmetGradient.addColorStop(0, '#3a5a8f');
    helmetGradient.addColorStop(0.5, '#1e3a5f');
    helmetGradient.addColorStop(1, '#0e2a4f');
    ctx.fillStyle = helmetGradient;
    ctx.beginPath();
    ctx.ellipse(0, -62, 16, 12, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // ヘルメットの耳当て
    ctx.beginPath();
    ctx.ellipse(-14, -52, 5, 10, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // フェイスガード
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -50);
    ctx.quadraticCurveTo(-5, -45, 8, -50);
    ctx.stroke();

    ctx.restore();

    // バット（体の回転とは別に描画）
    this.drawBat(x, y);
  }

  private drawBat(x: number, y: number): void {
    const ctx = this.ctx;
    const batBaseX = x - 15;
    const batBaseY = y - 45;
    const batLength = 75;

    ctx.save();
    ctx.translate(batBaseX, batBaseY);
    ctx.rotate(this.batAngle);

    // バットの影（よりリアルに）
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.moveTo(3, 6);
    ctx.lineTo(batLength + 3, -4);
    ctx.lineTo(batLength + 3, 6);
    ctx.lineTo(3, 14);
    ctx.closePath();
    ctx.fill();

    // バット本体（より詳細なグラデーション）
    const batGradient = ctx.createLinearGradient(0, -10, 0, 10);
    batGradient.addColorStop(0, '#F4A460');
    batGradient.addColorStop(0.2, '#DEB887');
    batGradient.addColorStop(0.5, '#F5DEB3');
    batGradient.addColorStop(0.8, '#DEB887');
    batGradient.addColorStop(1, '#8B4513');
    ctx.fillStyle = batGradient;

    // バットの形状（よりリアルに）
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.quadraticCurveTo(batLength * 0.3, -6, batLength * 0.6, -9);
    ctx.lineTo(batLength, -11);
    ctx.lineTo(batLength + 5, 0);
    ctx.lineTo(batLength, 11);
    ctx.lineTo(batLength * 0.6, 9);
    ctx.quadraticCurveTo(batLength * 0.3, 6, 0, 3);
    ctx.closePath();
    ctx.fill();

    // グリップ（左側）
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.moveTo(-5, -4);
    ctx.lineTo(15, -5);
    ctx.lineTo(15, 5);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fill();

    // グリップのテープライン
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 3, -4);
      ctx.lineTo(i * 3, 4);
      ctx.stroke();
    }

    // バットのハイライト
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, -4);
    ctx.quadraticCurveTo(batLength * 0.5, -7, batLength - 10, -8);
    ctx.stroke();

    ctx.restore();

    // スイングエフェクト（より派手に）
    if (this.isSwinging && this.batAngle > 0) {
      const swingAlpha = Math.min(0.6, (this.batAngle / Math.PI) * 0.8);

      // スイング軌跡（複数）
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(255,255,255,${swingAlpha * (1 - i * 0.3)})`;
        ctx.lineWidth = 4 - i;
        ctx.beginPath();
        ctx.arc(batBaseX, batBaseY, batLength - i * 5, this.batAngle - 0.4 - i * 0.1, this.batAngle);
        ctx.stroke();
      }

      // スイング風切り音エフェクト
      ctx.strokeStyle = `rgba(200,220,255,${swingAlpha * 0.5})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const angle = this.batAngle - 0.3 + i * 0.08;
        const len = batLength * (0.6 + i * 0.1);
        ctx.beginPath();
        ctx.moveTo(batBaseX + Math.cos(angle) * len, batBaseY + Math.sin(angle) * len);
        ctx.lineTo(batBaseX + Math.cos(angle) * (len + 15), batBaseY + Math.sin(angle) * (len + 15));
        ctx.stroke();
      }
    }
  }

  private drawBall3D(x: number, y: number, z: number): void {
    const ctx = this.ctx;

    // 遠近法でサイズ調整（z=0で小さく、z=1000で大きく）
    const perspective = 0.5 + (z / 1000) * 1.5;
    const size = 8 + perspective * 14;

    // 位置調整（遠近法）
    const perspectiveX = this.canvasWidth / 2 + (x - this.canvasWidth / 2) * perspective;
    const perspectiveY = this.canvasHeight * 0.45 + (y - this.canvasHeight * 0.35 + z * 0.35) * perspective;

    // 影（地面に落ちる影）
    const shadowY = perspectiveY + size + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(perspectiveX + 2, shadowY, size * 0.9, size * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // ボール本体（よりリアルなグラデーション）
    const ballGradient = ctx.createRadialGradient(
      perspectiveX - size * 0.35, perspectiveY - size * 0.35, 0,
      perspectiveX, perspectiveY, size
    );
    ballGradient.addColorStop(0, '#ffffff');
    ballGradient.addColorStop(0.3, '#f8f8f8');
    ballGradient.addColorStop(0.7, '#e8e8e8');
    ballGradient.addColorStop(1, '#cccccc');
    ctx.fillStyle = ballGradient;
    ctx.beginPath();
    ctx.arc(perspectiveX, perspectiveY, size, 0, Math.PI * 2);
    ctx.fill();

    // ボールの縁（立体感）
    ctx.strokeStyle = 'rgba(150,150,150,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(perspectiveX, perspectiveY, size, 0, Math.PI * 2);
    ctx.stroke();

    // 縫い目（よりリアルな回転）
    const rotation = this.frameCount * 0.25;
    const seamColor = '#C41E3A';
    ctx.strokeStyle = seamColor;
    ctx.lineWidth = Math.max(1.5, size * 0.12);
    ctx.lineCap = 'round';

    // 左側の縫い目
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = rotation + i * 0.4;
      const px = perspectiveX - size * 0.3 + Math.cos(angle) * size * 0.25;
      const py = perspectiveY + Math.sin(angle) * size * 0.4;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 右側の縫い目
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = rotation + Math.PI + i * 0.4;
      const px = perspectiveX + size * 0.3 + Math.cos(angle) * size * 0.25;
      const py = perspectiveY + Math.sin(angle) * size * 0.4;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // ハイライト（光の反射）
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(perspectiveX - size * 0.3, perspectiveY - size * 0.3, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFlyingBall(): void {
    const ctx = this.ctx;

    // 遠近法
    const perspective = Math.max(0.3, 1 - this.hitBallZ / 2500);
    const size = 20 * perspective;
    const x = this.hitBallX;
    const y = this.hitBallY;

    // 影（地面）
    const shadowY = this.canvasHeight * 0.85;
    const shadowSize = size * (1 + (shadowY - y) / 200);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x, shadowY, shadowSize, shadowSize * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // ボール
    if (size > 2) {
      const ballGradient = ctx.createRadialGradient(
        x - size * 0.3, y - size * 0.3, 0,
        x, y, size
      );
      ballGradient.addColorStop(0, '#ffffff');
      ballGradient.addColorStop(1, '#cccccc');
      ctx.fillStyle = ballGradient;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      // 縫い目
      if (size > 5) {
        ctx.strokeStyle = '#C41E3A';
        ctx.lineWidth = Math.max(1, size * 0.1);
        ctx.beginPath();
        ctx.arc(x - size * 0.2, y, size * 0.4, 0.5, 2.5);
        ctx.stroke();
      }
    }
  }

  private drawBallTrail(): void {
    const ctx = this.ctx;

    this.ballTrail.forEach((point, i) => {
      const alpha = point.alpha * 0.6;
      if (alpha < 0.05) return;

      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3 + i * 0.3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawTimingIndicator(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    // タイミングバー
    const barWidth = w * 0.65;
    const barHeight = 16;
    const barX = (w - barWidth) / 2;
    const barY = h - 35;

    // 外枠の影
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(barX - 8, barY - 8, barWidth + 16, barHeight + 16, 8);
    ctx.fill();

    // 外枠
    const frameGradient = ctx.createLinearGradient(barX, barY - 6, barX, barY + barHeight + 6);
    frameGradient.addColorStop(0, '#4a4a6a');
    frameGradient.addColorStop(0.5, '#3a3a5a');
    frameGradient.addColorStop(1, '#2a2a4a');
    ctx.fillStyle = frameGradient;
    ctx.beginPath();
    ctx.roundRect(barX - 6, barY - 6, barWidth + 12, barHeight + 12, 6);
    ctx.fill();

    // ゾーン定義（グラデーション付き）
    const zones = [
      { start: 0, end: 0.25, color1: '#cc3333', color2: '#aa2222', label: 'EARLY' },
      { start: 0.25, end: 0.42, color1: '#cc8833', color2: '#aa6622', label: '' },
      { start: 0.42, end: 0.5, color1: '#33cc55', color2: '#22aa44', label: 'GOOD' },
      { start: 0.5, end: 0.58, color1: '#00ffaa', color2: '#00dd88', label: 'PERFECT' },
      { start: 0.58, end: 0.75, color1: '#cc8833', color2: '#aa6622', label: '' },
      { start: 0.75, end: 1, color1: '#cc3333', color2: '#aa2222', label: 'LATE' },
    ];

    zones.forEach(zone => {
      const zoneGradient = ctx.createLinearGradient(0, barY, 0, barY + barHeight);
      zoneGradient.addColorStop(0, zone.color1);
      zoneGradient.addColorStop(1, zone.color2);
      ctx.fillStyle = zoneGradient;
      ctx.fillRect(
        barX + barWidth * zone.start,
        barY,
        barWidth * (zone.end - zone.start),
        barHeight
      );
    });

    // PERFECTゾーンのグロー
    const perfectStart = barX + barWidth * 0.5;
    const perfectWidth = barWidth * 0.08;
    const glowIntensity = 0.3 + Math.sin(this.frameCount * 0.15) * 0.15;

    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur = 15 + Math.sin(this.frameCount * 0.15) * 5;
    ctx.fillStyle = `rgba(0,255,170,${glowIntensity})`;
    ctx.fillRect(perfectStart, barY - 2, perfectWidth, barHeight + 4);
    ctx.shadowBlur = 0;

    // 現在位置マーカー
    const progress = Math.min(1, this.ballZ / 1000);
    const markerX = barX + barWidth * progress;

    // マーカーの脈動
    const pulse = 1 + Math.sin(this.frameCount * 0.3) * 0.1;

    // マーカーの影
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(markerX, barY - 12);
    ctx.lineTo(markerX - 8 * pulse, barY - 2);
    ctx.lineTo(markerX + 8 * pulse, barY - 2);
    ctx.closePath();
    ctx.fill();

    // マーカー本体
    const markerGradient = ctx.createLinearGradient(markerX - 8, 0, markerX + 8, 0);
    markerGradient.addColorStop(0, '#ffffff');
    markerGradient.addColorStop(0.5, '#ffffcc');
    markerGradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = markerGradient;
    ctx.beginPath();
    ctx.moveTo(markerX, barY - 14);
    ctx.lineTo(markerX - 7 * pulse, barY - 3);
    ctx.lineTo(markerX + 7 * pulse, barY - 3);
    ctx.closePath();
    ctx.fill();

    // マーカーライン
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(markerX - 2, barY, 4, barHeight);

    // 下マーカー
    ctx.beginPath();
    ctx.moveTo(markerX, barY + barHeight + 12);
    ctx.lineTo(markerX - 7 * pulse, barY + barHeight + 3);
    ctx.lineTo(markerX + 7 * pulse, barY + barHeight + 3);
    ctx.closePath();
    ctx.fill();

    // ラベル（アニメーション付き）
    const labelFontSize = Math.max(9, Math.min(w / 45, 12));
    ctx.font = `bold ${labelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // EARLY
    ctx.fillStyle = 'rgba(255,100,100,0.9)';
    ctx.fillText('EARLY', barX + barWidth * 0.125, barY - 16);

    // PERFECT（グロー付き）
    const perfectGlow = Math.sin(this.frameCount * 0.12) * 0.3 + 0.7;
    ctx.fillStyle = `rgba(0,255,170,${perfectGlow})`;
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur = 8;
    ctx.fillText('PERFECT', barX + barWidth * 0.54, barY - 16);
    ctx.shadowBlur = 0;

    // LATE
    ctx.fillStyle = 'rgba(255,100,100,0.9)';
    ctx.fillText('LATE', barX + barWidth * 0.875, barY - 16);
  }

  private drawParticles(): void {
    const ctx = this.ctx;

    this.particles.forEach(p => {
      const alpha = p.life / p.maxLife;
      ctx.fillStyle = p.color.replace('1)', `${alpha})`);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private addSwingParticles(): void {
    const x = this.canvasWidth / 2 + 30;
    const y = this.canvasHeight * 0.8;

    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: x + Math.random() * 40,
        y: y + Math.random() * 30 - 15,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: 20,
        maxLife: 20,
        color: 'rgba(255,255,255,1)',
        size: 3 + Math.random() * 3
      });
    }
  }

  private addHomerunParticles(): void {
    const x = this.canvasWidth / 2;
    const y = this.canvasHeight * 0.7;

    // メイン爆発パーティクル（増量＆強化）
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * 14;
      const colors = [
        'rgba(255,215,0,1)',   // ゴールド
        'rgba(255,100,0,1)',   // オレンジ
        'rgba(255,50,50,1)',   // レッド
        'rgba(255,255,255,1)', // ホワイト
        'rgba(255,150,0,1)',   // ダークオレンジ
        'rgba(255,255,100,1)'  // イエロー
      ];
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 8,
        life: 50 + Math.random() * 30,
        maxLife: 80,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 5 + Math.random() * 6
      });
    }

    // 星型の輝きパーティクル
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const speed = 8 + Math.random() * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: 'rgba(255,255,255,1)',
        size: 3 + Math.random() * 3
      });
    }

    // 虹色の放射パーティクル
    const rainbowColors = [
      'rgba(255,0,0,1)', 'rgba(255,127,0,1)', 'rgba(255,255,0,1)',
      'rgba(0,255,0,1)', 'rgba(0,0,255,1)', 'rgba(75,0,130,1)', 'rgba(148,0,211,1)'
    ];
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * 12,
        vy: Math.sin(angle) * 8 - 10,
        life: 40,
        maxLife: 40,
        color: rainbowColors[i % rainbowColors.length],
        size: 6
      });
    }
  }

  private addFireworkParticles(x: number, y: number): void {
    // より豪華な連続花火
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      const colors = [
        'rgba(255,215,0,1)',
        'rgba(255,100,0,1)',
        'rgba(255,255,255,1)',
        'rgba(255,50,150,1)',
        'rgba(50,200,255,1)'
      ];
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 25,
        maxLife: 25,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 3
      });
    }
  }

  private drawReadyScreen(): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    // 背景
    this.drawStadium();

    // オーバーレイ
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, w, h);

    // フォントサイズをcanvasサイズに応じて調整
    const baseFontSize = Math.min(w / 12, h / 8);
    const titleFontSize = Math.max(20, Math.min(baseFontSize * 1.2, 32));
    const subtitleFontSize = Math.max(12, Math.min(baseFontSize * 0.5, 16));
    const instructionFontSize = Math.max(10, Math.min(baseFontSize * 0.4, 14));

    // タイトル
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${titleFontSize}px "Oswald", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚾ HOMERUN CHALLENGE ⚾', w / 2, h / 2 - h * 0.15);

    ctx.fillStyle = '#ffffff';
    ctx.font = `${subtitleFontSize}px "Noto Sans JP", Arial`;
    ctx.fillText('タイミングよくスイングしてホームランを狙え！', w / 2, h / 2);
    ctx.font = `${instructionFontSize}px Arial`;
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('画面タップ or スペースキー でスイング', w / 2, h / 2 + h * 0.15);
  }

  private easeOutQuad(t: number): number {
    return t * (2 - t);
  }

  private endGame(): void {
    this.gameState.set('gameover');
    this.stopBgm();
  }

  saveScore(): void {
    const rawNickname = this.nickname ?? '';
    // 前後の空白をトリムし、制御文字を除去
    const trimmed = rawNickname.trim();
    const sanitized = trimmed.replace(/[\u0000-\u001F\u007F]/g, '');

    // バリデーション: 空/空白のみは禁止
    if (!sanitized) {
      this.nicknameError.set('ニックネームを入力してください。');
      return;
    }

    // バリデーション: 長さ 1〜20 文字
    if (sanitized.length < 1 || sanitized.length > 20) {
      this.nicknameError.set('ニックネームは1〜20文字で入力してください。');
      return;
    }

    // 成功時は、クリーンな値を状態に反映してエラーをクリア
    this.nickname = sanitized;
    this.nicknameError.set(null);

    const rank = this.gameScoreService.addScore('homerun', sanitized, this.score());
    this.savedRank.set(rank);
    this.highScore.set(this.gameScoreService.getHighScore('homerun'));
  }

  getResultMessage(type: string): string {
    switch (type) {
      case 'homerun': return '🎉 HOMERUN!!';
      case 'hit': return '👍 HIT!';
      case 'foul': return '⚠️ FOUL';
      case 'strike': return '❌ STRIKE';
      case 'miss': return '💨 SWING & MISS';
      default: return '';
    }
  }

  getResultColor(type: string): string {
    switch (type) {
      case 'homerun': return 'text-yellow-400';
      case 'hit': return 'text-green-400';
      case 'foul': return 'text-orange-400';
      case 'strike': return 'text-red-400';
      case 'miss': return 'text-gray-400';
      default: return '';
    }
  }

  getTimingMessage(): string {
    switch (this.swingTiming()) {
      case 'perfect': return 'PERFECT!';
      case 'good': return 'GOOD!';
      case 'early': return 'EARLY';
      case 'late': return 'LATE';
      default: return '';
    }
  }

  getTimingColor(): string {
    switch (this.swingTiming()) {
      case 'perfect': return 'text-green-400';
      case 'good': return 'text-blue-400';
      case 'early': return 'text-orange-400';
      case 'late': return 'text-orange-400';
      default: return '';
    }
  }

  getHomerunCount(): number {
    return this.results().filter(r => r.type === 'homerun').length;
  }

  getHitCount(): number {
    return this.results().filter(r => r.type === 'hit').length;
  }
}
