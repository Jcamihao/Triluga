import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { SEARCH_IMPORTS, SearchPageBase } from './search-page.base';

@Component({
  selector: 'app-search-mobile',
  standalone: true,
  imports: SEARCH_IMPORTS,
  templateUrl: './search-mobile.component.html',
  styleUrls: ['./search-mobile.component.scss'],
})
export class SearchMobileComponent
  extends SearchPageBase
  implements AfterViewInit, OnDestroy, OnInit
{
  @ViewChild('sentinel')
  set sentinelElementRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.sentinelRef = value;
    if (value) {
      this.observeSentinel();
    }
  }

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

  ngAfterViewInit() {
    this.observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && this.hasNextPage && !this.loading) {
          this.currentPage += 1;
          this.fetchVehicles();
        }
      },
      { rootMargin: '160px' },
    );
    queueMicrotask(() => this.observeSentinel());
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}
