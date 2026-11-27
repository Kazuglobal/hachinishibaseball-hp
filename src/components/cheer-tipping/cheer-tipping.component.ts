import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  computed,
  PLATFORM_ID,
  Inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { SEOService } from '../../services/seo.service';
import { environment } from '../../environments/environment';
import {
  CheerTipService,
  CheerDonation,
  BALL_CHEER_CONFIG,
} from '../../services/cheer-tip.service';

@Component({
  selector: 'app-cheer-tipping',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    SectionTitleComponent,
    BackButtonComponent,
  ],
  templateUrl: './cheer-tipping.component.html',
  styleUrls: ['./cheer-tipping.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheerTippingComponent implements OnInit {
  readonly cheerService = inject(CheerTipService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seoService = inject(SEOService);
  private readonly isBrowser: boolean;

  readonly ballConfig = BALL_CHEER_CONFIG;
  readonly isProduction = environment.production;
  readonly quantityOptions = [1, 2, 3];
  readonly periodPresets = ['OB・OG', '保護者', '一般支援者', '10期', '20期', '30期', '40期', '48期'];
  readonly flyingBallIndexes = [0, 1, 2, 3, 4, 5];

  // フォーム状態
  donorName = signal<string>('');
  donorPeriod = signal<string>('');
  quantity = signal<number>(1);
  donorMessage = signal<string>('');

  // ボール表裏プレビュー切替（'logo' = 青森県立八戸西高等学校面 / 'team' = 円陣写真面）
  ballSide = signal<'logo' | 'team'>('logo');

  // UI状態
  isProcessing = signal<boolean>(false);
  isVerifying = signal<boolean>(false);
  isDownloading = signal<boolean>(false);
  formError = signal<string | null>(null);
  statusNotice = signal<string | null>(null);
  newlyAddedId = signal<string | null>(null);
  selectedDetail = signal<CheerDonation | null>(null);

  // ムービー演出＆記念ボール進呈モーダル状態
  celebrationDonation = signal<CheerDonation | null>(null);
  isVideoMuted = signal<boolean>(true);
  videoMissing = signal<boolean>(false);
  practiceVideoMissing = signal<boolean>(false);
  readonly practiceVideoPath = '/assets/videos/cheer-practice.mp4';
  activeCelebrationVideo = signal<'practice' | 'ball3d'>('practice');

  readonly totalAmount = computed(() => this.quantity() * 500);
  readonly donations = computed(() => this.cheerService.allDonations());
  readonly previewName = computed(() => this.donorName().trim() || '八戸 太郎');
  readonly previewPeriod = computed(() => this.donorPeriod().trim() || '32期');

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.seoService.updateSEO({
      title: '現役応援 記念ボール寄付 | 八戸西高校野球部OB会',
      description:
        '1口500円から八戸西高校野球部の練習球を支援！ご寄付いただくと、Blender 3D記念ボール演出とともに「青森県立八戸西高等学校 記念ボール（お名前・回期入り）」を進呈・保存いただけます。',
      keywords:
        '八戸西高校,八戸西高校野球部,OB会,応援,投げ銭,寄付,500円,記念ボール,練習球支援',
      url: 'https://hachinohenishibaseball.com/cheer',
    });

    if (this.isBrowser) {
      this.cheerService.loadDonations();
      this.handleStripeReturnParams();
    }
  }

  private async handleStripeReturnParams(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const status = params.get('status');
    const sessionId = params.get('session_id');

    if (status === 'cancelled') {
      this.statusNotice.set('お支払いがキャンセルされました。再度お手続きいただけます。');
      this.clearQueryParams();
      return;
    }

    if (status === 'success' && sessionId) {
      this.isVerifying.set(true);
      this.formError.set(null);
      const result = await this.cheerService.verifyCheckoutSession(sessionId);
      this.isVerifying.set(false);
      this.clearQueryParams();

      if (result.donation) {
        this.newlyAddedId.set(result.donation.id);
        this.openCelebration(result.donation);
      } else if (result.error) {
        this.formError.set(result.error);
      }
    }
  }

  private clearQueryParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });
  }

  toggleBallSide(): void {
    this.ballSide.set(this.ballSide() === 'logo' ? 'team' : 'logo');
  }

  applyPeriodPreset(preset: string): void {
    this.donorPeriod.set(preset);
  }

  onVideoError(): void {
    this.videoMissing.set(true);
  }

  onPracticeVideoError(): void {
    this.practiceVideoMissing.set(true);
  }

  onCelebrationVideoEnded(): void {
    // 練習ムービー再生終了後、Blender 3D記念ボール動画があれば自動で連続再生
    if (this.activeCelebrationVideo() === 'practice' && !this.videoMissing()) {
      this.activeCelebrationVideo.set('ball3d');
    }
  }

  private validateForm(): boolean {
    if (!this.donorName().trim()) {
      this.formError.set('記念ボールに刻むお名前を入力してください。');
      return false;
    }
    if (!this.donorPeriod().trim()) {
      this.formError.set('回期（例：32期）または立場（例：保護者・一般）を入力してください。');
      return false;
    }
    this.formError.set(null);
    return true;
  }

  async startCheckout(): Promise<void> {
    if (!this.validateForm()) return;

    this.isProcessing.set(true);
    this.statusNotice.set(null);

    const res = await this.cheerService.createCheckoutSession({
      name: this.donorName().trim(),
      period: this.donorPeriod().trim(),
      category: 'batting',
      quantity: this.quantity(),
      message: this.donorMessage().trim(),
    });

    this.isProcessing.set(false);

    if (res.url && this.isBrowser) {
      window.location.href = res.url;
      return;
    }

    if (res.error) {
      this.formError.set(res.error);
    }
  }

  triggerDemoDonation(): void {
    const name = this.donorName().trim() || '八戸 太郎';
    const period = this.donorPeriod().trim() || '32期';
    this.formError.set(null);
    this.statusNotice.set(null);

    const demoItem = this.cheerService.addDemoDonation({
      name,
      period,
      category: 'batting',
      quantity: this.quantity(),
      message:
        this.donorMessage().trim() ||
        '甲子園目指して頑張れ！OB一同応援しています！',
    });

    this.newlyAddedId.set(demoItem.id);
    this.openCelebration(demoItem);
  }

  openCelebration(donation: CheerDonation): void {
    this.activeCelebrationVideo.set(this.practiceVideoMissing() ? 'ball3d' : 'practice');
    this.celebrationDonation.set(donation);
  }

  closeCelebration(scrollToWall = false): void {
    this.celebrationDonation.set(null);
    if (scrollToWall && this.isBrowser) {
      setTimeout(() => {
        const el = document.getElementById('cheer-wall');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 120);
    }
  }

  toggleMute(): void {
    this.isVideoMuted.set(!this.isVideoMuted());
  }

  openDetail(donation: CheerDonation): void {
    this.selectedDetail.set(donation);
  }

  closeDetail(): void {
    this.selectedDetail.set(null);
  }

  clearDemoItems(): void {
    this.cheerService.clearDemoDonations();
    this.newlyAddedId.set(null);
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  getSerialNumber(donation: CheerDonation): string {
    const list = this.donations();
    const idx = list.findIndex((item) => item.id === donation.id);
    const num = idx >= 0 ? list.length - idx : 1;
    return `HN-${String(num).padStart(4, '0')}`;
  }

  /**
   * 寄付者専用の「八戸西記念ボール（お名前・回期・シリアルNo.入り）」PNG画像を生成してダウンロード
   */
  async downloadMemorialBall(donation: CheerDonation): Promise<void> {
    if (!this.isBrowser || this.isDownloading()) return;
    this.isDownloading.set(true);

    try {
      const size = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 背景グラデーション（八戸西ネイビー×スタジアムスポットライト）
      const bg = ctx.createRadialGradient(size * 0.5, size * 0.32, 60, size * 0.5, size * 0.5, size * 0.78);
      bg.addColorStop(0, '#0c3f82');
      bg.addColorStop(0.55, '#002454');
      bg.addColorStop(1, '#020c1f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);

      // ゴールド枠線
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
      ctx.lineWidth = 6;
      ctx.strokeRect(28, 28, size - 56, size - 56);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(42, 42, size - 84, size - 84);

      // 上部タイトル
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.font = '700 26px "Noto Sans JP", sans-serif';
      ctx.fillText('HACHINISHI BASEBALL ALUMNI MEMORIAL BALL', size / 2, 102);

      ctx.fillStyle = '#ffffff';
      ctx.font = '800 42px "Noto Serif JP", serif';
      ctx.fillText('青森県立八戸西高等学校 野球部OB会', size / 2, 158);

      // 実物記念ボール画像（表面・裏面）を読み込み
      const [logoImg, teamImg] = await Promise.all([
        this.loadImage('/assets/images/hachinishi-ball-logo.png'),
        this.loadImage('/assets/images/hachinishi-ball-team.png'),
      ]);

      // メインボール（表面）＋サブボール（裏面）を描画
      if (logoImg) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 42;
        ctx.shadowOffsetY = 20;
        ctx.drawImage(logoImg, size * 0.16, 210, 440, 440);
        ctx.restore();
      }
      if (teamImg) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 36;
        ctx.shadowOffsetY = 18;
        ctx.drawImage(teamImg, size * 0.52, 260, 350, 350);
        ctx.restore();
      }

      // 支援者ネームプレート
      const plateY = 695;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.beginPath();
      ctx.roundRect(110, plateY, size - 220, 235, 24);
      ctx.fill();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 回期バッジ
      ctx.fillStyle = '#B31B1B';
      ctx.beginPath();
      ctx.roundRect(size / 2 - 110, plateY + 24, 220, 44, 22);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 24px "Noto Sans JP", sans-serif';
      ctx.fillText(donation.period, size / 2, plateY + 55);

      // 支援者氏名
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 54px "Noto Sans JP", sans-serif';
      ctx.fillText(`${donation.name} 様`, size / 2, plateY + 132);

      // 球数・シリアル・日付
      ctx.fillStyle = '#fde68a';
      ctx.font = '700 24px "Noto Sans JP", sans-serif';
      ctx.fillText(
        `応援球数：${donation.quantity}球（¥${donation.amount.toLocaleString()}）  ｜  No. ${this.getSerialNumber(donation)}`,
        size / 2,
        plateY + 182
      );

      if (donation.message) {
        ctx.fillStyle = '#dbeafe';
        ctx.font = '500 22px "Noto Sans JP", sans-serif';
        const msg =
          donation.message.length > 34
            ? donation.message.slice(0, 34) + '…'
            : donation.message;
        ctx.fillText(`「${msg}」`, size / 2, plateY + 218);
      }

      // フッター
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '500 20px "Noto Sans JP", sans-serif';
      ctx.fillText(
        `発行日：${this.formatDate(donation.createdAt)}  ／  hachinohenishibaseball.com`,
        size / 2,
        995
      );

      const link = document.createElement('a');
      const safeName = donation.name.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'supporter';
      link.download = `hachinishi-memorial-ball-${safeName}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      this.isDownloading.set(false);
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
}
