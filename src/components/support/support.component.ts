import { Component, ChangeDetectionStrategy, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';

interface Donor {
  period: string;
  names: string[];
}

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, SectionTitleComponent, BackButtonComponent],
  templateUrl: './support.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SupportComponent implements OnInit {
  private route = inject(ActivatedRoute);
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

  ngOnInit() {
    // フラグメントがcreditの場合、スクロールして表示
    this.route.fragment.subscribe(fragment => {
      if (fragment === 'credit') {
        setTimeout(() => {
          const element = document.getElementById('credit');
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      }
    });
  }
}


