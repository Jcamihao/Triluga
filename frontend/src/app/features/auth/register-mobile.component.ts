import { Component } from '@angular/core';
import { REGISTER_IMPORTS, RegisterPageBase } from './register-page.base';

@Component({
  selector: 'app-register-mobile',
  standalone: true,
  imports: REGISTER_IMPORTS,
  templateUrl: './register-mobile.component.html',
  styleUrls: ['./register-mobile.component.scss'],
})
export class RegisterMobileComponent extends RegisterPageBase {}
