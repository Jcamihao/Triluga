import { Component } from '@angular/core';
import { REGISTER_IMPORTS, RegisterPageBase } from './register-page.base';

@Component({
  selector: 'app-register-desktop',
  standalone: true,
  imports: REGISTER_IMPORTS,
  templateUrl: './register-desktop.component.html',
  styleUrls: ['./register-desktop.component.scss'],
})
export class RegisterDesktopComponent extends RegisterPageBase {}
