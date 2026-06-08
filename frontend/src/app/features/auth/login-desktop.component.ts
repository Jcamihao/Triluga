import { Component } from '@angular/core';
import { LOGIN_IMPORTS, LoginPageBase } from './login-page.base';

@Component({
  selector: 'app-login-desktop',
  standalone: true,
  imports: LOGIN_IMPORTS,
  templateUrl: './login-desktop.component.html',
  styleUrls: ['./login-desktop.component.scss'],
})
export class LoginDesktopComponent extends LoginPageBase {}
