import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-works',
  templateUrl: './works.component.html',
  imports: [SectionTitleComponent, ObserveVisibilityDirective, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksComponent {
  sectionVisible = signal(false);
  works = [
    { image: 'https://picsum.photos/seed/activity1/800/600', category: 'イベントレポート', title: '2024年度 OB会総会を開催しました', delay: '' },
    { image: 'https://picsum.photos/seed/activity2/800/600', category: '支援活動', title: '現役選手へ練習用具を寄贈', delay: 'delay-200' },
    { image: 'https://picsum.photos/seed/activity3/800/600', category: '交流会', title: 'OB・現役交流戦を実施', delay: 'delay-400' },
    { image: 'https://picsum.photos/seed/activity4/800/600', category: 'イベントレポート', title: '夏の大会に向けた激励会', delay: '' },
    { image: 'https://picsum.photos/seed/activity5/800/600', category: '支援活動', title: 'OB会によるグラウンド整備', delay: 'delay-200' },
    { image: 'https://picsum.photos/seed/activity6/800/600', category: 'その他', title: 'OB会会報誌 第10号発行', delay: 'delay-400' },
  ];
}