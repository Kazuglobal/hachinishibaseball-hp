import { Component, ChangeDetectionStrategy, OnInit, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SponsorService } from '../../../services/sponsor.service';

@Component({
  selector: 'app-sponsor-banner-strip',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './sponsor-banner-strip.component.html',
  styleUrls: ['./sponsor-banner-strip.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorBannerStripComponent implements OnInit {
  readonly sponsorService = inject(SponsorService);

  variant = input<'full' | 'compact' | 'gold' | 'silver' | 'bronze'>('full');
  showRecruitCta = input<boolean>(true);

  ngOnInit(): void {
    this.sponsorService.loadSponsors();
  }
}
