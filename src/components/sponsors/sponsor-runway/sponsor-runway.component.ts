import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  Inject,
  PLATFORM_ID,
  NgZone,
  signal,
  computed,
  HostListener,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  SponsorTier,
  SPONSOR_PLANS,
  SponsorPlanConfig,
} from '../../../services/sponsor.service';

export interface RunwayPin {
  number: number;
  x: number; // % from left
  y: number; // % from top
  tier: SponsorTier;
  label: string;
  spotTitle: string;
  spotNote: string;
}

export interface BaseballLook {
  id: string;
  indexLabel: string;
  code: string;
  companyName: string;
  industry: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  imageAlt: string;
  featuredTier: SponsorTier;
  tierPriceLabel: string;
  usageTag: string;
  pins: RunwayPin[];
}

export interface RenderedLookState {
  look: BaseballLook;
  index: number;
  transform: string;
  opacity: number;
  filter: string;
  zIndex: number;
  isFront: boolean;
}

const BASEBALL_LOOKS: BaseballLook[] = [
  {
    id: 'look-gold-mirai',
    indexLabel: '01',
    code: 'GOLD PARTNER / ¥50,000',
    companyName: '株式会社 八戸みらい建設（見本）',
    industry: '総合建設・土木',
    title: 'ゴールド協賛 掲載見本①',
    subtitle: 'トップ最上位・大型ワイドバナー＋光沢シマー演出',
    description:
      'トップページ最上位および主要全ページ（試合結果・活動報告・ご支援）に優先掲出。濃紺×ゴールド枠と上品な光沢シマー演出で、地域を支える企業ブランドを堂々と訴求します。',
    image: 'assets/images/sponsors/ad-gold-mirai.jpg',
    imageAlt: 'ゴールド協賛 掲載見本 株式会社 八戸みらい建設',
    featuredTier: 'gold',
    tierPriceLabel: '年額 ¥50,000',
    usageTag: '最上位ワイド枠・光沢シマー演出',
    pins: [
      {
        number: 1,
        x: 50,
        y: 16,
        tier: 'gold',
        label: 'GOLD 特別バッジ＆最上位優先枠',
        spotTitle: 'ゴールド協賛（年額 ¥50,000・720×200px）',
        spotNote: 'トップ最上位＋試合結果・活動報告・ご支援ページに光沢シマー付きで掲出。',
      },
      {
        number: 2,
        x: 50,
        y: 52,
        tier: 'silver',
        label: 'シルバー枠との比較（標準ロゴ）',
        spotTitle: 'シルバー協賛（年額 ¥30,000・400×120px）',
        spotNote: '標準サイズロゴ＋キャッチコピー。ホバー時の枠線強調・ズーム演出付き。',
      },
      {
        number: 3,
        x: 50,
        y: 86,
        tier: 'bronze',
        label: 'ブロンズ枠との比較（社名リンク）',
        spotTitle: 'ブロンズ協賛（年額 ¥10,000・画像不要）',
        spotNote: '企業名・店舗名と公式サイトリンクを1年間掲出する手軽な応援枠。',
      },
    ],
  },
  {
    id: 'look-gold-michinoku',
    indexLabel: '02',
    code: 'GOLD PARTNER / ¥50,000',
    companyName: 'みちのく水産フーズ株式会社（見本）',
    industry: '水産加工・食品メーカー',
    title: 'ゴールド協賛 掲載見本②',
    subtitle: '主要全ページ優先掲出・ワイドスライド対応',
    description:
      '八戸の地元企業・OB企業様の信頼感を最大限に伝えるゴールド枠。大会速報やOB会イベント時にアクセスが集まるトップ最上位で1年間継続表示されます。',
    image: 'assets/images/sponsors/ad-gold-michinoku.jpg',
    imageAlt: 'ゴールド協賛 掲載見本 みちのく水産フーズ株式会社',
    featuredTier: 'gold',
    tierPriceLabel: '年額 ¥50,000',
    usageTag: '主要全ページ掲出・ワイド表示',
    pins: [
      {
        number: 1,
        x: 50,
        y: 18,
        tier: 'gold',
        label: '大型ワイドバナー＋光沢シマー',
        spotTitle: 'ゴールド協賛（年額 ¥50,000）',
        spotNote: '全プラン中で最大サイズ・最上位ポジションに優先配置されます。',
      },
      {
        number: 2,
        x: 50,
        y: 56,
        tier: 'silver',
        label: '標準ロゴバナー枠',
        spotTitle: 'シルバー協賛（年額 ¥30,000）',
        spotNote: 'トップ・活動報告・ご支援ページにロゴと一言PRを掲出。',
      },
      {
        number: 3,
        x: 50,
        y: 85,
        tier: 'bronze',
        label: 'テキストリンク協賛枠',
        spotTitle: 'ブロンズ協賛（年額 ¥10,000）',
        spotNote: 'ロゴデータ不要。社名とURLだけで最短掲出が可能です。',
      },
    ],
  },
  {
    id: 'look-silver-sports',
    indexLabel: '03',
    code: 'SILVER PARTNER / ¥30,000',
    companyName: '北東北スポーツギア（見本）',
    industry: 'スポーツ用品・野球専門店',
    title: 'シルバー協賛 掲載見本①',
    subtitle: '標準ロゴバナー（400×120）＋ホバーズーム演出',
    description:
      '企業ロゴと40文字以内の応援キャッチコピーをセットで掲出する定番プラン。ホバー時のネイビー枠線強調と緩やかな浮き上がり演出で、洗練された印象を与えます。',
    image: 'assets/images/sponsors/ad-silver-sports.jpg',
    imageAlt: 'シルバー協賛 掲載見本 北東北スポーツギア',
    featuredTier: 'silver',
    tierPriceLabel: '年額 ¥30,000',
    usageTag: '標準ロゴ枠・ホバーズーム演出',
    pins: [
      {
        number: 1,
        x: 50,
        y: 22,
        tier: 'silver',
        label: 'SILVER 標準ロゴバナー＋一言PR',
        spotTitle: 'シルバー協賛（年額 ¥30,000・400×120px）',
        spotNote: 'トップ・活動報告・ご支援ページ・協賛一覧の4エリアへ掲出。',
      },
      {
        number: 2,
        x: 50,
        y: 54,
        tier: 'gold',
        label: '上位ゴールド枠へアップグレード',
        spotTitle: 'ゴールド協賛（年額 ¥50,000・720×200px）',
        spotNote: 'さらに大きいワイドサイズ＋光沢シマー演出で最上位に表示。',
      },
      {
        number: 3,
        x: 50,
        y: 86,
        tier: 'bronze',
        label: 'ブロンズ協賛（テキスト枠）',
        spotTitle: 'ブロンズ協賛（年額 ¥10,000）',
        spotNote: 'バナー画像なし・テキストリンクのみで気軽に協賛可能。',
      },
    ],
  },
  {
    id: 'look-silver-clinic',
    indexLabel: '04',
    code: 'SILVER PARTNER / ¥30,000',
    companyName: '八戸ウエスト整形外科（見本）',
    industry: '医療機関・スポーツ整形',
    title: 'シルバー協賛 掲載見本②',
    subtitle: '清潔感ある白×シルバー枠・複数ページ掲出',
    description:
      '医療機関・士業・地域サービス業様にも最適な、落ち着いた白基調×シルバー枠デザイン。ロゴ画像をメールで送るだけで事務局が綺麗に配置いたします。',
    image: 'assets/images/sponsors/ad-silver-clinic.jpg',
    imageAlt: 'シルバー協賛 掲載見本 八戸ウエスト整形外科',
    featuredTier: 'silver',
    tierPriceLabel: '年額 ¥30,000',
    usageTag: 'ロゴ＋応援メッセージ・4エリア掲出',
    pins: [
      {
        number: 1,
        x: 50,
        y: 24,
        tier: 'silver',
        label: 'ロゴ＆応援メッセージ枠',
        spotTitle: 'シルバー協賛（年額 ¥30,000）',
        spotNote: 'メール送付いただいたロゴ画像を事務局確認のうえ1年間掲出。',
      },
      {
        number: 2,
        x: 50,
        y: 56,
        tier: 'gold',
        label: '最上位ワイドバナー枠',
        spotTitle: 'ゴールド協賛（年額 ¥50,000）',
        spotNote: '試合結果ページを含む主要全ページの最上位エリアに優先表示。',
      },
      {
        number: 3,
        x: 50,
        y: 86,
        tier: 'bronze',
        label: 'テキストリンク枠',
        spotTitle: 'ブロンズ協賛（年額 ¥10,000）',
        spotNote: 'トップページ協賛エリア・協賛企業一覧に社名リンクを掲出。',
      },
    ],
  },
  {
    id: 'look-gold-sanriku',
    indexLabel: '05',
    code: 'GOLD PARTNER / ¥50,000',
    companyName: '三陸モビリティ株式会社（見本）',
    industry: '自動車販売・地域モビリティ',
    title: 'ゴールド協賛 掲載見本③',
    subtitle: 'ナイター照明のように目を引く最上位プレミアム枠',
    description:
      '大型720×200pxワイドバナーと光沢シマー演出の組み合わせで、訪問者の視線を自然と惹きつけます。1年間を通して八戸西野球部の公式ゴールドパートナーとして紹介されます。',
    image: 'assets/images/sponsors/ad-gold-sanriku.jpg',
    imageAlt: 'ゴールド協賛 掲載見本 三陸モビリティ株式会社',
    featuredTier: 'gold',
    tierPriceLabel: '年額 ¥50,000',
    usageTag: '公式ゴールドパートナー・最上位枠',
    pins: [
      {
        number: 1,
        x: 50,
        y: 18,
        tier: 'gold',
        label: '最上位プレミアムワイド枠',
        spotTitle: 'ゴールド協賛（年額 ¥50,000）',
        spotNote: '光沢シマー演出・ワイド表示・主要全ページ優先掲出のすべてに対応。',
      },
      {
        number: 2,
        x: 50,
        y: 56,
        tier: 'silver',
        label: '標準ロゴバナー枠',
        spotTitle: 'シルバー協賛（年額 ¥30,000）',
        spotNote: 'コストと視認性のバランスに優れた400×120pxロゴ枠。',
      },
      {
        number: 3,
        x: 50,
        y: 86,
        tier: 'bronze',
        label: 'ブロンズ応援リンク枠',
        spotTitle: 'ブロンズ協賛（年額 ¥10,000）',
        spotNote: '社名・店舗名のテキストリンク掲出で1年間応援。',
      },
    ],
  },
  {
    id: 'look-bronze-kabushima',
    indexLabel: '06',
    code: 'BRONZE PARTNER / ¥10,000',
    companyName: '蕪島ベーカリー＆カフェ（見本）',
    industry: '地域飲食店・個人店舗',
    title: 'ブロンズ協賛 掲載見本',
    subtitle: '画像制作不要・社名＆公式サイトリンクで1年間応援',
    description:
      '地元の飲食店様やOB経営の店舗様でも気軽にご参加いただける年額10,000円プラン。バナー画像の制作や入稿は不要で、お申込み後すぐにご掲出いただけます。',
    image: 'assets/images/sponsors/ad-bronze-kabushima.jpg',
    imageAlt: 'ブロンズ協賛 掲載見本 蕪島ベーカリー＆カフェ',
    featuredTier: 'bronze',
    tierPriceLabel: '年額 ¥10,000',
    usageTag: '画像不要・テキストリンク1年間掲出',
    pins: [
      {
        number: 1,
        x: 50,
        y: 22,
        tier: 'bronze',
        label: 'BRONZE 画像不要・テキストリンク枠',
        spotTitle: 'ブロンズ協賛（年額 ¥10,000）',
        spotNote: 'バナー画像不要。企業・店舗名と公式サイトURLを1年間掲出。',
      },
      {
        number: 2,
        x: 50,
        y: 55,
        tier: 'silver',
        label: 'ロゴ画像を載せたい方はシルバーへ',
        spotTitle: 'シルバー協賛（年額 ¥30,000）',
        spotNote: 'ロゴ画像（400×120px）と一言PRを複数ページに掲出。',
      },
      {
        number: 3,
        x: 50,
        y: 84,
        tier: 'gold',
        label: '最上位ワイド掲出はゴールドへ',
        spotTitle: 'ゴールド協賛（年額 ¥50,000）',
        spotNote: '大型720×200pxワイドバナー＋光沢シマー演出で最上位表示。',
      },
    ],
  },
];

@Component({
  selector: 'app-sponsor-runway',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sponsor-runway.component.html',
  styleUrls: ['./sponsor-runway.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorRunwayComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() selectedTier: SponsorTier = 'silver';
  @Output() selectPlan = new EventEmitter<SponsorTier>();

  @ViewChild('stageEl') stageEl?: ElementRef<HTMLDivElement>;

  readonly looks = BASEBALL_LOOKS;
  readonly plans = SPONSOR_PLANS;
  private readonly isBrowser: boolean;

  // カルーセル状態
  readonly activeIndex = signal<number>(0);
  readonly isPaused = signal<boolean>(false);
  readonly isHovering = signal<boolean>(false);
  readonly isZoomOpen = signal<boolean>(false);
  readonly activePinNumber = signal<number | null>(1);
  readonly progressPercent = signal<number>(0);
  readonly isMobileViewport = signal<boolean>(false);
  readonly isReducedMotion = signal<boolean>(false);
  readonly isDragging = signal<boolean>(false);

  // カスタムカーソル状態
  readonly cursorVisible = signal<boolean>(false);
  readonly cursorX = signal<number>(0);
  readonly cursorY = signal<number>(0);
  readonly cursorMode = signal<'drag' | 'view'>('drag');

  // 描画用の3Dリング計算結果
  readonly renderedLooks = signal<RenderedLookState[]>([]);

  // アクティブなルック・選択プラン
  readonly currentLook = computed(() => this.looks[this.activeIndex()]);
  readonly highlightedTier = signal<SponsorTier>('gold');
  readonly highlightedPlan = computed<SponsorPlanConfig>(() => {
    const t = this.highlightedTier();
    return this.plans.find((p) => p.id === t) ?? this.plans[1];
  });

  // スプリング物理用内部変数
  private currentFloat = 0;
  private targetFloat = 0;
  private velocity = 0;
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private autoplayElapsed = 0;
  private readonly autoplayDuration = 5000;

  // ドラッグ操作用
  private pointerDown = false;
  private pointerStartX = 0;
  private pointerStartTarget = 0;
  private pointerMoved = false;

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private readonly ngZone: NgZone
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.highlightedTier.set(this.looks[0].featuredTier);
    this.updateRenderedLooks(0);

    if (this.isBrowser) {
      this.checkViewport();
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.isReducedMotion.set(mq.matches);
      if (mq.matches) {
        this.isPaused.set(true);
      }
    }
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.lastFrameTime = performance.now();
    this.ngZone.runOutsideAngular(() => {
      const tick = (now: number) => {
        const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
        this.lastFrameTime = now;
        this.stepPhysics(dt);
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    });
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (!this.isBrowser) return;
    this.checkViewport();
    this.updateRenderedLooks(this.currentFloat);
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (this.isZoomOpen() && event.key === 'Escape') {
      this.closeZoom();
      return;
    }
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (event.key === 'ArrowRight') {
      this.step(1);
    } else if (event.key === 'ArrowLeft') {
      this.step(-1);
    }
  }

  private checkViewport(): void {
    this.isMobileViewport.set(window.innerWidth < 768);
  }

  private stepPhysics(dt: number): void {
    const shouldAutoplay =
      !this.isPaused() &&
      !this.isHovering() &&
      !this.isZoomOpen() &&
      !this.pointerDown &&
      !this.isReducedMotion();

    if (shouldAutoplay) {
      this.autoplayElapsed += dt * 1000;
      const pct = Math.min(100, (this.autoplayElapsed / this.autoplayDuration) * 100);
      if (Math.abs(pct - this.progressPercent()) > 0.6) {
        this.ngZone.run(() => this.progressPercent.set(pct));
      }
      if (this.autoplayElapsed >= this.autoplayDuration) {
        this.autoplayElapsed = 0;
        this.ngZone.run(() => this.step(1, false));
      }
    }

    const stiffness = this.pointerDown ? 180 : 95;
    const damping = this.pointerDown ? 24 : 18;
    const diff = this.targetFloat - this.currentFloat;

    if (Math.abs(diff) > 0.0005 || Math.abs(this.velocity) > 0.0005) {
      const accel = diff * stiffness - this.velocity * damping;
      this.velocity += accel * dt;
      this.currentFloat += this.velocity * dt;
      this.ngZone.run(() => this.updateRenderedLooks(this.currentFloat));
    } else if (this.currentFloat !== this.targetFloat) {
      this.currentFloat = this.targetFloat;
      this.velocity = 0;
      this.ngZone.run(() => this.updateRenderedLooks(this.currentFloat));
    }
  }

  private updateRenderedLooks(pos: number): void {
    const count = this.looks.length;
    const isMobile = this.isMobileViewport();
    const reduced = this.isReducedMotion();

    const states: RenderedLookState[] = this.looks.map((look, i) => {
      let delta = ((i - pos) % count + count) % count;
      if (delta > count / 2) delta -= count;

      if (isMobile) {
        const absD = Math.abs(delta);
        const xPct = delta * 66;
        const yPct = absD * 5;
        const scale = Math.max(0.58, 1 - absD * 0.18);
        const opacity = Math.max(0, 1 - absD * 0.42);
        const blur = reduced ? 0 : Math.min(5, absD * 2.2);
        const zIndex = Math.round(50 - absD * 10);

        return {
          look,
          index: i,
          transform: `translate3d(${xPct.toFixed(2)}%, ${yPct.toFixed(2)}%, 0) scale(${scale.toFixed(3)})`,
          opacity: Number(opacity.toFixed(3)),
          filter: blur > 0.15 ? `blur(${blur.toFixed(1)}px)` : 'none',
          zIndex,
          isFront: absD < 0.35,
        };
      }

      const angle = (delta / count) * Math.PI * 2;
      const sinA = Math.sin(angle);
      const cosA = Math.cos(angle);
      const depth = (cosA + 1) / 2;

      const radiusX = 42;
      const xPct = sinA * radiusX;
      const yPct = (1 - depth) * -6;
      const scale = 0.56 + depth * 0.44;
      const opacity = 0.2 + Math.pow(depth, 1.45) * 0.8;
      const blur = reduced ? 0 : (1 - depth) * 7.5;
      const zIndex = Math.round(depth * 60) + 10;

      return {
        look,
        index: i,
        transform: `translate3d(${xPct.toFixed(2)}%, ${yPct.toFixed(2)}%, 0) scale(${scale.toFixed(3)})`,
        opacity: Number(opacity.toFixed(3)),
        filter: blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : 'none',
        zIndex,
        isFront: Math.abs(delta) < 0.35,
      };
    });

    this.renderedLooks.set(states);
  }

  private normalizeIndex(val: number): number {
    const n = this.looks.length;
    return ((Math.round(val) % n) + n) % n;
  }

  private syncActiveFromTarget(): void {
    const idx = this.normalizeIndex(this.targetFloat);
    this.activeIndex.set(idx);
    const look = this.looks[idx];
    this.highlightedTier.set(look.featuredTier);
    const matchingPin = look.pins.find((p) => p.tier === look.featuredTier);
    this.activePinNumber.set(matchingPin ? matchingPin.number : 1);
  }

  step(delta: number, resetProgress = true): void {
    this.targetFloat = Math.round(this.targetFloat) + delta;
    this.syncActiveFromTarget();
    if (resetProgress) {
      this.autoplayElapsed = 0;
      this.progressPercent.set(0);
    }
  }

  goToIndex(index: number): void {
    const n = this.looks.length;
    const currentIdx = this.normalizeIndex(this.targetFloat);
    let diff = index - currentIdx;
    if (diff > n / 2) diff -= n;
    if (diff < -n / 2) diff += n;
    this.targetFloat = Math.round(this.targetFloat) + diff;
    this.syncActiveFromTarget();
    this.autoplayElapsed = 0;
    this.progressPercent.set(0);
  }

  togglePause(): void {
    this.isPaused.update((v) => !v);
  }

  onStagePointerDown(event: PointerEvent): void {
    if (this.isZoomOpen()) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;

    // コントロールボタン・枠ピンを見るボタン上のクリックはドラッグに吸わせない
    const targetEl = event.target as HTMLElement | null;
    if (targetEl?.closest('.rw-controls, .rw-view-trigger, .rw-zoom')) {
      return;
    }

    this.pointerDown = true;
    this.pointerMoved = false;
    this.pointerStartX = event.clientX;
    this.pointerStartTarget = this.targetFloat;
    this.isDragging.set(true);
    (event.currentTarget as HTMLElement)?.setPointerCapture?.(event.pointerId);
  }

  onStagePointerMove(event: PointerEvent): void {
    const targetEl = event.target as HTMLElement | null;
    const overControls = !!targetEl?.closest('.rw-controls, .rw-view-trigger, .rw-zoom');

    if (this.stageEl && event.pointerType === 'mouse' && !this.isMobileViewport()) {
      if (overControls) {
        this.cursorVisible.set(false);
      } else {
        const rect = this.stageEl.nativeElement.getBoundingClientRect();
        const relX = event.clientX - rect.left;
        const relY = event.clientY - rect.top;
        this.cursorX.set(relX);
        this.cursorY.set(relY);
        this.cursorVisible.set(true);

        const centerDist = Math.abs(relX - rect.width / 2);
        this.cursorMode.set(centerDist < rect.width * 0.22 ? 'view' : 'drag');
      }
    }

    if (!this.pointerDown || this.isZoomOpen()) return;
    const dx = event.clientX - this.pointerStartX;
    if (Math.abs(dx) > 6) {
      this.pointerMoved = true;
    }
    const sensitivity = this.isMobileViewport() ? 180 : 240;
    this.targetFloat = this.pointerStartTarget - dx / sensitivity;
  }

  onStagePointerUp(event: PointerEvent): void {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    this.isDragging.set(false);
    (event.currentTarget as HTMLElement)?.releasePointerCapture?.(event.pointerId);

    if (this.pointerMoved) {
      this.targetFloat = Math.round(this.targetFloat);
      this.syncActiveFromTarget();
      this.autoplayElapsed = 0;
      this.progressPercent.set(0);
    }
  }

  onStagePointerLeave(): void {
    this.cursorVisible.set(false);
    this.isHovering.set(false);
  }

  onStagePointerEnter(): void {
    this.isHovering.set(true);
  }

  onLookClick(state: RenderedLookState, event: MouseEvent): void {
    event.stopPropagation();
    if (this.pointerMoved) return;

    if (state.isFront) {
      this.openZoom();
    } else {
      this.goToIndex(state.index);
    }
  }

  openZoom(event?: MouseEvent): void {
    event?.stopPropagation();
    this.isZoomOpen.set(true);
    this.cursorVisible.set(false);
    const look = this.currentLook();
    const matchingPin = look.pins.find((p) => p.tier === this.highlightedTier());
    this.activePinNumber.set(matchingPin ? matchingPin.number : 1);
  }

  closeZoom(): void {
    this.isZoomOpen.set(false);
  }

  selectPin(pin: RunwayPin): void {
    this.activePinNumber.set(pin.number);
    this.highlightedTier.set(pin.tier);
  }

  selectTierInPanel(tier: SponsorTier): void {
    this.highlightedTier.set(tier);
    // 左の3Dリングも該当プランの代表的な見本へ自然に回転させる
    if (this.currentLook().featuredTier !== tier) {
      const targetIdx = this.looks.findIndex((l) => l.featuredTier === tier);
      if (targetIdx >= 0) {
        this.goToIndex(targetIdx);
        this.highlightedTier.set(tier);
      }
    }
    const matchingPin = this.currentLook().pins.find((p) => p.tier === tier);
    if (matchingPin) {
      this.activePinNumber.set(matchingPin.number);
    }
  }

  getPlanByTier(tier: SponsorTier): SponsorPlanConfig {
    return this.plans.find((p) => p.id === tier) ?? this.plans[1];
  }

  applyHighlightedPlan(): void {
    this.isZoomOpen.set(false);
    this.selectPlan.emit(this.highlightedTier());
  }

  applySpecificPlan(tier: SponsorTier, event: MouseEvent): void {
    event.stopPropagation();
    this.highlightedTier.set(tier);
    this.isZoomOpen.set(false);
    this.selectPlan.emit(tier);
  }
}
