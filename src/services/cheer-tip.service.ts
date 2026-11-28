import { Injectable, signal, computed, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../environments/environment';

export type CheerCategory = 'batting';

export interface CheerCategoryConfig {
  id: CheerCategory;
  title: string;
  shortTitle: string;
  subtitle: string;
  description: string;
  itemName: string;
  itemUnit: string;
  videoPath: string;
  videoFileName: string;
  accentColor: string;
  badgeClass: string;
  unitAmount: number;
}

export interface CheerDonation {
  id: string;
  name: string;
  period: string;
  category: CheerCategory;
  amount: number;
  quantity: number;
  message?: string;
  createdAt: string;
  isDemo?: boolean;
  sessionId?: string;
}

export interface CreateCheckoutPayload {
  name: string;
  period: string;
  category: CheerCategory;
  quantity: number;
  message?: string;
}

export const BALL_CHEER_CONFIG: CheerCategoryConfig = {
  id: 'batting',
  title: '八戸西高校 記念ボール寄付（球の応援）',
  shortTitle: '記念ボール',
  subtitle: '現役選手の練習球・バッティング支援（1口 500円〜）',
  description:
    '現役部員の打撃練習・硬式球を支援できます。ご寄付いただくと、Blender 3D 演出ムービーとともに「青森県立八戸西高等学校 記念ボール（あなたのお名前・回期入り）」を進呈・保存でき、応援ウォールにも自動で並びます。',
  itemName: '八戸西記念ボール',
  itemUnit: '球',
  videoPath: '/assets/videos/hachinishi-ball.mp4',
  videoFileName: 'hachinishi-ball.mp4',
  accentColor: '#002D62',
  badgeClass: 'bg-[#002D62] text-white',
  unitAmount: 500,
};

const DEMO_STORAGE_KEY = 'hachinishi_cheer_demo_donations_v2';

const SAMPLE_DONATIONS: CheerDonation[] = [
  {
    id: 'sample-1',
    name: '山田 太郎（サンプル）',
    period: '10期',
    category: 'batting',
    amount: 500,
    quantity: 1,
    message: '一球一球を大切に、夏に向けて振り抜け！',
    createdAt: '2026-11-15T09:00:00.000Z',
    isDemo: true,
  },
  {
    id: 'sample-2',
    name: '佐藤 花子（サンプル）',
    period: '30期',
    category: 'batting',
    amount: 1000,
    quantity: 2,
    message: '甲子園を目指して全力で練習に励んでください！応援しています。',
    createdAt: '2026-11-16T12:30:00.000Z',
    isDemo: true,
  },
  {
    id: 'sample-3',
    name: '八戸 一郎（サンプル）',
    period: '20期',
    category: 'batting',
    amount: 500,
    quantity: 1,
    message: '八戸西の誇りを胸に、グラウンドで思い切りプレーしてください！',
    createdAt: '2026-11-18T18:15:00.000Z',
    isDemo: true,
  },
];

@Injectable({
  providedIn: 'root',
})
export class CheerTipService {
  private readonly isBrowser: boolean;
  private readonly serverDonations = signal<CheerDonation[]>([]);
  private readonly demoDonations = signal<CheerDonation[]>([]);

  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);
  readonly config = BALL_CHEER_CONFIG;

  readonly allDonations = computed<CheerDonation[]>(() => {
    const server = this.serverDonations();
    const demo = this.demoDonations();
    const base = server.length > 0 ? server : SAMPLE_DONATIONS;
    const seen = new Set<string>();
    const merged: CheerDonation[] = [];

    for (const item of [...demo, ...base]) {
      if (item.category !== 'batting') continue;
      const key = item.sessionId || item.id;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }

    return merged.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });

  readonly stats = computed(() => {
    const list = this.allDonations();
    const totalBalls = list.reduce((acc, d) => acc + (d.quantity || 1), 0);
    const totalAmount = list.reduce((acc, d) => acc + (d.amount || 500), 0);
    return {
      totalSupporters: list.length,
      totalBalls,
      totalAmount,
    };
  });

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.demoDonations.set(this.readDemoFromStorage());
    }
  }

  async loadDonations(): Promise<void> {
    if (!this.isBrowser) return;
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const url = `${environment.gasWebAppUrl}?type=cheer_tips`;
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data && data.success && Array.isArray(data.donations)) {
        const parsed: CheerDonation[] = data.donations
          .filter(
            (d: Record<string, unknown>) =>
              d &&
              typeof d['name'] === 'string' &&
              (!d['category'] || d['category'] === 'batting')
          )
          .map((d: Record<string, unknown>, idx: number) => ({
            id: String(d['sessionId'] || d['id'] || `srv-${idx}`),
            sessionId: d['sessionId'] ? String(d['sessionId']) : undefined,
            name: String(d['name']),
            period: String(d['period'] || 'OB'),
            category: 'batting' as const,
            amount: Number(d['amount']) || 500,
            quantity: Number(d['quantity']) || 1,
            message: d['message'] ? String(d['message']) : '',
            createdAt: String(d['createdAt'] || new Date().toISOString()),
            isDemo: false,
          }));
        this.serverDonations.set(parsed);
      }
    } catch {
      this.loadError.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createCheckoutSession(
    payload: CreateCheckoutPayload
  ): Promise<{ url?: string; error?: string; notConfigured?: boolean }> {
    try {
      const res = await fetch('/api/create-cheer-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, category: 'batting' }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return {
          notConfigured: true,
          error:
            '現在オンライン決済の準備中です。しばらくしてから再度お試しください。',
        };
      }

      const data = await res.json();
      if (!res.ok) {
        return {
          notConfigured: res.status === 503,
          error:
            data.error ||
            '決済セッションの作成に失敗しました。しばらくしてからお試しください。',
        };
      }
      return { url: data.url };
    } catch {
      return {
        notConfigured: true,
        error:
          '決済APIに接続できませんでした。しばらくしてから再度お試しください。',
      };
    }
  }

  async verifyCheckoutSession(
    sessionId: string
  ): Promise<{ donation?: CheerDonation; error?: string }> {
    try {
      const res = await fetch(
        `/api/verify-cheer-checkout?session_id=${encodeURIComponent(sessionId)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { error: err.error || '決済の確認に失敗しました。' };
      }
      const data = await res.json();
      if (data.success && data.donation) {
        const verified: CheerDonation = {
          ...data.donation,
          category: 'batting',
          isDemo: false,
        };
        const current = this.serverDonations();
        const exists = current.some(
          (item) =>
            item.sessionId === verified.sessionId || item.id === verified.id
        );
        if (!exists) {
          this.serverDonations.set([verified, ...current]);
        }
        return { donation: verified };
      }
      return { error: data.error || '決済が完了していません。' };
    } catch {
      return { error: '決済確認中に通信エラーが発生しました。' };
    }
  }

  addDemoDonation(payload: CreateCheckoutPayload): CheerDonation {
    const item: CheerDonation = {
      id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: payload.name.trim(),
      period: payload.period.trim(),
      category: 'batting',
      quantity: payload.quantity,
      amount: payload.quantity * 500,
      message: (payload.message || '').trim(),
      createdAt: new Date().toISOString(),
      isDemo: true,
    };

    const updated = [item, ...this.demoDonations()];
    this.demoDonations.set(updated);
    this.saveDemoToStorage(updated);
    return item;
  }

  clearDemoDonations(): void {
    this.demoDonations.set([]);
    if (this.isBrowser) {
      try {
        localStorage.removeItem(DEMO_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }

  hasUserDemoDonations(): boolean {
    return this.demoDonations().length > 0;
  }

  private readDemoFromStorage(): CheerDonation[] {
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveDemoToStorage(items: CheerDonation[]): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
    } catch {
      // ignore
    }
  }
}
