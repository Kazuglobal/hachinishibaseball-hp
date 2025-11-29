import { Component, ChangeDetectionStrategy, OnInit, AfterViewInit, inject, signal, computed, ChangeDetectorRef, PLATFORM_ID, Inject, effect } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { NgOptimizedImage } from '@angular/common';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';
import { AlumniVoiceService, AlumniVoice } from '../../services/alumni-voice.service';

@Component({
  selector: 'app-alumni-voice-detail',
  standalone: true,
  imports: [CommonModule, SectionTitleComponent, BackButtonComponent, NgOptimizedImage, RouterLink, ObserveVisibilityDirective],
  templateUrl: './alumni-voice-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlumniVoiceDetailComponent implements OnInit, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);
  private alumniVoiceService = inject(AlumniVoiceService);
  private isBrowser: boolean;
  isVisible = signal(false);

  // データはサービスから取得
  alumniVoice = signal<AlumniVoice | null>(null);
  currentVoiceIndex = signal<number>(-1);
  sortedVoices = computed(() => this.alumniVoiceService.getAllVoices()());

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);

    // データロード完了後にルートパラメータを処理
    effect(() => {
      if (this.alumniVoiceService.isDataLoaded()()) {
        this.loadVoiceFromRoute();
      }
    });
  }

  ngOnInit() {
    this.isVisible.set(true);

    // データがすでにロードされている場合は即座に処理
    if (this.alumniVoiceService.isDataLoaded()()) {
      this.loadVoiceFromRoute();
    }
  }

  /**
   * ルートパラメータから記事を読み込む
   */
  private loadVoiceFromRoute() {
    this.route.params.subscribe(params => {
      const id = params['id'];
      const foundVoice = this.alumniVoiceService.getVoiceById(id);

      if (foundVoice) {
        this.alumniVoice.set(foundVoice);
        const sorted = this.sortedVoices();
        const index = sorted.findIndex(v => v.id === id);
        this.currentVoiceIndex.set(index);
      } else {
        // 記事が見つからない場合はホームにリダイレクト
        this.router.navigate(['/']);
      }
      this.cdr.markForCheck();
    });
  }

  nextVoice = computed(() => {
    const currentIndex = this.currentVoiceIndex();
    const sorted = this.sortedVoices();
    if (currentIndex >= 0 && currentIndex < sorted.length - 1) {
      return sorted[currentIndex + 1];
    }
    return null;
  });

  /**
   * マークダウン形式のテキストをHTMLに変換
   * 画像マーカー [IMAGE:filename.jpg:caption] と見出しを処理
   */
  formatContent(content: string): SafeHtml {
    if (!content) return this.sanitizer.bypassSecurityTrustHtml('');

    let html = content
      // 画像マーカーを処理 [IMAGE:filename.jpg:caption]
      .replace(/\[IMAGE:([^:]+):([^\]]*)\]/g, (match, filename, caption) => {
        const imagePath = `/assets/images/${filename.trim()}`;
        const captionText = caption.trim();
        if (captionText) {
          return `<figure class="my-8 md:my-12 -mx-4 sm:mx-0">
            <div class="relative overflow-hidden bg-gray-100">
              <img
                src="${imagePath}"
                width="800"
                height="600"
                alt="${captionText}"
                loading="lazy"
                decoding="async"
                class="w-full h-auto max-h-[350px] sm:max-h-[450px] md:max-h-[500px] lg:max-h-[600px] object-cover">
            </div>
            <figcaption class="mt-3 px-4 sm:px-0 text-center text-xs sm:text-sm text-gray-600 italic">
              ${captionText}
            </figcaption>
          </figure>`;
        } else {
          return `<figure class="my-8 md:my-12 -mx-4 sm:mx-0">
            <div class="relative overflow-hidden bg-gray-100">
              <img
                src="${imagePath}"
                width="800"
                height="600"
                alt=""
                loading="lazy"
                decoding="async"
                class="w-full h-auto max-h-[350px] sm:max-h-[450px] md:max-h-[500px] lg:max-h-[600px] object-cover">
            </div>
          </figure>`;
        }
      })
      .replace(/### (.+)/g, '<h2 class="text-2xl md:text-3xl font-bold font-serif-jp text-gray-900 mt-16 mb-6 pb-4 border-b-2 border-gray-900">$1</h2>')
      .split('\n\n')
      .map(para => {
        const trimmed = para.trim();
        if (trimmed.startsWith('<h2') || trimmed.startsWith('<figure')) {
          return trimmed;
        }
        if (trimmed === '') {
          return '';
        }
        // 引用符で囲まれたテキストは通常のスタイルで表示
        const processedText = trimmed
          .replace(/\n/g, '<br>');
        return `<p class="mb-8 text-gray-700 leading-[1.9]">${processedText}</p>`;
      })
      .filter(p => p !== '')
      .join('');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  getFormattedContent(): SafeHtml {
    const voice = this.alumniVoice();
    if (!voice) return this.sanitizer.bypassSecurityTrustHtml('');
    return this.formatContent(voice.content);
  }

  ngAfterViewInit() {
    // ページ遷移時にページの上部にスクロール
    if (this.isBrowser) {
      setTimeout(() => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }, 100);
    }
  }
}
