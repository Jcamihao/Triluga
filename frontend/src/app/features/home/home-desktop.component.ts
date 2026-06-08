import { Component } from '@angular/core';
import { HOME_IMPORTS, HomePageBase } from './home-page.base';

@Component({
  selector: 'app-home-desktop',
  standalone: true,
  imports: HOME_IMPORTS,
  templateUrl: './home-desktop.component.html',
  styleUrls: ['./home-desktop.component.scss'],
})
export class HomeDesktopComponent extends HomePageBase {}
