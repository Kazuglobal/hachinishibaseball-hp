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
import { SponsorBannerStripComponent } from '../shared/sponsor-banner-strip/sponsor-banner-strip.component';
import { SEOService } from '../../services/seo.service';
import {
  SponsorService,
  SponsorTier,
  SPONSOR_PLANS,
} from '../../services/sponsor.service';

@Component({
  selector: 'app-sponsors',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    SectionTitleComponent,
    BackButtonComponent,
    SponsorBannerStripComponent,
  ],
  templateUrl: './sponsors.component.html',
  styleUrls: ['./sponsors.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorsComponent implements OnInit {
  readonly sponsorService = inject(SponsorService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seoService = inject(SEOService);
  private readonly isBrowser: boolean;

  readonly plans = SPONSOR_PLANS;

  // フォーム状態
  selectedTier = signal<SponsorTier>('silver');
  companyName = signal<string>('');
  contactName = signal<string>('');
  email = signal<string>('');
  phone = signal<string>('');
  url = signal<string>('');
  catchphrase = signal<string>('');

  // UI状態
  isProcessing = signal<boolean>(false);
  isVerifying = signal<boolean>(false);
  formError = signal<string | null>(null);
  statusNotice = signal<string | null>(null);
  completedApplication = signal<{
    sessionId: string;
    tier: SponsorTier;
    companyName: string;
    amount: number;
  } | null>(null);

  readonly selectedPlan = computed(() =>
    this.sponsorService.getPlan(this.selectedTier())
  );
  readonly previewCompany = computed(
    () => this.companyName().trim() || '株式会社サンプル商事'
  );
  readonly previewCatchphrase = computed(
    () =>
      this.catchphrase().trim() ||
      '地域の未来を担う八戸西高校野球部を応援しています。'
  );

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.seoService.updateSEO({
      title: '協賛・広告掲載のご案内 | 八戸西高校野球部OB会',
      description:
        '八戸西高等学校野球部OB会サイトの協賛・広告枠のご案内。ブロンズ（年額10,000円）・シルバー（年額30,000円）・ゴールド（年額50,000円）の3プランからお申込みいただけます。',
      keywords:
        '八戸西高校,八戸西高校野球部,OB会,協賛,広告掲載,スポンサー,パートナー募集',
      url: 'https://hachinohenishibaseball.com/sponsors',
    });

    if (this.isBrowser) {
      this.sponsorService.loadSponsors();
      this.handleStripeReturn();
    }
  }

  private async handleStripeReturn(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const status = params.get('status');
    const sessionId = params.get('session_id');

    if (status === 'cancelled') {
      this.statusNotice.set('お支払いがキャンセルされました。内容をご確認のうえ再度お手続きください。');
      this.clearQueryParams();
      return;
    }

    if (status === 'success' && sessionId) {
      this.isVerifying.set(true);
      this.formError.set(null);
      const res = await this.sponsorService.verifySponsorCheckout(sessionId);
      this.isVerifying.set(false);
      this.clearQueryParams();

      if (res.application) {
        this.completedApplication.set(res.application);
      } else if (res.error) {
        this.formError.set(res.error);
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

  selectTier(tier: SponsorTier): void {
    this.selectedTier.set(tier);
    this.formError.set(null);
  }

  getPlanName(tier: SponsorTier): string {
    return this.sponsorService.getPlan(tier).name;
  }

  async submitApplication(): Promise<void> {
    if (!this.companyName().trim()) {
      this.formError.set('企業・団体名を入力してください。');
      return;
    }
    if (!this.contactName().trim()) {
      this.formError.set('ご担当者様のお名前を入力してください。');
      return;
    }
    const emailVal = this.email().trim();
    if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      this.formError.set('有効なメールアドレスを入力してください。');
      return;
    }
    const urlVal = this.url().trim();
    if (urlVal && !/^https:\/\/.+/.test(urlVal)) {
      this.formError.set('リンク先URLは https:// から始まる形式で入力してください。');
      return;
    }

    this.formError.set(null);
    this.statusNotice.set(null);
    this.isProcessing.set(true);

    const res = await this.sponsorService.createSponsorCheckout({
      tier: this.selectedTier(),
      companyName: this.companyName().trim(),
      contactName: this.contactName().trim(),
      email: emailVal,
      phone: this.phone().trim(),
      url: urlVal,
      catchphrase: this.catchphrase().trim(),
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
}
