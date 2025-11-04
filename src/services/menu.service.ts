import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MenuService {
  isMenuOpen = signal(false);

  open() {
    this.isMenuOpen.set(true);
  }

  close() {
    this.isMenuOpen.set(false);
  }

  toggle() {
    this.isMenuOpen.update(state => !state);
  }
}
