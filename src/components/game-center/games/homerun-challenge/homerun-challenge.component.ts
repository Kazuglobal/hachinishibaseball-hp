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
  // アニメーション用
  private frameCount = 0;
  private slowMotion = false;
  private slowMotionFactor = 1;
  private flyingTimeoutId: number | null = null;
  private resultTimeoutId: number | null = null;

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
    
    if (state === 'pitching' || state === 'swing') {
      this.updatePitching(deltaMultiplier);
    } else if (state === 'flying') {
      this.updateFlying(deltaMultiplier);
    }
    
    this.updateParticles(deltaMultiplier);
    this.drawGame();
    
    this.animationId = requestAnimationFrame(() => this.animateGame());
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
    
    // スコア計算 & サウンド
    if (type === 'homerun') {
      this.score.update(s => s + distance * 10);
      this.addHomerunParticles();
      this.playSound(this.homerunSound);
    } else if (type === 'hit') {
      this.score.update(s => s + distance * 5);
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
  }

  private drawStadium(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    
    // 空（グラデーション）
    const skyGradient = ctx.createLinearGradient(0, 0, 0, h * 0.4);
    skyGradient.addColorStop(0, '#1a1a2e');
    skyGradient.addColorStop(0.5, '#16213e');
    skyGradient.addColorStop(1, '#0f3460');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, w, h * 0.4);
    
    // 星
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 50; i++) {
      const x = (i * 137.5) % w;
      const y = (i * 89.3) % (h * 0.35);
      const size = 0.5 + Math.random() * 1.5;
      const twinkle = Math.sin(this.frameCount * 0.05 + i) * 0.3 + 0.7;
      ctx.globalAlpha = twinkle;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // 観客席（外野）
    const standGradient = ctx.createLinearGradient(0, h * 0.25, 0, h * 0.45);
    standGradient.addColorStop(0, '#2d2d2d');
    standGradient.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = standGradient;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.4);
    ctx.quadraticCurveTo(w / 2, h * 0.25, w, h * 0.4);
    ctx.lineTo(w, h * 0.5);
    ctx.quadraticCurveTo(w / 2, h * 0.35, 0, h * 0.5);
    ctx.closePath();
    ctx.fill();
    
    // 観客のライト（点滅）
    for (let i = 0; i < 80; i++) {
      const x = (w * 0.1) + (i % 20) * (w * 0.8 / 20);
      const row = Math.floor(i / 20);
      const y = h * 0.32 + row * 8 + Math.sin(x * 0.1) * 5;
      const flicker = Math.sin(this.frameCount * 0.1 + i * 0.5) > 0.3;
      
      if (flicker) {
        ctx.fillStyle = ['#ffcc00', '#ff6600', '#ffffff', '#00ff00'][i % 4];
        ctx.globalAlpha = 0.6 + Math.random() * 0.4;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    
    // フェンス
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.quadraticCurveTo(w / 2, h * 0.35, w, h * 0.5);
    ctx.stroke();
    
    // フィールド（芝生）
    const fieldGradient = ctx.createLinearGradient(0, h * 0.5, 0, h);
    fieldGradient.addColorStop(0, '#1a5c1a');
    fieldGradient.addColorStop(0.3, '#228B22');
    fieldGradient.addColorStop(1, '#1a6b1a');
    ctx.fillStyle = fieldGradient;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.quadraticCurveTo(w / 2, h * 0.35, w, h * 0.5);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    
    // 芝生のストライプ
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 12; i++) {
      if (i % 2 === 0) {
        const startY = h * 0.5 + i * 15;
        ctx.beginPath();
        ctx.moveTo(w * 0.2, startY);
        ctx.lineTo(w * 0.8, startY);
        ctx.lineTo(w * 0.9, startY + 30);
        ctx.lineTo(w * 0.1, startY + 30);
        ctx.closePath();
        ctx.fill();
      }
    }
    
    // 投手マウンド
    ctx.fillStyle = '#c4a484';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.45, 35, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // ホームベース
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.88);
    ctx.lineTo(w / 2 - 15, h * 0.92);
    ctx.lineTo(w / 2 - 15, h * 0.95);
    ctx.lineTo(w / 2 + 15, h * 0.95);
    ctx.lineTo(w / 2 + 15, h * 0.92);
    ctx.closePath();
    ctx.fill();
    
    // バッターボックス
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(w / 2 + 25, h * 0.82, 50, 80);
  }

  private drawPitcher(): void {
    const ctx = this.ctx;
    const x = this.canvasWidth / 2;
    const y = this.canvasHeight * 0.42;
    
    // 投手（シルエット）
    ctx.fillStyle = '#1a1a1a';
    
    // 体
    ctx.beginPath();
    ctx.ellipse(x, y, 15, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 頭
    ctx.beginPath();
    ctx.arc(x, y - 30, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // 腕（投球モーション）
    const armAngle = Math.sin(this.frameCount * 0.2) * 0.3;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 10, y - 15);
    ctx.lineTo(x + 25 + Math.cos(armAngle) * 10, y - 25 + Math.sin(armAngle) * 5);
    ctx.stroke();
  }

  private drawBatter(): void {
    const ctx = this.ctx;
    const x = this.canvasWidth / 2 + 50;
    const y = this.canvasHeight * 0.85;
    
    // バッター
    ctx.fillStyle = '#002D62';
    
    // 体
    ctx.beginPath();
    ctx.ellipse(x, y - 30, 18, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 頭
    ctx.beginPath();
    ctx.arc(x, y - 75, 15, 0, Math.PI * 2);
    ctx.fill();
    
    // ヘルメット
    ctx.fillStyle = '#002D62';
    ctx.beginPath();
    ctx.ellipse(x, y - 82, 17, 10, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    
    // バット
    const batBaseX = x - 15;
    const batBaseY = y - 45;
    const batLength = 70;
    
    ctx.save();
    ctx.translate(batBaseX, batBaseY);
    ctx.rotate(this.batAngle);
    
    // バットの影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(5, 5);
    ctx.lineTo(batLength + 5, -5);
    ctx.lineTo(batLength + 5, 5);
    ctx.lineTo(5, 12);
    ctx.closePath();
    ctx.fill();
    
    // バット本体
    const batGradient = ctx.createLinearGradient(0, 0, batLength, 0);
    batGradient.addColorStop(0, '#8B4513');
    batGradient.addColorStop(0.3, '#D2691E');
    batGradient.addColorStop(0.5, '#F4A460');
    batGradient.addColorStop(0.7, '#D2691E');
    batGradient.addColorStop(1, '#8B4513');
    ctx.fillStyle = batGradient;
    
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(batLength * 0.7, -8);
    ctx.lineTo(batLength, -10);
    ctx.lineTo(batLength, 10);
    ctx.lineTo(batLength * 0.7, 8);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fill();
    
    // バットのハイライト
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, -2);
    ctx.lineTo(batLength - 10, -6);
    ctx.stroke();
    
    ctx.restore();
    
    // スイングエフェクト
    if (this.isSwinging && this.batAngle > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(batBaseX, batBaseY, batLength, this.batAngle - 0.5, this.batAngle);
      ctx.stroke();
    }
  }

  private drawBall3D(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    
    // 遠近法でサイズ調整（z=0で小さく、z=1000で大きく）
    const perspective = 0.5 + (z / 1000) * 1.5;
    const size = 8 + perspective * 12;
    
    // 位置調整（遠近法）
    const perspectiveX = this.canvasWidth / 2 + (x - this.canvasWidth / 2) * perspective;
    const perspectiveY = this.canvasHeight * 0.45 + (y - this.canvasHeight * 0.35 + z * 0.35) * perspective;
    
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(perspectiveX + 3, perspectiveY + size + 5, size * 0.8, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // ボール本体
    const ballGradient = ctx.createRadialGradient(
      perspectiveX - size * 0.3, perspectiveY - size * 0.3, 0,
      perspectiveX, perspectiveY, size
    );
    ballGradient.addColorStop(0, '#ffffff');
    ballGradient.addColorStop(0.8, '#e0e0e0');
    ballGradient.addColorStop(1, '#cccccc');
    ctx.fillStyle = ballGradient;
    ctx.beginPath();
    ctx.arc(perspectiveX, perspectiveY, size, 0, Math.PI * 2);
    ctx.fill();
    
    // 縫い目
    ctx.strokeStyle = '#C41E3A';
    ctx.lineWidth = Math.max(1.5, size * 0.15);
    const rotation = this.frameCount * 0.3;
    
    ctx.beginPath();
    ctx.arc(perspectiveX - size * 0.25, perspectiveY, size * 0.5, rotation + 0.5, rotation + 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(perspectiveX + size * 0.25, perspectiveY, size * 0.5, rotation + 3.5, rotation + 5.5);
    ctx.stroke();
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
    const barWidth = w * 0.6;
    const barHeight = 12;
    const barX = (w - barWidth) / 2;
    const barY = h - 30;
    
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX - 5, barY - 5, barWidth + 10, barHeight + 10);
    
    // ゾーン表示
    const zones = [
      { start: 0, end: 0.25, color: '#ff4444' },      // 早すぎ
      { start: 0.25, end: 0.4, color: '#ffaa00' },    // やや早い
      { start: 0.4, end: 0.5, color: '#44ff44' },     // グッド
      { start: 0.5, end: 0.6, color: '#00ff88' },     // パーフェクト
      { start: 0.6, end: 0.75, color: '#ffaa00' },    // やや遅い
      { start: 0.75, end: 1, color: '#ff4444' },      // 遅すぎ
    ];
    
    zones.forEach(zone => {
      ctx.fillStyle = zone.color;
      ctx.fillRect(
        barX + barWidth * zone.start,
        barY,
        barWidth * (zone.end - zone.start),
        barHeight
      );
    });
    
    // 現在位置マーカー
    const progress = Math.min(1, this.ballZ / 1000);
    const markerX = barX + barWidth * progress;
    
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(markerX, barY - 8);
    ctx.lineTo(markerX - 6, barY - 2);
    ctx.lineTo(markerX + 6, barY - 2);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillRect(markerX - 2, barY, 4, barHeight);
    
    // ラベル（フォントサイズをcanvasサイズに応じて調整）
    const labelFontSize = Math.max(8, Math.min(w / 40, 10));
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${labelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const labelOffset = Math.max(8, Math.min(h / 20, 12));
    ctx.fillText('EARLY', barX + barWidth * 0.15, barY - labelOffset);
    ctx.fillText('PERFECT', barX + barWidth * 0.55, barY - labelOffset);
    ctx.fillText('LATE', barX + barWidth * 0.85, barY - labelOffset);
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
    
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 5 + Math.random() * 10;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 5,
        life: 40 + Math.random() * 20,
        maxLife: 60,
        color: ['rgba(255,215,0,1)', 'rgba(255,100,0,1)', 'rgba(255,50,50,1)'][Math.floor(Math.random() * 3)],
        size: 4 + Math.random() * 4
      });
    }
  }

  private addFireworkParticles(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20,
        maxLife: 20,
        color: ['rgba(255,215,0,1)', 'rgba(255,100,0,1)', 'rgba(255,255,255,1)'][Math.floor(Math.random() * 3)],
        size: 2 + Math.random() * 2
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
