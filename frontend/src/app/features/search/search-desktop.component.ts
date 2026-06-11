import { Component, OnInit } from '@angular/core';
import { SEARCH_IMPORTS, SearchPageBase } from './search-page.base';

@Component({
  selector: 'app-search-desktop',
  standalone: true,
  imports: SEARCH_IMPORTS,
  templateUrl: './search-desktop.component.html',
  styleUrls: ['./search-desktop.component.scss'],
})
export class SearchDesktopComponent extends SearchPageBase implements OnInit {
  ngOnInit() {
    this.locationService.loadLocation().then(() => {
      if (!this.query.city && !this.query.latitude && this.locationService.cityName) {
        this.router.navigate(['/search'], {
          queryParams: { ...this.query, city: this.locationService.cityName },
          replaceUrl: true,
        });
      }
    });
  }
}
