import {
  Component,
  ChangeDetectionStrategy,
  CUSTOM_ELEMENTS_SCHEMA,
  OnInit,
  inject,
  signal,
  computed,
  ChangeDetectorRef,
  PLATFORM_ID,
  Inject,
} from '@angular/core';
import { CommonModule, NgOptimizedImage, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { MiniUniformComponent } from '../shared/mini-uniform/mini-uniform.component';
import { environment } from '../../environments/environment';
import { SEOService } from '../../services/seo.service';
import {
  MembershipFeeService,
  MembershipFeeRecord,
  MEMBERSHIP_FEE_AMOUNT,
  MEMBERSHIP_VIDEO_PATH,
  MEMBERSHIP_VIDEO_FILENAME,
} from '../../services/membership-fee.service';

interface Donor {
  period: string;
  names: string[];
}

export interface UniformDonorItem {
  id: string;
  name: string;
  period: string;
  year: number;
  amount: number;
  message?: string;
  createdAt?: string;
  isDemo?: boolean;
  isOnline?: boolean;
}

/** GAS側が success:false を返したことを示すエラー（メッセージは画面に表示してよい内容） */
class ServerRejectedError extends Error {}

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SectionTitleComponent,
    BackButtonComponent,
    MiniUniformComponent,
    RouterLink,
    NgOptimizedImage,
  ],
  templateUrl: './support.component.html',
  styleUrls: ['./support.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SupportComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private seoService = inject(SEOService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly membershipService = inject(MembershipFeeService);
  private readonly isBrowser: boolean;

  readonly membershipFeeAmount = MEMBERSHIP_FEE_AMOUNT;
  readonly membershipVideoPath = MEMBERSHIP_VIDEO_PATH;
  readonly membershipVideoFileName = MEMBERSHIP_VIDEO_FILENAME;
  readonly periodPresets = ['1期', '10期', '20期', '30期', '40期', '48期', '49期', 'OB・OG'];
  readonly confettiIndexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  // 2024年の支援者一覧
  donors: Donor[] = [
    { period: '1期', names: ['今川 一 様', '大久保 雅人 様', '霞 牧広 様', '豊川 寛一 様', '田名部 秀代 様'] },
    { period: '2期', names: ['田名部 和人 様', '天間 昭悦 様', '佐藤 幸子 様', '大下 貴禎 様'] },
    { period: '3期', names: ['笹山 浩之 様', '工藤 郁朗 様', '西 志紀 様', '三浦 俊司 様', '八田 恭章 様', '坂本 光慈 様', '貝吹 尚寿 様', '渡辺 雅人 様', '沼畑 伸光 様', '大山 茂 様'] },
    { period: '5期', names: ['鈴木 徳彦 様'] },
    { period: '6期', names: ['中村 和浩 様'] },
    { period: '9期', names: ['菊地 武広 様', '高嶋 勝幸 様'] },
    { period: '10期', names: ['助川 淳二 様', '沼田 傑慎 様', '榎本 直行 様', '上村 賢悦 様'] },
    { period: '11期', names: ['尾崎 昌孝 様'] },
    { period: '12期', names: ['後村 英徳 様'] },
    { period: '13期', names: ['木村 浩二 様', '沼田 匡弘 様', '三浦 智樹 様'] },
    { period: '14期', names: ['池田 義仁 様'] },
    { period: '16期', names: ['岩織 美幸 様'] },
    { period: '19期', names: ['佐藤 真二 様'] },
    { period: '20期', names: ['澤井 優聖 様', '前田 涼子 様', '藤ヶ森 涼子 様'] },
    { period: '21期', names: ['中村 渉 様'] },
    { period: '23期', names: ['下館 健利 様'] },
    { period: '24期', names: ['齋藤 昌宏 様'] },
    { period: '25期', names: ['小川 貴史 様', '佐藤 泰正 様'] },
    { period: '26期', names: ['菅原 英人 様', '石倉 睦子 様'] },
    { period: '29期', names: ['今川 泰伸 様'] },
    { period: '30期', names: ['小泉 章宏 様'] },
    { period: '32期', names: ['林野 智 様'] },
    { period: '35期', names: ['石郷岡 浩紀 様'] },
    { period: '36期', names: ['田島 雅大 様'] },
    { period: '41期', names: ['佐々木 琢磨 様'] },
    { period: '43期', names: ['三浦 颯斗 様'] },
    { period: '46期', names: ['三浦 滉斗 様', '菊地 凜 様'] },
    { period: '48期', names: ['沖田 佑平 様', '工藤 柊也 様', '田中 我空 様', '山田 晃大 様', '駒澤 綸輝 様', '鳥谷部 凌輔 様'] }
  ];

  // 2024年の一覧は初期状態で非表示（ボタンで開閉）
  showDonors2024 = signal(false);

  // 2025年の支援者一覧
  donors2025: Donor[] = [
    { period: '1期', names: ['今川 一 様', '木村 光秀 様'] },
    { period: '2期', names: ['天間 昭悦 様', '佐藤 幸子 様'] },
    { period: '3期', names: ['西 志紀 様', '八田 恭章 様', '五戸 秀治 様', '貝吹 尚寿 様', '三浦 俊司 様', '沼畑 伸光 様'] },
    { period: '8期', names: ['西山 圭一 様'] },
    { period: '9期', names: ['高嶋 勝幸 様', '菊地 武広 様'] },
    { period: '10期', names: ['榎本 直行 様', '上村 賢悦 様'] },
    { period: '11期', names: ['尾崎 昌孝 様'] },
    { period: '12期', names: ['後村 英徳 様'] },
    { period: '18期', names: ['松館 隆一 様'] },
    { period: '20期', names: ['澤井 優聖 様'] },
    { period: '21期', names: ['中村 渉 様'] },
    { period: '25期', names: ['佐藤 泰正 様'] },
    { period: '30期', names: ['讃岐 洋平 様'] },
    { period: '31期', names: ['日当 裕一 様'] },
    { period: '33期', names: ['上野 衆 様'] },
    { period: '35期', names: ['石郷岡 浩紀 様'] },
    { period: '46期', names: ['菊地 凛 様'] },
    { period: '48期', names: ['田中 咲多 様'] },
    {
      period: '49期',
      names: [
        '佐々木 優斗 様',
        '久野 太粋 様',
        '向山 翔琉 様',
        '荒木 絢斗 様',
        '木村 駿介 様',
        '福田 泰匡 様',
        '類家 結仁 様',
        '川崎 耀瑛 様',
        '小谷地 心 様',
        '高渕 柊汰 様',
        '敦賀 伊吹 様',
        '中塚 虎羽 様',
        '中村 龍澄 様',
        '福山 颯汰 様',
        '松村 快裡 様',
        '赤坂 和奏 様',
        '笹倉 未羽 様'
      ]
    }
  ];

  // ミニチュアユニフォーム用にフラット化した一覧
  readonly uniformDonors2025: UniformDonorItem[] = this.flattenDonors(this.donors2025, 2025);
  readonly uniformDonors2024: UniformDonorItem[] = this.flattenDonors(this.donors, 2024);

  // オンライン納入者（自動反映分）をユニフォームアイテムに変換
  readonly onlineUniformDonors = computed<UniformDonorItem[]>(() =>
    this.membershipService.allOnlineRecords().map((rec) => this.recordToUniformItem(rec))
  );

  // 年会費クレジットカード納入フォーム状態（投げ銭制度と同様のフロー）
  feeDonorName = signal<string>('');
  feeDonorPeriod = signal<string>('');
  feeDonorMessage = signal<string>('');
  isFeeProcessing = signal<boolean>(false);
  isFeeVerifying = signal<boolean>(false);
  feeFormError = signal<string | null>(null);
  feeStatusNotice = signal<string | null>(null);
  newlyAddedUniformId = signal<string | null>(null);

  // ムービー演出モーダル状態
  celebrationUniform = signal<UniformDonorItem | null>(null);
  isVideoMuted = signal<boolean>(true);
  videoMissing = signal<boolean>(false);

  readonly feePreviewName = computed(() => {
    const raw = this.feeDonorName().trim();
    return raw ? this.formatHonorificName(raw) : '八戸 太郎 様';
  });
  readonly feePreviewPeriod = computed(() => this.feeDonorPeriod().trim() || '32期');

  // OB会参加フォーム
  participationForm = {
    name: '',
    period: '',
    email: '',
    phone: '',
    attendance: '出席',
    remarks: ''
  };

  isSubmitting = signal(false);
  isSubmitted = signal(false);
  submitError = signal<string | null>(null);

  // GAS Web App URL（環境設定から取得。お問い合わせフォームと同一デプロイに統一）
  private readonly GAS_WEB_APP_URL = environment.gasWebAppUrl;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    // SEO設定
    this.seoService.updateSEO({
      title: 'ご支援のお願い | 八戸西高校 | 八戸西高等学校',
      description: '八戸西高校（八戸西高等学校）野球部OB会へのご支援をお願いします。現役チームへの支援、OB会への参加、寄付など、様々な形でご支援いただけます。八戸西高校野球部の活動を応援してください。',
      keywords: '八戸西高校,八戸西高等学校,八戸西高校野球部,野球部,OB会,支援,寄付,現役チーム支援,OB会参加,八戸西高校OB会,八戸西高校野球部支援',
      url: 'https://hachinohenishibaseball.com/support'
    });

    if (this.isBrowser) {
      this.membershipService.loadRecords();
      this.handleStripeReturnParams();
    }
  }

  private flattenDonors(list: Donor[], year: number): UniformDonorItem[] {
    const result: UniformDonorItem[] = [];
    list.forEach((group, gIdx) => {
      group.names.forEach((name, nIdx) => {
        result.push({
          id: `donor-${year}-${gIdx}-${nIdx}`,
          name,
          period: group.period,
          year,
          amount: MEMBERSHIP_FEE_AMOUNT,
          isOnline: false,
        });
      });
    });
    return result;
  }

  private formatHonorificName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return '';
    return trimmed.endsWith('様') ? trimmed : `${trimmed} 様`;
  }

  private recordToUniformItem(rec: MembershipFeeRecord): UniformDonorItem {
    return {
      id: rec.id,
      name: this.formatHonorificName(rec.name),
      period: rec.period,
      year: rec.year,
      amount: rec.amount,
      message: rec.message,
      createdAt: rec.createdAt,
      isDemo: rec.isDemo,
      isOnline: true,
    };
  }

  private async handleStripeReturnParams(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const status = params.get('status');
    const sessionId = params.get('session_id');

    if (status === 'cancelled') {
      this.feeStatusNotice.set('お支払いがキャンセルされました。再度お手続きいただけます。');
      this.clearQueryParams();
      return;
    }

    if (status === 'success' && sessionId) {
      this.isFeeVerifying.set(true);
      this.feeFormError.set(null);
      const result = await this.membershipService.verifyCheckoutSession(sessionId);
      this.isFeeVerifying.set(false);
      this.clearQueryParams();

      if (result.record) {
        const uniformItem = this.recordToUniformItem(result.record);
        this.newlyAddedUniformId.set(uniformItem.id);
        this.openCelebration(uniformItem);
      } else if (result.error) {
        this.feeFormError.set(result.error);
      }
      this.cdr.markForCheck();
    }
  }

  private clearQueryParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });
  }

  applyFeePeriodPreset(preset: string): void {
    this.feeDonorPeriod.set(preset);
  }

  private validateFeeForm(): boolean {
    if (!this.feeDonorName().trim()) {
      this.feeFormError.set('ユニフォームに表示するお名前を入力してください。');
      return false;
    }
    if (!this.feeDonorPeriod().trim()) {
      this.feeFormError.set('卒期（例：32期）を入力してください。');
      return false;
    }
    this.feeFormError.set(null);
    return true;
  }

  async startMembershipCheckout(): Promise<void> {
    if (!this.validateFeeForm()) return;

    this.isFeeProcessing.set(true);
    this.feeStatusNotice.set(null);

    const res = await this.membershipService.createCheckoutSession({
      name: this.feeDonorName().trim(),
      period: this.feeDonorPeriod().trim(),
      year: new Date().getFullYear(),
      message: this.feeDonorMessage().trim(),
    });

    this.isFeeProcessing.set(false);

    if (res.url && this.isBrowser) {
      window.location.href = res.url;
      return;
    }

    if (res.error) {
      this.feeFormError.set(res.error);
    }
    this.cdr.markForCheck();
  }

  triggerMembershipDemo(): void {
    const name = this.feeDonorName().trim() || '八戸 太郎';
    const period = this.feeDonorPeriod().trim() || '32期';
    this.feeFormError.set(null);
    this.feeStatusNotice.set(null);

    const demoRec = this.membershipService.addDemoPayment({
      name,
      period,
      year: new Date().getFullYear(),
      message:
        this.feeDonorMessage().trim() ||
        '現役選手の活躍を心より応援しています！',
    });

    const uniformItem = this.recordToUniformItem(demoRec);
    this.newlyAddedUniformId.set(uniformItem.id);
    this.openCelebration(uniformItem);
  }

  openCelebration(item: UniformDonorItem): void {
    this.celebrationUniform.set(item);
  }

  closeCelebration(scrollToWall = false): void {
    this.celebrationUniform.set(null);
    if (scrollToWall && this.isBrowser) {
      setTimeout(() => {
        const el = document.getElementById('uniform-wall');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 120);
    }
  }

  toggleMute(): void {
    this.isVideoMuted.set(!this.isVideoMuted());
  }

  onVideoError(): void {
    this.videoMissing.set(true);
  }

  clearDemoUniforms(): void {
    this.membershipService.clearDemoPayments();
    this.newlyAddedUniformId.set(null);
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  async onSubmitParticipation() {
    if (!this.participationForm.name || !this.participationForm.period || !this.participationForm.email) {
      this.submitError.set('必須項目を入力してください。');
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    try {
      const payload = {
        name: this.participationForm.name,
        period: this.participationForm.period,
        email: this.participationForm.email,
        phone: this.participationForm.phone || '',
        attendance: this.participationForm.attendance,
        remarks: this.participationForm.remarks || '',
        timestamp: new Date().toISOString()
      };

      const formData = new URLSearchParams();
      formData.append('formType', 'attendance');
      formData.append('event', 'reiwa9-general-meeting');
      formData.append('name', payload.name);
      formData.append('period', payload.period);
      formData.append('email', payload.email);
      formData.append('phone', payload.phone);
      formData.append('attendance', payload.attendance);
      formData.append('remarks', payload.remarks);
      formData.append('timestamp', payload.timestamp);

      const response = await fetch(this.GAS_WEB_APP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      if (response.ok) {
        const rawBody = await response.text();
        let result: { success?: boolean; error?: string };
        try {
          result = JSON.parse(rawBody);
        } catch {
          throw new Error('INVALID_RESPONSE');
        }
        if (!result.success) {
          throw new ServerRejectedError(result.error || '送信に失敗しました');
        }
      } else {
        throw new Error('HTTPエラー: ' + response.status);
      }

      this.isSubmitted.set(true);
      this.cdr.markForCheck();

      this.participationForm = {
        name: '',
        period: '',
        email: '',
        phone: '',
        attendance: '出席',
        remarks: ''
      };
    } catch (error) {
      if (!environment.production) {
        console.error('送信エラー:', error instanceof Error ? error.message : 'Unknown error');
      }
      const detail = error instanceof ServerRejectedError
        ? `（${error.message}）`
        : error instanceof Error && error.message === 'INVALID_RESPONSE'
          ? '（受付サーバーの応答が不正です。管理者へご連絡ください）'
          : error instanceof TypeError
            ? '（通信できませんでした。電波状況をご確認ください）'
            : '';
      this.submitError.set('送信に失敗しました。しばらくしてから再度お試しください。' + detail);
      this.cdr.markForCheck();
    } finally {
      this.isSubmitting.set(false);
      this.cdr.markForCheck();
    }
  }

  resetForm() {
    this.isSubmitted.set(false);
    this.submitError.set(null);
  }
}
