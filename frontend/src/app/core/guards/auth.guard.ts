import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  if (!authService.hasSession()) {
    return router.createUrlTree(['/auth/login']);
  }

  return authService.restoreSession().pipe(
    map((authenticated) =>
      authenticated ? true : router.createUrlTree(['/auth/login']),
    ),
    catchError(() => of(router.createUrlTree(['/auth/login']))),
  );
};
