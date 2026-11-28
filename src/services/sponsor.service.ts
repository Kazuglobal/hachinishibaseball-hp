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
    englishName: 'BRONZE PARTNER',
    price: 10000,
    periodLabel: '年額（1年間掲載）',
    formatSummary: 'テキストリンク枠（企業・店舗名＋公式サイトリンク）',
    motionSummary: 'ホバー時の下線・ネイビー強調',
    placementSummary: 'トップページ協賛エリア・協賛企業一覧ページ',
    recommendedImageSize: '画像不要（テキスト掲出）',
    features: [
      '企業名・店舗名および公式サイトへのリンク掲出',
      '掲載期間：掲載開始日から1年間',
      'ロゴ・バナー画像の制作不要ですぐに掲載可能',
    ],
  },
  {
    id: 'silver',
    name: 'シルバー協賛',
    englishName: 'SILVER PARTNER',
    price: 30000,
    periodLabel: '年額（1年間掲載）',
    formatSummary: '標準ロゴバナー枠＋一言キャッチコピー',
    motionSummary: 'ホバー時の枠線強調・緩やかなズーム演出',
    placementSummary: 'トップページ協賛エリア・活動報告・ご支援ページ・協賛一覧',
    recommendedImageSize: '推奨 400 × 120 px（PNG / JPG）',
    features: [
      'ロゴまたはバナー画像（400×120px推奨）の掲出',
      '一言キャッチコピー（最大40文字）および公式サイトリンク',
      '複数ページ（トップ・活動報告・ご支援ページ等）に掲載',
    ],
  },
  {
    id: 'gold',
    name: 'ゴールド協賛',
    englishName: 'GOLD PARTNER',
    price: 50000,
    periodLabel: '年額（1年間掲載）',
    formatSummary: '大型ワイドバナー枠＋紹介文・優先掲出',
    motionSummary: '上品な光沢シマー演出・ワイドスライド切替表示',
    placementSummary: 'トップページ最上位協賛枠・試合結果・活動報告・ご支援ページ',
    recommendedImageSize: '推奨 720 × 200 px（PNG / JPG）',
    features: [
      '最上位エリアでの大型ワイドバナー（720×200px推奨）優先掲出',
      '上品な光沢シマー演出および自動スライド表示に対応',
      '主要全ページ（トップ・試合結果・活動報告・ご支援）に掲載',
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
