import { Component, ChangeDetectionStrategy, CUSTOM_ELEMENTS_SCHEMA, OnInit, AfterViewInit, inject, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { filter } from 'rxjs';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';

interface Donor {
  period: string;
  names: string[];
}

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, FormsModule, SectionTitleComponent, BackButtonComponent],
  templateUrl: './support.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SupportComponent implements OnInit, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  isVisible = signal(true);

  // 昨年の入金者一覧
  donors: Donor[] = [
    { period: '1期', names: ['大久保 雅人 様', '霞 牧広 様'] },
    { period: '2期', names: ['田名部 和人 様'] },
    { period: '3期', names: ['笹山 浩之 様', '工藤 都朗 様'] },
    { period: '5期', names: ['鈴木 徳彦 様'] },
    { period: '6期', names: ['中村 和浩 様'] },
    { period: '10期', names: ['助川 淳二 様', '沼田 傑慎 様'] },
    { period: '11期', names: ['尾崎 昌孝 様'] },
    { period: '13期', names: ['木村 浩二 様', '沼田 匡弘 様'] },
    { period: '14期', names: ['池田 義仁 様'] },
    { period: '16期', names: ['岩織 美幸 様'] },
    { period: '19期', names: ['佐藤 真二 様'] },
    { period: '20期', names: ['澤井 優聖 様', '前田 涼子 様'] },
    { period: '23期', names: ['下館 健利 様'] },
    { period: '24期', names: ['齋藤 昌宏 様'] },
    { period: '25期', names: ['小川 貴史 様'] },
    { period: '26期', names: ['菅原 英人 様'] },
    { period: '27期', names: ['土峰 直樹 様'] },
    { period: '29期', names: ['今川 泰伸 様'] },
    { period: '32期', names: ['林野 智 様'] },
    { period: '41期', names: ['佐々木 琢磨 様'] },
    { period: '43期', names: ['三浦 颯斗 様'] },
    { period: '46期', names: ['三浦 滉斗 様', '菊地 凜 様'] }
  ];

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

  // GAS Web App URL（実際のURLに置き換えてください）
  private readonly GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwrFlZnWu0rwYNQ2z-CC7TUQYo2Dod-vh3CcNHbGRqqN2Glgc_xE6eTiXxBu5OVpFB0/exec';

  ngOnInit() {
    // ルーティング変更時にフラグメントを処理
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        setTimeout(() => {
          this.scrollToFragment();
        }, 100);
      });

    // 初回ロード時のフラグメント処理
    setTimeout(() => {
      this.scrollToFragment();
    }, 100);
  }

  ngAfterViewInit() {
    // ビュー初期化後にフラグメントを処理（確実に要素が存在する）
    setTimeout(() => {
      this.scrollToFragment();
    }, 300);
  }

  private scrollToFragment() {
    const fragment = this.route.snapshot.fragment;
    if (fragment) {
      setTimeout(() => {
        const element = document.getElementById(fragment);
        if (element) {
          // ヘッダーの高さを考慮してスクロール
          const headerOffset = 100;
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }, 200);
    }
  }

  async onSubmitParticipation() {
    if (!this.participationForm.name || !this.participationForm.period || !this.participationForm.email) {
      this.submitError.set('必須項目を入力してください。');
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    try {
      // JSON形式で送信（GASスクリプトでJSON.parseを使用）
      const payload = {
        name: this.participationForm.name,
        period: this.participationForm.period,
        email: this.participationForm.email,
        phone: this.participationForm.phone || '',
        attendance: this.participationForm.attendance,
        remarks: this.participationForm.remarks || '',
        timestamp: new Date().toISOString()
      };

      console.log('Sending data to GAS:', payload);
      console.log('GAS URL:', this.GAS_WEB_APP_URL);

      // GAS Web Appに送信（application/x-www-form-urlencoded形式で送信）
      // この形式はGASで最も確実に動作します
      const formData = new URLSearchParams();
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
      this.participationForm = {
        name: '',
        period: '',
        email: '',
        phone: '',
        attendance: '出席',
        remarks: ''
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


