import { Component } from '@angular/core';
import { FAVORITES_IMPORTS, FavoritesPageBase } from './favorites-page.base';

@Component({
  selector: 'app-favorites-mobile',
  standalone: true,
  imports: FAVORITES_IMPORTS,
  templateUrl: './favorites-mobile.component.html',
  styleUrls: ['./favorites-mobile.component.scss'],
})
export class FavoritesMobileComponent extends FavoritesPageBase {}
