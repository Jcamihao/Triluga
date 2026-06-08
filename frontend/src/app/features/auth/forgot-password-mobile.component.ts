import { Component } from '@angular/core';
import { FORGOT_PASSWORD_IMPORTS, ForgotPasswordPageBase } from './forgot-password-page.base';

@Component({
  selector: 'app-forgot-password-mobile',
  standalone: true,
  imports: FORGOT_PASSWORD_IMPORTS,
  templateUrl: './forgot-password-mobile.component.html',
})
export class ForgotPasswordMobileComponent extends ForgotPasswordPageBase {}
