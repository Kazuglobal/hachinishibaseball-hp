import { Injectable, signal, computed, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../environments/environment';

export type SponsorTier = 'bronze' | 'silver' | 'gold';

export interface SponsorPlanConfig {
  id: SponsorTier;
  name: string;
  englishName: string;
  price: number;
  periodLabel: string;
  formatSummary: string;
  motionSummary: string;
  placementSummary: string;
  recommendedImageSize: string;
  features: string[];
}

export interface PublicSponsor {
  id: string;
  tier: SponsorTier;
  companyName: string;
  url: string;
  catchphrase: string;
  logoUrl?: string;
  startDate?: string;
  endDate?: string;
}

export interface SponsorCheckoutPayload {
  tier: SponsorTier;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  url: string;
  catchphrase?: string;
}

export const SPONSOR_PLANS: SponsorPlanConfig[] = [
  {
    id: 'bronze',
    name: 'ブロンズ協賛',
    englishName: 'Bronze',
    price: 10000,
    periodLabel: '年額（1年間掲載）',
    formatSummary: 'サムネイル画像＋社名・公式サイトリンク',
    motionSummary: '落ち着いたホバー強調',
    placementSummary: 'サイト最下部（フッター直上）・協賛一覧',
    recommendedImageSize: 'ロゴ・店舗写真（画像なしも可）',
    features: [
      'サイト最下部と協賛一覧に1年間掲出',
      'ロゴや店舗写真のサムネイル付きで社名・URLへリンク',
      '画像のご用意がない場合もテキストのみで掲出可能',
    ],
  },
  {
    id: 'silver',
    name: 'シルバー協賛',
    englishName: 'Silver',
    price: 30000,
    periodLabel: '年額（1年間掲載）',
    formatSummary: '標準広告＋業種・応援文（50字まで）',
    motionSummary: 'ホバー時の静かな浮き上がり演出',
    placementSummary: 'トップ中段（活動報告直下）・主要ページ',
    recommendedImageSize: '広告画像・ロゴ（PNG / JPG）',
    features: [
      'トップ中段と試合結果・活動報告ページに1年間掲出',
      '見切れのない広告画像に業種と応援文（50字まで）を併記',
      'OB・保護者・地域の方へ自然に届く定番プラン',
    ],
  },
  {
    id: 'gold',
    name: 'ゴールド協賛',
    englishName: 'Gold',
    price: 50000,
    periodLabel: '年額（1年間掲載）',
    formatSummary: '大型広告＋横の企業紹介解説（140字まで）',
    motionSummary: '上品な光沢シマー演出・トップ最上部',
    placementSummary: 'トップ最上部・主要全ページ優先掲出',
    recommendedImageSize: '大型広告ビジュアル（PNG / JPG）',
    features: [
      'トップ最上部（ファーストビュー直下）に1年間優先掲出',
      '広告の横に事業内容や応援の想いを伝える紹介解説付き',
      '試合結果・活動報告・ご支援を含む主要全ページへ掲載',
    ],
  },
];

@Injectable({
  providedIn: 'root',
})
export class SponsorService {
  private readonly isBrowser: boolean;
  private readonly loaded = signal<boolean>(false);

  readonly plans = SPONSOR_PLANS;
  readonly sponsors = signal<PublicSponsor[]>([]);
  readonly isLoading = signal<boolean>(false);

  readonly goldSponsors = computed(() =>
    this.sponsors().filter((s) => s.tier === 'gold')
  );
  readonly silverSponsors = computed(() =>
    this.sponsors().filter((s) => s.tier === 'silver')
  );
  readonly bronzeSponsors = computed(() =>
    this.sponsors().filter((s) => s.tier === 'bronze')
  );

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  getPlan(tier: SponsorTier): SponsorPlanConfig {
    return SPONSOR_PLANS.find((p) => p.id === tier) ?? SPONSOR_PLANS[0];
  }

  async loadSponsors(force = false): Promise<void> {
    if (!this.isBrowser) return;
    if (this.loaded() && !force) return;

    this.isLoading.set(true);
    try {
      const res = await fetch(`${environment.gasWebAppUrl}?type=sponsors`, {
        method: 'GET',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.success && Array.isArray(data.sponsors)) {
        const list: PublicSponsor[] = data.sponsors
          .filter(
            (item: Record<string, unknown>) =>
              item &&
              typeof item['companyName'] === 'string' &&
              (item['tier'] === 'gold' ||
                item['tier'] === 'silver' ||
                item['tier'] === 'bronze')
          )
          .map((item: Record<string, unknown>, idx: number) => ({
            id: String(item['id'] || `sp-${idx}`),
            tier: item['tier'] as SponsorTier,
            companyName: String(item['companyName']),
            url: this.sanitizeExternalUrl(String(item['url'] || '')),
            catchphrase: String(item['catchphrase'] || ''),
            logoUrl: this.sanitizeExternalUrl(String(item['logoUrl'] || '')),
            startDate: item['startDate'] ? String(item['startDate']) : undefined,
            endDate: item['endDate'] ? String(item['endDate']) : undefined,
          }));
        this.sponsors.set(list);
        this.loaded.set(true);
      }
    } catch {
      // GAS未更新時も静かに空配列で継続
    } finally {
      this.isLoading.set(false);
    }
  }

  async createSponsorCheckout(
    payload: SponsorCheckoutPayload
  ): Promise<{ url?: string; error?: string }> {
    try {
      const res = await fetch('/api/create-sponsor-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return { error: '現在オンライン決済の準備中です。お問い合わせフォームよりご連絡ください。' };
      }
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || '決済セッションの作成に失敗しました。' };
      }
      return { url: data.url };
    } catch {
      return { error: '通信エラーが発生しました。しばらくしてからお試しください。' };
    }
  }

  async verifySponsorCheckout(sessionId: string): Promise<{
    application?: {
      sessionId: string;
      tier: SponsorTier;
      companyName: string;
      amount: number;
      receiptUrl?: string;
    };
    error?: string;
  }> {
    try {
      const res = await fetch(
        `/api/verify-sponsor-checkout?session_id=${encodeURIComponent(sessionId)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        return { error: data.error || 'お支払いの確認に失敗しました。' };
      }
      return { application: data.application };
    } catch {
      return { error: '決済確認中に通信エラーが発生しました。' };
    }
  }

  private sanitizeExternalUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:') {
        return parsed.toString();
      }
    } catch {
      // invalid URL
    }
    return '';
  }
}
