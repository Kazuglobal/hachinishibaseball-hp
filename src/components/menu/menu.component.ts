import { Component, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { MenuService } from '../../services/menu.service';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-menu',
  templateUrl: './menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink]
})
export class MenuComponent {
  menuService = inject(MenuService);
  navItems = input.required<string[]>();
}
