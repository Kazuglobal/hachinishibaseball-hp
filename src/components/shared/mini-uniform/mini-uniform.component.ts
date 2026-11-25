import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-mini-uniform',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      display: block;
    }

    .uniform-stage {
      perspective: 750px;
    }

    .uniform-card {
      transform-style: preserve-3d;
      transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), filter 0.35s ease;
    }

    .uniform-card.is-interactive:hover {
      transform: rotateY(-7deg) rotateX(4deg) translateY(-4px) scale(1.03);
    }

    .uniform-img {
      filter: drop-shadow(0 8px 14px rgba(0, 45, 98, 0.22));
      transition: filter 0.35s ease;
    }

    .uniform-card.is-interactive:hover .uniform-img {
      filter: drop-shadow(0 14px 22px rgba(0, 45, 98, 0.32));
    }

    .uniform-card.is-lg .uniform-img {
      filter: drop-shadow(0 16px 32px rgba(0, 0, 0, 0.45)) drop-shadow(0 0 24px rgba(255, 255, 255, 0.22));
    }

    .nameplate {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(244, 247, 252, 0.94) 100%);
      box-shadow:
        0 2px 6px rgba(0, 45, 98, 0.2),
        inset 0 0 0 1px rgba(0, 45, 98, 0.16);
      transform: translateZ(14px);
    }

    .nameplate-stitch {
      border: 1.5px dashed rgba(0, 45, 98, 0.35);
    }

    @keyframes uniformGlow {
      0%, 100% {
        box-shadow: 0 0 0 0 rgba(179, 27, 27, 0.42), 0 10px 24px -6px rgba(0, 45, 98, 0.22);
      }
      50% {
        box-shadow: 0 0 0 7px rgba(179, 27, 27, 0.1), 0 14px 30px -4px rgba(0, 45, 98, 0.3);
      }
    }

    .uniform-highlighted {
      animation: uniformGlow 2.2s ease-in-out infinite;
    }
  `],
  template: `
    <div
      class="uniform-stage relative select-none"
      [ngClass]="{
        'w-full': size() === 'sm',
        'w-56 sm:w-64 mx-auto': size() === 'md',
        'w-64 sm:w-80 mx-auto': size() === 'lg'
      }">
      <div
        class="uniform-card relative flex flex-col items-center justify-center rounded-2xl"
        [class.is-interactive]="interactive()"
        [class.is-lg]="size() === 'lg'"
        [class.uniform-highlighted]="highlighted()"
        [ngClass]="{
          'p-2 sm:p-2.5 bg-gradient-to-b from-slate-50/90 to-white border border-slate-200/80 hover:border-[#002D62]/40': size() === 'sm',
          'p-2': size() === 'md',
          'p-1': size() === 'lg',
          'border-[#B31B1B]': highlighted() && size() === 'sm'
        }">

        <!-- 右上バッジ（NEW / デモ / 年度など） -->
        @if (badge()) {
          <span
            class="absolute top-1.5 right-1.5 z-20 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm tracking-wide"
            [ngClass]="{
              'bg-[#B31B1B] text-white': badge() === 'NEW',
              'bg-amber-500 text-white': badge() === 'デモ',
              'bg-[#002D62] text-white': badge() !== 'NEW' && badge() !== 'デモ'
            }">
            {{ badge() }}
          </span>
        }

        <!-- ユニフォーム本体 + 名前・卒期オーバーレイ -->
        <div class="relative w-full aspect-[720/677] flex items-center justify-center">
          <picture class="w-full h-full block">
            <source srcset="/assets/images/hachinishi-uniform.webp" type="image/webp" />
            <img
              src="/assets/images/hachinishi-uniform.png"
              [alt]="period() + ' ' + displayName() + ' ミニチュアユニフォーム'"
              [attr.loading]="size() === 'sm' ? 'lazy' : 'eager'"
              decoding="async"
              class="uniform-img w-full h-full object-contain pointer-events-none" />
          </picture>

          <!-- ユニフォーム上のネームプレート（胸のHNロゴを避け、胴体中央〜下部に配置） -->
          <div
            class="nameplate absolute left-1/2 -translate-x-1/2 z-10 rounded-lg text-center pointer-events-none"
            [ngClass]="{
              'bottom-[11%] w-[64%] px-1 py-1': size() === 'sm',
              'bottom-[12%] w-[62%] px-2 py-1.5 rounded-xl': size() === 'md',
              'bottom-[12%] w-[62%] px-3 py-2 rounded-xl': size() === 'lg'
            }">
            <div
              class="nameplate-stitch rounded-[6px] flex flex-col items-center justify-center"
              [ngClass]="{
                'px-1 py-0.5 gap-0.5': size() === 'sm',
                'px-2 py-1 gap-1': size() === 'md',
                'px-2.5 py-1.5 gap-1': size() === 'lg'
              }">
              <!-- 卒期ピル -->
              <span
                class="inline-block rounded-full bg-[#002D62] text-white font-bold leading-none whitespace-nowrap"
                [ngClass]="{
                  'text-[9px] sm:text-[10px] px-1.5 py-[2px]': size() === 'sm',
                  'text-[11px] px-2.5 py-0.5': size() === 'md',
                  'text-xs sm:text-sm px-3 py-1': size() === 'lg'
                }">
                {{ period() }}
              </span>

              <!-- 支援者お名前 -->
              <span
                class="block font-extrabold text-[#002D62] leading-tight tracking-tight max-w-full truncate"
                [ngClass]="nameTextClass()">
                {{ displayName() }}
              </span>
            </div>
          </div>
        </div>

        <!-- クリック可能ヒント（オンライン納入者向け） -->
        @if (showHint() && size() === 'sm') {
          <div class="mt-1 flex items-center justify-center gap-1 text-[10px] font-bold text-[#002D62]/80">
            <span>▶ ムービー再生</span>
          </div>
        }
      </div>
    </div>
  `,
})
export class MiniUniformComponent {
  readonly name = input.required<string>();
  readonly period = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('sm');
  readonly badge = input<string | null>(null);
  readonly interactive = input<boolean>(false);
  readonly highlighted = input<boolean>(false);
  readonly showHint = input<boolean>(false);

  readonly displayName = computed(() => {
    const raw = (this.name() || '').trim();
    if (!raw) return '八戸 太郎';
    return raw;
  });

  readonly nameTextClass = computed(() => {
    const len = this.displayName().length;
    const sz = this.size();
    if (sz === 'lg') {
      return len > 9 ? 'text-sm sm:text-base' : 'text-base sm:text-xl';
    }
    if (sz === 'md') {
      return len > 9 ? 'text-xs sm:text-sm' : 'text-sm sm:text-base';
    }
    // sm
    return len > 8 ? 'text-[10px] sm:text-[11px]' : 'text-[11px] sm:text-xs';
  });
}
