import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, PLATFORM_ID, Inject, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GameScoreService } from '../../../../services/game-score.service';
import { SEOService } from '../../../../services/seo.service';
import {
  FIELD,
  PITCH_TYPES,
  PitchType,
  PitchTypeId,
  ZonePoint,
  breakOffsetAt,
  pitchFlightTime,
  rollPitchSpeed,
  isStrike,
  computeContact,
  resolveBattedBall,
  PlayResult,
  PlayOutcome,
  OUTCOME_LABEL,
  BATTED_BALL_LABEL,
  BattedBallTrajectory,
  fenceDistanceAt,
  clamp,
  SWING_WINDOW_MS,
  BAT_VERTICAL_WINDOW_CM,
  BAT_HORIZONTAL_WINDOW_CM,
} from '../../shared/baseball-physics';

type GameState = 'ready' | 'windup' | 'pitching' | 'flying' | 'result' | 'gameover';

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

interface TrailPoint { x: number; y: number; r: number; alpha: number; }

/** 1球ごとの記録（配球チャート用） */
interface PitchRecord {
  location: ZonePoint;
  pitch: PitchType;
  speedKmh: number;
  called: 'strike' | 'ball' | 'swing';
}

/** 打席結果の記録 */
interface AtBatRecord {
  outcome: PlayOutcome;
  distance: number;
  exitVelocityKmh: number;
  launchAngleDeg: number;
  barrel: boolean;
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
  private animationId = 0;
  private isBrowser: boolean;
  private resizeHandler?: () => void;
  private resizeObserver?: ResizeObserver;
  private pendingTimeouts: number[] = [];

  private seoService = inject(SEOService);
  private gameScoreService = inject(GameScoreService);

  // ====================================================================
  // ゲーム進行（実際の野球と同じ打席／カウント制）
  // ====================================================================
  gameState = signal<GameState>('ready');
  /** 何打席目か */
  atBat = signal(0);
  readonly totalAtBats = 5;
  balls = signal(0);
  strikes = signal(0);
  outs = signal(0);
  score = signal(0);
  atBatResults = signal<AtBatRecord[]>([]);
  pitchLog = signal<PitchRecord[]>([]);

  /** 打球データ（トラッキング表示用） */
  lastPlay = signal<PlayResult | null>(null);
  lastOutcomeLabel = signal('');
  /** 判定の補足（見逃し / 空振り など） */
  lastOutcomeSub = signal('');
  swingTiming = signal<'perfect' | 'good' | 'early' | 'late' | null>(null);
  showResultMessage = signal(false);

  /** 現在の投球情報 */
  currentPitchType = signal<PitchType | null>(null);
  currentPitchSpeed = signal(0);
  /** 投球後に球種を開示する（投球前は伏せる） */
  revealPitch = signal(false);

  // ゲームオーバー
  nickname = '';
  savedRank = signal(0);
  scoreSaved = signal(false);
  highScore = signal(0);
  nicknameError = signal<string | null>(null);

  // ====================================================================
  // 投球の状態
  // ====================================================================
  private pitch!: PitchType;
  private pitchSpeedKmh = 0;
  private pitchLocation: ZonePoint = { x: 0, y: 0 };
  private pitchStartMs = 0;
  private pitchFlightMs = 0;
  /** リリースまでの溜め（ワインドアップ） */
  private windupMs = 0;
  /** 投球の進行度 0〜1 */
  private pitchProgress = 0;
  /** 打者を通過してから判定するまでの猶予 */
  private passedPlate = false;
  /** この1球の判定が確定したか（確定後のスイング入力を無効にする） */
  private pitchDecided = false;

  // スイング
  /** バットが振り始めてからミートポイントに到達するまでの時間（実際の打者と同じ約130ms） */
  private readonly BAT_LAG_MS = 130;
  private swingStartMs = 0;
  private isSwinging = false;
  private swingResolved = false;

  /** ミートポイント（ストライクゾーン正規化座標） */
  meetX = signal(0);
  meetY = signal(0);

  // 打球
  private flightTraj: BattedBallTrajectory | null = null;
  private flightSpray = 0;
  private flightStartMs = 0;
  private flightDone = false;

  // 演出
  private particles: Particle[] = [];
  private ballTrail: TrailPoint[] = [];
  private frameCount = 0;
  private screenShakeX = 0;
  private screenShakeY = 0;
  private screenShakeIntensity = 0;
  private impactFlashAlpha = 0;
  private slowMotionFactor = 1;
  private batAngle = -Math.PI * 0.75;

  // サウンド
  private swingSound?: HTMLAudioElement;
  private homerunSound?: HTMLAudioElement;
  private hitSound?: HTMLAudioElement;
  private foulSound?: HTMLAudioElement;
  private missSound?: HTMLAudioElement;
  private bgm?: HTMLAudioElement;

  // ====================================================================
  // 画面・カメラ（捕手の後方から投手を見る実際の中継カメラ位置）
  // ====================================================================
  private canvasWidth = 0;
  private canvasHeight = 0;
  private isMobile = false;
  private readonly MOBILE_BREAKPOINT = 768;

  /**
   * カメラ設定。実際の中継の「バックネット裏・望遠レンズ」の画角を再現する。
   * 本塁の9m後方・高さ1.7mから望遠で見ることで、
   * 打者が画面を占有しすぎず、投手も十分な大きさで見える自然な構図になる。
   */
  private readonly CAM_BACK = 9.0;
  private readonly CAM_HEIGHT = 1.7;
  /** リリースポイント: 投手板の1.4m前、高さ1.85m、三塁側に0.35m（右投手） */
  private readonly RELEASE = { x: -0.35, y: 1.85, z: FIELD.MOUND_TO_PLATE - 1.4 };
  /** 打者の立ち位置（右打者は三塁側＝カメラから見て左） */
  private readonly BATTER_X = -0.85;

  private focal = 0;
  private horizonY = 0;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  // ====================================================================
  // ライフサイクル
  // ====================================================================
  ngOnInit(): void {
    this.seoService.updateSEO({
      title: 'ホームランチャレンジ | 八戸西高校 野球部OB会',
      description: '球種と コースを見極めてタイミングを合わせろ！打球初速・角度・飛距離を再現した本格バッティング。',
      keywords: '野球ゲーム,ホームラン,バッティング,ミニゲーム,打球初速,打球角度',
      url: 'https://hachinohenishibaseball.com/game/homerun'
    });
    this.highScore.set(this.gameScoreService.getHighScore('homerun'));
    if (this.isBrowser) this.initSounds();
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    this.ctx = canvas.getContext('2d')!;
    setTimeout(() => {
      this.resizeCanvas();
      this.drawReadyScreen();
    }, 0);

    this.resizeHandler = () => this.resizeCanvas();
    window.addEventListener('resize', this.resizeHandler);

    const container = canvas.parentElement;
    if (container && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
      this.resizeObserver.observe(container);
    }
  }

  ngOnDestroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.isBrowser && this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    this.resizeObserver?.disconnect();
    this.clearTimeouts();
    this.stopBgm();
  }

  private clearTimeouts(): void {
    this.pendingTimeouts.forEach(id => clearTimeout(id));
    this.pendingTimeouts = [];
  }

  private later(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      this.pendingTimeouts = this.pendingTimeouts.filter(t => t !== id);
      fn();
    }, ms);
    this.pendingTimeouts.push(id);
  }

  // ====================================================================
  // 入力
  // ====================================================================
  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const state = this.gameState();
    if (state !== 'pitching' && state !== 'windup') return;

    if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault();
      this.swing();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.meetY.update(v => clamp(v + 0.25, -1.6, 1.6));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.meetY.update(v => clamp(v - 0.25, -1.6, 1.6));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.meetX.update(v => clamp(v - 0.25, -1.6, 1.6));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.meetX.update(v => clamp(v + 0.25, -1.6, 1.6));
    }
  }

  /** キャンバス上のタップ位置でミートポイントを決めて同時にスイング */
  onCanvasPointer(event: MouseEvent | TouchEvent): void {
    const state = this.gameState();
    if ((state !== 'pitching' && state !== 'windup') || this.pitchDecided) return;

    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    let clientX: number, clientY: number;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      const t = event.touches[0] || event.changedTouches[0];
      if (!t) return;
      event.preventDefault();
      clientX = t.clientX;
      clientY = t.clientY;
    }

    const p = this.screenToZone(clientX - rect.left, clientY - rect.top);
    this.meetX.set(clamp(p.x, -1.6, 1.6));
    this.meetY.set(clamp(p.y, -1.6, 1.6));
    this.swing();
  }

  /** タップせずに見送る */
  takePitch(): void {
    // 見送りは何もしない（ボールが通過したときに自動判定される）
  }

  swing(): void {
    const state = this.gameState();
    if ((state !== 'pitching' && state !== 'windup') || this.isSwinging || this.pitchDecided) return;

    this.isSwinging = true;
    this.swingResolved = false;
    this.swingStartMs = performance.now();
    this.playSound(this.swingSound);
    this.addSwingParticles();
  }

  // ====================================================================
  // ゲーム進行
  // ====================================================================
  startGame(): void {
    if (this.gameState() !== 'ready' && this.gameState() !== 'gameover') return;

    this.clearTimeouts();
    this.atBat.set(0);
    this.score.set(0);
    this.outs.set(0);
    this.atBatResults.set([]);
    this.pitchLog.set([]);
    this.savedRank.set(0);
    this.scoreSaved.set(false);
    this.nicknameError.set(null);
    this.lastPlay.set(null);
    this.playBgm();
    this.nextAtBat();
  }

  private nextAtBat(): void {
    if (this.atBat() >= this.totalAtBats) {
      this.endGame();
      return;
    }
    this.atBat.update(v => v + 1);
    this.balls.set(0);
    this.strikes.set(0);
    this.meetX.set(0);
    this.meetY.set(0);
    this.nextPitch();
  }

  private nextPitch(): void {
    this.ensureCanvasSize();

    this.showResultMessage.set(false);
    this.lastPlay.set(null);
    this.swingTiming.set(null);
    this.revealPitch.set(false);
    this.isSwinging = false;
    this.swingResolved = false;
    this.passedPlate = false;
    this.pitchDecided = false;
    this.pitchProgress = 0;
    this.particles = [];
    this.ballTrail = [];
    this.batAngle = -Math.PI * 0.75;
    this.slowMotionFactor = 1;
    this.flightTraj = null;
    this.flightDone = false;

    const selected = this.selectPitch();
    this.pitch = selected.pitch;
    this.pitchLocation = selected.location;
    this.pitchSpeedKmh = rollPitchSpeed(this.pitch);
    this.pitchFlightMs = pitchFlightTime(this.pitchSpeedKmh) * 1000;

    this.currentPitchType.set(this.pitch);
    this.currentPitchSpeed.set(this.pitchSpeedKmh);

    // ワインドアップ（実際の投球動作と同じくリリースまで間がある）
    this.windupMs = 600 + Math.random() * 500;
    this.pitchStartMs = performance.now() + this.windupMs;

    this.gameState.set('windup');
    this.startLoop();
  }

  /**
   * 投手の配球AI。実際の投手と同じく、カウントによって
   * 「ストライクを取りにいく球」と「振らせにいくボール球」を投げ分ける。
   */
  private selectPitch(): { pitch: PitchType; location: ZonePoint } {
    const b = this.balls();
    const s = this.strikes();
    const difficulty = (this.atBat() - 1) / Math.max(1, this.totalAtBats - 1); // 0〜1

    // 追い込んだら変化球中心、ボール先行ならストレート中心
    const ahead = s >= 2 && b <= 1;
    const behind = b >= 2 && s <= 1;

    const pool: PitchTypeId[] = ahead
      ? ['slider', 'forkball', 'curve', 'changeup', 'slider', 'fastball']
      : behind
        ? ['fastball', 'fastball', 'shoot', 'slider']
        : ['fastball', 'fastball', 'slider', 'curve', 'changeup', 'forkball', 'shoot'];

    const pitch = PITCH_TYPES[pool[Math.floor(Math.random() * pool.length)]];

    // コース: 追い込んだらボール球で誘う、ボール先行なら甘めに
    let location: ZonePoint;
    if (ahead && Math.random() < 0.55) {
      // 誘い球（ゾーンのすぐ外）
      const edge = 1.05 + Math.random() * 0.45;
      location = Math.random() < 0.5
        ? { x: (Math.random() < 0.5 ? -1 : 1) * edge, y: (Math.random() - 0.5) * 1.6 }
        : { x: (Math.random() - 0.5) * 1.6, y: (Math.random() < 0.5 ? -1 : 1) * edge };
    } else if (behind) {
      // ストライクを取りにいく（甘め）
      location = { x: (Math.random() - 0.5) * 1.0, y: (Math.random() - 0.5) * 1.0 };
    } else {
      // 通常: 後半ほどコーナーを突く
      const spread = 0.6 + difficulty * 0.7;
      location = { x: (Math.random() - 0.5) * 2 * spread, y: (Math.random() - 0.5) * 2 * spread };
    }
    return { pitch, location };
  }

  private startLoop(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    const loop = () => {
      this.frameCount++;
      const state = this.gameState();
      if (state !== 'windup' && state !== 'pitching' && state !== 'flying') return;

      this.updateEffects();
      if (state === 'windup' || state === 'pitching') {
        this.updatePitch();
      } else if (state === 'flying') {
        this.updateFlight();
      }
      this.updateParticles();
      this.drawGame();
      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  }

  private updatePitch(): void {
    const now = performance.now();

    if (this.gameState() === 'windup') {
      if (now >= this.pitchStartMs) {
        this.gameState.set('pitching');
      } else {
        // ワインドアップ中でも早打ちできる（早すぎれば当然タイミングを外す）
        this.resolveSwingIfDue(now);
        return;
      }
    }

    this.pitchProgress = clamp((now - this.pitchStartMs) / this.pitchFlightMs, 0, 1.6);

    // 軌跡
    if (this.pitchProgress <= 1.05 && this.frameCount % 2 === 0) {
      const pos = this.ballScreenPos(this.pitchProgress);
      this.ballTrail.push({ x: pos.x, y: pos.y, r: pos.r, alpha: 1 });
      if (this.ballTrail.length > 18) this.ballTrail.shift();
    }
    this.ballTrail.forEach(t => (t.alpha *= 0.93));

    this.resolveSwingIfDue(now);

    // 本塁通過後の見送り判定
    if (!this.passedPlate && this.pitchProgress >= 1 && !this.isSwinging && !this.pitchDecided) {
      this.passedPlate = true;
      this.onTakenPitch();
    }
  }

  /** バットがミートポイントに到達したタイミングで当たり判定を行う */
  private resolveSwingIfDue(now: number): void {
    if (!this.isSwinging || this.swingResolved || this.pitchDecided) return;

    const elapsed = now - this.swingStartMs;
    // バットの振り抜きアニメーション
    this.batAngle = -Math.PI * 0.75 + Math.PI * 1.15 * this.easeOutQuad(clamp(elapsed / 180, 0, 1));

    if (elapsed < this.BAT_LAG_MS) return;

    this.swingResolved = true;
    this.pitchDecided = true;
    const contactTimeMs = this.swingStartMs + this.BAT_LAG_MS;
    const plateTimeMs = this.pitchStartMs + this.pitchFlightMs;
    // ＋が振り遅れ、－が早すぎ
    const timingErrorMs = contactTimeMs - plateTimeMs;

    // ミートポイントとボールのズレ（cm換算）
    const zoneHalfWidthCm = (FIELD.ZONE_WIDTH / 2) * 100;
    const zoneHalfHeightCm = ((FIELD.ZONE_TOP - FIELD.ZONE_BOTTOM) / 2) * 100;
    const horizontalMissCm = (this.meetX() - this.pitchLocation.x) * zoneHalfWidthCm;
    const verticalMissCm = (this.meetY() - this.pitchLocation.y) * zoneHalfHeightCm;

    // タッチ操作は指で狙う分だけ精度が落ちるため、モバイルは判定を少し甘くする
    const assist = this.isMobile ? 0.68 : 1;

    const contact = computeContact({
      timingErrorMs: timingErrorMs * assist,
      verticalMissCm: verticalMissCm * assist,
      horizontalMissCm: horizontalMissCm * assist,
      pitchSpeedKmh: this.pitchSpeedKmh,
      power: 1.0,
    });

    this.revealPitch.set(true);
    this.logPitch('swing');

    const absTiming = Math.abs(timingErrorMs);
    this.swingTiming.set(
      contact.whiff
        ? (timingErrorMs > 0 ? 'late' : 'early')
        : absTiming <= SWING_WINDOW_MS * 0.22 ? 'perfect'
          : absTiming <= SWING_WINDOW_MS * 0.5 ? 'good'
            : timingErrorMs > 0 ? 'late' : 'early'
    );

    if (contact.whiff) {
      this.playSound(this.missSound);
      this.screenShakeIntensity = 3;
      this.addStrike('空振り');
      return;
    }

    const play = resolveBattedBall(contact);
    this.lastPlay.set(play);
    this.impactFlash(play.outcome);
    this.addContactParticles(play.outcome);

    if (play.outcome === 'foul') {
      this.playSound(this.foulSound);
      this.onFoul(play);
      return;
    }

    // インプレー: 打球の飛翔を描画
    this.playSound(play.outcome === 'homerun' ? this.homerunSound : this.hitSound);
    this.startFlight(play);
  }

  private logPitch(called: 'strike' | 'ball' | 'swing'): void {
    this.pitchLog.update(log => [
      ...log,
      { location: { ...this.pitchLocation }, pitch: this.pitch, speedKmh: this.pitchSpeedKmh, called },
    ]);
  }

  /** 見送った場合の球審の判定 */
  private onTakenPitch(): void {
    this.pitchDecided = true;
    this.revealPitch.set(true);
    const strike = isStrike(this.pitchLocation);
    this.logPitch(strike ? 'strike' : 'ball');

    if (strike) {
      this.swingTiming.set(null);
      this.addStrike('見逃し');
    } else {
      this.balls.update(b => b + 1);
      if (this.balls() >= 4) {
        this.finishAtBat('walk', 'フォアボール', 120, '四球で出塁');
      } else {
        this.showCall('ボール', '');
        this.later(() => this.nextPitch(), 900);
      }
    }
  }

  private addStrike(label: string): void {
    this.strikes.update(s => s + 1);
    if (this.strikes() >= 3) {
      this.finishAtBat('strikeout', '三振', 0, label);
    } else {
      this.showCall('ストライク', label);
      this.later(() => this.nextPitch(), 900);
    }
  }

  private onFoul(play: PlayResult): void {
    // 実際のルール通り、2ストライクからのファウルはカウントしない
    if (this.strikes() < 2) this.strikes.update(s => s + 1);
    this.showCall('ファウル', this.strikes() >= 2 ? 'カウントは変わりません' : '');
    this.later(() => this.nextPitch(), 1100);
  }

  private startFlight(play: PlayResult): void {
    this.flightTraj = play.trajectory;
    this.flightSpray = play.sprayAngleDeg;
    this.flightStartMs = performance.now();
    this.flightDone = false;
    this.ballTrail = [];
    this.gameState.set('flying');
    // 会心の当たりはスローモーション演出
    this.slowMotionFactor = play.outcome === 'homerun' || play.barrel ? 0.45 : 1;
  }

  private updateFlight(): void {
    if (!this.flightTraj) { this.finishFlight(); return; }

    const elapsed = (performance.now() - this.flightStartMs) / 1000 * this.slowMotionFactor;
    // 打球が遠ざかるにつれてスローを解除
    if (this.slowMotionFactor < 1) this.slowMotionFactor = Math.min(1, this.slowMotionFactor + 0.006);

    if (elapsed >= this.flightTraj.hangTime) {
      this.finishFlight();
      return;
    }

    const pos = this.battedBallScreenPos(elapsed);
    if (pos && this.frameCount % 2 === 0) {
      this.ballTrail.push({ x: pos.x, y: pos.y, r: pos.r, alpha: 1 });
      if (this.ballTrail.length > 40) this.ballTrail.shift();
    }
    this.ballTrail.forEach(t => (t.alpha *= 0.97));

    const play = this.lastPlay();
    if (play?.outcome === 'homerun' && this.frameCount % 4 === 0 && pos) {
      this.addFireworkParticles(pos.x, pos.y);
    }
  }

  private finishFlight(): void {
    if (this.flightDone) return;
    this.flightDone = true;
    const play = this.lastPlay();
    if (!play) { this.nextAtBat(); return; }

    const points: Record<PlayOutcome, number> = {
      homerun: 1000 + Math.round(play.distance * 12),
      triple: 700,
      double: 500,
      single: 300,
      out: 20,
      foul: 0,
      strikeout: 0,
      walk: 120,
    };
    const bonus = play.barrel ? 300 : 0;
    const sub = play.battedType ? `${BATTED_BALL_LABEL[play.battedType]}・${play.hangTime}秒滞空` : '';
    this.finishAtBat(play.outcome, OUTCOME_LABEL[play.outcome], points[play.outcome] + bonus, sub);
  }

  private finishAtBat(outcome: PlayOutcome, label: string, points: number, sub = ''): void {
    const play = this.lastPlay();
    this.score.update(s => s + points);
    this.lastOutcomeLabel.set(label);
    this.lastOutcomeSub.set(sub);
    this.showResultMessage.set(true);

    this.atBatResults.update(r => [...r, {
      outcome,
      distance: play?.distance ?? 0,
      exitVelocityKmh: play?.exitVelocityKmh ?? 0,
      launchAngleDeg: play?.launchAngleDeg ?? 0,
      barrel: play?.barrel ?? false,
    }]);

    if (outcome === 'out' || outcome === 'strikeout') {
      this.outs.update(o => o + 1);
    }

    this.gameState.set('result');
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.drawGame();

    this.later(() => {
      this.showResultMessage.set(false);
      this.nextAtBat();
    }, outcome === 'homerun' ? 2600 : 1900);
  }

  private showCall(text: string, sub: string): void {
    this.lastOutcomeLabel.set(text);
    this.lastOutcomeSub.set(sub);
    this.showResultMessage.set(true);
    this.later(() => this.showResultMessage.set(false), 800);
  }

  private endGame(): void {
    this.gameState.set('gameover');
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.stopBgm();
  }

  saveScore(): void {
    if (this.scoreSaved()) return;

    const trimmed = (this.nickname ?? '').trim();
    // 制御文字を除去
    const sanitized = trimmed.replace(/[ -]/g, '');

    if (!sanitized) {
      this.nicknameError.set('ニックネームを入力してください。');
      return;
    }
    if (sanitized.length > 20) {
      this.nicknameError.set('ニックネームは1〜20文字で入力してください。');
      return;
    }

    this.nickname = sanitized;
    this.nicknameError.set(null);

    const rank = this.gameScoreService.addScore('homerun', sanitized, this.score());
    this.savedRank.set(rank);
    this.scoreSaved.set(true);
    this.highScore.set(this.gameScoreService.getHighScore('homerun'));
  }

  // ====================================================================
  // 3D投影（本塁後方のカメラ）
  // ====================================================================
  private setupCamera(): void {
    // ストライクゾーンが画面幅の11%（モバイルは14%）に写るように焦点距離を決める。
    // この比率が実際の中継映像の「打者の大きさ:ゾーンの大きさ」とほぼ一致する。
    this.focal = (this.canvasWidth * (this.isMobile ? 0.17 : 0.11)) * this.CAM_BACK / FIELD.ZONE_WIDTH;
    this.horizonY = this.canvasHeight * 0.30;
  }

  /** ワールド座標（x=左右, y=高さ, z=本塁からの距離）を画面座標へ */
  private project(x: number, y: number, z: number): { x: number; y: number; scale: number } {
    const depth = Math.max(0.35, z + this.CAM_BACK);
    const scale = this.focal / depth;
    return {
      x: this.canvasWidth / 2 + x * scale,
      y: this.horizonY - (y - this.CAM_HEIGHT) * scale,
      scale,
    };
  }

  /** ストライクゾーン正規化座標 → ワールド座標（本塁上） */
  private zoneToWorld(p: ZonePoint): { x: number; y: number } {
    return {
      x: p.x * (FIELD.ZONE_WIDTH / 2),
      y: (FIELD.ZONE_TOP + FIELD.ZONE_BOTTOM) / 2 + p.y * ((FIELD.ZONE_TOP - FIELD.ZONE_BOTTOM) / 2),
    };
  }

  /** 画面座標 → ストライクゾーン正規化座標（タップ位置の解釈） */
  private screenToZone(sx: number, sy: number): ZonePoint {
    const scale = this.focal / this.CAM_BACK;
    const worldX = (sx - this.canvasWidth / 2) / scale;
    const worldY = this.CAM_HEIGHT - (sy - this.horizonY) / scale;
    const midHeight = (FIELD.ZONE_TOP + FIELD.ZONE_BOTTOM) / 2;
    return {
      x: worldX / (FIELD.ZONE_WIDTH / 2),
      y: (worldY - midHeight) / ((FIELD.ZONE_TOP - FIELD.ZONE_BOTTOM) / 2),
    };
  }

  /** 投球の進行度から画面上のボール位置と半径を求める */
  private ballScreenPos(progress: number): { x: number; y: number; r: number; z: number } {
    const p = clamp(progress, 0, 1.4);
    const target = this.zoneToWorld(this.pitchLocation);
    const brk = breakOffsetAt(this.pitch, Math.min(1, p));

    // リリース点から本塁へ直線補間
    const z = this.RELEASE.z * (1 - p);
    const baseX = this.RELEASE.x + (target.x - this.RELEASE.x) * p;
    const baseY = this.RELEASE.y + (target.y - this.RELEASE.y) * p;

    // 重力による弧（始点と終点が決まった放物線は直線より上を通る）。
    // 到達時間0.44秒なら中間点で約24cm浮いて見える＝実際の「投球は落ちながら来る」見え方になる。
    const T = this.pitchFlightMs / 1000;
    const gravityArc = (9.81 / 2) * T * T * p * (1 - p);

    const proj = this.project(baseX + brk.x, baseY + brk.y + gravityArc, Math.max(-1.5, z));
    // ボール直径7.3cm
    const r = Math.max(2.2, (0.0366 * proj.scale));
    return { x: proj.x, y: proj.y, r, z };
  }

  /** 打球の経過秒数から画面位置を求める */
  private battedBallScreenPos(t: number): { x: number; y: number; r: number } | null {
    const traj = this.flightTraj;
    if (!traj) return null;
    const path = traj.path;
    let idx = path.findIndex(pt => pt.t >= t);
    if (idx < 0) idx = path.length - 1;
    const pt = path[idx];

    const rad = (this.flightSpray * Math.PI) / 180;
    const worldX = pt.d * Math.sin(rad);
    const worldZ = pt.d * Math.cos(rad);
    const proj = this.project(worldX, pt.h, worldZ);
    return { x: proj.x, y: proj.y, r: Math.max(1.5, 0.0366 * proj.scale) };
  }

  // ====================================================================
  // 描画
  // ====================================================================
  private drawGame(): void {
    if (!this.ctx || this.canvasWidth <= 0) return;
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(this.screenShakeX, this.screenShakeY);

    this.drawField();

    const state = this.gameState();

    if (state === 'windup' || state === 'pitching') {
      this.drawPitcher();
      this.drawStrikeZone();
      this.drawMeetCursor();
      this.drawBallTrail();
      this.drawPitchedBall();
      this.drawBatterForeground();
      this.drawPitchHud();
    } else if (state === 'flying') {
      this.drawFenceMarker();
      this.drawBallTrail();
      this.drawFlyingBall();
      this.drawBatterForeground();
      this.drawTrackingHud();
    } else {
      this.drawPitcher();
      this.drawStrikeZone();
      this.drawBatterForeground();
    }

    this.drawParticles();
    this.drawCountBoard();

    if (this.impactFlashAlpha > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.impactFlashAlpha})`;
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
    ctx.restore();
  }

  /** 球場（本塁後方からの視点） */
  private drawField(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    const horizon = this.horizonY;

    // 夜空
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#070712');
    sky.addColorStop(0.6, '#131331');
    sky.addColorStop(1, '#1b2a4a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 1);

    // 星
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137.5) % w;
      const y = (i * 71.3) % (horizon * 0.8);
      const twinkle = Math.sin(this.frameCount * 0.06 + i) * 0.4 + 0.6;
      ctx.globalAlpha = twinkle * 0.7;
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + (i % 3) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 照明塔
    this.drawLightTower(w * 0.1, horizon * 0.18);
    this.drawLightTower(w * 0.9, horizon * 0.18);

    // 外野スタンド
    const stand = ctx.createLinearGradient(0, horizon * 0.55, 0, horizon);
    stand.addColorStop(0, '#3a3a4c');
    stand.addColorStop(1, '#191926');
    ctx.fillStyle = stand;
    ctx.fillRect(0, horizon * 0.58, w, horizon * 0.42);

    // 観客のざわめき（光の点）
    for (let i = 0; i < 90; i++) {
      const col = i % 30;
      const row = Math.floor(i / 30);
      const x = (w / 30) * col + (row % 2) * (w / 60);
      const y = horizon * 0.63 + row * horizon * 0.11;
      const intensity = Math.sin(this.frameCount * 0.12 + i * 0.4);
      if (intensity > 0.3) {
        ctx.fillStyle = ['#ffcc00', '#ffffff', '#ff9944'][i % 3];
        ctx.globalAlpha = 0.25 + intensity * 0.3;
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // 外野フェンス（水平線のすぐ下）
    ctx.fillStyle = '#123a6b';
    ctx.fillRect(0, horizon - 6, w, 8);
    ctx.fillStyle = 'rgba(255,221,68,0.9)';
    ctx.fillRect(0, horizon - 7, w, 2);

    // 芝生（遠近感のあるグラデーション）
    const grass = ctx.createLinearGradient(0, horizon, 0, h);
    grass.addColorStop(0, '#17491d');
    grass.addColorStop(0.35, '#1f6b26');
    grass.addColorStop(1, '#2e9236');
    ctx.fillStyle = grass;
    ctx.fillRect(0, horizon, w, h - horizon);

    // 芝目のストライプ（奥ほど細くなる＝遠近感）
    for (let i = 0; i < 12; i++) {
      const t0 = i / 12, t1 = (i + 0.5) / 12;
      const y0 = horizon + (h - horizon) * Math.pow(t0, 1.9);
      const y1 = horizon + (h - horizon) * Math.pow(t1, 1.9);
      ctx.fillStyle = `rgba(255,255,255,${0.035})`;
      ctx.fillRect(0, y0, w, Math.max(1, y1 - y0));
    }

    // 内野の土（本塁周り）
    const dirt = this.project(0, 0, 5);
    const dirtNear = this.project(0, 0, 0);
    ctx.fillStyle = '#8a6a45';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, h);
    ctx.lineTo(w, dirtNear.y);
    ctx.quadraticCurveTo(w / 2, dirt.y, 0, dirtNear.y);
    ctx.closePath();
    ctx.fill();

    // 投手マウンド（直径5.49m・高さ25cm の実寸）
    const moundFront = this.project(0, 0, FIELD.MOUND_TO_PLATE - 2.74);
    const moundBack = this.project(0, 0, FIELD.MOUND_TO_PLATE + 2.74);
    const moundTop = this.project(0, 0.25, FIELD.MOUND_TO_PLATE);
    const moundScale = moundTop.scale;
    const rx = 2.74 * moundScale;
    const cy = (moundFront.y + moundBack.y) / 2;
    const ry = Math.max(3, (moundFront.y - moundBack.y) / 2);

    const moundGrad = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    moundGrad.addColorStop(0, '#7d5f3d');
    moundGrad.addColorStop(0.45, '#9c7a52');
    moundGrad.addColorStop(1, '#6d5234');
    ctx.fillStyle = moundGrad;
    ctx.beginPath();
    ctx.ellipse(moundTop.x, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // 芝との境目をぼかす
    ctx.strokeStyle = 'rgba(30,70,30,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 投手板（ピッチャープレート 61cm×15cm）
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(moundTop.x - 0.305 * moundScale, moundTop.y - 0.04 * moundScale, 0.61 * moundScale, Math.max(1.5, 0.08 * moundScale));

    // 本塁ベース
    const plate = this.project(0, 0, 0.4);
    const ps = plate.scale;
    ctx.fillStyle = '#f2f2f2';
    ctx.beginPath();
    ctx.moveTo(plate.x - 0.216 * ps, plate.y - 0.05 * ps);
    ctx.lineTo(plate.x + 0.216 * ps, plate.y - 0.05 * ps);
    ctx.lineTo(plate.x + 0.216 * ps, plate.y + 0.05 * ps);
    ctx.lineTo(plate.x, plate.y + 0.16 * ps);
    ctx.lineTo(plate.x - 0.216 * ps, plate.y + 0.05 * ps);
    ctx.closePath();
    ctx.fill();

    // 照明のフィールドへの反射
    const light = ctx.createRadialGradient(w / 2, horizon, 0, w / 2, horizon, w * 0.7);
    light.addColorStop(0, 'rgba(255,255,235,0.10)');
    light.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, w, h);
  }

  private drawLightTower(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#242430';
    ctx.fillRect(x - 2, y, 4, this.horizonY - y);
    ctx.fillStyle = '#33333f';
    ctx.fillRect(x - 16, y - 6, 32, 10);
    for (let i = 0; i < 4; i++) {
      const lx = x - 11 + i * 7.5;
      ctx.fillStyle = '#fffff0';
      ctx.beginPath();
      ctx.arc(lx, y - 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(lx, y - 1, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** 投手（ワインドアップからリリースまでのモーション） */
  private drawPitcher(): void {
    const ctx = this.ctx;
    // 投手は投手板（マウンドの頂上）に立つ
    const mound = this.project(0, 0.25, FIELD.MOUND_TO_PLATE);
    const s = mound.scale;
    const x = mound.x;
    const groundY = mound.y;

    const now = performance.now();
    // -1〜0 がワインドアップ、0〜1 がリリース後
    const phase = this.gameState() === 'windup'
      ? -clamp((this.pitchStartMs - now) / this.windupMs, 0, 1)
      : clamp(this.pitchProgress, 0, 1);

    // 身長1.8m
    const bodyH = 1.8 * s;
    const lean = phase < 0 ? Math.sin((1 + phase) * Math.PI * 0.5) * 0.12 : 0.22;

    ctx.save();
    ctx.translate(x, groundY);
    ctx.rotate(-lean * 0.3);

    // 脚（軸足と踏み出し足）
    const legLift = phase < -0.35 ? Math.sin((phase + 1) * Math.PI) * 0.5 : 0;
    const stride = phase >= 0 ? 0.55 : 0.18 + Math.max(0, 1 + phase) * 0.2;
    ctx.strokeStyle = '#e8e8ec';
    ctx.lineWidth = Math.max(3, 0.17 * s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0.05 * s, 0);
    ctx.lineTo(0.02 * s, -bodyH * 0.48);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-stride * s, -legLift * bodyH * 0.35);
    ctx.lineTo(-0.05 * s, -bodyH * 0.48);
    ctx.stroke();

    // 胴体（ユニフォーム）
    const body = ctx.createLinearGradient(-0.3 * s, -bodyH, 0.3 * s, -bodyH * 0.4);
    body.addColorStop(0, '#f2f2f5');
    body.addColorStop(1, '#c3c8d2');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, -bodyH * 0.66, 0.3 * s, 0.26 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // 背番号
    ctx.fillStyle = '#1e3a5f';
    ctx.font = `bold ${Math.max(6, 0.2 * s)}px Oswald, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('18', 0, -bodyH * 0.66);
    ctx.textBaseline = 'alphabetic';

    // 投球腕（ワインドアップ → リリース）
    const armAngle = phase < 0
      ? -Math.PI * 0.95 + (1 + phase) * Math.PI * 0.5
      : -Math.PI * 0.45 + Math.min(1, phase * 3) * Math.PI * 0.7;
    ctx.strokeStyle = '#f1d7b5';
    ctx.lineWidth = Math.max(2, 0.13 * s);
    ctx.beginPath();
    ctx.moveTo(0.14 * s, -bodyH * 0.82);
    ctx.lineTo(0.14 * s + Math.cos(armAngle) * 0.62 * s, -bodyH * 0.82 + Math.sin(armAngle) * 0.62 * s);
    ctx.stroke();
    // グラブ側の腕
    ctx.beginPath();
    ctx.moveTo(-0.14 * s, -bodyH * 0.82);
    ctx.lineTo(-0.48 * s, -bodyH * (phase < 0 ? 0.78 : 0.55));
    ctx.stroke();
    // グラブ
    ctx.fillStyle = '#5a3a1c';
    ctx.beginPath();
    ctx.arc(-0.52 * s, -bodyH * (phase < 0 ? 0.78 : 0.55), 0.13 * s, 0, Math.PI * 2);
    ctx.fill();

    // 頭・帽子
    ctx.fillStyle = '#f1d7b5';
    ctx.beginPath();
    ctx.arc(0, -bodyH * 0.99, 0.155 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath();
    ctx.ellipse(0, -bodyH * 1.03, 0.175 * s, 0.11 * s, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-0.175 * s, -bodyH * 1.03, 0.35 * s, Math.max(1, 0.05 * s));
    ctx.restore();
  }

  /** ストライクゾーン（本塁上の枠） */
  private drawStrikeZone(): void {
    const ctx = this.ctx;
    const tl = this.project(-FIELD.ZONE_WIDTH / 2, FIELD.ZONE_TOP, 0);
    const br = this.project(FIELD.ZONE_WIDTH / 2, FIELD.ZONE_BOTTOM, 0);
    const x = tl.x, y = tl.y, w = br.x - tl.x, h = br.y - tl.y;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // 3×3の分割線
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (w / 3) * i, y);
      ctx.lineTo(x + (w / 3) * i, y + h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + (h / 3) * i);
      ctx.lineTo(x + w, y + (h / 3) * i);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** ミートポイントのカーソル（バットの芯が通る位置） */
  private drawMeetCursor(): void {
    const ctx = this.ctx;
    const world = this.zoneToWorld({ x: this.meetX(), y: this.meetY() });
    const p = this.project(world.x, world.y, 0);
    // バットの有効範囲を楕円で可視化（内外22cm × 上下9cm）
    const scale = p.scale;
    const rx = (BAT_HORIZONTAL_WINDOW_CM / 100) * scale;
    const ry = (BAT_VERTICAL_WINDOW_CM / 100) * scale;

    ctx.save();
    const pulse = 0.55 + Math.sin(this.frameCount * 0.12) * 0.15;
    ctx.strokeStyle = `rgba(255,215,0,${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = `rgba(255,215,0,${pulse * 0.25})`;
    ctx.fill();

    // 中心の十字
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y);
    ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x, p.y + 7);
    ctx.stroke();
    ctx.restore();
  }

  private drawPitchedBall(): void {
    if (this.gameState() === 'windup') return;
    const p = this.pitchProgress;
    if (p > 1.25) return;

    const ctx = this.ctx;
    const pos = this.ballScreenPos(p);

    // 縫い目つきのボール
    const grad = ctx.createRadialGradient(pos.x - pos.r * 0.3, pos.y - pos.r * 0.3, pos.r * 0.1, pos.x, pos.y, pos.r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.75, '#f0f0e8');
    grad.addColorStop(1, '#c9c9bd');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pos.r, 0, Math.PI * 2);
    ctx.fill();

    if (pos.r > 5) {
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = Math.max(1, pos.r * 0.12);
      const spin = this.frameCount * 0.35;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pos.r * 0.72, spin, spin + Math.PI * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pos.r * 0.72, spin + Math.PI, spin + Math.PI * 1.7);
      ctx.stroke();
    }

    // 遠くにある間はグロー（実際の中継でもボールは光って見える）
    if (pos.r < 7) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#ffffcc';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pos.r + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawFlyingBall(): void {
    const traj = this.flightTraj;
    if (!traj) return;
    const ctx = this.ctx;
    const elapsed = (performance.now() - this.flightStartMs) / 1000 * this.slowMotionFactor;
    const pos = this.battedBallScreenPos(elapsed);
    if (!pos) return;

    // 地面に落ちる影（奥行きの手がかり）
    const idx = Math.min(traj.path.length - 1, Math.max(0, traj.path.findIndex(pt => pt.t >= elapsed)));
    const pt = traj.path[idx < 0 ? traj.path.length - 1 : idx];
    const rad = (this.flightSpray * Math.PI) / 180;
    const shadow = this.project(pt.d * Math.sin(rad), 0, pt.d * Math.cos(rad));
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, Math.max(1.5, 0.0366 * shadow.scale * 1.6), Math.max(0.8, 0.0366 * shadow.scale * 0.6), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pos.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pos.r + 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** 打球が向かう方向のフェンス位置を表示（本塁打かどうかが見て分かる） */
  private drawFenceMarker(): void {
    const ctx = this.ctx;
    const rad = (this.flightSpray * Math.PI) / 180;
    const fence = fenceDistanceAt(this.flightSpray);
    const base = this.project(fence * Math.sin(rad), 0, fence * Math.cos(rad));
    const top = this.project(fence * Math.sin(rad), FIELD.FENCE_HEIGHT, fence * Math.cos(rad));

    ctx.save();
    ctx.strokeStyle = 'rgba(255,215,0,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(base.x - 40, base.y);
    ctx.lineTo(base.x + 40, base.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,215,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(base.x - 40, top.y, 80, base.y - top.y);

    ctx.fillStyle = 'rgba(255,215,0,0.95)';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`フェンス ${Math.round(fence)}m`, base.x, top.y - 6);
    ctx.restore();
  }

  /** 手前に見える打者（バックネット裏カメラの構図では画面左に大きく写る） */
  private drawBatterForeground(): void {
    const ctx = this.ctx;
    // 右打者は本塁の三塁側（カメラから見て左）
    const stand = this.project(this.BATTER_X, 0, 0);
    const s = stand.scale;

    ctx.save();

    const swingT = this.isSwinging ? clamp((performance.now() - this.swingStartMs) / 200, 0, 1) : 0;
    ctx.translate(stand.x, stand.y);
    ctx.rotate(this.easeOutQuad(swingT) * 0.06);

    const bodyH = 1.75 * s;

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.4 * s, 0.1 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // 脚（ユニフォームのパンツ）
    ctx.strokeStyle = '#e6e6ea';
    ctx.lineWidth = Math.max(3, 0.15 * s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.22 * s, -0.02 * s); ctx.lineTo(-0.1 * s, -bodyH * 0.45);
    ctx.moveTo(0.24 * s, -0.02 * s); ctx.lineTo(0.09 * s, -bodyH * 0.45);
    ctx.stroke();
    // ストッキング
    ctx.strokeStyle = '#16304f';
    ctx.lineWidth = Math.max(2, 0.12 * s);
    ctx.beginPath();
    ctx.moveTo(-0.22 * s, -0.02 * s); ctx.lineTo(-0.18 * s, -bodyH * 0.16);
    ctx.moveTo(0.24 * s, -0.02 * s); ctx.lineTo(0.2 * s, -bodyH * 0.16);
    ctx.stroke();

    // 胴体（ユニフォーム）
    const body = ctx.createLinearGradient(-0.26 * s, -bodyH, 0.26 * s, -bodyH * 0.4);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(1, '#bfc4cc');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, -bodyH * 0.63, 0.24 * s, 0.3 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // 背番号
    ctx.fillStyle = '#1e3a5f';
    ctx.font = `bold ${Math.max(7, 0.17 * s)}px Oswald, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('7', 0, -bodyH * 0.62);
    ctx.textBaseline = 'alphabetic';

    // 腕（構え〜スイング）
    const batPivotX = 0.1 * s;
    const batPivotY = -bodyH * 0.8;
    ctx.strokeStyle = '#f1d7b5';
    ctx.lineWidth = Math.max(2, 0.08 * s);
    ctx.beginPath();
    ctx.moveTo(-0.12 * s, -bodyH * 0.78);
    ctx.lineTo(batPivotX, batPivotY);
    ctx.stroke();

    // 頭・ヘルメット
    ctx.fillStyle = '#f1d7b5';
    ctx.beginPath();
    ctx.arc(0, -bodyH * 0.95, 0.125 * s, 0, Math.PI * 2);
    ctx.fill();
    const helmet = ctx.createRadialGradient(-0.04 * s, -bodyH * 1.0, 0, 0, -bodyH * 0.96, 0.16 * s);
    helmet.addColorStop(0, '#32557f');
    helmet.addColorStop(1, '#12283f');
    ctx.fillStyle = helmet;
    ctx.beginPath();
    ctx.arc(0, -bodyH * 0.965, 0.145 * s, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    // 耳当て
    ctx.beginPath();
    ctx.ellipse(-0.13 * s, -bodyH * 0.93, 0.05 * s, 0.07 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // バット（構えは肩に担ぐ、スイングで振り抜く）
    const batAngle = this.isSwinging ? this.batAngle : -Math.PI * 0.62;
    ctx.save();
    ctx.translate(batPivotX, batPivotY);
    ctx.rotate(batAngle);
    const batLen = 0.84 * s; // 実際のバット長 約84cm
    const batGrad = ctx.createLinearGradient(0, 0, batLen, 0);
    batGrad.addColorStop(0, '#3a2410');
    batGrad.addColorStop(0.2, '#c99a5b');
    batGrad.addColorStop(1, '#efd0a0');
    ctx.fillStyle = batGrad;
    ctx.beginPath();
    ctx.moveTo(0, -0.018 * s);
    ctx.lineTo(batLen * 0.55, -0.03 * s);
    ctx.lineTo(batLen, -0.035 * s);
    ctx.lineTo(batLen, 0.035 * s);
    ctx.lineTo(batLen * 0.55, 0.03 * s);
    ctx.lineTo(0, 0.018 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // スイング軌跡
    if (this.isSwinging && swingT > 0.05 && swingT < 1) {
      ctx.strokeStyle = `rgba(255,255,255,${0.45 * (1 - swingT)})`;
      ctx.lineWidth = Math.max(2, 0.05 * s);
      ctx.beginPath();
      ctx.arc(batPivotX, batPivotY, batLen * 0.9, batAngle - 0.9, batAngle);
      ctx.stroke();
    }

    ctx.restore();
  }

  /** 投球中の情報（球種は投げ終わるまで伏せる） */
  private drawPitchHud(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    if (!this.revealPitch()) return;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.roundRect(w - 138, 12, 126, 46, 8);
    ctx.fill();
    ctx.fillStyle = this.pitch.color;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.pitch.name, w - 75, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Oswald, Arial';
    ctx.fillText(`${this.pitchSpeedKmh} km/h`, w - 75, 51);
    ctx.restore();
  }

  /** 打球のトラッキングデータ（実際の中継のような表示） */
  private drawTrackingHud(): void {
    const play = this.lastPlay();
    if (!play) return;
    const ctx = this.ctx;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.roundRect(12, 12, 152, 74, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,0,0.4)';
    ctx.lineWidth = 1;
    ctx.roundRect(12, 12, 152, 74, 8);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '10px Arial';
    ctx.fillText('打球初速', 22, 30);
    ctx.fillText('打球角度', 22, 50);
    ctx.fillText('推定飛距離', 22, 70);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Oswald, Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`${play.exitVelocityKmh} km/h`, 156, 30);
    ctx.fillText(`${play.launchAngleDeg}°`, 156, 50);
    ctx.fillText(`${play.distance} m`, 156, 70);

    if (play.barrel) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('★ BARREL', 22, 86);
    }
    ctx.restore();
  }

  /** ボールカウントボード（B-S-O） */
  private drawCountBoard(): void {
    const ctx = this.ctx;
    const h = this.canvasHeight;
    const x = 14;
    const y = h - 58;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.roundRect(x, y, 106, 46, 8);
    ctx.fill();

    const labels: [string, number, number, string][] = [
      ['B', this.balls(), 3, '#4ade80'],
      ['S', this.strikes(), 2, '#facc15'],
      ['O', this.outs(), 2, '#ef4444'],
    ];
    ctx.font = 'bold 11px Arial';
    labels.forEach(([label, value, max, color], row) => {
      const ly = y + 13 + row * 13;
      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 9, ly + 3);
      for (let i = 0; i < max; i++) {
        ctx.beginPath();
        ctx.arc(x + 28 + i * 15, ly, 4.6, 0, Math.PI * 2);
        ctx.fillStyle = i < value ? color : 'rgba(255,255,255,0.15)';
        ctx.fill();
      }
    });
    ctx.restore();
  }

  private drawBallTrail(): void {
    const ctx = this.ctx;
    this.ballTrail.forEach(t => {
      ctx.globalAlpha = t.alpha * 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(t.x, t.y, Math.max(0.8, t.r * 0.7), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    this.particles.forEach(p => {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  private drawReadyScreen(): void {
    if (!this.ctx || this.canvasWidth <= 0) return;
    this.setupCamera();
    this.drawField();
    this.drawPitcher();
    this.drawStrikeZone();
    this.drawBatterForeground();

    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${Math.max(20, this.canvasWidth * 0.045)}px Oswald, Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('HOMERUN CHALLENGE', this.canvasWidth / 2, this.canvasHeight * 0.42);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(11, this.canvasWidth * 0.021)}px Arial`;
    ctx.fillText('打ちたい高さをタップ＝その位置でスイング', this.canvasWidth / 2, this.canvasHeight * 0.55);
    ctx.fillText('ボール球は見送ればフォアボール', this.canvasWidth / 2, this.canvasHeight * 0.62);
    ctx.restore();
  }

  // ====================================================================
  // 演出
  // ====================================================================
  private updateEffects(): void {
    if (this.screenShakeIntensity > 0.1) {
      this.screenShakeX = (Math.random() - 0.5) * this.screenShakeIntensity;
      this.screenShakeY = (Math.random() - 0.5) * this.screenShakeIntensity;
      this.screenShakeIntensity *= 0.88;
    } else {
      this.screenShakeX = this.screenShakeY = this.screenShakeIntensity = 0;
    }
    if (this.impactFlashAlpha > 0) {
      this.impactFlashAlpha *= 0.85;
      if (this.impactFlashAlpha < 0.01) this.impactFlashAlpha = 0;
    }
  }

  private impactFlash(outcome: PlayOutcome): void {
    if (outcome === 'homerun') {
      this.screenShakeIntensity = 22;
      this.impactFlashAlpha = 0.7;
    } else if (outcome === 'foul') {
      this.screenShakeIntensity = 6;
      this.impactFlashAlpha = 0.2;
    } else {
      this.screenShakeIntensity = 12;
      this.impactFlashAlpha = 0.35;
    }
  }

  private updateParticles(): void {
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.22;
      p.life -= 1;
      return p.life > 0;
    });
  }

  private addSwingParticles(): void {
    const p = this.project(-0.4, 1.0, 0.2);
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: p.x, y: p.y,
        vx: (Math.random() - 0.2) * 6,
        vy: (Math.random() - 0.5) * 4,
        life: 14, maxLife: 14,
        color: 'rgba(255,255,255,0.55)',
        size: 1.5 + Math.random() * 2,
      });
    }
  }

  private addContactParticles(outcome: PlayOutcome): void {
    const world = this.zoneToWorld({ x: this.meetX(), y: this.meetY() });
    const p = this.project(world.x, world.y, 0);
    const count = outcome === 'homerun' ? 34 : 16;
    const colors = outcome === 'homerun'
      ? ['#ffd700', '#ff8c00', '#ffffff']
      : ['#ffffff', '#d9e6ff'];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 2 + Math.random() * 6;
      this.particles.push({
        x: p.x, y: p.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 22 + Math.random() * 14, maxLife: 36,
        color: colors[i % colors.length],
        size: 1.5 + Math.random() * 3,
      });
    }
  }

  private addFireworkParticles(x: number, y: number): void {
    const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#ffffff'];
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20, maxLife: 20,
        color: colors[i % colors.length],
        size: 1.5 + Math.random() * 2,
      });
    }
  }

  // ====================================================================
  // キャンバス
  // ====================================================================
  private ensureCanvasSize(): void {
    if (this.canvasWidth > 0 && this.canvasHeight > 0) return;
    if (this.isBrowser && this.canvasRef?.nativeElement) this.resizeCanvas();
    if (this.canvasWidth <= 0) this.canvasWidth = 800;
    if (this.canvasHeight <= 0) this.canvasHeight = 500;
    this.setupCamera();
  }

  private resizeCanvas(): void {
    if (!this.isBrowser) return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;

    this.isMobile = window.innerWidth < this.MOBILE_BREAKPOINT;

    const containerWidth = container.clientWidth || container.offsetWidth;
    const containerHeight = container.clientHeight || container.offsetHeight;
    // モバイルは縦を厚くしてストライクゾーンを大きく表示する
    const aspectRatio = this.isMobile ? 4 / 3 : 16 / 10;
    let width = containerWidth;
    let height = width / aspectRatio;
    if (containerHeight > 0 && height > containerHeight) {
      height = containerHeight;
      width = height * aspectRatio;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    this.canvasWidth = width;
    this.canvasHeight = height;
    this.setupCamera();

    const state = this.gameState();
    if (state === 'ready') this.drawReadyScreen();
    else if (state === 'result' || state === 'gameover') this.drawGame();
  }

  // ====================================================================
  // サウンド
  // ====================================================================
  private initSounds(): void {
    const make = (src: string, volume: number) => {
      try {
        const a = new Audio(src);
        a.volume = volume;
        a.addEventListener('error', () => { /* ファイルが無い場合は無音 */ });
        return a;
      } catch { return undefined; }
    };
    this.swingSound = make('assets/sounds/bat-swing.mp3', 0.6);
    this.homerunSound = make('assets/sounds/homerun.mp3', 0.8);
    this.hitSound = make('assets/sounds/hit.mp3', 0.7);
    this.foulSound = make('assets/sounds/foul.mp3', 0.6);
    this.missSound = make('assets/sounds/miss.mp3', 0.6);
    try {
      this.bgm = new Audio('assets/sounds/background-music.mp3');
      this.bgm.loop = true;
      this.bgm.volume = 0.35;
      this.bgm.addEventListener('error', () => { this.bgm = undefined; });
    } catch { this.bgm = undefined; }
  }

  private playSound(sound?: HTMLAudioElement): void {
    if (!this.isBrowser || !sound) return;
    try {
      sound.currentTime = 0;
      // 音源が無い / 自動再生がブロックされた場合の Promise 拒否を握り潰す
      sound.play()?.catch(() => { /* noop */ });
    } catch { /* noop */ }
  }

  private playBgm(): void {
    if (!this.isBrowser || !this.bgm) return;
    try { this.bgm.play()?.catch(() => { /* noop */ }); } catch { /* noop */ }
  }

  private stopBgm(): void {
    if (!this.bgm) return;
    this.bgm.pause();
    this.bgm.currentTime = 0;
  }

  private easeOutQuad(t: number): number {
    return t * (2 - t);
  }

  // ====================================================================
  // テンプレート用ヘルパー
  // ====================================================================
  homerunCount = computed(() => this.atBatResults().filter(r => r.outcome === 'homerun').length);
  hitCount = computed(() => this.atBatResults().filter(r => ['single', 'double', 'triple', 'homerun'].includes(r.outcome)).length);
  /** 打率（打数 = 打席数 − 四球） */
  battingAverage = computed(() => {
    const results = this.atBatResults();
    const atBats = results.filter(r => r.outcome !== 'walk').length;
    if (atBats === 0) return '.000';
    const avg = this.hitCount() / atBats;
    return avg.toFixed(3).replace(/^0/, '');
  });
  maxDistance = computed(() => Math.max(0, ...this.atBatResults().map(r => r.distance)));
  maxExitVelocity = computed(() => Math.max(0, ...this.atBatResults().map(r => r.exitVelocityKmh)));

  outcomeLabel(outcome: PlayOutcome): string {
    return OUTCOME_LABEL[outcome];
  }

  outcomeMark(outcome: PlayOutcome): string {
    switch (outcome) {
      case 'homerun': return 'HR';
      case 'triple': return '3B';
      case 'double': return '2B';
      case 'single': return 'H';
      case 'walk': return 'BB';
      case 'strikeout': return 'K';
      default: return 'O';
    }
  }

  outcomeClass(outcome: PlayOutcome): string {
    switch (outcome) {
      case 'homerun': return 'bg-gradient-to-br from-yellow-400 to-orange-500 border-yellow-300 text-black';
      case 'triple':
      case 'double': return 'bg-gradient-to-br from-emerald-500 to-emerald-700 border-emerald-400 text-white';
      case 'single': return 'bg-gradient-to-br from-green-500 to-green-700 border-green-400 text-white';
      case 'walk': return 'bg-gradient-to-br from-sky-500 to-sky-700 border-sky-400 text-white';
      case 'strikeout': return 'bg-gradient-to-br from-red-600 to-red-800 border-red-400 text-white';
      default: return 'bg-gradient-to-br from-gray-600 to-gray-800 border-gray-500 text-white';
    }
  }

  battedTypeLabel(): string {
    const play = this.lastPlay();
    return play?.battedType ? BATTED_BALL_LABEL[play.battedType] : '';
  }

  getTimingMessage(): string {
    switch (this.swingTiming()) {
      case 'perfect': return 'ジャストミート！';
      case 'good': return 'ナイスバッティング';
      case 'early': return '早すぎ（差し込まれず前で捉えた）';
      case 'late': return '振り遅れ';
      default: return '';
    }
  }

  /** 配球チャート用: ゾーン座標をパーセントに変換（-1.8〜1.8 を 0〜100%） */
  chartX(p: ZonePoint): number {
    return 50 + (p.x / 1.8) * 50;
  }

  chartY(p: ZonePoint): number {
    return 50 - (p.y / 1.8) * 50;
  }
}
