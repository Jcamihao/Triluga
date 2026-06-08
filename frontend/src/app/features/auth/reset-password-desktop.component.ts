import { Component } from '@angular/core';
import { RESET_PASSWORD_IMPORTS, ResetPasswordPageBase } from './reset-password-page.base';

@Component({
  selector: 'app-reset-password-desktop',
  standalone: true,
  imports: RESET_PASSWORD_IMPORTS,
  templateUrl: './reset-password-desktop.component.html',
  styleUrls: ['./reset-password-desktop.component.scss'],
})
export class ResetPasswordDesktopComponent extends ResetPasswordPageBase {}
