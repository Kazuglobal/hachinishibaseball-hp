import { Component, ChangeDetectionStrategy, OnInit, inject, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule, SectionTitleComponent, BackButtonComponent],
  templateUrl: './contact.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  // お問い合わせフォーム
  contactForm = {
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  };

  isSubmitting = signal(false);
  isSubmitted = signal(false);
  submitError = signal<string | null>(null);

  // GAS Web App URL（環境設定から取得）
  private readonly GAS_WEB_APP_URL = environment.gasWebAppUrl;

  // メールアドレスの正規表現パターン
  private readonly EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  ngOnInit() {
    // ページの一番上にスクロール
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  async onSubmitContact() {
    if (!this.contactForm.name || !this.contactForm.email || !this.contactForm.message) {
      this.submitError.set('必須項目を入力してください。');
      return;
    }

    // メールアドレスの形式を検証
    const trimmedEmail = this.contactForm.email.trim();
    if (!this.EMAIL_REGEX.test(trimmedEmail)) {
      this.submitError.set('有効なメールアドレスを入力してください。');
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    // タイムアウト制御用のAbortControllerとタイマーID
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      const payload = {
        name: this.contactForm.name,
        email: this.contactForm.email,
        phone: this.contactForm.phone || '',
        subject: this.contactForm.subject || '',
        message: this.contactForm.message,
        timestamp: new Date().toISOString()
      };

      // GAS Web Appに送信（application/x-www-form-urlencoded形式で送信）
      const formData = new URLSearchParams();
      formData.append('name', payload.name);
      formData.append('email', payload.email);
      formData.append('phone', payload.phone);
      formData.append('subject', payload.subject);
      formData.append('message', payload.message);
      formData.append('timestamp', payload.timestamp);

      // タイムアウトタイマーを開始
      timeoutId = setTimeout(() => {
        controller.abort();
      }, 10000); // 10秒でタイムアウト

      const response = await fetch(this.GAS_WEB_APP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString(),
        signal: controller.signal
      });

      // タイマーをクリア
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      // レスポンスを確認
      if (response.ok) {
        let result;
        try {
          result = await response.json();
        } catch (parseError) {
          // JSONパースに失敗した場合、生のレスポンスボディを取得
          const rawBody = await response.text();
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
          throw new Error(`レスポンスの解析に失敗しました: ${errorMessage}. レスポンスボディ: ${rawBody}`);
        }
        if (!result.success) {
          throw new Error(result.error || '送信に失敗しました');
        }
      } else {
        throw new Error('HTTPエラー: ' + response.status);
      }

      this.isSubmitted.set(true);
      this.cdr.markForCheck();
      
      // フォームをリセット
      this.contactForm = {
        name: '',
        email: '',
        phone: '',
        subject: '',
        message: ''
      };
    } catch (error) {
      // 開発環境でのみエラーログを出力（機密データは含めない）
      if (!environment.production) {
        console.error('送信エラー:', error instanceof Error ? error.message : 'Unknown error');
      }
      
      // タイムアウトエラーの場合はタイマーをクリア
      if (error instanceof Error && error.name === 'AbortError') {
        this.submitError.set('リクエストがタイムアウトしました。再度お試しください。');
      } else {
        this.submitError.set('送信に失敗しました。しばらくしてから再度お試しください。');
      }
      this.cdr.markForCheck();
    } finally {
      // タイマーを確実にクリア
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.isSubmitting.set(false);
      this.cdr.markForCheck();
    }
  }

  resetForm() {
    this.isSubmitted.set(false);
    this.submitError.set(null);
  }
}

