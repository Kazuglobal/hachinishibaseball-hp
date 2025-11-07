import { Component, ChangeDetectionStrategy, input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MenuService } from '../../services/menu.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink]
})
export class HeaderComponent {
  navItems = input.required<string[]>();
  menuService = inject(MenuService);
}
