import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { AnalyticsTrackingService } from './core/services/analytics-tracking.service';
import { AppLoggerService } from './core/services/app-logger.service';
import { AuthService } from './core/services/auth.service';
import { PrivacyApiService } from './core/services/privacy-api.service';
import { PrivacyPreferencesService } from './core/services/privacy-preferences.service';
import { PwaInstallService } from './core/services/pwa-install.service';
import { RouteTraceService } from './core/services/route-trace.service';

describe('AppComponent', () => {
  beforeEach(async () => {
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
            hasSession: () => false,
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
});
