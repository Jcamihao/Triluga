import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, Profile, User, UserRole } from '../models/domain.models';
import { AppLoggerService } from './app-logger.service';

type LoginPayload = {
  email: string;
  password: string;
};

type RegisterPayload = LoginPayload & {
  role: Extract<UserRole, 'OWNER' | 'RENTER'>;
  fullName: string;
  phone: string;
  city: string;
  state: string;
};

type SessionClaims = {
  sub: string;
  email: string;
  role: UserRole;
  exp?: number;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly logger = inject(AppLoggerService);
  private readonly storage = globalThis.localStorage;

  private readonly accessTokenKey = 'velo.accessToken';
  private readonly refreshTokenKey = 'velo.refreshToken';
  private readonly userKey = 'velo.user';

  private readonly accessTokenSignal = signal<string | null>(
    this.readStoredValue(this.accessTokenKey),
  );
  private readonly refreshTokenSignal = signal<string | null>(
    this.readStoredValue(this.refreshTokenKey),
  );
  private readonly currentUserSignal = signal<User | null>(this.readStoredUser());
  private readonly restoringSessionSignal = signal(false);
  private restoreSessionRequest$?: Observable<boolean>;

  readonly currentUser = computed(
    () =>
      this.currentUserSignal() ??
      this.buildFallbackUserFromToken(this.accessTokenSignal()),
  );
  readonly isAuthenticated = computed(() =>
    this.hasValidAccessToken(this.accessTokenSignal()),
  );
  readonly hasSession = computed(
    () => !!this.accessTokenSignal() || !!this.refreshTokenSignal(),
  );
  readonly isRestoringSession = computed(() => this.restoringSessionSignal());

  login(payload: LoginPayload) {
    this.logger.info('auth', 'login_started', {
      email: payload.email.toLowerCase(),
    });

    return this.http
      .post<AuthResponse>(`${environment.apiBaseUrl}/auth/login`, payload)
      .pipe(
        tap({
          next: (response) => {
            this.logger.info('auth', 'login_succeeded', {
              userId: response.user.id,
              role: response.user.role,
            });
            this.setSession(response);
          },
          error: (error) => {
            this.logger.warn('auth', 'login_failed', {
              email: payload.email.toLowerCase(),
              message: error?.message ?? 'Erro desconhecido',
            });
          },
        }),
      );
  }

  register(payload: RegisterPayload) {
    this.logger.info('auth', 'register_started', {
      email: payload.email.toLowerCase(),
      role: payload.role,
    });

    return this.http
      .post<AuthResponse>(`${environment.apiBaseUrl}/auth/register`, payload)
      .pipe(
        tap({
          next: (response) => {
            this.logger.info('auth', 'register_succeeded', {
              userId: response.user.id,
              role: response.user.role,
            });
            this.setSession(response);
          },
          error: (error) => {
            this.logger.warn('auth', 'register_failed', {
              email: payload.email.toLowerCase(),
              message: error?.message ?? 'Erro desconhecido',
            });
          },
        }),
      );
  }

  loadMe() {
    this.logger.debug('auth', 'load_me_started');
    return this.http.get<User>(`${environment.apiBaseUrl}/auth/me`).pipe(
      tap({
        next: (user) => {
          this.logger.debug('auth', 'load_me_succeeded', {
            userId: user.id,
            role: user.role,
          });
          this.persistUser(user);
        },
        error: (error) => {
          this.logger.warn('auth', 'load_me_failed', {
            message: error?.message ?? 'Erro desconhecido',
          });
        },
      }),
    );
  }

  restoreSession(forceRefresh = false) {
    if (this.restoreSessionRequest$) {
      return this.restoreSessionRequest$;
    }

    if (!forceRefresh && this.isAuthenticated()) {
      const fallbackUser = this.buildFallbackUserFromToken(
        this.accessTokenSignal(),
      );

      if (fallbackUser && !this.currentUserSignal()) {
        this.persistUser(fallbackUser);
      }

      this.logger.debug('auth', 'restore_session_skipped_valid_access', {
        userId: this.getSessionUserId(),
      });
      return of(true);
    }

    if (forceRefresh) {
      this.logger.info('auth', 'restore_session_forced', {
        userId: this.getSessionUserId(),
      });
    }

    const refreshToken = this.refreshTokenSignal();

    if (!refreshToken) {
      this.logger.debug('auth', 'restore_session_no_refresh_token');
      if (this.accessTokenSignal()) {
        this.clearSession();
      }
      return of(false);
    }

    this.logger.info('auth', 'restore_session_started');
    this.restoringSessionSignal.set(true);

    this.restoreSessionRequest$ = this.http
      .post<AuthResponse>(`${environment.apiBaseUrl}/auth/refresh`, {
        refreshToken,
      })
      .pipe(
        tap({
          next: (response) => {
            this.logger.info('auth', 'restore_session_succeeded', {
              userId: response.user.id,
              role: response.user.role,
            });
            this.setSession(response);
          },
          error: (error) => {
            this.logger.warn('auth', 'restore_session_failed', {
              message: error?.message ?? 'Erro desconhecido',
            });
            this.clearSession();
          },
        }),
        map(() => true),
        catchError(() => of(false)),
        finalize(() => {
          this.restoringSessionSignal.set(false);
          this.restoreSessionRequest$ = undefined;
        }),
        shareReplay(1),
      );

    return this.restoreSessionRequest$;
  }

  logout() {
    this.logger.info('auth', 'logout_requested', {
      userId: this.currentUserSignal()?.id ?? null,
    });
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  clearSession() {
    this.logger.debug('auth', 'session_cleared', {
      userId: this.currentUserSignal()?.id ?? null,
    });
    this.storage.removeItem(this.accessTokenKey);
    this.storage.removeItem(this.refreshTokenKey);
    this.storage.removeItem(this.userKey);
    this.accessTokenSignal.set(null);
    this.refreshTokenSignal.set(null);
    this.currentUserSignal.set(null);
  }

  getAccessToken() {
    return this.accessTokenSignal();
  }

  getRefreshToken() {
    return this.refreshTokenSignal();
  }

  getSessionUserId() {
    return this.currentUser()?.id ?? this.decodeToken(this.accessTokenSignal())?.sub ?? null;
  }

  getSessionRole() {
    return this.currentUser()?.role ?? this.decodeToken(this.accessTokenSignal())?.role ?? null;
  }

  hasRole(roles: UserRole[]) {
    const role = this.getSessionRole();
    return !!role && roles.includes(role);
  }

  syncProfile(profile: Profile) {
    const currentUser = this.currentUserSignal();

    if (!currentUser) {
      return;
    }

    this.persistUser({
      ...currentUser,
      profile: {
        ...currentUser.profile,
        ...profile,
      },
    });
  }

  private setSession(response: AuthResponse) {
    this.storage.setItem(this.accessTokenKey, response.accessToken);
    this.storage.setItem(this.refreshTokenKey, response.refreshToken);
    this.accessTokenSignal.set(response.accessToken);
    this.refreshTokenSignal.set(response.refreshToken);
    this.logger.debug('auth', 'session_updated', {
      userId: response.user.id,
      role: response.user.role,
    });
    this.persistUser(response.user);
  }

  private persistUser(user: User) {
    this.storage.setItem(this.userKey, JSON.stringify(user));
    this.logger.debug('auth', 'user_persisted', {
      userId: user.id,
      role: user.role,
    });
    this.currentUserSignal.set(user);
  }

  private readStoredUser() {
    const raw = this.storage.getItem(this.userKey);
    return raw ? (JSON.parse(raw) as User) : null;
  }

  private readStoredValue(key: string) {
    return this.storage.getItem(key);
  }

  private hasValidAccessToken(token: string | null) {
    const payload = this.decodeToken(token);

    if (!token || !payload) {
      return false;
    }

    if (!payload.exp) {
      return true;
    }

    return payload.exp * 1000 > Date.now() + 5000;
  }

  private decodeToken(token: string | null) {
    if (!token) {
      return null;
    }

    const [, payload] = token.split('.');

    if (!payload) {
      return null;
    }

    try {
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4 || 4)) % 4),
        '=',
      );

      return JSON.parse(globalThis.atob(padded)) as SessionClaims;
    } catch (error) {
      this.logger.warn('auth', 'decode_token_failed', {
        message: error instanceof Error ? error.message : 'Token inválido',
      });
      return null;
    }
  }

  private buildFallbackUserFromToken(token: string | null) {
    const claims = this.decodeToken(token);

    if (!claims) {
      return null;
    }

    return {
      id: claims.sub,
      email: claims.email,
      role: claims.role,
      status: 'ACTIVE',
      profile: null,
    } satisfies User;
  }
}
