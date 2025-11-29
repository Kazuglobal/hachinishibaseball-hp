import { Directive, ElementRef, HostListener, Input, Renderer2, OnInit, OnDestroy } from '@angular/core';

@Directive({
    selector: '[appTilt]',
    standalone: true
})
export class TiltDirective implements OnInit, OnDestroy {
    @Input() tiltMaxAngleX = 15;
    @Input() tiltMaxAngleY = 15;
    @Input() tiltPerspective = 1000;
    @Input() tiltScale = 1.05;
    @Input() tiltSpeed = 400;
    @Input() glare = true;
    @Input() glareMaxOpacity = 0.5;

    private glareElement: HTMLElement | null = null;
    private bounds: DOMRect | null = null;
    private updateCall: number | null = null;

    constructor(private el: ElementRef, private renderer: Renderer2) { }

    ngOnInit() {
        this.renderer.setStyle(this.el.nativeElement, 'transform-style', 'preserve-3d');
        this.renderer.setStyle(this.el.nativeElement, 'will-change', 'transform');

        if (this.glare) {
            this.createGlare();
        }
    }

    ngOnDestroy() {
        if (this.updateCall) {
            cancelAnimationFrame(this.updateCall);
        }
    }

    private createGlare() {
        this.glareElement = this.renderer.createElement('div');
        this.renderer.addClass(this.glareElement, 'js-tilt-glare');
        this.renderer.setStyle(this.glareElement, 'position', 'absolute');
        this.renderer.setStyle(this.glareElement, 'top', '0');
        this.renderer.setStyle(this.glareElement, 'left', '0');
        this.renderer.setStyle(this.glareElement, 'width', '100%');
        this.renderer.setStyle(this.glareElement, 'height', '100%');
        this.renderer.setStyle(this.glareElement, 'overflow', 'hidden');
        this.renderer.setStyle(this.glareElement, 'pointer-events', 'none');
        this.renderer.setStyle(this.glareElement, 'border-radius', 'inherit');

        const innerGlare = this.renderer.createElement('div');
        this.renderer.addClass(innerGlare, 'js-tilt-glare-inner');
        this.renderer.setStyle(innerGlare, 'position', 'absolute');
        this.renderer.setStyle(innerGlare, 'top', '50%');
        this.renderer.setStyle(innerGlare, 'left', '50%');
        this.renderer.setStyle(innerGlare, 'background-image', 'linear-gradient(0deg, rgba(255,255,255,0) 0%, #ffffff 100%)');
        this.renderer.setStyle(innerGlare, 'width', '200%');
        this.renderer.setStyle(innerGlare, 'height', '200%');
        this.renderer.setStyle(innerGlare, 'transform', 'translate(-50%, -50%) rotate(180deg)');
        this.renderer.setStyle(innerGlare, 'opacity', '0');
        this.renderer.setStyle(innerGlare, 'transition', `opacity ${this.tiltSpeed}ms cubic-bezier(.03,.98,.52,.99)`);

        this.renderer.appendChild(this.glareElement, innerGlare);
        this.renderer.appendChild(this.el.nativeElement, this.glareElement);
    }

    @HostListener('mouseenter')
    onMouseEnter() {
        this.bounds = this.el.nativeElement.getBoundingClientRect();
        this.renderer.setStyle(this.el.nativeElement, 'transition', 'none');
        if (this.glareElement) {
            const inner = this.glareElement.querySelector('.js-tilt-glare-inner');
            if (inner) {
                this.renderer.setStyle(inner, 'transition', 'none');
            }
        }
    }

    @HostListener('mousemove', ['$event'])
    onMouseMove(event: MouseEvent) {
        if (!this.bounds) return;

        const x = event.clientX - this.bounds.left;
        const y = event.clientY - this.bounds.top;
        const w = this.bounds.width;
        const h = this.bounds.height;

        const centerX = w / 2;
        const centerY = h / 2;

        const mouseX = x - centerX;
        const mouseY = y - centerY;

        const rotateX = (mouseY / centerY) * -this.tiltMaxAngleX;
        const rotateY = (mouseX / centerX) * this.tiltMaxAngleY;

        this.updateTransform(rotateX, rotateY);

        if (this.glare) {
            this.updateGlare(mouseX, mouseY, w, h);
        }
    }

    @HostListener('mouseleave')
    onMouseLeave() {
        this.renderer.setStyle(this.el.nativeElement, 'transition', `transform ${this.tiltSpeed}ms cubic-bezier(.03,.98,.52,.99)`);
        this.renderer.setStyle(this.el.nativeElement, 'transform', `perspective(${this.tiltPerspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`);

        if (this.glareElement) {
            const inner = this.glareElement.querySelector('.js-tilt-glare-inner');
            if (inner) {
                this.renderer.setStyle(inner, 'transition', `opacity ${this.tiltSpeed}ms cubic-bezier(.03,.98,.52,.99)`);
                this.renderer.setStyle(inner, 'opacity', '0');
            }
        }
    }

    private updateTransform(rotateX: number, rotateY: number) {
        if (this.updateCall) {
            cancelAnimationFrame(this.updateCall);
        }

        this.updateCall = requestAnimationFrame(() => {
            const transform = `perspective(${this.tiltPerspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${this.tiltScale}, ${this.tiltScale}, ${this.tiltScale})`;
            this.renderer.setStyle(this.el.nativeElement, 'transform', transform);
        });
    }

    private updateGlare(mouseX: number, mouseY: number, w: number, h: number) {
        if (!this.glareElement) return;

        const inner = this.glareElement.querySelector('.js-tilt-glare-inner');
        if (!inner) return;

        const angle = Math.atan2(mouseY, mouseX) * (180 / Math.PI) - 90;
        const opacity = (Math.abs(mouseX) / (w / 2) + Math.abs(mouseY) / (h / 2)) / 2 * this.glareMaxOpacity;

        this.renderer.setStyle(inner, 'transform', `translate(-50%, -50%) rotate(${angle}deg)`);
        this.renderer.setStyle(inner, 'opacity', opacity.toString());
    }
}
