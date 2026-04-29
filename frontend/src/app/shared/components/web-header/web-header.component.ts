import { CommonModule } from '@angular/common';
import { Component, Input, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AppLoggerService } from '../../../core/services/app-logger.service';
import { AuthService } from '../../../core/services/auth.service';
import { ChatInboxService } from '../../../core/services/chat-inbox.service';
import { NotificationsCenterService } from '../../../core/services/notifications-center.service';

@Component({
  selector: 'app-web-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './web-header.component.html',
  styleUrls: ['./web-header.component.scss'],
})
export class WebHeaderComponent {
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);
  protected readonly chatInboxService = inject(ChatInboxService);
  protected readonly notificationsService = inject(NotificationsCenterService);
  private readonly logger = inject(AppLoggerService);
  private inboxWarmupScheduled = false;
  protected notificationsOpen = false;

  @Input() fixed = false;

  protected readonly avatarFallback =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDVVPsQebFXSU8SAlguZUvq2_i2z1jIfEJqpAThFnCSc2ft_oNkdEoNzAIYc0rX3hHIb8cYJe4JAwzItbHvpYpzYRddssJLYqPLOXXxIH2AIsyANlVZXBdEzpM45Hlm3-2SzIm3G6rhbcRAv7fUDnaZqDPy6A90YSb8PEg0vb6DyZOw0UTiBKcVBUos-ycRHw0iJ_yJHffmCZfHjUTODmg4V6ZaRIgOKeFUwUsURc-JAzRR9PQwPZYXfwLNxSVks59Du_yrwoaAU6a1';

  constructor() {
    effect(() => {
      if (!this.authService.hasSession()) {
        this.inboxWarmupScheduled = false;
        this.notificationsOpen = false;
        return;
      }

      if (this.inboxWarmupScheduled) {
        return;
      }

      this.inboxWarmupScheduled = true;
      globalThis.setTimeout(() => this.warmupInbox(), 600);
      this.notificationsService.ensureLoaded().subscribe();
    });
  }

  protected goToSearch(params: Record<string, string | undefined>) {
    this.router.navigate(['/search'], { queryParams: params });
  }

  protected openProtected(path: string) {
    if (!this.authService.hasSession()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    if (path === '/chat') {
      this.chatInboxService.ensureReady().subscribe();
    }

    this.router.navigate([path]);
  }

  protected isRouteActive(path: string) {
    const currentPath = this.router.url.split('?')[0].split('#')[0];
    return currentPath === path || currentPath.startsWith(`${path}/`);
  }

  protected get unreadChatCount() {
    return this.chatInboxService.unreadCount();
  }

  protected get unreadChatBadge() {
    return this.unreadChatCount > 99 ? '99+' : String(this.unreadChatCount);
  }

  protected toggleNotifications() {
    if (!this.authService.hasSession()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    this.notificationsOpen = !this.notificationsOpen;

    if (this.notificationsOpen) {
      this.notificationsService.ensureLoaded(true).subscribe();
    }
  }

  protected closeNotifications() {
    this.notificationsOpen = false;
  }

  protected markNotificationRead(notificationId: string) {
    this.notificationsService.markRead(notificationId).subscribe();
  }

  protected get unreadNotificationCount() {
    return this.notificationsService.unreadCount();
  }

  protected get unreadNotificationBadge() {
    return this.unreadNotificationCount > 99
      ? '99+'
      : String(this.unreadNotificationCount);
  }

  protected get avatarUrl() {
    return (
      this.authService.currentUser()?.profile?.avatarUrl || this.avatarFallback
    );
  }

  private warmupInbox() {
    this.chatInboxService
      .ensureReady()
      .pipe(
        catchError((error) => {
          this.logger.warn('web-header', 'chat_inbox_warmup_failed', {
            message: error?.message ?? 'Erro desconhecido',
          });
          return of(false);
        }),
      )
      .subscribe();
  }
}
