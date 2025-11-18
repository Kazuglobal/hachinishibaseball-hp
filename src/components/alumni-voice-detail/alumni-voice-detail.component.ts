import { Component, ChangeDetectionStrategy, OnInit, AfterViewInit, inject, signal, computed, ChangeDetectorRef, PLATFORM_ID, Inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { NgOptimizedImage } from '@angular/common';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';

interface AlumniVoice {
  id: string;
  image: string;
  title: string;
  family: string;
  generation: string;
  currentJob: string;
  content: string;
}

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
  private isBrowser: boolean;
  isVisible = signal(false);

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  // ALUMNI VOICEデータ
  private alumniVoices: AlumniVoice[] = [
    {
      id: 'hayashino-satoshi',
      image: '/assets/images/hayashino.jpg',
      title: '野球部での経験が、今の自分の礎です。',
      family: '32期生 - 林野 智 様',
      generation: '32期生',
      currentJob: '宮城県警警察官（若林警察署 荒井交番勤務）',
      content: `### 高校時代の挫折が、指導者への道を開いた

「入ってすぐは、これはちょっと無理だなって思いました」

32期生の林野智さんは、高校時代を振り返りながら率直に語る。当時、市内の上手い選手たちが集まる中で、自分の実力に限界を感じたという。最終的には選手としてではなく、データ分析などで貢献する道を選んだ。

「自分としてはちょっと悔いがあって。下手なら下手なりに、もう少し本気で野球をしたかったなって、今さらながらずっと思っています」

この後悔が、後の人生に大きな影響を与えることになる。

### 10年間の指導者経験 ─ 中学生に野球の魅力を伝える

高校卒業後、林野さんは大学では野球を続けなかったが、縁あって中学生の指導に携わることになった。

「大学生の頃、野球が好きだったので、アルバイト先も元プロ野球選手の方が店長をやっている居酒屋で働いていました」

そこで出会った常連客に連れられて行った寿司店の親方が、仙台育英で甲子園準優勝経験のある人物だった。その親方から「お前も手伝え」と誘われたのが、仙台宮城野リトルシニアでのコーチの始まりだった。

[IMAGE:hayashino4.jpg:宮城野リトルシニアの選手たち]

[IMAGE:hayashino3.jpg:コーチ時代の林野さん]

[IMAGE:hayashino2.jpg:]

「高校の時の後悔があったのも、指導を続ける大きな理由でしたね。約10年間、中学生たちに野球を教えていました」

### 34歳での転職 ─ 新たな挑戦へ

東北福祉大学で特別支援教育を学び、卒業後は障害福祉施設で働いていた林野さん。しかし、30代半ばにして大きな決断をする。

「前の仕事が嫌だったわけではないんです。ただ、何かチャレンジしてみたくなってしまったんです」

もともと警察24時などの番組が好きだった林野さんは、34歳まで警察官採用試験を受けられることを知り、「もう一回頑張ってみたい」と勉強を再開。見事合格を果たした。

### 警察官として ─ 震災の被災地を守る

現在は若林警察署の荒井交番に配属され、日々の勤務に励んでいる。管轄区域には、東日本大震災で多くの犠牲者を出した荒浜地区も含まれる。

「大変なのは法律の勉強ですね。若い子たちとの記憶力の差を感じました。でも、落とし物から行方不明者の捜索まで、一つ一つ対応していって『良かった』と思える瞬間が、やりがいになっています」

### プロフェッショナルを目指して

警察官として、林野さんには明確な目標がある。

「警察って本当にいろんな仕事があるんです。刑事、交通事故捜査、職務質問...。何か一つのプロフェッショナルになりたいですね」

2歳半と1歳半の2人の子どもの父親でもある林野さん。仕事と家庭、両方で充実した日々を送っている。

### 後輩たちへのメッセージ

「毎年、西高野球部の結果は楽しみにしています。4年前に甲子園に行ったばかりなので、その伝統を絶やすことなく頑張ってほしい」

そして最後に、野球部OBとしての思いを語った。

「最近はホームページなどで野球部の活動を見る機会も増えました。先輩後輩の繋がりを大事にしたいですね。もう少し集まる機会が多くなれば面白いなと思います。みんなでまた集まりたいですね」

高校時代の挫折と後悔。それが指導者としての10年間を生み、今は警察官として新たな道を歩む林野さん。野球部での経験は、確実に今の自分の礎となっている。`
    },
  ];

  alumniVoice = signal<AlumniVoice | null>(null);
  currentVoiceIndex = signal<number>(-1);
  sortedVoices = signal<AlumniVoice[]>([]);

  ngOnInit() {
    this.isVisible.set(true);
    
    // ID順にソート
    const sorted = [...this.alumniVoices];
    this.sortedVoices.set(sorted);
    
    this.route.params.subscribe(params => {
      const id = params['id'];
      const foundVoice = this.alumniVoices.find(v => v.id === id);
      
      if (foundVoice) {
        this.alumniVoice.set(foundVoice);
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

  // マークダウン形式のテキストをHTMLに変換
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

