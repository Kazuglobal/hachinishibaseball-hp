
import { Injectable, signal, effect, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class ScrollService {
  scrollY = signal(0);
  documentHeight = signal(0);
  windowHeight = signal(0);
  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  init() {
    if (this.isBrowser) {
      this.updateValues();
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onResize, { passive: true });
    }
  }

  private onScroll = () => {
    this.scrollY.set(window.scrollY);
  }

  private onResize = () => {
    this.updateValues();
  }

  private updateValues() {
    this.scrollY.set(window.scrollY);
    this.documentHeight.set(document.documentElement.scrollHeight);
    this.windowHeight.set(window.innerHeight);
  }

  destroy() {
    if (this.isBrowser) {
      window.removeEventListener('scroll', this.onScroll);
      window.removeEventListener('resize', this.onResize);
    }
  }
}
