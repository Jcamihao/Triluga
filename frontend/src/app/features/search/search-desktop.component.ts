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
    this.locationService.loadLocation();
  }
}
