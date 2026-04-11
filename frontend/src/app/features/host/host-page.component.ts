import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-host-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './host-page.component.html',
  styleUrls: ['./host-page.component.scss'],
})
export class HostPageComponent {
  protected readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  protected get user() {
    return this.authService.currentUser();
  }
}
