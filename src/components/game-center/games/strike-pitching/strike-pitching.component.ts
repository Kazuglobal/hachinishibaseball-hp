import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, PLATFORM_ID, Inject, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GameScoreService } from '../../../../services/game-score.service';
import { SEOService } from '../../../../services/seo.service';
import {
  FIELD,
  PITCH_TYPE_LIST,
  PitchType,
  ZonePoint,
  breakOffsetAt,
  pitchFlightTime,

  isStrike,
  BATTER_LINEUP,
  BatterProfile,
  batterWillSwing,
  batterSwingResult,
  PlayResult,
  OUTCOME_LABEL,
  BATTED_BALL_LABEL,
  clamp,
} from '../../shared/baseball-physics';

type GameState =
  | 'ready'      // 開始前
  | 'selectType' // 球種選択
  | 'aiming'     // コース指定
  | 'power'      // 球威メーター
  | 'control'    // 制球メーター
  | 'throwing'   // 投球中
  | 'result'     // 判定表示
  | 'gameover';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

/** 1球の記録（配球チャート） */
interface PitchRecord {
  aim: ZonePoint;
  actual: ZonePoint;
  pitch: PitchType;
  speedKmh: number;
  judge: string;
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
  private animationId = 0;
  private isBrowser: boolean;
  private resizeHandler?: () => void;
  private resizeObserver?: ResizeObserver;
  private pendingTimeouts: number[] = [];

  private seoService = inject(SEOService);
  private gameScoreService = inject(GameScoreService);

  // ====================================================================
  // ゲーム状態（1イニング＝3アウトを取るまで）
  // ====================================================================
  gameState = signal<GameState>('ready');
  score = signal(0);
  balls = signal(0);
  strikes = signal(0);
  outs = signal(0);
  runs = signal(0);
  pitchCount = signal(0);
  /** スタミナ 0〜100。減ると球速と制球が落ちる（実際の投手と同じ） */
  stamina = signal(100);
  /** 塁状況 [一塁, 二塁, 三塁] */
  bases = signal<[boolean, boolean, boolean]>([false, false, false]);

  batterIndex = signal(0);
  currentBatter = signal<BatterProfile>(BATTER_LINEUP[0]);
  strikeouts = signal(0);
  hitsAllowed = signal(0);
  walksAllowed = signal(0);
  /** ストライク率算出用 */
  strikeThrown = signal(0);

  pitchLog = signal<PitchRecord[]>([]);
  judgeText = signal('');
  judgeSub = signal('');
  judgeColor = signal('#ffffff');
  showJudge = signal(false);

  readonly pitchTypes = PITCH_TYPE_LIST;
  selectedPitchType = signal<PitchType>(PITCH_TYPE_LIST[0]);

  /** 狙ったコース（ゾーン正規化座標） */
  aim = signal<ZonePoint>({ x: 0, y: 0 });
  /** 実際にボールが到達したコース */
  private actual: ZonePoint = { x: 0, y: 0 };

  /** メーター値 0〜100 */
  meter = signal(0);
  private meterDir = 1;
  private meterTimer: number | null = null;
  /** 決定した球威（0〜100） */
  powerValue = signal(0);
  /** 制球メーターの停止位置（50が中央＝完璧） */
  controlValue = signal(50);

  currentSpeed = signal(0);

  // ゲームオーバー
  nickname = '';
  savedRank = signal(0);
  scoreSaved = signal(false);
  highScore = signal(0);
  nicknameError = signal<string | null>(null);

  // 投球アニメーション
  private pitchStartMs = 0;
  private pitchFlightMs = 0;
  private pitchProgress = 0;
  private throwResolved = false;
  /** この球で打者が振ると決めたか（リリース時に決定し、描画と判定で共有する） */
  private batterWillSwing = false;
  private batterSwung = false;
  private batterSwingStartMs = 0;

  private particles: Particle[] = [];
  private frameCount = 0;
  private screenShakeX = 0;
  private screenShakeY = 0;
  private screenShakeIntensity = 0;
  private impactFlashAlpha = 0;
  private mittShake = 0;

  // サウンド
  private throwSound?: HTMLAudioElement;
  private perfectSound?: HTMLAudioElement;
  private missSound?: HTMLAudioElement;
  private bgm?: HTMLAudioElement;

  // ====================================================================
  // カメラ（投手の後方＝実際の中継のセンターカメラに近い画角）
  // ====================================================================
  private canvasWidth = 0;
  private canvasHeight = 0;
  private isMobile = false;
  private readonly MOBILE_BREAKPOINT = 768;

  /** カメラは投手板の10m後方、高さ2.1m */
  private readonly CAM_BACK = 10;
  private readonly CAM_HEIGHT = 2.1;
  /** カメラから本塁までの距離 */
  private get plateDepth(): number { return FIELD.MOUND_TO_PLATE + this.CAM_BACK; }
  /** リリースポイントのカメラからの距離 */
  private get releaseDepth(): number { return this.CAM_BACK + 1.4; }

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
      title: 'ストライクピッチング | 八戸西高校 野球部OB会',
      description: '球種とコースを選び、球威と制球のメーターを止めて投げ分けろ！打者を3人抑えて無失点に。',
      keywords: '野球ゲーム,ピッチング,投球,変化球,ミニゲーム',
      url: 'https://hachinohenishibaseball.com/game/pitching'
    });
    this.highScore.set(this.gameScoreService.getHighScore('pitching'));
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
    this.stopMeter();
    this.clearTimeouts();
    if (this.isBrowser && this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    this.resizeObserver?.disconnect();
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
    if (event.code !== 'Space') return;
    const state = this.gameState();
    if (state === 'power' || state === 'control') {
      event.preventDefault();
      this.stopMeterAndAdvance();
    }
  }

  selectPitchType(pitch: PitchType): void {
    if (this.gameState() !== 'selectType') return;
    this.selectedPitchType.set(pitch);
    this.gameState.set('aiming');
  }

  /** キャンバスのタップでコースを指定 */
  onCanvasPointer(event: MouseEvent | TouchEvent): void {
    const state = this.gameState();
    if (state === 'power' || state === 'control') {
      if (!(event instanceof MouseEvent)) event.preventDefault();
      this.stopMeterAndAdvance();
      return;
    }
    if (state !== 'aiming') return;

    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    let clientX: number, clientY: number;
    if (event instanceof MouseEvent) {
      clientX = event.clientX; clientY = event.clientY;
    } else {
      const t = event.touches[0] || event.changedTouches[0];
      if (!t) return;
      event.preventDefault();
      clientX = t.clientX; clientY = t.clientY;
    }

    const p = this.screenToZone(clientX - rect.left, clientY - rect.top);
    // 狙えるのはゾーンの少し外まで（実際の投手も極端に外れたところは狙わない）
    this.aim.set({ x: clamp(p.x, -1.7, 1.7), y: clamp(p.y, -1.7, 1.7) });
    this.startPowerMeter();
  }

  /** 9分割ゾーンのボタンから狙う（モバイル向けの補助UI） */
  aimZone(zone: number): void {
    if (this.gameState() !== 'aiming') return;
    const row = Math.floor((zone - 1) / 3);
    const col = (zone - 1) % 3;
    this.aim.set({ x: (col - 1) * (2 / 3), y: (1 - row) * (2 / 3) });
    this.startPowerMeter();
  }

  // ====================================================================
  // メーター（球威 → 制球 の2段階。実際の投球も「力の入れ具合」と「リリースの精度」）
  // ====================================================================
  private startPowerMeter(): void {
    this.gameState.set('power');
    this.meter.set(0);
    this.meterDir = 1;
    this.runMeter(3.4);
  }

  private startControlMeter(): void {
    this.gameState.set('control');
    this.meter.set(0);
    this.meterDir = 1;
    // 球威が高いほど制球メーターが速くなる＝力むほど制球が難しい
    const speedFactor = 3.0 + (this.powerValue() / 100) * 2.6;
    // スタミナ切れでさらに速く（＝止めにくい）
    const staminaFactor = 1 + (1 - this.stamina() / 100) * 0.5;
    this.runMeter(speedFactor * staminaFactor);
  }

  private runMeter(speed: number): void {
    this.stopMeter();
    if (!this.isBrowser) return;
    this.meterTimer = window.setInterval(() => {
      this.meter.update(v => {
        const next = v + this.meterDir * speed;
        if (next >= 100) { this.meterDir = -1; return 100; }
        if (next <= 0) { this.meterDir = 1; return 0; }
        return next;
      });
    }, 16);
  }

  private stopMeter(): void {
    if (this.meterTimer !== null) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
  }

  stopMeterAndAdvance(): void {
    const state = this.gameState();
    if (state === 'power') {
      this.stopMeter();
      this.powerValue.set(Math.round(this.meter()));
      this.later(() => this.startControlMeter(), 180);
    } else if (state === 'control') {
      this.stopMeter();
      this.controlValue.set(Math.round(this.meter()));
      this.throwBall();
    }
  }

  // ====================================================================
  // 投球
  // ====================================================================
  startGame(): void {
    if (this.gameState() !== 'ready' && this.gameState() !== 'gameover') return;
    this.clearTimeouts();
    this.score.set(0);
    this.balls.set(0);
    this.strikes.set(0);
    this.outs.set(0);
    this.runs.set(0);
    this.pitchCount.set(0);
    this.stamina.set(100);
    this.bases.set([false, false, false]);
    this.batterIndex.set(0);
    this.currentBatter.set(BATTER_LINEUP[0]);
    this.strikeouts.set(0);
    this.hitsAllowed.set(0);
    this.walksAllowed.set(0);
    this.strikeThrown.set(0);
    this.pitchLog.set([]);
    this.savedRank.set(0);
    this.scoreSaved.set(false);
    this.nicknameError.set(null);
    this.particles = [];
    this.playBgm();
    this.nextPitch();
  }

  private nextPitch(): void {
    this.ensureCanvasSize();
    this.showJudge.set(false);
    this.throwResolved = false;
    this.batterSwung = false;
    this.batterWillSwing = false;
    this.pitchProgress = 0;
    this.aim.set({ x: 0, y: 0 });
    this.gameState.set('selectType');
    this.startLoop();
  }

  private throwBall(): void {
    const pitch = this.selectedPitchType();
    const staminaRatio = this.stamina() / 100;

    // 球速: 球威メーターで球種のレンジ内を決める。スタミナ低下で球速も落ちる
    const [lo, hi] = pitch.speedKmh;
    const base = lo + (hi - lo) * (this.powerValue() / 100);
    const speed = Math.round(base - (1 - staminaRatio) * 8 + (Math.random() - 0.5) * 2);
    this.currentSpeed.set(speed);

    // 制球: メーターの中央(50)からのズレが着弾のブレになる
    const dev = Math.abs(this.controlValue() - 50) / 50; // 0〜1
    // 力むほど・スタミナが無いほどブレが大きくなる
    const powerPenalty = 1 + Math.max(0, this.powerValue() - 70) / 100;
    const staminaPenalty = 1 + (1 - staminaRatio) * 0.8;
    const missMagnitude = dev * 1.5 * powerPenalty * staminaPenalty;

    // ブレる向きは制球メーターの停止方向にやや引っ張られる（早すぎ＝外、遅すぎ＝内）
    const bias = (this.controlValue() - 50) / 50;
    const angle = Math.random() * Math.PI * 2;
    const aim = this.aim();
    this.actual = {
      x: clamp(aim.x + Math.cos(angle) * missMagnitude + bias * 0.35, -2.6, 2.6),
      y: clamp(aim.y + Math.sin(angle) * missMagnitude, -2.6, 2.6),
    };

    // 打者が振るかどうかはこの時点で決定し、スイング動作と判定で同じ結果を使う
    this.batterWillSwing = batterWillSwing(
      this.currentBatter(), this.actual, pitch, this.strikes(), this.balls(),
    );
    this.batterSwung = false;

    this.pitchFlightMs = pitchFlightTime(speed) * 1000;
    this.pitchStartMs = performance.now();
    this.pitchProgress = 0;
    this.pitchCount.update(v => v + 1);
    this.stamina.update(s => Math.max(0, s - (this.powerValue() > 75 ? 3 : 2)));

    this.playSound(this.throwSound);
    this.gameState.set('throwing');
  }

  private startLoop(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    const loop = () => {
      this.frameCount++;
      const state = this.gameState();
      if (state === 'ready' || state === 'gameover') return;

      this.updateEffects();
      if (state === 'throwing') this.updateThrow();
      this.updateParticles();
      this.drawGame();
      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  }

  private updateThrow(): void {
    const now = performance.now();
    this.pitchProgress = (now - this.pitchStartMs) / this.pitchFlightMs;

    // 打者は到達の約130ms前にスイングを開始する（実際の打者の反応と同じ）
    if (this.batterWillSwing && !this.batterSwung && this.pitchProgress >= 0.72) {
      this.batterSwung = true;
      this.batterSwingStartMs = now;
    }

    if (!this.throwResolved && this.pitchProgress >= 1) {
      this.throwResolved = true;
      this.onPitchArrived();
    }
  }

  /** ボールが本塁に到達したときの判定 */
  private onPitchArrived(): void {
    const pitch = this.selectedPitchType();
    const batter = this.currentBatter();
    const speed = this.currentSpeed();
    const inZone = isStrike(this.actual);

    this.mittShake = 10;
    this.screenShakeIntensity = 5;

    const willSwing = this.batterWillSwing;

    // 狙い通りに決まったかのボーナス
    const aimError = Math.hypot(this.actual.x - this.aim().x, this.actual.y - this.aim().y);
    const pinpoint = aimError < 0.25;

    if (!willSwing) {
      // 見送り
      if (inZone) {
        this.strikeThrown.update(v => v + 1);
        this.addScore(pinpoint ? 200 : 130);
        this.recordPitch('見逃しストライク');
        this.judge('ストライク', '見逃し', '#facc15');
        this.addStrike();
      } else {
        this.addScore(-20);
        this.recordPitch('ボール');
        this.judge('ボール', '', '#38bdf8');
        this.addBall();
      }
      return;
    }

    // 打者がスイング
    this.strikeThrown.update(v => v + 1);
    const result = batterSwingResult(batter, this.actual, pitch, speed);

    if (result.kind === 'whiff') {
      this.addScore(pinpoint ? 220 : 170);
      this.recordPitch('空振り');
      this.judge('空振り', 'スイング＆ミス', '#f87171');
      this.addParticles('#facc15', 22);
      this.addStrike();
      return;
    }

    if (result.kind === 'foul') {
      this.addScore(40);
      this.recordPitch('ファウル');
      this.judge('ファウル', this.strikes() >= 2 ? 'カウントは変わりません' : '', '#fb923c');
      // 2ストライクからのファウルはカウントしない
      if (this.strikes() < 2) {
        this.strikes.update(s => s + 1);
        this.later(() => this.nextPitch(), 1200);
      } else {
        this.later(() => this.nextPitch(), 1200);
      }
      return;
    }

    // インプレー
    const play = result.result!;
    this.recordPitch(OUTCOME_LABEL[play.outcome]);
    this.onBallInPlay(play);
  }

  private onBallInPlay(play: PlayResult): void {
    const sub = play.battedType
      ? `${BATTED_BALL_LABEL[play.battedType]}・${play.exitVelocityKmh}km/h・${play.distance}m`
      : '';

    if (play.outcome === 'out') {
      this.addScore(350);
      this.judge('アウト', sub, '#4ade80');
      this.addParticles('#4ade80', 16);
      this.recordOut();
      return;
    }

    // 被安打
    this.hitsAllowed.update(v => v + 1);
    this.impactFlashAlpha = 0.4;
    this.screenShakeIntensity = 16;

    const advance = play.outcome === 'homerun' ? 4
      : play.outcome === 'triple' ? 3
        : play.outcome === 'double' ? 2 : 1;

    const penalty = play.outcome === 'homerun' ? -600
      : play.outcome === 'triple' ? -350
        : play.outcome === 'double' ? -250 : -150;
    this.addScore(penalty);

    this.advanceRunners(advance, true);
    this.judge(OUTCOME_LABEL[play.outcome], sub, play.outcome === 'homerun' ? '#f43f5e' : '#fbbf24');
    this.nextBatter();
  }

  private addStrike(): void {
    this.strikes.update(s => s + 1);
    if (this.strikes() >= 3) {
      this.strikeouts.update(v => v + 1);
      this.addScore(600);
      this.later(() => {
        this.judge('三振！', 'バッターアウト', '#22d3ee');
        this.recordOut();
      }, 700);
    } else {
      this.later(() => this.nextPitch(), 1100);
    }
  }

  private addBall(): void {
    this.balls.update(b => b + 1);
    if (this.balls() >= 4) {
      this.walksAllowed.update(v => v + 1);
      this.addScore(-250);
      this.later(() => {
        this.judge('フォアボール', '押し出しに注意', '#38bdf8');
        this.advanceRunners(1, false);
        this.nextBatter();
      }, 700);
    } else {
      this.later(() => this.nextPitch(), 1000);
    }
  }

  /**
   * 走者を進める。
   * @param baseCount 打者が進む塁数（4=本塁打）
   * @param hit 安打かどうか（四球のときは押し出しのみ）
   */
  private advanceRunners(baseCount: number, hit: boolean): void {
    const [first, second, third] = this.bases();
    let scored = 0;
    let b1 = false, b2 = false, b3 = false;

    if (!hit) {
      // 四球: 埋まっている塁だけ押し出す
      if (first && second && third) scored++;
      b3 = third || (first && second);
      b2 = second || first;
      b1 = true;
    } else if (baseCount >= 4) {
      scored += 1 + (first ? 1 : 0) + (second ? 1 : 0) + (third ? 1 : 0);
    } else {
      const runners = [first ? 1 : 0, second ? 2 : 0, third ? 3 : 0].filter(v => v > 0);
      const landing: number[] = [];
      for (const r of runners) {
        const dest = r + baseCount;
        if (dest >= 4) scored++;
        else landing.push(dest);
      }
      landing.push(baseCount);
      b1 = landing.includes(1);
      b2 = landing.includes(2);
      b3 = landing.includes(3);
    }

    this.bases.set([b1, b2, b3]);
    if (scored > 0) {
      this.runs.update(r => r + scored);
      this.addScore(-200 * scored);
    }
  }

  private recordOut(): void {
    this.outs.update(o => o + 1);
    if (this.outs() >= 3) {
      // 三者凡退ボーナス
      if (this.hitsAllowed() === 0 && this.walksAllowed() === 0) this.addScore(800);
      this.later(() => this.endGame(), 1500);
    } else {
      this.nextBatter();
    }
  }

  private nextBatter(): void {
    this.later(() => {
      if (this.outs() >= 3) return;
      this.balls.set(0);
      this.strikes.set(0);
      this.batterIndex.update(i => (i + 1) % BATTER_LINEUP.length);
      this.currentBatter.set(BATTER_LINEUP[this.batterIndex()]);
      this.nextPitch();
    }, 1600);
  }

  private addScore(points: number): void {
    this.score.update(s => Math.max(0, s + points));
  }

  private judge(text: string, sub: string, color: string): void {
    this.judgeText.set(text);
    this.judgeSub.set(sub);
    this.judgeColor.set(color);
    this.showJudge.set(true);
    this.gameState.set('result');
  }

  private recordPitch(judgeLabel: string): void {
    this.pitchLog.update(log => [...log, {
      aim: { ...this.aim() },
      actual: { ...this.actual },
      pitch: this.selectedPitchType(),
      speedKmh: this.currentSpeed(),
      judge: judgeLabel,
    }]);
  }

  private endGame(): void {
    this.gameState.set('gameover');
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.stopMeter();
    this.stopBgm();
  }

  saveScore(): void {
    if (this.scoreSaved()) return;
    const trimmed = (this.nickname ?? '').trim();
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
    const rank = this.gameScoreService.addScore('pitching', sanitized, this.score());
    this.savedRank.set(rank);
    this.scoreSaved.set(true);
    this.highScore.set(this.gameScoreService.getHighScore('pitching'));
  }

  // ====================================================================
  // 3D投影
  // ====================================================================
  private setupCamera(): void {
    this.focal = (this.canvasWidth * (this.isMobile ? 0.15 : 0.115)) * this.plateDepth / FIELD.ZONE_WIDTH;
    this.horizonY = this.canvasHeight * 0.26;
  }

  /** ワールド座標（x=左右, y=高さ, depth=カメラからの距離）を画面へ */
  private project(x: number, y: number, depth: number): { x: number; y: number; scale: number } {
    const d = Math.max(0.5, depth);
    const scale = this.focal / d;
    return {
      x: this.canvasWidth / 2 + x * scale,
      y: this.horizonY - (y - this.CAM_HEIGHT) * scale,
      scale,
    };
  }

  private zoneToWorld(p: ZonePoint): { x: number; y: number } {
    return {
      x: p.x * (FIELD.ZONE_WIDTH / 2),
      y: (FIELD.ZONE_TOP + FIELD.ZONE_BOTTOM) / 2 + p.y * ((FIELD.ZONE_TOP - FIELD.ZONE_BOTTOM) / 2),
    };
  }

  private screenToZone(sx: number, sy: number): ZonePoint {
    const scale = this.focal / this.plateDepth;
    const worldX = (sx - this.canvasWidth / 2) / scale;
    const worldY = this.CAM_HEIGHT - (sy - this.horizonY) / scale;
    const midHeight = (FIELD.ZONE_TOP + FIELD.ZONE_BOTTOM) / 2;
    return {
      x: worldX / (FIELD.ZONE_WIDTH / 2),
      y: (worldY - midHeight) / ((FIELD.ZONE_TOP - FIELD.ZONE_BOTTOM) / 2),
    };
  }

  /** 投球の進行度から画面位置を求める */
  private ballScreenPos(progress: number): { x: number; y: number; r: number } {
    const p = clamp(progress, 0, 1.2);
    const pitch = this.selectedPitchType();
    const target = this.zoneToWorld(this.actual);
    const brk = breakOffsetAt(pitch, Math.min(1, p));

    const depth = this.releaseDepth + (this.plateDepth - this.releaseDepth) * p;
    // リリースポイントは投手板の1.4m前・高さ1.85m・三塁側0.35m（右投手）
    const startX = -0.35, startY = 1.85;
    const baseX = startX + (target.x - startX) * p;
    const baseY = startY + (target.y - startY) * p;

    // 重力による弧
    const T = this.pitchFlightMs / 1000;
    const gravityArc = (9.81 / 2) * T * T * p * (1 - p);

    const proj = this.project(baseX + brk.x, baseY + brk.y + gravityArc, depth);
    return { x: proj.x, y: proj.y, r: Math.max(2, 0.0366 * proj.scale) };
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
    this.drawCatcher();
    this.drawBatter();
    this.drawUmpire();
    this.drawStrikeZone();

    const state = this.gameState();
    if (state === 'aiming' || state === 'power' || state === 'control') {
      this.drawAimReticle();
    }
    if (state === 'throwing' || (state === 'result' && this.pitchProgress > 0)) {
      this.drawBall();
    }

    this.drawParticles();
    this.drawScoreboard();

    if (this.impactFlashAlpha > 0) {
      ctx.fillStyle = `rgba(255,80,80,${this.impactFlashAlpha})`;
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
    ctx.restore();
  }

  private drawField(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    const horizon = this.horizonY;

    // 空
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#0a1026');
    sky.addColorStop(1, '#1d2c4d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 1);

    // バックネット裏スタンド
    const stand = ctx.createLinearGradient(0, horizon * 0.45, 0, horizon);
    stand.addColorStop(0, '#39394b');
    stand.addColorStop(1, '#16161f');
    ctx.fillStyle = stand;
    ctx.fillRect(0, horizon * 0.45, w, horizon * 0.55);

    for (let i = 0; i < 120; i++) {
      const col = i % 40;
      const row = Math.floor(i / 40);
      const x = (w / 40) * col + (row % 2) * (w / 80);
      const y = horizon * 0.5 + row * horizon * 0.15;
      const flicker = Math.sin(this.frameCount * 0.1 + i * 0.5);
      if (flicker > 0.2) {
        ctx.fillStyle = ['#ffcc66', '#ffffff', '#9fd0ff'][i % 3];
        ctx.globalAlpha = 0.2 + flicker * 0.25;
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // バックネット
    ctx.strokeStyle = 'rgba(200,220,255,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 14) {
      ctx.beginPath(); ctx.moveTo(x, horizon * 0.45); ctx.lineTo(x, horizon); ctx.stroke();
    }

    // 内野の芝と土
    const grass = ctx.createLinearGradient(0, horizon, 0, h);
    grass.addColorStop(0, '#1d5e24');
    grass.addColorStop(0.5, '#27822f');
    grass.addColorStop(1, '#2f9c38');
    ctx.fillStyle = grass;
    ctx.fillRect(0, horizon, w, h - horizon);

    for (let i = 0; i < 10; i++) {
      const t0 = i / 10, t1 = (i + 0.5) / 10;
      const y0 = horizon + (h - horizon) * Math.pow(t0, 1.8);
      const y1 = horizon + (h - horizon) * Math.pow(t1, 1.8);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, y0, w, Math.max(1, y1 - y0));
    }

    // 本塁周りの土
    const plate = this.project(0, 0, this.plateDepth);
    const dirtFar = this.project(0, 0, this.plateDepth + 4.5);
    const dirtNear = this.project(0, 0, this.plateDepth - 5.5);
    ctx.fillStyle = '#8a6a45';
    ctx.beginPath();
    ctx.ellipse(plate.x, (dirtFar.y + dirtNear.y) / 2, 6.5 * plate.scale,
      Math.max(3, (dirtNear.y - dirtFar.y) / 2), 0, 0, Math.PI * 2);
    ctx.fill();

    // 本塁ベース（地面に置かれた五角形として正しく投影する）
    const plateD = this.plateDepth;
    const pFarL = this.project(-0.216, 0, plateD + 0.215);
    const pFarR = this.project(0.216, 0, plateD + 0.215);
    const pMidL = this.project(-0.216, 0, plateD - 0.005);
    const pMidR = this.project(0.216, 0, plateD - 0.005);
    const pTip = this.project(0, 0, plateD - 0.215);
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.moveTo(pFarL.x, pFarL.y);
    ctx.lineTo(pFarR.x, pFarR.y);
    ctx.lineTo(pMidR.x, pMidR.y);
    ctx.lineTo(pTip.x, pTip.y);
    ctx.lineTo(pMidL.x, pMidL.y);
    ctx.closePath();
    ctx.fill();

    // バッターボックス（1.22m×1.83m の長方形を地面に投影）
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    [-1, 1].forEach(side => {
      const cx = side * 0.9;
      const corners = [
        this.project(cx - 0.61, 0, plateD + 0.915),
        this.project(cx + 0.61, 0, plateD + 0.915),
        this.project(cx + 0.61, 0, plateD - 0.915),
        this.project(cx - 0.61, 0, plateD - 0.915),
      ];
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      corners.slice(1).forEach(c => ctx.lineTo(c.x, c.y));
      ctx.closePath();
      ctx.stroke();
    });

    // 投手マウンドの手前側（カメラの足元）
    ctx.fillStyle = '#9c7a52';
    ctx.beginPath();
    ctx.ellipse(w / 2, h + h * 0.18, w * 0.95, h * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 捕手（後ろ姿・ミットを構える） */
  private drawCatcher(): void {
    const ctx = this.ctx;
    const depth = this.plateDepth + 2.0;
    const base = this.project(-0.28, 0, depth);
    const s = base.scale;

    ctx.save();
    ctx.translate(base.x, base.y);

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.5 * s, 0.14 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // しゃがんだ体（高さ約0.95m）
    const bodyH = 0.95 * s;
    ctx.fillStyle = '#1d3557';
    ctx.beginPath();
    ctx.ellipse(0, -bodyH * 0.42, 0.34 * s, 0.3 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // レガース
    ctx.fillStyle = '#2a4d7a';
    [-0.26, 0.26].forEach(dx => {
      ctx.beginPath();
      ctx.ellipse(dx * s, -bodyH * 0.16, 0.12 * s, 0.18 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // ヘルメット
    ctx.fillStyle = '#16304f';
    ctx.beginPath();
    ctx.arc(0, -bodyH * 0.82, 0.16 * s, 0, Math.PI * 2);
    ctx.fill();
    // マスクの格子
    ctx.strokeStyle = 'rgba(200,200,210,0.5)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 0.055 * s, -bodyH * 0.92);
      ctx.lineTo(i * 0.055 * s, -bodyH * 0.72);
      ctx.stroke();
    }

    // ミット（狙ったコースに構える＝実際の配球と同じ）
    const target = this.zoneToWorld(this.aim());
    const mittPos = this.project(target.x - 0.22, target.y, this.plateDepth + 0.5);
    ctx.restore();

    const shake = this.mittShake > 0 ? (Math.random() - 0.5) * this.mittShake : 0;
    const mittR = 0.19 * mittPos.scale;
    const mittGrad = ctx.createRadialGradient(mittPos.x, mittPos.y, mittR * 0.2, mittPos.x, mittPos.y, mittR);
    mittGrad.addColorStop(0, '#a9682f');
    mittGrad.addColorStop(1, '#5d3a1a');
    ctx.fillStyle = mittGrad;
    ctx.beginPath();
    ctx.arc(mittPos.x + shake, mittPos.y + shake, mittR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /** 打者（右打者＝投手から見て右側） */
  private drawBatter(): void {
    const ctx = this.ctx;
    const base = this.project(0.82, 0, this.plateDepth);
    const s = base.scale;
    const bodyH = 1.75 * s;

    ctx.save();
    ctx.translate(base.x, base.y);

    // スイングアニメーション
    const swingT = this.batterSwung
      ? clamp((performance.now() - this.batterSwingStartMs) / 260, 0, 1)
      : 0;
    ctx.rotate(this.easeOutQuad(swingT) * 0.1);

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.4 * s, 0.11 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // 脚（膝を割った構え）
    ctx.strokeStyle = '#eceef2';
    ctx.lineWidth = Math.max(2, 0.16 * s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.24 * s, 0); ctx.lineTo(-0.1 * s, -bodyH * 0.5);
    ctx.moveTo(0.24 * s, 0); ctx.lineTo(0.1 * s, -bodyH * 0.5);
    ctx.stroke();
    // ストッキング
    ctx.strokeStyle = '#7a1020';
    ctx.lineWidth = Math.max(2, 0.13 * s);
    ctx.beginPath();
    ctx.moveTo(-0.24 * s, 0); ctx.lineTo(-0.21 * s, -bodyH * 0.16);
    ctx.moveTo(0.24 * s, 0); ctx.lineTo(0.21 * s, -bodyH * 0.16);
    ctx.stroke();

    // 胴（肩幅は広く、腰は細く）
    ctx.fillStyle = '#f2f3f6';
    ctx.beginPath();
    ctx.moveTo(-0.23 * s, -bodyH * 0.86);
    ctx.lineTo(0.23 * s, -bodyH * 0.86);
    ctx.lineTo(0.17 * s, -bodyH * 0.48);
    ctx.lineTo(-0.17 * s, -bodyH * 0.48);
    ctx.closePath();
    ctx.fill();
    // 肩
    ctx.beginPath();
    ctx.ellipse(0, -bodyH * 0.85, 0.23 * s, 0.07 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // 頭・ヘルメット
    ctx.fillStyle = '#f1d7b5';
    ctx.beginPath();
    ctx.arc(0, -bodyH * 0.94, 0.1 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a1020';
    ctx.beginPath();
    ctx.arc(0, -bodyH * 0.955, 0.115 * s, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();

    // バット
    const batAngle = this.batterSwung
      ? -Math.PI * 0.7 + Math.PI * 1.1 * this.easeOutQuad(swingT)
      : -Math.PI * 0.65;
    ctx.save();
    ctx.translate(-0.1 * s, -bodyH * 0.82);
    ctx.rotate(batAngle);
    ctx.fillStyle = '#c99a5b';
    ctx.fillRect(0, -0.025 * s, 0.84 * s, 0.05 * s);
    ctx.restore();

    ctx.restore();
  }

  /** 球審 */
  private drawUmpire(): void {
    const ctx = this.ctx;
    const base = this.project(-0.15, 0, this.plateDepth + 2.2);
    const s = base.scale;
    const bodyH = 1.2 * s;

    ctx.save();
    ctx.translate(base.x, base.y);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#1b1b22';
    ctx.beginPath();
    ctx.ellipse(0, -bodyH * 0.45, 0.34 * s, 0.34 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111116';
    ctx.beginPath();
    ctx.arc(0, -bodyH * 0.88, 0.16 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawStrikeZone(): void {
    const ctx = this.ctx;
    const tl = this.project(-FIELD.ZONE_WIDTH / 2, FIELD.ZONE_TOP, this.plateDepth);
    const br = this.project(FIELD.ZONE_WIDTH / 2, FIELD.ZONE_BOTTOM, this.plateDepth);
    const x = tl.x, y = tl.y, w = br.x - tl.x, h = br.y - tl.y;

    ctx.save();
    // 半透明の面（中継のストライクゾーン表示と同じ見せ方）
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(x + (w / 3) * i, y); ctx.lineTo(x + (w / 3) * i, y + h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + (h / 3) * i); ctx.lineTo(x + w, y + (h / 3) * i); ctx.stroke();
    }
    ctx.restore();
  }

  /** 狙いのレティクル */
  private drawAimReticle(): void {
    const ctx = this.ctx;
    const target = this.zoneToWorld(this.aim());
    const p = this.project(target.x, target.y, this.plateDepth);
    const pulse = 0.6 + Math.sin(this.frameCount * 0.14) * 0.2;

    ctx.save();
    ctx.strokeStyle = `rgba(255,80,80,${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 16, p.y); ctx.lineTo(p.x - 5, p.y);
    ctx.moveTo(p.x + 5, p.y); ctx.lineTo(p.x + 16, p.y);
    ctx.moveTo(p.x, p.y - 16); ctx.lineTo(p.x, p.y - 5);
    ctx.moveTo(p.x, p.y + 5); ctx.lineTo(p.x, p.y + 16);
    ctx.stroke();
    ctx.restore();
  }

  private drawBall(): void {
    const ctx = this.ctx;
    const p = clamp(this.pitchProgress, 0, 1);
    const pos = this.ballScreenPos(p);

    // 軌跡
    for (let i = 1; i <= 8; i++) {
      const tp = Math.max(0, p - i * 0.035);
      const tPos = this.ballScreenPos(tp);
      ctx.globalAlpha = 0.28 * (1 - i / 9);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(tPos.x, tPos.y, tPos.r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const grad = ctx.createRadialGradient(pos.x - pos.r * 0.3, pos.y - pos.r * 0.3, pos.r * 0.1, pos.x, pos.y, pos.r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#cfcfc4');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pos.r, 0, Math.PI * 2);
    ctx.fill();

    if (pos.r > 5) {
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = Math.max(1, pos.r * 0.13);
      const spin = this.frameCount * 0.4;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pos.r * 0.7, spin, spin + Math.PI * 0.65);
      ctx.stroke();
    }
  }

  /** 球場のスコアボード風の表示 */
  private drawScoreboard(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.roundRect(10, 10, 128, 56, 8);
    ctx.fill();

    const rows: [string, number, number, string][] = [
      ['B', this.balls(), 3, '#4ade80'],
      ['S', this.strikes(), 2, '#facc15'],
      ['O', this.outs(), 2, '#ef4444'],
    ];
    ctx.font = 'bold 11px Arial';
    rows.forEach(([label, value, max, color], row) => {
      const ly = 26 + row * 15;
      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'left';
      ctx.fillText(label, 20, ly + 3);
      for (let i = 0; i < max; i++) {
        ctx.beginPath();
        ctx.arc(38 + i * 16, ly, 5, 0, Math.PI * 2);
        ctx.fillStyle = i < value ? color : 'rgba(255,255,255,0.15)';
        ctx.fill();
      }
    });

    // 走者表示（ダイヤモンド型）
    const dx = w - 52, dy = 34, r = 7;
    const [b1, b2, b3] = this.bases();
    const drawBase = (cx: number, cy: number, on: boolean) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = on ? '#facc15' : 'rgba(255,255,255,0.2)';
      ctx.fillRect(-r / 2, -r / 2, r, r);
      ctx.restore();
    };
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(w - 82, 10, 72, 52, 8);
    ctx.fill();
    drawBase(dx + 12, dy, b1);       // 一塁（右）
    drawBase(dx, dy - 12, b2);        // 二塁（上）
    drawBase(dx - 12, dy, b3);        // 三塁（左）
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`失点 ${this.runs()}`, dx, 56);

    ctx.restore();
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
    this.drawCatcher();
    this.drawBatter();
    this.drawUmpire();
    this.drawStrikeZone();

    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.fillStyle = '#38bdf8';
    ctx.font = `bold ${Math.max(18, this.canvasWidth * 0.045)}px Oswald, Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('STRIKE PITCHING', this.canvasWidth / 2, this.canvasHeight * 0.42);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(10, this.canvasWidth * 0.02)}px Arial`;
    ctx.fillText('球種 → コース → 球威 → 制球 の順に決めて投げる', this.canvasWidth / 2, this.canvasHeight * 0.54);
    ctx.fillText('3アウトを取るまでが1イニング', this.canvasWidth / 2, this.canvasHeight * 0.61);
    ctx.restore();
  }

  // ====================================================================
  // 演出
  // ====================================================================
  private updateEffects(): void {
    if (this.screenShakeIntensity > 0.1) {
      this.screenShakeX = (Math.random() - 0.5) * this.screenShakeIntensity;
      this.screenShakeY = (Math.random() - 0.5) * this.screenShakeIntensity;
      this.screenShakeIntensity *= 0.86;
    } else {
      this.screenShakeX = this.screenShakeY = this.screenShakeIntensity = 0;
    }
    if (this.impactFlashAlpha > 0) {
      this.impactFlashAlpha *= 0.86;
      if (this.impactFlashAlpha < 0.01) this.impactFlashAlpha = 0;
    }
    if (this.mittShake > 0) this.mittShake *= 0.82;
  }

  private updateParticles(): void {
    this.particles = this.particles.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--;
      return p.life > 0;
    });
  }

  private addParticles(color: string, count: number): void {
    const target = this.zoneToWorld(this.actual);
    const p = this.project(target.x, target.y, this.plateDepth);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 1.5 + Math.random() * 4;
      this.particles.push({
        x: p.x, y: p.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 20 + Math.random() * 14, maxLife: 34,
        color, size: 1.5 + Math.random() * 2.5,
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
    if (this.canvasHeight <= 0) this.canvasHeight = 600;
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
    const aspectRatio = 4 / 3;
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
    else if (state === 'gameover') this.drawGame();
  }

  // ====================================================================
  // サウンド
  // ====================================================================
  private initSounds(): void {
    const make = (src: string, volume: number) => {
      try {
        const a = new Audio(src);
        a.volume = volume;
        a.addEventListener('error', () => { /* 音源が無い場合は無音 */ });
        return a;
      } catch { return undefined; }
    };
    this.throwSound = make('assets/sounds/pitch.mp3', 0.6);
    this.perfectSound = make('assets/sounds/perfect.mp3', 0.8);
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
  // テンプレート用
  // ====================================================================
  zones = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  /** ストライク率（%） */
  strikePercentage = computed(() => {
    const total = this.pitchCount();
    if (total === 0) return 0;
    return Math.round((this.strikeThrown() / total) * 100);
  });

  /** 制球メーターの中央からのズレ（表示用） */
  controlAccuracy = computed(() => Math.max(0, 100 - Math.abs(this.controlValue() - 50) * 2));

  /** 選択中の球種の球速レンジ表示 */
  speedRangeLabel(pitch: PitchType): string {
    return `${pitch.speedKmh[0]}〜${pitch.speedKmh[1]}km/h`;
  }

  /** 変化の向きを矢印で表示（打者から見た変化） */
  breakLabel(pitch: PitchType): string {
    const bx = pitch.break.x, by = pitch.break.y;
    const parts: string[] = [];
    if (Math.abs(by) >= 0.15) parts.push(by < 0 ? '落ちる' : '伸びる');
    if (Math.abs(bx) >= 0.15) parts.push(bx < 0 ? '外へ' : '内へ');
    return parts.length ? parts.join('・') : '素直';
  }

  chartX(p: ZonePoint): number { return 50 + (p.x / 2.2) * 50; }
  chartY(p: ZonePoint): number { return 50 - (p.y / 2.2) * 50; }

  /** 配球チャートの点の色（判定で色分け） */
  chartColor(rec: PitchRecord): string {
    if (rec.judge === 'ボール') return '#38bdf8';
    if (rec.judge.includes('ストライク') || rec.judge === '空振り') return '#facc15';
    if (rec.judge === 'ファウル') return '#fb923c';
    if (rec.judge === 'アウト') return '#4ade80';
    return '#f43f5e';
  }
}
