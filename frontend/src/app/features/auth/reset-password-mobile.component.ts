import { Component } from '@angular/core';
import { RESET_PASSWORD_IMPORTS, ResetPasswordPageBase } from './reset-password-page.base';

@Component({
  selector: 'app-reset-password-mobile',
  standalone: true,
  imports: RESET_PASSWORD_IMPORTS,
  templateUrl: './reset-password-mobile.component.html',
})
export class ResetPasswordMobileComponent extends ResetPasswordPageBase {}
