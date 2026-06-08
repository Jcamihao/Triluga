import { Component } from '@angular/core';
import { HOME_IMPORTS, HomePageBase } from './home-page.base';

@Component({
  selector: 'app-home-mobile',
  standalone: true,
  imports: HOME_IMPORTS,
  templateUrl: './home-mobile.component.html',
  styleUrls: ['./home-mobile.component.scss'],
})
export class HomeMobileComponent extends HomePageBase {}
