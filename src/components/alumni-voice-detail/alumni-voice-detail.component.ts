import { Component, ChangeDetectionStrategy, OnInit, AfterViewInit, inject, signal, computed, ChangeDetectorRef, PLATFORM_ID, Inject, effect } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { NgOptimizedImage } from '@angular/common';
import { AlumniVoiceService, AlumniVoice } from '../../services/alumni-voice.service';
import { SEOService } from '../../services/seo.service';

@Component({
  selector: 'app-alumni-voice-detail',
  standalone: true,
  imports: [CommonModule, BackButtonComponent, NgOptimizedImage, RouterLink],
  templateUrl: './alumni-voice-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlumniVoiceDetailComponent implements OnInit, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);
  private alumniVoiceService = inject(AlumniVoiceService);
  private seoService = inject(SEOService);
  private isBrowser: boolean;
  isVisible = signal(false);

  // データはサービスから取得
  alumniVoice = signal<AlumniVoice | null>(null);
  currentVoiceIndex = signal<number>(-1);
  sortedVoices = computed(() => this.alumniVoiceService.getAllVoices()());
  loadError = computed(() => this.alumniVoiceService.hasLoadError()());

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);

    // データロード完了後にルートパラメータを処理
    // （isDataLoaded()は「既にロード済み」の場合も初回実行時にtrueを返すため、
    // ngOnInit側で同じ処理を重複して呼ぶ必要はない）
    effect(() => {
      if (this.alumniVoiceService.isDataLoaded()()) {
        this.loadVoiceFromRoute();
      }
    });
  }

  ngOnInit() {
    this.isVisible.set(true);
  }

  /**
   * ルートパラメータから記事を読み込む
   */
  private loadVoiceFromRoute() {
    this.route.params.subscribe(params => {
      const id = params['id'];

      // データ読み込み自体に失敗している場合は、記事なしと誤認してホームへ飛ばさず
      // テンプレート側のエラー表示に委ねる
      if (this.alumniVoiceService.hasLoadError()()) {
        this.cdr.markForCheck();
        return;
      }

      const foundVoice = this.alumniVoiceService.getVoiceById(id);

      if (foundVoice) {
        this.alumniVoice.set(foundVoice);
        const sorted = this.sortedVoices();
        const index = sorted.findIndex(v => v.id === id);
        this.currentVoiceIndex.set(index);

        const plainContent = foundVoice.content.replace(/\[IMAGE:[^\]]*\]/g, '').replace(/###\s*/g, '').trim();
        const description = plainContent.length > 120
          ? `${plainContent.slice(0, 120)}…`
          : plainContent;

        this.seoService.updateSEO({
          title: `${foundVoice.title} | ALUMNI VOICE`,
          description,
          keywords: `八戸西高校,八戸西高等学校,八戸西高校野球部,OB活躍情報,ALUMNI VOICE,${foundVoice.generation}`,
          image: foundVoice.image.startsWith('http') ? foundVoice.image : `https://hachinohenishibaseball.com${foundVoice.image}`,
          url: `https://hachinohenishibaseball.com/alumni-voice/${foundVoice.id}`,
          type: 'article'
        });
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
   * HTML特殊文字をエスケープする（属性値・テキストへの生埋め込み用）
   */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * マークダウン形式のテキストをHTMLに変換
   * 画像マーカー [IMAGE:filename.jpg:caption] と見出しを処理
   */
  formatContent(content: string): SafeHtml {
    if (!content) return this.sanitizer.bypassSecurityTrustHtml('');

    let html = content
      // 画像マーカーを処理 [IMAGE:filename.jpg:caption]
      .replace(/\[IMAGE:([^:]+):([^\]]*)\]/g, (match, filename, caption) => {
        const imagePath = `/assets/images/${this.escapeHtml(filename.trim())}`;
        const captionText = this.escapeHtml(caption.trim());
        if (captionText) {
          return `<figure class="my-8 md:my-12 -mx-4 sm:mx-0">
            <div class="relative overflow-hidden bg-gray-100 max-h-[400px] sm:max-h-[500px] md:max-h-[600px] flex items-center justify-center">
              <img
                src="${imagePath}"
                width="800"
                height="600"
                alt="${captionText}"
                loading="lazy"
                decoding="async"
                class="w-full h-full object-contain">
            </div>
            <figcaption class="mt-3 px-4 sm:px-0 text-center text-xs sm:text-sm text-gray-600 italic">
              ${captionText}
            </figcaption>
          </figure>`;
        } else {
          return `<figure class="my-8 md:my-12 -mx-4 sm:mx-0">
            <div class="relative overflow-hidden bg-gray-100 max-h-[400px] sm:max-h-[500px] md:max-h-[600px] flex items-center justify-center">
              <img
                src="${imagePath}"
                width="800"
                height="600"
                alt=""
                loading="lazy"
                decoding="async"
                class="w-full h-full object-contain">
            </div>
          </figure>`;
        }
      })
      .replace(/### (.+)/g, (match, headingText) =>
        `<h2 class="text-2xl md:text-3xl font-bold font-serif-jp text-gray-900 mt-16 mb-6 pb-4 border-b-2 border-gray-900">${this.escapeHtml(headingText)}</h2>`)
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
        const processedText = this.escapeHtml(trimmed)
          .replace(/\n/g, '<br>');
        return `<p class="mb-8 text-gray-700 leading-[1.9]">${processedText}</p>`;
      })
      .filter(p => p !== '')
      .join('');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  // 変更検知のたびに正規表現整形処理が再実行されないようcomputedでキャッシュする
  formattedContent = computed<SafeHtml>(() => {
    const voice = this.alumniVoice();
    if (!voice) return this.sanitizer.bypassSecurityTrustHtml('');
    return this.formatContent(voice.content);
  });

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
