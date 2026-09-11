import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, PLATFORM_ID, Inject, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GameScoreService } from '../../../../services/game-score.service';
import { SEOService } from '../../../../services/seo.service';
import {
  FIELD,
  simulateBattedBall,
  classifyBattedBall,
  BATTED_BALL_LABEL,
  BattedBallType,
  fenceDistanceAt,
  clamp,
} from '../../shared/baseball-physics';

type GameState = 'ready' | 'waiting' | 'flight' | 'result' | 'gameover';
type CatchKind = 'normal' | 'running' | 'jumping' | 'diving' | 'fence' | null;

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

interface PlayRecord {
  caught: boolean;
  kind: CatchKind;
  battedType: BattedBallType;
  distance: number;
  hangTime: number;
  runDistance: number;
  points: number;
}

/** 打球の種類ごとの設定（実際の打球データのレンジに準拠） */
interface BattedBallSpec {
  label: string;
  exitVelocity: [number, number];
  launchAngle: [number, number];
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
  private animationId = 0;
  private isBrowser: boolean;
  private resizeHandler?: () => void;
  private resizeObserver?: ResizeObserver;
  private pendingTimeouts: number[] = [];

  private seoService = inject(SEOService);
  private gameScoreService = inject(GameScoreService);

  // ====================================================================
  // ゲーム状態
  // ====================================================================
  gameState = signal<GameState>('ready');
  score = signal(0);
  combo = signal(0);
  maxCombo = signal(0);
  catchCount = signal(0);
  missCount = signal(0);
  /** 何打球目か */
  ballNumber = signal(0);
  readonly totalBalls = 12;

  plays = signal<PlayRecord[]>([]);
  resultText = signal('');
  resultSub = signal('');
  resultColor = signal('#ffffff');
  showResult = signal(false);

  /** 現在の打球情報（HUD表示用） */
  currentBattedLabel = signal('');
  currentExitVelocity = signal(0);
  currentHangTime = signal(0);
  currentDistance = signal(0);
  private currentLaunchAngle = 0;

  /** 風（実際の外野守備で最も判断を狂わせる要素） */
  windSpeed = signal(0);
  windDirDeg = signal(0);

  // ゲームオーバー
  nickname = '';
  savedRank = signal(0);
  scoreSaved = signal(false);
  highScore = signal(0);
  nicknameError = signal<string | null>(null);

  // ====================================================================
  // ワールド（x=左右[m] / z=本塁からの距離[m] / y=高さ[m]）
  // ====================================================================
  /** 野手の位置 */
  private fx = 0;
  private fz = 84;
  private fvx = 0;
  private fvz = 0;
  /** 実際の外野手の全力疾走 約7.5m/s */
  private readonly RUN_SPEED = 8.0;
  private readonly ACCEL = 22;

  private runDistance = 0;

  /** ジャンプ */
  private jumpT = -1;
  private readonly JUMP_DURATION = 0.62;
  /** ダイビング */
  private diveT = -1;
  private diveDirX = 0;
  private diveDirZ = 0;
  private readonly DIVE_DURATION = 0.75;

  /** 走る目標（タップ操作時） */
  private targetX: number | null = null;
  private targetZ: number | null = null;

  // 入力
  private keys = new Set<string>();

  // ボール
  private ballPath: { d: number; h: number; t: number }[] = [];
  private ballSpray = 0;
  private ballHangTime = 0;
  private flightT = 0;
  private ballX = 0;
  private ballY = 0;
  private ballZ = 0;
  private ballTrail: { x: number; y: number; z: number }[] = [];
  private windAx = 0;
  private windAz = 0;
  /** 落下予測地点 */
  private landingX = 0;
  private landingZ = 0;
  private resolved = false;
  private isHomerun = false;

  // 演出
  private particles: Particle[] = [];
  private frameCount = 0;
  private lastFrameMs = 0;
  private timeScale = 1;
  private slowMotionT = 0;
  private screenShakeX = 0;
  private screenShakeY = 0;
  private screenShakeIntensity = 0;

  // サウンド
  private catchSound?: HTMLAudioElement;
  private missSound?: HTMLAudioElement;
  private bgm?: HTMLAudioElement;

  // ====================================================================
  // カメラ（野手の後方から。実際の外野守備の見え方に近い視点）
  // ====================================================================
  private canvasWidth = 0;
  private canvasHeight = 0;
  private isMobile = false;
  private readonly MOBILE_BREAKPOINT = 768;

  private camX = 0;
  private camZ = 97;
  private readonly CAM_BEHIND = 12;
  private readonly CAM_HEIGHT = 7.0;
  private focal = 0;
  private horizonY = 0;
  /** カメラの基準の地平線位置（チルトなしの状態） */
  private baseHorizonY = 0;
  /** 基準の焦点距離（高く上がった打球では引いて全体を映す） */
  private baseFocal = 0;

  /** 打球の種類（実際の打球データのレンジ） */
  private readonly BALL_SPECS: BattedBallSpec[] = [
    { label: 'フライ', exitVelocity: [128, 152], launchAngle: [30, 44] },
    { label: 'ライナー', exitVelocity: [148, 170], launchAngle: [14, 23] },
    { label: '大飛球', exitVelocity: [158, 174], launchAngle: [27, 34] },
    { label: 'ポテンフライ', exitVelocity: [98, 122], launchAngle: [34, 50] },
  ];

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  // ====================================================================
  // ライフサイクル
  // ====================================================================
  ngOnInit(): void {
    this.seoService.updateSEO({
      title: '守備キャッチ | 八戸西高校 野球部OB会',
      description: '打球の落下点を読んで走れ！奥行きのある外野守備でジャンピングキャッチ・ダイビングキャッチを決めろ。',
      keywords: '野球ゲーム,守備,外野,キャッチ,落下点,ミニゲーム',
      url: 'https://hachinohenishibaseball.com/game/catch'
    });
    this.highScore.set(this.gameScoreService.getHighScore('catch'));
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
    if (this.gameState() !== 'flight' && this.gameState() !== 'waiting') return;
    const k = event.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) {
      this.keys.add(k);
      this.targetX = this.targetZ = null;
      event.preventDefault();
    } else if (event.code === 'Space') {
      this.jump();
      event.preventDefault();
    } else if (k === 'shift' || k === 'x') {
      this.dive();
      event.preventDefault();
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.key.toLowerCase());
  }

  /** キャンバスをタップした位置へ走る（実際の外野手が落下点へ走るのと同じ操作） */
  onCanvasPointer(event: MouseEvent | TouchEvent): void {
    const state = this.gameState();
    if (state !== 'flight' && state !== 'waiting') return;

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

    const ground = this.screenToGround(clientX - rect.left, clientY - rect.top);
    if (ground) {
      this.targetX = clamp(ground.x, -48, 48);
      this.targetZ = clamp(ground.z, 45, FIELD.FENCE_CENTER - 1);
      this.keys.clear();
    }
  }

  jump(): void {
    if (this.gameState() !== 'flight') return;
    if (this.jumpT >= 0 || this.diveT >= 0) return;
    this.jumpT = 0;
  }

  dive(): void {
    if (this.gameState() !== 'flight') return;
    if (this.diveT >= 0 || this.jumpT >= 0) return;
    this.diveT = 0;
    // ダイブは現在の進行方向、止まっているならボールの方向へ
    const speed = Math.hypot(this.fvx, this.fvz);
    if (speed > 0.5) {
      this.diveDirX = this.fvx / speed;
      this.diveDirZ = this.fvz / speed;
    } else {
      const dx = this.landingX - this.fx;
      const dz = this.landingZ - this.fz;
      const d = Math.hypot(dx, dz) || 1;
      this.diveDirX = dx / d;
      this.diveDirZ = dz / d;
    }
    this.addDirtParticles();
  }

  // ====================================================================
  // ゲーム進行
  // ====================================================================
  startGame(): void {
    if (this.gameState() !== 'ready' && this.gameState() !== 'gameover') return;
    this.clearTimeouts();
    this.score.set(0);
    this.combo.set(0);
    this.maxCombo.set(0);
    this.catchCount.set(0);
    this.missCount.set(0);
    this.ballNumber.set(0);
    this.plays.set([]);
    this.savedRank.set(0);
    this.scoreSaved.set(false);
    this.nicknameError.set(null);
    this.particles = [];
    this.fx = 0; this.fz = 84; this.fvx = 0; this.fvz = 0;
    this.camX = 0; this.camZ = this.fz + this.CAM_BEHIND;
    this.playBgm();
    this.nextBall();
  }

  private nextBall(): void {
    this.ensureCanvasSize();

    if (this.ballNumber() >= this.totalBalls) {
      this.endGame();
      return;
    }
    this.ballNumber.update(v => v + 1);
    this.showResult.set(false);
    this.resolved = false;
    this.isHomerun = false;
    this.jumpT = -1;
    this.diveT = -1;
    this.ballTrail = [];
    this.targetX = this.targetZ = null;
    this.timeScale = 1;
    this.slowMotionT = 0;

    // 風（毎回変わる。実際の球場でも風向きは守備位置の判断に影響する）
    const wind = Math.random() * 7;
    const windDir = Math.random() * Math.PI * 2;
    this.windSpeed.set(Math.round(wind * 10) / 10);
    this.windDirDeg.set(Math.round((windDir * 180) / Math.PI));
    // 風による加速度（横風は打球を流す）
    // 7m/s の横風でおよそ3〜4m 流れる程度（実際のフライの流され方に近い）
    this.windAx = Math.cos(windDir) * wind * 0.05;
    this.windAz = Math.sin(windDir) * wind * 0.05;

    // 打球の生成（後半ほど難しい打球）
    const difficulty = (this.ballNumber() - 1) / Math.max(1, this.totalBalls - 1);
    const spec = this.pickBallSpec(difficulty);
    const la = spec.launchAngle[0] + Math.random() * (spec.launchAngle[1] - spec.launchAngle[0]);

    // 仮の打球で滞空時間を見積もり、「全力で走れば届く距離」に落下点を置く
    const probeEv = (spec.exitVelocity[0] + spec.exitVelocity[1]) / 2;
    const probe = simulateBattedBall(probeEv, la, 1);
    const reach = Math.min(24, this.RUN_SPEED * probe.hangTime * 0.58);
    const wanted = reach * (0.28 + difficulty * 0.66);

    // 打球の種類ごとに走る方向の傾向を変える
    // （ポテンは前へ突っ込む、大飛球は後ろへ下がる）
    let dirBias: number;
    if (spec.label === 'ポテンフライ') dirBias = -Math.PI / 2;      // 本塁方向（前）
    else if (spec.label === '大飛球') dirBias = Math.PI / 2;        // フェンス方向（後ろ）
    else dirBias = Math.random() * Math.PI * 2;
    const dir = dirBias + (Math.random() - 0.5) * Math.PI * 0.9;

    let tx = clamp(this.fx + Math.cos(dir) * wanted, -44, 44);
    let tz = clamp(this.fz + Math.sin(dir) * wanted, 52, FIELD.FENCE_CENTER - 2);
    let spray = clamp((Math.atan2(tx, tz) * 180) / Math.PI, -41, 41);
    const targetDistance = Math.hypot(tx, tz);

    // その地点に落ちる初速を求める（打球角度は固定して二分探索）
    const ev = this.solveExitVelocity(targetDistance, la);
    const traj = simulateBattedBall(ev, la, 1);

    this.ballPath = traj.path;
    this.ballHangTime = traj.hangTime;
    this.ballSpray = spray;

    this.landingX = traj.distance * Math.sin((spray * Math.PI) / 180)
      + 0.5 * this.windAx * traj.hangTime * traj.hangTime;
    this.landingZ = traj.distance * Math.cos((spray * Math.PI) / 180)
      + 0.5 * this.windAz * traj.hangTime * traj.hangTime;

    // フェンス越えは捕球不能（ホームラン）
    this.isHomerun = traj.distance > fenceDistanceAt(this.ballSpray);

    this.currentLaunchAngle = la;
    this.currentBattedLabel.set(spec.label);
    this.currentExitVelocity.set(Math.round(ev));
    this.currentHangTime.set(Math.round(traj.hangTime * 10) / 10);
    this.currentDistance.set(Math.round(traj.distance));

    this.runDistance = 0;
    this.flightT = 0;
    this.lastFrameMs = performance.now();

    this.gameState.set('flight');
    this.startLoop();
  }

  private pickBallSpec(difficulty: number): BattedBallSpec {
    const r = Math.random();
    if (difficulty < 0.3) {
      // 序盤は素直なフライ中心
      return r < 0.7 ? this.BALL_SPECS[0] : this.BALL_SPECS[3];
    }
    if (difficulty < 0.65) {
      return r < 0.45 ? this.BALL_SPECS[0] : r < 0.75 ? this.BALL_SPECS[1] : this.BALL_SPECS[3];
    }
    // 終盤は大飛球とライナーが増える
    return r < 0.35 ? this.BALL_SPECS[1] : r < 0.7 ? this.BALL_SPECS[2] : this.BALL_SPECS[0];
  }

  /** 指定した飛距離になる打球初速を二分探索で求める（打球角度は固定） */
  private solveExitVelocity(targetDistance: number, launchAngleDeg: number): number {
    let lo = 90, hi = 182;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      const d = simulateBattedBall(mid, launchAngleDeg, 1).distance;
      if (d < targetDistance) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  private startLoop(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    const loop = () => {
      const now = performance.now();
      const dtRaw = Math.min(0.05, (now - this.lastFrameMs) / 1000);
      this.lastFrameMs = now;
      this.frameCount++;

      const state = this.gameState();
      if (state === 'ready' || state === 'gameover') return;

      const dt = dtRaw * this.timeScale;
      this.updateEffects(dtRaw);
      if (state === 'flight') this.updateFlight(dt);
      this.updateFielder(dt);
      this.updateCamera(dtRaw);
      this.updateParticles(dt);
      this.drawGame();

      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  }

  private updateFlight(dt: number): void {
    const prevT = this.flightT;
    this.flightT += dt;

    // ボールがグラブの届く高さを通過するのは0.1秒ほどしかないため、
    // 1フレームを分割して判定する（フレーム落ちですり抜けるのを防ぐ）
    const steps = this.resolved ? 1 : 5;
    for (let i = 1; i <= steps; i++) {
      const t = Math.min(prevT + (dt * i) / steps, this.ballHangTime);
      this.setBallPosition(t);
      if (this.resolved) continue;

      const catchKind = this.checkCatch();
      if (catchKind) {
        this.resolved = true;
        this.onCatch(catchKind);
        return;
      }
    }

    if (this.frameCount % 2 === 0) {
      this.ballTrail.push({ x: this.ballX, y: this.ballY, z: this.ballZ });
      if (this.ballTrail.length > 60) this.ballTrail.shift();
    }

    if (this.resolved) return;

    // 落球（地面に到達）
    if (this.flightT >= this.ballHangTime) {
      this.resolved = true;
      this.onMiss();
    }
  }

  /** 経過時間 t の打球位置を求める（飛距離方向 + 風による流れ） */
  private setBallPosition(t: number): void {
    const pt = this.pathAt(t);
    const rad = (this.ballSpray * Math.PI) / 180;
    this.ballX = pt.d * Math.sin(rad) + 0.5 * this.windAx * t * t;
    this.ballZ = pt.d * Math.cos(rad) + 0.5 * this.windAz * t * t;
    this.ballY = pt.h;
  }

  private pathAt(t: number): { d: number; h: number } {
    const path = this.ballPath;
    if (path.length === 0) return { d: 0, h: 0 };
    let idx = path.findIndex(p => p.t >= t);
    if (idx < 0) return path[path.length - 1];
    if (idx === 0) return path[0];
    const a = path[idx - 1], b = path[idx];
    const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
    return { d: a.d + (b.d - a.d) * f, h: a.h + (b.h - a.h) * f };
  }

  /**
   * 捕球判定。
   * 実際の捕球と同じく「グラブが届く高さ」と「体からの距離」の両方を満たす必要がある。
   */
  private checkCatch(): CatchKind {
    if (this.isHomerun && this.ballY > FIELD.FENCE_HEIGHT && this.ballZ > fenceDistanceAt(this.ballSpray) - 1) {
      return null; // フェンス越えは追いつけない
    }

    const dist = Math.hypot(this.ballX - this.fx, this.ballZ - this.fz);
    const moving = Math.hypot(this.fvx, this.fvz) > 2.5;

    // ダイビング中: 低い打球を横っ飛びで捕る
    if (this.diveT >= 0 && this.diveT < this.DIVE_DURATION * 0.7) {
      if (this.ballY < 1.6 && dist < 3.2) return 'diving';
      return null;
    }

    // ジャンプ中: 高い打球に届く
    if (this.jumpT >= 0 && this.jumpT < this.JUMP_DURATION) {
      const jumpHeight = this.jumpOffset();
      const reachTop = 2.35 + jumpHeight;
      if (this.ballY >= 1.8 && this.ballY <= reachTop && dist < 2.1) {
        // フェンス際のジャンピングキャッチ
        if (this.ballZ > fenceDistanceAt(this.ballSpray) - 3) return 'fence';
        return 'jumping';
      }
      return null;
    }

    // 通常捕球: グラブの届く高さ 0.3〜2.35m
    if (this.ballY >= 0.2 && this.ballY <= 2.35 && dist < 1.8) {
      return moving ? 'running' : 'normal';
    }
    return null;
  }

  private onCatch(kind: CatchKind): void {
    this.catchCount.update(v => v + 1);
    this.combo.update(c => c + 1);
    if (this.combo() > this.maxCombo()) this.maxCombo.set(this.combo());
    this.playSound(this.catchSound);

    // 得点: 走った距離と捕球の難易度で決まる
    const base = 120;
    const runBonus = Math.round(this.runDistance * 9);
    const kindBonus = kind === 'diving' ? 320
      : kind === 'fence' ? 400
        : kind === 'jumping' ? 200
          : kind === 'running' ? 80 : 0;
    const comboMult = 1 + Math.min(1.0, (this.combo() - 1) * 0.12);
    const points = Math.round((base + runBonus + kindBonus) * comboMult);
    this.score.update(s => s + points);

    const labels: Record<NonNullable<CatchKind>, string> = {
      normal: 'キャッチ',
      running: 'ランニングキャッチ',
      jumping: 'ジャンピングキャッチ',
      diving: 'ダイビングキャッチ',
      fence: 'フェンス際の好捕',
    };
    const label = labels[kind!];

    this.plays.update(p => [...p, {
      caught: true,
      kind,
      battedType: classifyBattedBall(this.currentLaunchAngle),
      distance: this.currentDistance(),
      hangTime: this.currentHangTime(),
      runDistance: Math.round(this.runDistance),
      points,
    }]);

    // 好捕はスローモーション演出
    if (kind === 'diving' || kind === 'fence' || kind === 'jumping') {
      this.timeScale = 0.35;
      this.slowMotionT = 0.9;
      this.screenShakeIntensity = 10;
    }

    this.addCatchParticles();
    this.showJudge(label, `${this.currentBattedLabel()}・滞空${this.currentHangTime()}秒・${Math.round(this.runDistance)}m走った`, '#4ade80');
    this.later(() => this.nextBall(), 1700);
  }

  private onMiss(): void {
    this.missCount.update(v => v + 1);
    this.combo.set(0);
    this.playSound(this.missSound);
    this.screenShakeIntensity = 6;

    this.plays.update(p => [...p, {
      caught: false,
      kind: null,
      battedType: classifyBattedBall(this.currentLaunchAngle),
      distance: this.currentDistance(),
      hangTime: this.currentHangTime(),
      runDistance: Math.round(this.runDistance),
      points: 0,
    }]);

    this.addDirtParticles();
    if (this.isHomerun) {
      this.showJudge('ホームラン', 'フェンスオーバー。これは仕方ない', '#f43f5e');
    } else {
      const miss = Math.round(Math.hypot(this.ballX - this.fx, this.ballZ - this.fz));
      this.showJudge('落球…', `落下点まで あと${miss}m`, '#f87171');
    }
    this.later(() => this.nextBall(), 1700);
  }

  private showJudge(text: string, sub: string, color: string): void {
    this.resultText.set(text);
    this.resultSub.set(sub);
    this.resultColor.set(color);
    this.showResult.set(true);
  }

  private endGame(): void {
    this.gameState.set('gameover');
    if (this.animationId) cancelAnimationFrame(this.animationId);
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
    const rank = this.gameScoreService.addScore('catch', sanitized, this.score());
    this.savedRank.set(rank);
    this.scoreSaved.set(true);
    this.highScore.set(this.gameScoreService.getHighScore('catch'));
  }

  // ====================================================================
  // 野手の移動
  // ====================================================================
  private updateFielder(dt: number): void {
    if (dt <= 0) return;

    // ダイビング中は操作できない（実際のダイビングと同じ）
    if (this.diveT >= 0) {
      this.diveT += dt;
      const p = this.diveT / this.DIVE_DURATION;
      if (p < 0.55) {
        const lunge = 6.0 * (1 - p / 0.55);
        this.fx += this.diveDirX * lunge * dt;
        this.fz += this.diveDirZ * lunge * dt;
        this.runDistance += lunge * dt;
      }
      if (this.diveT >= this.DIVE_DURATION) this.diveT = -1;
      this.fvx = this.fvz = 0;
      return;
    }

    if (this.jumpT >= 0) {
      this.jumpT += dt;
      if (this.jumpT >= this.JUMP_DURATION) this.jumpT = -1;
    }

    // 入力方向
    let ix = 0, iz = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) ix -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) ix += 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) iz += 1;   // 奥（フェンス方向）
    if (this.keys.has('arrowdown') || this.keys.has('s')) iz -= 1; // 手前（内野方向）

    if (ix === 0 && iz === 0 && this.targetX !== null && this.targetZ !== null) {
      const dx = this.targetX - this.fx;
      const dz = this.targetZ - this.fz;
      const d = Math.hypot(dx, dz);
      if (d > 0.4) { ix = dx / d; iz = dz / d; }
      else { this.targetX = this.targetZ = null; }
    }

    const mag = Math.hypot(ix, iz);
    if (mag > 0) { ix /= mag; iz /= mag; }

    // 加減速（実際の選手のように止まるまでに間がある）
    const targetVx = ix * this.RUN_SPEED;
    const targetVz = iz * this.RUN_SPEED;
    this.fvx += clamp(targetVx - this.fvx, -this.ACCEL * dt, this.ACCEL * dt);
    this.fvz += clamp(targetVz - this.fvz, -this.ACCEL * dt, this.ACCEL * dt);
    if (mag === 0) {
      this.fvx *= Math.pow(0.02, dt);
      this.fvz *= Math.pow(0.02, dt);
    }

    const beforeX = this.fx, beforeZ = this.fz;
    this.fx = clamp(this.fx + this.fvx * dt, -52, 52);
    // フェンスより先には行けない
    this.fz = clamp(this.fz + this.fvz * dt, 40, fenceDistanceAt(0) - 0.6);
    this.runDistance += Math.hypot(this.fx - beforeX, this.fz - beforeZ);
  }

  /** ジャンプの高さ（放物線） */
  private jumpOffset(): number {
    if (this.jumpT < 0) return 0;
    const p = this.jumpT / this.JUMP_DURATION;
    // 最高到達点 約0.75m（実際のジャンプと同程度）
    return Math.max(0, 4 * 0.75 * p * (1 - p));
  }

  private updateCamera(dt: number): void {
    // 飛球中は野手と落下点の中間を映して、両方を見ながら走れるようにする
    const tracking = this.gameState() === 'flight' && !this.resolved;
    const focusX = tracking ? this.fx * 0.55 + this.landingX * 0.45 : this.fx;
    const focusZ = tracking ? this.fz * 0.7 + this.landingZ * 0.3 : this.fz;
    const targetX = focusX * 0.9;
    const targetZ = focusZ + this.CAM_BEHIND;
    const k = 1 - Math.pow(0.001, dt);
    this.camX += (targetX - this.camX) * k;
    this.camZ += (targetZ - this.camZ) * k;

    // 打球を目で追うようにカメラを上に振り、高く上がった打球では引いて全体を映す
    // （実際の中継カメラと同じ動き）
    let desiredHorizon = this.baseHorizonY;
    let desiredFocal = this.baseFocal;
    const minBallY = this.canvasHeight * 0.1;

    if (this.gameState() === 'flight') {
      const depth = this.camZ - this.ballZ;
      if (depth > 1.2) {
        const maxHorizon = this.maxHorizonY();
        // まずカメラを上に振って収める
        const scale = this.baseFocal / depth;
        const yAtBase = this.baseHorizonY - (this.ballY - this.CAM_HEIGHT) * scale;
        if (yAtBase < minBallY) {
          desiredHorizon = Math.min(maxHorizon, this.baseHorizonY + (minBallY - yAtBase));
        }
        // チルトだけで収まらない高い打球は焦点距離を縮めて（＝引いて）収める
        const heightAboveCam = this.ballY - this.CAM_HEIGHT;
        if (heightAboveCam > 0) {
          const allowed = (desiredHorizon - minBallY) * depth / heightAboveCam;
          desiredFocal = Math.max(this.baseFocal * 0.55, Math.min(this.baseFocal, allowed));
        }
      }
    }

    const tiltK = 1 - Math.pow(0.02, dt);
    this.horizonY += (desiredHorizon - this.horizonY) * tiltK;
    this.focal += (desiredFocal - this.focal) * tiltK;
  }

  // ====================================================================
  // 投影
  // ====================================================================
  private setupCamera(): void {
    this.baseFocal = this.canvasWidth * (this.isMobile ? 0.5 : 0.58);
    this.focal = this.baseFocal;
    this.baseHorizonY = this.canvasHeight * 0.24;
    this.horizonY = this.baseHorizonY;
  }

  /** 野手が画面内に収まる範囲での地平線の下限 */
  private maxHorizonY(): number {
    const fielderFootOffset = this.CAM_HEIGHT * (this.focal / this.CAM_BEHIND);
    return Math.max(this.baseHorizonY, this.canvasHeight * 0.93 - fielderFootOffset);
  }

  private project(x: number, y: number, z: number): { x: number; y: number; scale: number } | null {
    const depth = this.camZ - z;
    if (depth < 1.2) return null;
    const scale = this.focal / depth;
    return {
      x: this.canvasWidth / 2 + (x - this.camX) * scale,
      y: this.horizonY - (y - this.CAM_HEIGHT) * scale,
      scale,
    };
  }

  /** 画面上の点を地面（y=0）のワールド座標に戻す */
  private screenToGround(sx: number, sy: number): { x: number; z: number } | null {
    // sy = horizon + CAM_HEIGHT * scale  →  scale = (sy - horizon) / CAM_HEIGHT
    const scale = (sy - this.horizonY) / this.CAM_HEIGHT;
    if (scale <= 0.5) return null; // 地平線より上はタップ不可
    const depth = this.focal / scale;
    const z = this.camZ - depth;
    const x = this.camX + (sx - this.canvasWidth / 2) / scale;
    return { x, z };
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
    this.drawLandingMarker();
    this.drawBallShadow();
    this.drawFielder();
    this.drawBallTrail();
    this.drawBall();
    this.drawParticles();
    this.drawHud();

    ctx.restore();
  }

  private drawField(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    const horizon = this.horizonY;

    // 空
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#1b3b63');
    sky.addColorStop(1, '#4a7fae');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 1);

    // 芝生
    const grass = ctx.createLinearGradient(0, horizon, 0, h);
    grass.addColorStop(0, '#1d5e24');
    grass.addColorStop(0.35, '#27822f');
    grass.addColorStop(1, '#38ad42');
    ctx.fillStyle = grass;
    ctx.fillRect(0, horizon, w, h - horizon);

    // 芝目のストライプ（ワールド座標に固定されるので走ると流れて見える＝距離感が出る）
    for (let z = Math.floor((this.camZ - 95) / 6) * 6; z < this.camZ - 2; z += 6) {
      const near = this.project(0, 0, z);
      const far = this.project(0, 0, z + 3);
      if (!near || !far) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.085)';
      ctx.fillRect(0, far.y, w, Math.max(1, near.y - far.y));
    }

    // 内野（遠方の土）と本塁
    const infieldEdge = this.project(0, 0, 38);
    if (infieldEdge) {
      ctx.fillStyle = '#8a6a45';
      ctx.beginPath();
      ctx.moveTo(0, infieldEdge.y);
      ctx.lineTo(w, infieldEdge.y);
      ctx.lineTo(w, horizon);
      ctx.lineTo(0, horizon);
      ctx.closePath();
      ctx.fill();
    }

    // 内野のマウンドと本塁（打者の位置が分かるようにする）
    const moundP = this.project(0, 0, FIELD.MOUND_TO_PLATE);
    if (moundP) {
      ctx.fillStyle = '#a9855c';
      ctx.beginPath();
      ctx.ellipse(moundP.x, moundP.y, 2.74 * moundP.scale, Math.max(1.5, 0.9 * moundP.scale), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const homeP = this.project(0, 0, 0.5);
    if (homeP) {
      ctx.fillStyle = '#f1f1f1';
      ctx.beginPath();
      ctx.ellipse(homeP.x, homeP.y, Math.max(1.5, 0.3 * homeP.scale), Math.max(1, 0.12 * homeP.scale), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ファウルライン
    [-1, 1].forEach(side => {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (let d = 20; d <= FIELD.FENCE_LINE; d += 6) {
        const rad = (side * FIELD.FOUL_ANGLE * Math.PI) / 180;
        const p = this.project(d * Math.sin(rad), 0, d * Math.cos(rad));
        if (!p) continue;
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
      if (started) ctx.stroke();
    });

    // ウォーニングトラック（フェンス手前の土。これが見えたら後ろが無い合図）
    ctx.fillStyle = 'rgba(150,110,70,0.85)';
    let prevNear: { x: number; y: number } | null = null;
    let prevFar: { x: number; y: number } | null = null;
    for (let a = -46; a <= 46; a += 3) {
      const rad = (a * Math.PI) / 180;
      const dFar = fenceDistanceAt(a);
      const dNear = dFar - 5;
      const far = this.project(dFar * Math.sin(rad), 0, dFar * Math.cos(rad));
      const near = this.project(dNear * Math.sin(rad), 0, dNear * Math.cos(rad));
      if (far && near && prevFar && prevNear) {
        ctx.beginPath();
        ctx.moveTo(prevNear.x, prevNear.y);
        ctx.lineTo(near.x, near.y);
        ctx.lineTo(far.x, far.y);
        ctx.lineTo(prevFar.x, prevFar.y);
        ctx.closePath();
        ctx.fill();
      }
      prevFar = far; prevNear = near;
    }

    // 遠くのスタンド（本塁側）
    ctx.fillStyle = 'rgba(30,34,48,0.85)';
    ctx.fillRect(0, horizon - h * 0.09, w, h * 0.09);
  }

  /** 落下予測地点（実際の外野手が最初の数歩で読む「落下点」） */
  private drawLandingMarker(): void {
    if (this.gameState() !== 'flight' || this.resolved) return;
    // 打った直後は読めない。0.35秒後（＝最初の一歩を切るころ）から表示される
    if (this.flightT < 0.35) return;

    const ctx = this.ctx;
    const p = this.project(this.landingX, 0, this.landingZ);
    if (!p) return;

    const remain = Math.max(0, this.ballHangTime - this.flightT);
    const pulse = 0.45 + Math.sin(this.frameCount * 0.2) * 0.2;
    const r = Math.max(9, 1.9 * p.scale);

    ctx.save();
    ctx.strokeStyle = `rgba(255,235,120,${pulse})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,235,120,${pulse * 0.2})`;
    ctx.fill();

    // 野手から落下点への誘導ライン
    const fielder = this.project(this.fx, 0, this.fz);
    const gap = Math.hypot(this.landingX - this.fx, this.landingZ - this.fz);
    if (fielder && gap > 2) {
      ctx.strokeStyle = 'rgba(255,235,120,0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(fielder.x, fielder.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 残り時間と落下点までの距離（画面端で切れないように位置を寄せる）
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    const labelX = clamp(p.x, 44, this.canvasWidth - 44);
    ctx.fillText(`${remain.toFixed(1)}s / ${Math.round(gap)}m`, labelX, p.y - r * 0.5 - 5);
    ctx.restore();
  }

  /** ボールの影（高さを読むための最重要の手がかり） */
  private drawBallShadow(): void {
    if (this.gameState() !== 'flight') return;
    const p = this.project(this.ballX, 0, this.ballZ);
    if (!p) return;
    const ctx = this.ctx;
    // 高いほど影は薄く大きくなる
    const heightFactor = clamp(this.ballY / 25, 0, 1);
    const r = Math.max(2, 0.35 * p.scale * (1 + heightFactor * 1.6));
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - heightFactor * 0.6)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBallTrail(): void {
    const ctx = this.ctx;
    this.ballTrail.forEach((t, i) => {
      const p = this.project(t.x, t.y, t.z);
      if (!p) return;
      const alpha = (i / this.ballTrail.length) * 0.35;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, 0.0366 * p.scale * 2.5), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  private drawBall(): void {
    if (this.gameState() !== 'flight') return;
    const p = this.project(this.ballX, this.ballY, this.ballZ);
    if (!p) return;
    const ctx = this.ctx;
    // 遠くても見えるようにボールは実寸より大きめに描く
    const r = Math.max(3, 0.0366 * p.scale * 3.2);

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffcc';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const grad = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#d8d8cc');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    if (r > 6) {
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = Math.max(1, r * 0.14);
      const spin = this.frameCount * 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.7, spin, spin + Math.PI * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 野手（後ろ姿） */
  private drawFielder(): void {
    const ctx = this.ctx;
    const jump = this.jumpOffset();
    const diving = this.diveT >= 0;
    const diveP = diving ? this.diveT / this.DIVE_DURATION : 0;

    const base = this.project(this.fx, 0, this.fz);
    if (!base) return;
    const s = base.scale;
    const bodyH = 1.8 * s;

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, 0.45 * s, 0.15 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(base.x, base.y - jump * s);

    if (diving) {
      // ダイビング: 体を横に倒す
      ctx.rotate((this.diveDirX >= 0 ? 1 : -1) * Math.min(1, diveP / 0.4) * Math.PI * 0.42);
    }

    const speed = Math.hypot(this.fvx, this.fvz);
    const runCycle = Math.sin(this.frameCount * 0.35) * Math.min(1, speed / this.RUN_SPEED);

    // 脚
    ctx.strokeStyle = '#ecebe6';
    ctx.lineWidth = Math.max(2, 0.15 * s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.1 * s, -bodyH * 0.48);
    ctx.lineTo(-0.1 * s + runCycle * 0.3 * s, jump > 0 ? -bodyH * 0.12 : 0);
    ctx.moveTo(0.1 * s, -bodyH * 0.48);
    ctx.lineTo(0.1 * s - runCycle * 0.3 * s, jump > 0 ? -bodyH * 0.12 : 0);
    ctx.stroke();

    // 胴（ユニフォームの背中）
    const body = ctx.createLinearGradient(-0.25 * s, -bodyH, 0.25 * s, -bodyH * 0.45);
    body.addColorStop(0, '#f4f4f6');
    body.addColorStop(1, '#c8ccd4');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-0.24 * s, -bodyH * 0.88);
    ctx.lineTo(0.24 * s, -bodyH * 0.88);
    ctx.lineTo(0.18 * s, -bodyH * 0.46);
    ctx.lineTo(-0.18 * s, -bodyH * 0.46);
    ctx.closePath();
    ctx.fill();

    // 背番号
    ctx.fillStyle = '#1e3a5f';
    ctx.font = `bold ${Math.max(6, 0.2 * s)}px Oswald, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('8', 0, -bodyH * 0.68);
    ctx.textBaseline = 'alphabetic';

    // グラブ側の腕（捕球体勢では上げる）
    const reaching = this.gameState() === 'flight' && this.ballY < 12;
    const armUp = jump > 0 || (reaching && this.ballY < 6);
    const gloveX = (diving ? this.diveDirX * 0.75 : -0.4) * s;
    const gloveY = diving ? -bodyH * 0.42 : (armUp ? -bodyH * 1.22 : -bodyH * 0.7);
    ctx.strokeStyle = '#f1d7b5';
    ctx.lineWidth = Math.max(2, 0.1 * s);
    ctx.beginPath();
    ctx.moveTo(-0.2 * s, -bodyH * 0.84);
    ctx.lineTo(gloveX, gloveY);
    ctx.stroke();
    // グラブ
    ctx.fillStyle = '#6b4423';
    ctx.beginPath();
    ctx.arc(gloveX, gloveY, 0.17 * s, 0, Math.PI * 2);
    ctx.fill();

    // 反対の腕
    ctx.strokeStyle = '#f1d7b5';
    ctx.beginPath();
    ctx.moveTo(0.2 * s, -bodyH * 0.84);
    ctx.lineTo(0.34 * s + runCycle * 0.2 * s, -bodyH * 0.62);
    ctx.stroke();

    // 頭・帽子
    ctx.fillStyle = '#f1d7b5';
    ctx.beginPath();
    ctx.arc(0, -bodyH * 0.96, 0.12 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath();
    ctx.ellipse(0, -bodyH * 0.99, 0.135 * s, 0.085 * s, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** 画面内のHUD（風・打球情報） */
  private drawHud(): void {
    const ctx = this.ctx;
    const w = this.canvasWidth;

    // 風向計
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 92, 44, 8);
    ctx.fill();
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '9px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('WIND', 18, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Oswald, Arial';
    ctx.fillText(`${this.windSpeed()} m/s`, 18, 44);

    // 風向きの矢印
    const ax = 84, ay = 30;
    const rad = (this.windDirDeg() * Math.PI) / 180;
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax - Math.cos(rad) * 9, ay - Math.sin(rad) * 9);
    ctx.lineTo(ax + Math.cos(rad) * 9, ay + Math.sin(rad) * 9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax + Math.cos(rad) * 9, ay + Math.sin(rad) * 9);
    ctx.lineTo(ax + Math.cos(rad + 2.5) * 6, ay + Math.sin(rad + 2.5) * 6);
    ctx.lineTo(ax + Math.cos(rad - 2.5) * 6, ay + Math.sin(rad - 2.5) * 6);
    ctx.closePath();
    ctx.fillStyle = '#7dd3fc';
    ctx.fill();
    ctx.restore();

    // 打球データ
    if (this.gameState() === 'flight') {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.roundRect(w - 122, 10, 112, 56, 8);
      ctx.fill();
      ctx.fillStyle = '#9fb3c8';
      ctx.font = '9px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('打球', w - 114, 24);
      ctx.fillText('初速', w - 114, 40);
      ctx.fillText('滞空', w - 114, 56);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(this.currentBattedLabel(), w - 18, 24);
      ctx.fillText(`${this.currentExitVelocity()} km/h`, w - 18, 40);
      ctx.fillText(`${this.currentHangTime()} 秒`, w - 18, 56);
      ctx.restore();
    }

    // コンボ
    if (this.combo() >= 2) {
      ctx.save();
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 20px Oswald, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${this.combo()} CATCH COMBO`, w / 2, 30);
      ctx.restore();
    }
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
    this.camX = 0;
    this.camZ = this.fz + this.CAM_BEHIND;
    this.drawField();
    this.drawFielder();

    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.fillStyle = '#4ade80';
    ctx.font = `bold ${Math.max(18, this.canvasWidth * 0.05)}px Oswald, Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('CATCH FLY', this.canvasWidth / 2, this.canvasHeight * 0.4);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(10, this.canvasWidth * 0.021)}px Arial`;
    ctx.fillText('落下点へ走ってフライを捕れ', this.canvasWidth / 2, this.canvasHeight * 0.53);
    ctx.fillText('黄色い輪が落下点・影で高さを読む', this.canvasWidth / 2, this.canvasHeight * 0.61);
    ctx.restore();
  }

  // ====================================================================
  // 演出
  // ====================================================================
  private updateEffects(dt: number): void {
    if (this.slowMotionT > 0) {
      this.slowMotionT -= dt;
      if (this.slowMotionT <= 0) this.timeScale = 1;
    }
    if (this.screenShakeIntensity > 0.1) {
      this.screenShakeX = (Math.random() - 0.5) * this.screenShakeIntensity;
      this.screenShakeY = (Math.random() - 0.5) * this.screenShakeIntensity;
      this.screenShakeIntensity *= 0.9;
    } else {
      this.screenShakeX = this.screenShakeY = this.screenShakeIntensity = 0;
    }
  }

  private updateParticles(dt: number): void {
    const step = dt * 60;
    this.particles = this.particles.filter(p => {
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vy += 0.25 * step;
      p.life -= step;
      return p.life > 0;
    });
  }

  private addCatchParticles(): void {
    const p = this.project(this.ballX, this.ballY, this.ballZ);
    if (!p) return;
    const colors = ['#ffd700', '#4ade80', '#ffffff', '#7dd3fc'];
    for (let i = 0; i < 22; i++) {
      const angle = (Math.PI * 2 * i) / 22;
      const speed = 2 + Math.random() * 4;
      this.particles.push({
        x: p.x, y: p.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1,
        life: 24 + Math.random() * 14, maxLife: 38,
        color: colors[i % colors.length], size: 1.5 + Math.random() * 2.5,
      });
    }
  }

  private addDirtParticles(): void {
    const p = this.project(this.fx, 0, this.fz);
    if (!p) return;
    for (let i = 0; i < 14; i++) {
      this.particles.push({
        x: p.x + (Math.random() - 0.5) * 30, y: p.y,
        vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 3 - 1,
        life: 20, maxLife: 20,
        color: 'rgba(110,80,45,1)', size: 1.5 + Math.random() * 2.5,
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
    if (this.canvasHeight <= 0) this.canvasHeight = 550;
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
    const aspectRatio = 16 / 11;
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
    this.catchSound = make('assets/sounds/catch.mp3', 0.7);
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

  // ====================================================================
  // テンプレート用
  // ====================================================================
  catchRate = computed(() => {
    const total = this.plays().length;
    if (total === 0) return 0;
    return Math.round((this.catchCount() / total) * 100);
  });

  totalRunDistance = computed(() => this.plays().reduce((sum, p) => sum + p.runDistance, 0));

  spectacularCatches = computed(() =>
    this.plays().filter(p => p.caught && (p.kind === 'diving' || p.kind === 'jumping' || p.kind === 'fence')).length
  );

  playMark(play: PlayRecord): string {
    if (!play.caught) return '×';
    switch (play.kind) {
      case 'diving': return 'D';
      case 'jumping': return 'J';
      case 'fence': return 'F';
      case 'running': return 'R';
      default: return '○';
    }
  }

  playClass(play: PlayRecord): string {
    if (!play.caught) return 'bg-gradient-to-br from-red-600 to-red-800 border-red-400 text-white';
    switch (play.kind) {
      case 'diving':
      case 'fence': return 'bg-gradient-to-br from-yellow-400 to-orange-500 border-yellow-300 text-black';
      case 'jumping': return 'bg-gradient-to-br from-sky-500 to-blue-700 border-sky-400 text-white';
      default: return 'bg-gradient-to-br from-green-500 to-green-700 border-green-400 text-white';
    }
  }

  playTitle(play: PlayRecord): string {
    const kindLabel = !play.caught ? '落球'
      : play.kind === 'diving' ? 'ダイビングキャッチ'
        : play.kind === 'fence' ? 'フェンス際の好捕'
          : play.kind === 'jumping' ? 'ジャンピングキャッチ'
            : play.kind === 'running' ? 'ランニングキャッチ' : 'キャッチ';
    return `${kindLabel} / 飛距離${play.distance}m / 滞空${play.hangTime}s / ${play.runDistance}m走行`;
  }

  battedLabel(type: BattedBallType): string {
    return BATTED_BALL_LABEL[type];
  }
}
