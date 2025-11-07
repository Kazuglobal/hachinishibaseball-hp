import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { AboutComponent } from './components/about/about.component';
import { SupportComponent } from './components/support/support.component';
import { MatchResultsComponent } from './components/match-results/match-results.component';
import { ActivityDetailComponent } from './components/activity-detail/activity-detail.component';

export const routes: Routes = [
    { path: '', component: HomeComponent, pathMatch: 'full' },
    { path: 'about', component: AboutComponent },
    { path: 'match-results', component: MatchResultsComponent },
    { path: 'support', component: SupportComponent },
    { path: 'activity/:id', component: ActivityDetailComponent },
    { path: '**', redirectTo: '' }
];
