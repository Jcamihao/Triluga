import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { AnalyticsTrackingService } from './core/services/analytics-tracking.service';
import { AppLoggerService } from './core/services/app-logger.service';
import { PwaInstallService } from './core/services/pwa-install.service';
import { PrivacyApiService } from './core/services/privacy-api.service';
import { PrivacyPreferencesService } from './core/services/privacy-preferences.service';
import { RouteTraceService } from './core/services/route-trace.service';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { CompareTrayComponent } from './shared/components/compare-tray/compare-tray.component';
import { UiStateService } from './core/services/ui-state.service';
import { WebFooterComponent } from './shared/components/web-footer/web-footer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    BottomNavComponent,
    CompareTrayComponent,
    WebFooterComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly logger = inject(AppLoggerService);
  private readonly analyticsTrackingService = inject(AnalyticsTrackingService);
  private readonly privacyApiService = inject(PrivacyApiService);
  protected readonly pwaInstallService = inject(PwaInstallService);
  protected readonly privacyPreferencesService = inject(
    PrivacyPreferencesService,
  );
  private readonly routeTraceService = inject(RouteTraceService);
  protected readonly authService = inject(AuthService);
  protected readonly uiStateService = inject(UiStateService);

  protected get menuOpen() {
    return this.uiStateService.menuOpen();
  }
  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    this.routeTraceService.start();
    this.analyticsTrackingService.trackCurrentSession(
      globalThis.location?.pathname
        ? `${globalThis.location.pathname}${globalThis.location.search}`
        : '/',
    );
    this.logger.info('app', 'bootstrap', {
      authenticated: this.authService.isAuthenticated(),
    });

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.uiStateService.closeMenu();
      });

    if (!this.authService.hasSession()) {
      return;
    }

    this.authService.restoreSession().subscribe({
      next: (authenticated) => {
        if (!authenticated || !this.authService.getAccessToken()) {
          return;
        }

        this.authService.loadMe().subscribe({
          error: () => undefined,
        });
      },
      error: () => undefined,
    });
  }

  protected toggleMenu() {
    this.uiStateService.toggleMenu();
  }

  protected closeMenu() {
    this.uiStateService.closeMenu();
  }

  protected openProfile() {
    this.navigateProtected('/profile');
  }

  protected openFavorites() {
    this.navigateProtected('/favorites');
  }

  protected openMyAds() {
    const user = this.authService.currentUser();
    const role = this.authService.getSessionRole();

    if (!user && !role) {
      this.closeMenu();
      this.router.navigate(['/auth/login']);
      return;
    }

    this.closeMenu();
    this.router.navigate(['/anunciar-carro']);
  }

  protected goToLogin() {
    this.closeMenu();
    this.router.navigate(['/auth/login']);
  }

  protected openPrivacyPolicy() {
    this.closeMenu();
    this.router.navigate(['/privacy']);
  }

  protected openPrivacyCenter() {
    this.closeMenu();

    if (!this.authService.hasSession()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    this.router.navigate(['/privacy-center']);
  }

  protected setAnalyticsConsent(granted: boolean) {
    this.privacyPreferencesService.setAnalyticsConsent(granted);

    if (this.authService.isAuthenticated()) {
      this.privacyApiService.updateMyPreferences(granted).subscribe({
        error: () => undefined,
      });
    }

    if (granted) {
      this.analyticsTrackingService.trackCurrentSession(
        globalThis.location?.pathname
          ? `${globalThis.location.pathname}${globalThis.location.search}`
          : '/',
      );
    }
  }

  protected async installApp() {
    await this.pwaInstallService.promptInstall();
  }

  protected dismissInstallBanner() {
    this.pwaInstallService.dismissBanner();
  }

  protected get showPrivacyBanner() {
    return !this.privacyPreferencesService.hasAnsweredAnalyticsChoice();
  }

  protected get showInstallBanner() {
    return !this.showPrivacyBanner && this.pwaInstallService.canShowBanner();
  }

  protected get shouldOffsetShellForBanners() {
    return (
      this.showBottomNav() && (this.showPrivacyBanner || this.showInstallBanner)
    );
  }

  protected get shouldUseStackedBannerOffset() {
    return false;
  }

  protected get showWebFooter() {
    return !this.currentUrl().startsWith('/auth/login');
  }

  readonly showBottomNav = () => {
    const url = this.currentUrl();

    if (url.startsWith('/auth')) {
      return false;
    }

    if (/^\/chat\/[^/]+/.test(url)) {
      return false;
    }

    return true;
  };

  private navigateProtected(path: string) {
    this.closeMenu();

    if (!this.authService.hasSession()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    this.router.navigate([path]);
  }

  protected get menuAvatarInitials() {
    const fullName = this.authService.currentUser()?.profile?.fullName?.trim();

    if (!fullName) {
      return 'IC';
    }

    return fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  protected get menuAvatarAlt() {
    const fullName = this.authService.currentUser()?.profile?.fullName?.trim();
    return fullName ? `Foto de perfil de ${fullName}` : 'Foto de perfil';
  }

  protected get menuTitle() {
    return (
      this.authService.currentUser()?.profile?.fullName?.trim() || 'Triluga'
    );
  }

  protected get showMenuBrand() {
    return !this.authService.currentUser()?.profile?.fullName?.trim();
  }
}
