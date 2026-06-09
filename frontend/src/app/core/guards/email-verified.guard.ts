import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const emailVerifiedGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.currentUser()?.emailVerified) {
    return true;
  }

  return router.createUrlTree(['/profile'], {
    queryParams: { emailNotVerified: '1' },
  });
};
