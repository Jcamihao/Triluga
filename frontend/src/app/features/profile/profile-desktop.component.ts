import { Component } from '@angular/core';
import { PROFILE_IMPORTS, ProfilePageBase } from './profile-page.base';
import { VerificationOnboardingComponent } from './components/verification-onboarding.component';

@Component({
  selector: 'app-profile-desktop',
  standalone: true,
  imports: [...PROFILE_IMPORTS, VerificationOnboardingComponent],
  templateUrl: './profile-desktop.component.html',
  styleUrls: ['./profile-desktop.component.scss'],
})
export class ProfileDesktopComponent extends ProfilePageBase {
  constructor() {
    super();
  }
}
