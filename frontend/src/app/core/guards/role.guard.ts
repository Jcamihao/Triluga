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

  const checkAccess = () => {
    if (!authService.hasRole(roles)) return router.createUrlTree(['/']);
    if (roles.includes('ADMIN') && !authService.isAdminAccount()) return router.createUrlTree(['/']);
    return true;
  };

  if (authService.isAuthenticated()) {
    return checkAccess();
  }

  return authService.restoreSession().pipe(
    map((authenticated) => {
      if (!authenticated) return router.createUrlTree(['/auth/login']);
      return checkAccess();
    }),
    catchError(() => of(router.createUrlTree(['/auth/login']))),
  );
};
