import { inject, Injectable, NgZone, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { ChatMessage } from '../models/domain.models';
import { AppLoggerService } from './app-logger.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ChatSocketService {
  private readonly authService = inject(AuthService);
  private readonly logger = inject(AppLoggerService);
  private readonly zone = inject(NgZone);

  private socket?: Socket;
  private readonly messageSubject = new Subject<ChatMessage>();
  private readonly conversationUpdatedSubject = new Subject<{
    conversationId: string;
  }>();
  private readonly presenceUpdatedSubject = new Subject<{
    userId: string;
    isOnline: boolean;
  }>();
  private readonly selfPresenceSignal = signal(false);
  private readonly transportConnectedSignal = signal(false);

  readonly message$: Observable<ChatMessage> = this.messageSubject.asObservable();
  readonly conversationUpdated$: Observable<{ conversationId: string }> =
    this.conversationUpdatedSubject.asObservable();
  readonly presenceUpdated$: Observable<{ userId: string; isOnline: boolean }> =
    this.presenceUpdatedSubject.asObservable();

  connect() {
    const token = this.authService.getAccessToken();

    if (!token) {
      this.logger.warn('chat-socket', 'connect_skipped_without_token');
      this.disconnect();
      return;
    }

    if (this.socket) {
      if (!this.socket.connected) {
        this.transportConnectedSignal.set(false);
        this.selfPresenceSignal.set(false);
        this.socket.auth = { token };
        this.logger.info('chat-socket', 'reconnect_requested');
        this.socket.connect();
      }
      return;
    }

    this.socket = io(environment.wsBaseUrl, {
      transports: ['websocket'],
      auth: {
        token,
      },
      withCredentials: true,
    });
    this.transportConnectedSignal.set(false);
    this.selfPresenceSignal.set(false);

    this.socket.on('connect', () => {
      this.zone.run(() => {
        this.transportConnectedSignal.set(true);
        this.logger.info('chat-socket', 'connected', {
          socketId: this.socket?.id ?? null,
        });
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.zone.run(() => {
        this.transportConnectedSignal.set(false);
        this.selfPresenceSignal.set(false);
        this.logger.warn('chat-socket', 'disconnected', {
          reason,
        });
      });
    });

    this.socket.on('connect_error', (error) => {
      this.zone.run(() => {
        this.transportConnectedSignal.set(false);
        this.selfPresenceSignal.set(false);
        this.logger.error('chat-socket', 'connect_error', {
          message: error.message,
        });
      });
    });

    this.socket.on('chat:error', (payload: { message?: string }) => {
      this.zone.run(() => {
        this.logger.warn('chat-socket', 'server_error', {
          message: payload?.message ?? 'Erro desconhecido',
        });
      });
    });

    this.socket.on('chat:presence:self', (payload: { isOnline?: boolean }) => {
      this.zone.run(() => {
        this.selfPresenceSignal.set(!!payload?.isOnline);
        this.logger.debug('chat-socket', 'self_presence_updated', {
          isOnline: !!payload?.isOnline,
        });
      });
    });

    this.socket.on(
      'chat:presence-updated',
      (payload: { userId?: string; isOnline?: boolean }) => {
        this.zone.run(() => {
          if (!payload?.userId) {
            return;
          }

          this.logger.debug('chat-socket', 'participant_presence_updated', {
            userId: payload.userId,
            isOnline: !!payload.isOnline,
          });
          this.presenceUpdatedSubject.next({
            userId: payload.userId,
            isOnline: !!payload.isOnline,
          });
        });
      },
    );

    this.socket.on('chat:message', (message: ChatMessage) => {
      this.zone.run(() => {
        this.logger.debug('chat-socket', 'message_received', {
          conversationId: message.conversationId,
          messageId: message.id,
          senderId: message.sender.id,
        });
        this.messageSubject.next(message);
      });
    });

    this.socket.on(
      'chat:conversation-updated',
      (payload: { conversationId: string }) => {
        this.zone.run(() => {
          this.logger.debug('chat-socket', 'conversation_updated', payload);
          this.conversationUpdatedSubject.next(payload);
        });
      },
    );
  }

  joinConversation(conversationId: string) {
    this.connect();
    this.logger.info('chat-socket', 'join_conversation_requested', {
      conversationId,
    });
    this.socket?.emit('chat:join', { conversationId });
  }

  isConnected() {
    return this.transportConnectedSignal();
  }

  isConfirmedOnline() {
    return this.selfPresenceSignal();
  }

  disconnect() {
    this.logger.info('chat-socket', 'disconnect_requested');
    this.transportConnectedSignal.set(false);
    this.selfPresenceSignal.set(false);
    this.socket?.disconnect();
    this.socket = undefined;
  }
}
