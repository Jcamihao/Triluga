import { Component } from '@angular/core';
import { PROFILE_IMPORTS, ProfilePageBase } from './profile-page.base';
import { VerificationOnboardingComponent } from './components/verification-onboarding.component';

@Component({
  selector: 'app-profile-mobile',
  standalone: true,
  imports: [...PROFILE_IMPORTS, VerificationOnboardingComponent],
  templateUrl: './profile-mobile.component.html',
  styleUrls: ['./profile-mobile.component.scss'],
})
export class ProfileMobileComponent extends ProfilePageBase {
  constructor() {
    super();
  }
}
