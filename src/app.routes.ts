import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { AboutComponent } from './components/about/about.component';
import { SupportComponent } from './components/support/support.component';
import { MatchResultsComponent } from './components/match-results/match-results.component';
import { ActivityDetailComponent } from './components/activity-detail/activity-detail.component';
import { ActivitiesListComponent } from './components/activities-list/activities-list.component';
import { AlumniActivitiesComponent } from './components/alumni-activities/alumni-activities.component';
import { ContactComponent } from './components/contact/contact.component';
import { PrivacyPolicyComponent } from './components/privacy-policy/privacy-policy.component';
import { AlumniVoiceDetailComponent } from './components/alumni-voice-detail/alumni-voice-detail.component';

export const routes: Routes = [
    { path: '', component: HomeComponent, pathMatch: 'full' },
    { path: 'about', component: AboutComponent },
    { path: 'match-results', component: MatchResultsComponent },
    { path: 'support', component: SupportComponent },
    { path: 'contact', component: ContactComponent },
    { path: 'activities', component: ActivitiesListComponent },
    { path: 'activity/:id', component: ActivityDetailComponent },
    { path: 'alumni-activities', component: AlumniActivitiesComponent },
    { path: 'alumni-voice/:id', component: AlumniVoiceDetailComponent },
    { path: 'privacy-policy', component: PrivacyPolicyComponent },
    { path: '**', redirectTo: '' }
];
