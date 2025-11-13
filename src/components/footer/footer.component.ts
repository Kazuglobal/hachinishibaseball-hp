import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink]
})
export class FooterComponent {
  sitemap = [
    { title: '野球部について', links: ['会長挨拶'] },
    { title: '活動報告', links: ['イベントレポート', '支援活動'] },
    { title: '試合結果', links: ['公式戦', '練習試合'] },
    { title: '現役チームへ支援', links: [] },
    { title: 'お問い合わせ', links: [] }
  ];
}
