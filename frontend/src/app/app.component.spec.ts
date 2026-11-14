import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { AnalyticsTrackingService } from './core/services/analytics-tracking.service';
import { AppLoggerService } from './core/services/app-logger.service';
import { AuthService } from './core/services/auth.service';
import { BillingFlagService } from './core/services/billing-flag.service';
import { UiStateService } from './core/services/ui-state.service';
import { signal } from '@angular/core';
import { PrivacyApiService } from './core/services/privacy-api.service';
import { PrivacyPreferencesService } from './core/services/privacy-preferences.service';
import { PwaInstallService } from './core/services/pwa-install.service';
import { RouteTraceService } from './core/services/route-trace.service';

describe('AppComponent', () => {
  const sessionFlag = signal(false);
  const billingEnabled = signal(false);

  beforeEach(async () => {
    sessionFlag.set(false);
    billingEnabled.set(false);
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: () => null,
            getAccessToken: () => null,
            getSessionRole: () => null,
            hasRole: () => false,
            hasSession: sessionFlag,
            isAuthenticated: () => false,
            loadMe: () => of(null),
            logout: () => undefined,
            restoreSession: () => of(false),
          },
        },
        {
          provide: AnalyticsTrackingService,
          useValue: {
            trackCurrentSession: () => undefined,
          },
        },
        {
          provide: AppLoggerService,
          useValue: {
            info: () => undefined,
          },
        },
        {
          provide: PwaInstallService,
          useValue: {
            canPromptInstall: () => false,
            canShowBanner: () => false,
            dismissBanner: () => undefined,
            promptInstall: async () => undefined,
            showAndroidInstallHint: () => false,
            showIosInstallHint: () => false,
          },
        },
        {
          provide: PrivacyApiService,
          useValue: {
            updateMyPreferences: () => of(null),
          },
        },
        {
          provide: PrivacyPreferencesService,
          useValue: {
            hasAnsweredAnalyticsChoice: () => true,
            setAnalyticsConsent: () => undefined,
          },
        },
        {
          provide: BillingFlagService,
          useValue: {
            enabled: billingEnabled,
            ensureLoaded: () => undefined,
          },
        },
        {
          provide: RouteTraceService,
          useValue: {
            start: () => undefined,
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);

    expect(fixture.componentInstance).toBeTruthy();
  });

  function planoItemInDrawer(): HTMLElement | undefined {
    TestBed.inject(UiStateService).menuOpen.set(true);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return (Array.from(fixture.nativeElement.querySelectorAll('.menu-link')) as HTMLElement[])
      .find((el) => el.textContent?.includes('Plano'));
  }

  it('mostra "Plano" no menu com sessão e enabled', () => {
    sessionFlag.set(true);
    billingEnabled.set(true);
    expect(planoItemInDrawer()).toBeDefined();
  });

  it('não mostra "Plano" no menu sem enabled', () => {
    sessionFlag.set(true);
    billingEnabled.set(false);
    expect(planoItemInDrawer()).toBeUndefined();
  });

  it('não mostra "Plano" no menu sem sessão', () => {
    sessionFlag.set(false);
    billingEnabled.set(true);
    expect(planoItemInDrawer()).toBeUndefined();
  });
});
