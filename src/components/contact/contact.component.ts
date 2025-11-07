import { Component, ChangeDetectionStrategy, OnInit, inject, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule, SectionTitleComponent, BackButtonComponent],
  templateUrl: './contact.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  isVisible = signal(true);

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

  // GAS Web App URL（実際のURLに置き換えてください）
  private readonly GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzyCDimerLrk72zhc2_FYoSgHqypF0iNVdeucuuHkpr8oDePq-7_o_TTXhUpRkpg_Rr/exec';

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

    this.isSubmitting.set(true);
    this.submitError.set(null);

    try {
      const payload = {
        name: this.contactForm.name,
        email: this.contactForm.email,
        phone: this.contactForm.phone || '',
        subject: this.contactForm.subject || '',
        message: this.contactForm.message,
        timestamp: new Date().toISOString()
      };

      console.log('Sending contact data to GAS:', payload);
      console.log('GAS URL:', this.GAS_WEB_APP_URL);

      // GAS Web Appに送信（application/x-www-form-urlencoded形式で送信）
      const formData = new URLSearchParams();
      formData.append('name', payload.name);
      formData.append('email', payload.email);
      formData.append('phone', payload.phone);
      formData.append('subject', payload.subject);
      formData.append('message', payload.message);
      formData.append('timestamp', payload.timestamp);

      const response = await fetch(this.GAS_WEB_APP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      // レスポンスを確認
      if (response.ok) {
        const result = await response.json();
        console.log('GAS response:', result);
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
      console.error('送信エラー:', error);
      this.submitError.set('送信に失敗しました。しばらくしてから再度お試しください。');
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

