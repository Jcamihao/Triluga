import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AppLoggerService } from '../../../core/services/app-logger.service';
import { BillingFlagService } from '../../../core/services/billing-flag.service';
import { ChatInboxService } from '../../../core/services/chat-inbox.service';
import { NotificationsCenterService } from '../../../core/services/notifications-center.service';
import { WebHeaderComponent } from './web-header.component';

describe('WebHeaderComponent: link Plano', () => {
  let fixture: ComponentFixture<WebHeaderComponent>;
  let hasSession: ReturnType<typeof signal<boolean>>;
  let enabled: ReturnType<typeof signal<boolean>>;

  function setup(session: boolean, flagEnabled: boolean) {
    hasSession = signal(session);
    enabled = signal(flagEnabled);

    TestBed.configureTestingModule({
      imports: [WebHeaderComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            hasSession,
            currentUser: () => null,
            hasRole: () => false,
            logout: () => undefined,
          },
        },
        {
          provide: BillingFlagService,
          useValue: { enabled, ensureLoaded: () => undefined },
        },
        {
          provide: ChatInboxService,
          useValue: {
            unreadCount: () => 0,
            ensureReady: () => of(true),
          },
        },
        {
          provide: NotificationsCenterService,
          useValue: {
            unreadCount: () => 0,
            loading: () => false,
            notifications: () => [],
            ensureLoaded: () => of([]),
            markRead: () => of(undefined),
          },
        },
        {
          provide: AppLoggerService,
          useValue: { warn: () => undefined, debug: () => undefined },
        },
      ],
    });

    fixture = TestBed.createComponent(WebHeaderComponent);
    fixture.detectChanges();
  }

  function planoLink(): HTMLElement | null {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button.web-header__link') as NodeListOf<HTMLButtonElement>,
    );
    return buttons.find((b) => b.textContent?.trim() === 'Plano') ?? null;
  }

  it('mostra "Plano" com sessão e enabled', () => {
    setup(true, true);
    expect(planoLink()).not.toBeNull();
  });

  it('não mostra "Plano" sem enabled', () => {
    setup(true, false);
    expect(planoLink()).toBeNull();
  });

  it('não mostra "Plano" sem sessão', () => {
    setup(false, true);
    expect(planoLink()).toBeNull();
  });
});
