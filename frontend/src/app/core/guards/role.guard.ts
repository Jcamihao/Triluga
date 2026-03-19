import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/domain.models';

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const roles = (route.data?.['roles'] as UserRole[] | undefined) ?? [];

  if (!authService.hasSession()) {
    return router.createUrlTree(['/auth/login']);
  }

  if (authService.isAuthenticated()) {
    return authService.hasRole(roles) ? true : router.createUrlTree(['/']);
  }

  return authService.restoreSession().pipe(
    map((authenticated) => {
      if (!authenticated) {
        return router.createUrlTree(['/auth/login']);
      }

      return authService.hasRole(roles) ? true : router.createUrlTree(['/']);
    }),
    catchError(() => of(router.createUrlTree(['/auth/login']))),
  );
};
