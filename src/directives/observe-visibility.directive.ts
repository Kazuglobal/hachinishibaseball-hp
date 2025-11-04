
import { Directive, ElementRef, inject, output, PLATFORM_ID, Inject, OnInit, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Directive({
  selector: '[visible]',
  standalone: true,
})
export class ObserveVisibilityDirective implements OnInit, OnDestroy {
  private elementRef = inject(ElementRef);
  private platformId = inject(PLATFORM_ID);
  
  visible = output<void>();

  private observer: IntersectionObserver | null = null;

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          this.visible.emit();
          // Disconnect observer after it has been visible once
          this.observer?.disconnect();
        }
      }, {
        root: null,
        rootMargin: '0px',
        threshold: 0.2 // Trigger when 20% of the element is visible
      });

      this.observer.observe(this.elementRef.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
