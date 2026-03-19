import { inject, Injectable } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { filter } from 'rxjs';
import { AppLoggerService } from './app-logger.service';

@Injectable({ providedIn: 'root' })
export class RouteTraceService {
  private readonly router = inject(Router);
  private readonly logger = inject(AppLoggerService);
  private started = false;

  start() {
    if (this.started) {
      return;
    }

    this.started = true;

    this.router.events
      .pipe(
        filter(
          (event) =>
            event instanceof NavigationStart ||
            event instanceof NavigationEnd ||
            event instanceof NavigationCancel ||
            event instanceof NavigationError,
        ),
      )
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          this.logger.info('router', 'navigation_started', {
            id: event.id,
            url: event.url,
          });
          return;
        }

        if (event instanceof NavigationEnd) {
          this.logger.info('router', 'navigation_completed', {
            id: event.id,
            url: event.urlAfterRedirects,
          });
          return;
        }

        if (event instanceof NavigationCancel) {
          this.logger.warn('router', 'navigation_cancelled', {
            id: event.id,
            url: event.url,
            reason: event.reason,
          });
          return;
        }

        if (event instanceof NavigationError) {
          this.logger.error('router', 'navigation_failed', {
            id: event.id,
            url: event.url,
            error:
              event.error instanceof Error
                ? event.error.message
                : String(event.error),
          });
        }
      });
  }
}
