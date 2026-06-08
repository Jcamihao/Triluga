import { Component } from '@angular/core';
import { FORGOT_PASSWORD_IMPORTS, ForgotPasswordPageBase } from './forgot-password-page.base';

@Component({
  selector: 'app-forgot-password-desktop',
  standalone: true,
  imports: FORGOT_PASSWORD_IMPORTS,
  templateUrl: './forgot-password-desktop.component.html',
  styleUrls: ['./forgot-password-desktop.component.scss'],
})
export class ForgotPasswordDesktopComponent extends ForgotPasswordPageBase {}
