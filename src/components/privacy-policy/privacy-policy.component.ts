import { Component, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { SEOService } from '../../services/seo.service';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [CommonModule, RouterLink, SectionTitleComponent, BackButtonComponent],
  templateUrl: './privacy-policy.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicyComponent implements OnInit {
  private seoService = inject(SEOService);

  ngOnInit() {
    this.seoService.updateSEO({
      title: 'プライバシーポリシー | 八戸西高校 | 八戸西高等学校',
      description: '八戸西高校（八戸西高等学校）野球部OB会公式サイトのプライバシーポリシーです。個人情報の取り扱いについて説明しています。',
      keywords: '八戸西高校,八戸西高等学校,プライバシーポリシー,個人情報保護方針',
      url: 'https://hachinohenishibaseball.com/privacy-policy'
    });

    // ページの一番上にスクロール
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}

