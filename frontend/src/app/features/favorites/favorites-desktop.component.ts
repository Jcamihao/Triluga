import { Component } from '@angular/core';
import { FAVORITES_IMPORTS, FavoritesPageBase } from './favorites-page.base';

@Component({
  selector: 'app-favorites-desktop',
  standalone: true,
  imports: FAVORITES_IMPORTS,
  templateUrl: './favorites-desktop.component.html',
  styleUrls: ['./favorites-desktop.component.scss'],
})
export class FavoritesDesktopComponent extends FavoritesPageBase {}
