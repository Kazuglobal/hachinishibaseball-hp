import { Injectable, signal, computed, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../environments/environment';

export interface MembershipFeeRecord {
  id: string;
  name: string;
  period: string;
  year: number;
  amount: number;
  message?: string;
  createdAt: string;
  isDemo?: boolean;
  sessionId?: string;
}

export interface CreateMembershipCheckoutPayload {
  name: string;
  period: string;
  year: number;
  message?: string;
}

const DEMO_STORAGE_KEY = 'hachinishi_membership_fee_demo_v1';
export const MEMBERSHIP_FEE_AMOUNT = 5000;
export const MEMBERSHIP_VIDEO_PATH = '/assets/videos/membership-thankyou.mp4';
export const MEMBERSHIP_VIDEO_FILENAME = 'membership-thankyou.mp4';

@Injectable({
  providedIn: 'root',
})
export class MembershipFeeService {
  private readonly isBrowser: boolean;
  private readonly serverRecords = signal<MembershipFeeRecord[]>([]);
  private readonly demoRecords = signal<MembershipFeeRecord[]>([]);

  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);

  /** サーバー記録済み＋ローカルデモの納入者一覧（新しい順、sessionId/id で重複排除） */
  readonly allOnlineRecords = computed<MembershipFeeRecord[]>(() => {
    const server = this.serverRecords();
    const demo = this.demoRecords();
    const seen = new Set<string>();
    const merged: MembershipFeeRecord[] = [];

    for (const item of [...demo, ...server]) {
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

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.demoRecords.set(this.readDemoFromStorage());
    }
  }

  async loadRecords(): Promise<void> {
    if (!this.isBrowser) return;
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const url = `${environment.gasWebAppUrl}?type=membership_fee`;
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data && data.success && Array.isArray(data.records)) {
        const parsed: MembershipFeeRecord[] = data.records
          .filter(
            (r: Record<string, unknown>) =>
              r && typeof r['name'] === 'string' && String(r['name']).trim().length > 0
          )
          .map((r: Record<string, unknown>, idx: number) => ({
            id: String(r['sessionId'] || r['id'] || `mf-srv-${idx}`),
            sessionId: r['sessionId'] ? String(r['sessionId']) : undefined,
            name: String(r['name']).trim(),
            period: String(r['period'] || 'OB').trim(),
            year: Number(r['year']) || new Date().getFullYear(),
            amount: Number(r['amount']) || MEMBERSHIP_FEE_AMOUNT,
            message: r['message'] ? String(r['message']) : '',
            createdAt: String(r['createdAt'] || new Date().toISOString()),
            isDemo: false,
          }));
        const existing = this.serverRecords();
        const seen = new Set<string>();
        const merged: MembershipFeeRecord[] = [];
        for (const item of [...existing, ...parsed]) {
          const key = item.sessionId || item.id;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }
        this.serverRecords.set(merged);
      }
    } catch {
      // GAS未更新時でも既存の一覧・デモ体験を問題なく動作させる
      this.loadError.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createCheckoutSession(
    payload: CreateMembershipCheckoutPayload
  ): Promise<{ url?: string; error?: string; notConfigured?: boolean }> {
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentType: 'membership_fee',
          category: 'membership_fee',
          name: payload.name,
          period: payload.period,
          year: payload.year,
          quantity: 1,
          message: payload.message || '',
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return {
          notConfigured: true,
          error:
            '現在ローカル環境またはStripe API未設定のため、決済画面へ接続できません。「演出をデモ体験する」ボタンからムービー再生とユニフォーム自動表示をお試しいただけます。',
        };
      }

      const data = await res.json();
      if (!res.ok) {
        return {
          notConfigured: res.status === 503,
          error:
            data.error ||
            'Stripe決済セッションの作成に失敗しました。しばらくしてからお試しください。',
        };
      }
      return { url: data.url };
    } catch {
      return {
        notConfigured: true,
        error:
          'Stripe決済APIに接続できませんでした。ローカル環境では「演出をデモ体験する」ボタンから動作をご確認いただけます。',
      };
    }
  }

  async verifyCheckoutSession(
    sessionId: string
  ): Promise<{ record?: MembershipFeeRecord; error?: string }> {
    try {
      const res = await fetch(
        `/api/verify-checkout-session?session_id=${encodeURIComponent(sessionId)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { error: err.error || '決済の確認に失敗しました。' };
      }
      const data = await res.json();
      if (data.success && data.donation) {
        const d = data.donation;
        const verified: MembershipFeeRecord = {
          id: String(d.sessionId || d.id),
          sessionId: d.sessionId ? String(d.sessionId) : undefined,
          name: String(d.name || '匿名OB'),
          period: String(d.period || 'OB'),
          year: Number(d.year) || new Date().getFullYear(),
          amount: Number(d.amount) || MEMBERSHIP_FEE_AMOUNT,
          message: d.message ? String(d.message) : '',
          createdAt: String(d.createdAt || new Date().toISOString()),
          isDemo: false,
        };

        const current = this.serverRecords();
        const exists = current.some(
          (item) =>
            (verified.sessionId && item.sessionId === verified.sessionId) ||
            item.id === verified.id
        );
        if (!exists) {
          this.serverRecords.set([verified, ...current]);
        }
        return { record: verified };
      }
      return { error: data.error || '決済が完了していません。' };
    } catch {
      return { error: '決済確認中に通信エラーが発生しました。' };
    }
  }

  addDemoPayment(payload: CreateMembershipCheckoutPayload): MembershipFeeRecord {
    const record: MembershipFeeRecord = {
      id: `mf-demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: payload.name.trim(),
      period: payload.period.trim(),
      year: payload.year,
      amount: MEMBERSHIP_FEE_AMOUNT,
      message: (payload.message || '').trim(),
      createdAt: new Date().toISOString(),
      isDemo: true,
    };

    const updated = [record, ...this.demoRecords()];
    this.demoRecords.set(updated);
    this.saveDemoToStorage(updated);
    return record;
  }

  clearDemoPayments(): void {
    this.demoRecords.set([]);
    if (this.isBrowser) {
      try {
        localStorage.removeItem(DEMO_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }

  hasUserDemoPayments(): boolean {
    return this.demoRecords().length > 0;
  }

  private readDemoFromStorage(): MembershipFeeRecord[] {
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveDemoToStorage(items: MembershipFeeRecord[]): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
    } catch {
      // ignore
    }
  }
}
