import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NotificationsCenterService } from '../../../core/services/notifications-center.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-search-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './search-header.component.html',
  styleUrls: ['./search-header.component.scss'],
})
export class SearchHeaderComponent {
  protected readonly authService = inject(AuthService);
  protected readonly notificationsService = inject(NotificationsCenterService);
  private readonly router = inject(Router);

  @Input() title = 'Escolha seu próximo carro';
  @Input() subtitle =
    'Pesquise por cidade, modelo e faixa de preço.';
  @Input() query = '';
  @Input() showFiltersAction = true;
  @Input() showMeta = true;
  @Input() minimal = false;

  @Output() search = new EventEmitter<{
    q: string;
  }>();
  @Output() filters = new EventEmitter<void>();

  protected notificationsOpen = false;

  constructor() {
    if (this.authService.hasSession()) {
      this.notificationsService.ensureLoaded().subscribe();
    }
  }

  submit() {
    this.search.emit({
      q: this.query.trim(),
    });
  }

  protected toggleNotifications() {
    this.notificationsOpen = !this.notificationsOpen;

    if (this.notificationsOpen && this.authService.hasSession()) {
      this.notificationsService.ensureLoaded(true).subscribe();
    }
  }

  protected closeNotifications() {
    this.notificationsOpen = false;
  }

  protected goToLogin() {
    this.notificationsOpen = false;
    this.router.navigate(['/auth/login']);
  }

  protected markNotificationRead(notificationId: string) {
    this.notificationsService.markRead(notificationId).subscribe();
  }

  protected get unreadBadge() {
    const unreadCount = this.notificationsService.unreadCount();
    return unreadCount > 99 ? '99+' : String(unreadCount);
  }
}
