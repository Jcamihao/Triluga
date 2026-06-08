import { Component } from '@angular/core';
import { LOGIN_IMPORTS, LoginPageBase } from './login-page.base';

@Component({
  selector: 'app-login-mobile',
  standalone: true,
  imports: LOGIN_IMPORTS,
  templateUrl: './login-mobile.component.html',
  styleUrls: ['./login-mobile.component.scss'],
})
export class LoginMobileComponent extends LoginPageBase {}
