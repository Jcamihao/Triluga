import { CommonModule, DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChatConversationItem,
  ChatMessage,
  PublicUserProfile,
  ReportReason,
} from '../../core/models/domain.models';
import { AppLoggerService } from '../../core/services/app-logger.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatApiService } from '../../core/services/chat-api.service';
import { ChatInboxService } from '../../core/services/chat-inbox.service';
import { ChatSocketService } from '../../core/services/chat-socket.service';
import { ProfileApiService } from '../../core/services/profile-api.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { VehiclesApiService } from '../../core/services/vehicles-api.service';
import { minRentalLabel } from '../../shared/utils/rental-pricing.util';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';

export const CHAT_IMPORTS = [
  CommonModule,
  FormsModule,
  RouterLink,
  DatePipe,
  WebHeaderComponent,
];

@Component({ template: '' })
export abstract class ChatPageBase {
  protected readonly authService = inject(AuthService);
  protected readonly socketService = inject(ChatSocketService);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly chatApiService = inject(ChatApiService);
  private readonly chatInboxService = inject(ChatInboxService);
  private readonly profileApiService = inject(ProfileApiService);
  private readonly vehiclesApiService = inject(VehiclesApiService);
  private readonly logger = inject(AppLoggerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly uiStateService = inject(UiStateService);

  protected readonly minRentalLabel = minRentalLabel;
  protected readonly fallbackAvatarImage =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='40' fill='%23f3eeee'/%3E%3Ccircle cx='80' cy='60' r='24' fill='%23b7aaac'/%3E%3Cpath d='M40 128c7-22 24-34 40-34s33 12 40 34' fill='%23b7aaac'/%3E%3C/svg%3E";
  protected readonly vehicleFallbackImage =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='280' viewBox='0 0 400 280'%3E%3Crect width='400' height='280' fill='%23f1f5f9'/%3E%3Cpath d='M60 180 L80 145 L110 108 L290 108 L320 145 L340 180 L340 196 L60 196Z' fill='%23cbd5e1'/%3E%3Cpath d='M115 108 L135 72 L265 72 L285 108Z' fill='%2394a3b8'/%3E%3Cpath d='M140 74 L154 74 L154 102 L130 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M162 70 L238 70 L248 102 L152 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M246 74 L260 74 L270 102 L246 102Z' fill='%23e2e8f0'/%3E%3Ccircle cx='115' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='115' cy='196' r='16' fill='%2394a3b8'/%3E%3Ccircle cx='285' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='285' cy='196' r='16' fill='%2394a3b8'/%3E%3C/svg%3E";

  protected readonly quickReplies = [
    'Olá! Ainda disponível?',
    'Qual o valor para mais dias?',
    'Posso retirar hoje?',
    'Tem como entregar no endereço?',
    'Pode me enviar mais fotos?',
  ];

  protected conversations: ChatConversationItem[] = [];
  protected messages: ChatMessage[] = [];
  protected selectedConversationId: string | null = null;
  protected draftMessage = '';
  protected isLoadingConversations = true;
  protected isLoadingMessages = false;
  protected isSending = false;
  protected conversationSearchTerm = '';
  protected showUnreadOnly = false;
  protected sidebarProfile: Pick<PublicUserProfile, 'ratingAverage' | 'reviewsCount' | 'bio'> | null = null;
  protected conversationReportOpen = false;
  protected conversationReportReason: ReportReason | '' = '';
  protected conversationReportDescription = '';
  protected conversationReportSubmitting = false;
  protected conversationReportDone = false;
  protected attachmentMenuOpen = false;
  protected pendingAttachment: {
    file: File;
    previewUrl: string;
    source: 'camera' | 'library';
  } | null = null;

  @ViewChild('messagesContainer')
  protected messagesContainer?: ElementRef<HTMLDivElement>;

  @ViewChild('photoInput')
  protected photoInput?: ElementRef<HTMLInputElement>;

  @ViewChild('cameraInput')
  protected cameraInput?: ElementRef<HTMLInputElement>;

  private requestedConversationId: string | null = null;
  private socketEventsBound = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.revokePendingAttachmentPreview());

    this.hydrateConversationsFromInbox();

    if (this.authService.hasSession()) {
      this.chatInboxService
        .ensureReady()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((ready) => {
          if (!ready || !this.authService.isAuthenticated()) {
            this.hydrateConversationsFromInbox();
            this.isLoadingConversations = false;
            return;
          }

          this.bootstrapAuthenticatedChat();
        });
    } else {
      this.isLoadingConversations = false;
    }

    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.requestedConversationId = params.get('conversationId');

        if (!this.requestedConversationId) {
          this.selectedConversationId = null;
          this.messages = [];
          return;
        }

        if (
          this.requestedConversationId &&
          this.hasConversation(this.requestedConversationId) &&
          this.requestedConversationId !== this.selectedConversationId
        ) {
          this.selectConversation(this.requestedConversationId);
        }
      });
  }

  protected get isConversationRoute() {
    return !!this.requestedConversationId;
  }

  protected toggleMenu() {
    this.uiStateService.toggleMenu();
  }

  protected toggleNotifications() {
    this.uiStateService.toggleNotifications();
  }

  protected get currentUserId() {
    return this.authService.currentUser()?.id ?? '';
  }

  protected get connectionStatusLabel() {
    if (this.socketService.isConfirmedOnline()) {
      return 'Online';
    }

    return this.socketService.isConnected() ? 'Verificando' : 'Offline';
  }

  protected get selectedConversation() {
    return (
      this.conversations.find(
        (conversation) => conversation.id === this.selectedConversationId,
      ) ?? null
    );
  }

  protected get desktopConversation() {
    return this.selectedConversation ?? this.filteredConversations[0] ?? null;
  }

  protected get desktopConversationMessages() {
    return this.selectedConversation ? this.messages : [];
  }

  protected get filteredConversations() {
    const searchTerm = this.conversationSearchTerm.trim().toLowerCase();

    return this.conversations.filter((conversation) => {
      if (this.showUnreadOnly && !conversation.unreadCount) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const participantName =
        conversation.otherParticipant.fullName ||
        conversation.otherParticipant.email;
      const preview = conversation.lastMessage?.content || '';

      return [participantName, conversation.vehicle.title, preview].some(
        (value) => value.toLowerCase().includes(searchTerm),
      );
    });
  }

  protected get canSendMessage() {
    return (
      !!this.selectedConversationId &&
      (!!this.draftMessage.trim() || !!this.pendingAttachment) &&
      !this.isSending &&
      !this.isLoadingMessages
    );
  }

  protected isMessageReadByRecipient(message: ChatMessage) {
    if (message.sender.id !== this.currentUserId) {
      return false;
    }

    const readAt = this.selectedConversation?.otherParticipant.lastReadAt;

    if (!readAt) {
      return false;
    }

    return new Date(readAt).getTime() >= new Date(message.createdAt).getTime();
  }

  protected messageReceiptLabel(message: ChatMessage) {
    return this.isMessageReadByRecipient(message) ? 'Lida' : 'Enviada';
  }

  protected openConversation(conversationId: string) {
    this.router.navigate(['/chat', conversationId]);
  }

  protected conversationParticipantName(conversation: ChatConversationItem) {
    return (
      conversation.otherParticipant.fullName ||
      conversation.otherParticipant.email
    );
  }

  protected conversationItemClasses(conversation: ChatConversationItem) {
    return conversation.unreadCount
      ? 'bg-surface-container-lowest'
      : 'bg-surface';
  }

  protected conversationTimeClasses(conversation: ChatConversationItem) {
    return conversation.unreadCount
      ? 'text-primary'
      : 'text-on-surface-variant/40';
  }

  protected conversationPreviewClasses(conversation: ChatConversationItem) {
    return conversation.unreadCount
      ? 'text-on-surface-variant font-bold'
      : 'text-on-surface-variant/60 font-medium';
  }

  protected isDesktopConversationActive(conversation: ChatConversationItem) {
    return this.desktopConversation?.id === conversation.id;
  }

  protected conversationTimeLabel(conversation: ChatConversationItem) {
    const value =
      conversation.lastMessageAt ||
      conversation.lastMessage?.createdAt ||
      conversation.updatedAt;
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const dayDifference = Math.round(
      (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
    );

    if (dayDifference === 0) {
      return new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }

    if (dayDifference === 1) {
      return 'Ontem';
    }

    if (dayDifference < 7) {
      return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(
        date,
      );
    }

    return new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'short',
    }).format(date);
  }

  protected trackByConversationId(
    _index: number,
    conversation: ChatConversationItem,
  ) {
    return conversation.id;
  }

  protected selectConversation(conversationId: string) {
    if (
      this.selectedConversationId === conversationId &&
      this.messages.length
    ) {
      return;
    }

    this.logger.info('chat-page', 'conversation_selected', {
      conversationId,
    });
    this.selectedConversationId = conversationId;
    this.sidebarProfile = null;

    this.socketService.joinConversation(conversationId);
    this.zeroUnreadCount(conversationId);
    this.loadMessages(conversationId);

    const participantId = this.conversations.find(
      (c) => c.id === conversationId,
    )?.otherParticipant.id;
    if (participantId) {
      this.profileApiService
        .getPublicProfile(participantId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (p) => {
            this.sidebarProfile = {
              ratingAverage: p.ratingAverage,
              reviewsCount: p.reviewsCount,
              bio: p.bio ?? null,
            };
          },
          error: () => {},
        });
    }
  }

  protected selectQuickReply(text: string) {
    this.draftMessage = text;
  }

  protected openConversationReport() {
    this.conversationReportReason = '';
    this.conversationReportDescription = '';
    this.conversationReportDone = false;
    this.conversationReportOpen = true;
  }

  protected closeConversationReport() {
    this.conversationReportOpen = false;
  }

  protected submitConversationReport() {
    const vehicleId = this.selectedConversation?.vehicle?.id;
    if (!vehicleId || !this.conversationReportReason || this.conversationReportSubmitting) return;
    this.conversationReportSubmitting = true;
    this.vehiclesApiService
      .createReport(vehicleId, this.conversationReportReason as ReportReason, this.conversationReportDescription || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.conversationReportSubmitting = false;
          this.conversationReportDone = true;
        },
        error: () => {
          this.conversationReportSubmitting = false;
        },
      });
  }

  protected sendMessage() {
    const conversationId = this.selectedConversationId;
    const content = this.buildMessageContent(this.draftMessage.trim());

    if (!conversationId || !content) {
      this.logger.warn('chat-page', 'send_message_blocked', {
        conversationId,
        hasContent: !!content,
      });
      return;
    }

    this.logger.info('chat-page', 'send_message_requested', {
      conversationId,
      length: content.length,
    });
    this.isSending = true;

    this.chatApiService
      .sendMessage(conversationId, content)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (message) => {
          this.appendMessage(message);
          this.draftMessage = '';
          this.clearPendingAttachment();
          this.isSending = false;
          this.logger.info('chat-page', 'send_message_succeeded', {
            conversationId,
            messageId: message.id,
          });
          this.refreshConversations(conversationId);
        },
        error: (error) => {
          this.isSending = false;
          this.logger.error('chat-page', 'send_message_failed', {
            conversationId,
            message: error?.message ?? 'Erro desconhecido',
          });
        },
      });
  }

  protected toggleAttachmentMenu() {
    this.attachmentMenuOpen = !this.attachmentMenuOpen;
  }

  protected openPhotoPicker() {
    this.attachmentMenuOpen = false;
    this.photoInput?.nativeElement.click();
  }

  protected openCameraPicker() {
    this.attachmentMenuOpen = false;
    this.cameraInput?.nativeElement.click();
  }

  protected handleAttachmentSelected(
    event: Event,
    source: 'camera' | 'library',
  ) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.logger.warn('chat-page', 'attachment_rejected', {
        type: file.type,
      });
      return;
    }

    this.clearPendingAttachment();
    this.pendingAttachment = {
      file,
      previewUrl: URL.createObjectURL(file),
      source,
    };
  }

  protected clearPendingAttachment() {
    this.revokePendingAttachmentPreview();
    this.pendingAttachment = null;
  }

  private bindSocketEvents() {
    if (this.socketEventsBound) {
      return;
    }

    this.socketEventsBound = true;

    this.socketService.message$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => {
        if (message.conversationId === this.selectedConversationId) {
          this.appendMessage(message);
          this.zeroUnreadCount(message.conversationId);
          this.chatApiService
            .markAsRead(message.conversationId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe();
        }

        this.logger.debug('chat-page', 'socket_message_applied', {
          conversationId: message.conversationId,
          messageId: message.id,
        });
        this.refreshConversations(message.conversationId);
      });

    this.socketService.conversationUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload) => {
        if (payload.conversationId === this.selectedConversationId) {
          this.loadMessages(payload.conversationId, { silent: true });
        }

        this.refreshConversations(payload.conversationId);
      });

    this.socketService.readReceipt$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload) => {
        this.applyReadReceipt(payload);
      });
  }

  private loadConversations(preferredConversationId?: string) {
    this.isLoadingConversations = true;
    this.hydrateConversationsFromInbox(preferredConversationId);

    this.chatApiService
      .getMyConversations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (conversations) => {
          this.chatInboxService.syncConversations(conversations);
          this.applyConversations(conversations, preferredConversationId);
          this.isLoadingConversations = false;
        },
        error: (error) => {
          this.logger.warn('chat-page', 'load_conversations_failed', {
            message: error?.message ?? 'Erro desconhecido',
          });
          this.hydrateConversationsFromInbox(preferredConversationId);
          this.isLoadingConversations = false;
        },
      });
  }

  private loadMessages(conversationId: string, options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;

    if (!silent) {
      this.isLoadingMessages = true;
    }

    this.chatApiService
      .getMessages(conversationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (messages) => {
          if (this.selectedConversationId !== conversationId) {
            if (!silent) {
              this.isLoadingMessages = false;
            }
            return;
          }

          this.messages = messages;
          this.zeroUnreadCount(conversationId);
          this.chatInboxService.syncConversations(this.conversations);
          this.scrollMessagesToBottom(silent ? 'smooth' : 'auto');
          if (!silent) {
            this.isLoadingMessages = false;
          }
        },
        error: (error) => {
          this.logger.warn('chat-page', 'load_messages_failed', {
            conversationId,
            message: error?.message ?? 'Erro desconhecido',
          });
          if (!silent) {
            this.isLoadingMessages = false;
          }
        },
      });
  }

  private refreshConversations(preferredConversationId?: string) {
    if (!this.authService.isAuthenticated()) {
      return;
    }

    this.chatApiService
      .getMyConversations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (conversations) => {
          this.chatInboxService.syncConversations(conversations);
          this.applyConversations(conversations, preferredConversationId);
        },
        error: (error) => {
          this.logger.warn('chat-page', 'refresh_conversations_failed', {
            message: error?.message ?? 'Erro desconhecido',
          });
          this.hydrateConversationsFromInbox(preferredConversationId);
        },
      });
  }

  private appendMessage(message: ChatMessage) {
    if (
      this.messages.some((currentMessage) => currentMessage.id === message.id)
    ) {
      return;
    }

    this.messages = [...this.messages, message];
    this.scrollMessagesToBottom('smooth');
  }

  private scrollMessagesToBottom(behavior: ScrollBehavior) {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const container = this.messagesContainer?.nativeElement;

        if (!container) {
          return;
        }

        container.scrollTo({
          top: container.scrollHeight,
          behavior,
        });
      });
    });
  }

  private zeroUnreadCount(conversationId: string) {
    this.conversations = this.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            unreadCount: 0,
          }
        : conversation,
    );
  }

  private applyReadReceipt(payload: {
    conversationId: string;
    readerId: string;
    readAt: string;
  }) {
    if (payload.readerId === this.currentUserId) {
      return;
    }

    this.conversations = this.conversations.map((conversation) =>
      conversation.id === payload.conversationId &&
      conversation.otherParticipant.id === payload.readerId
        ? {
            ...conversation,
            otherParticipant: {
              ...conversation.otherParticipant,
              lastReadAt: payload.readAt,
            },
          }
        : conversation,
    );

    this.chatInboxService.syncConversations(this.conversations);
  }

  private bootstrapAuthenticatedChat() {
    this.socketService.connect();
    this.bindSocketEvents();
    this.loadConversations(this.requestedConversationId ?? undefined);
  }

  private hydrateConversationsFromInbox(preferredConversationId?: string) {
    const inboxConversations = this.chatInboxService.conversations();

    if (!inboxConversations.length) {
      return false;
    }

    this.applyConversations(inboxConversations, preferredConversationId);
    return true;
  }

  private applyConversations(
    conversations: ChatConversationItem[],
    preferredConversationId?: string,
  ) {
    this.conversations = [...conversations];

    if (!this.isConversationRoute) {
      this.selectedConversationId = null;
      this.messages = [];
      return;
    }

    const targetConversationId =
      this.requestedConversationId ??
      preferredConversationId ??
      this.selectedConversationId ??
      null;

    if (!targetConversationId || !this.hasConversation(targetConversationId)) {
      this.selectedConversationId = null;
      this.messages = [];
      return;
    }

    this.selectConversation(targetConversationId);
  }

  private hasConversation(conversationId: string) {
    return this.conversations.some(
      (conversation) => conversation.id === conversationId,
    );
  }

  private buildMessageContent(content: string) {
    if (!this.pendingAttachment) {
      return content;
    }

    const attachmentLabel = `[Foto] ${this.pendingAttachment.file.name}`;

    return content ? `${content}\n${attachmentLabel}` : attachmentLabel;
  }

  private revokePendingAttachmentPreview() {
    if (this.pendingAttachment?.previewUrl) {
      URL.revokeObjectURL(this.pendingAttachment.previewUrl);
    }
  }
}
