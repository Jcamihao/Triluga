import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChatConversationItem, ChatMessage } from '../models/domain.models';
import { normalizeApiPayloadUrls } from '../utils/network-url.util';

@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private readonly http = inject(HttpClient);

  startVehicleConversation(vehicleId: string) {
    return this.http
      .post<ChatConversationItem>(
        `${environment.apiBaseUrl}/chats/vehicle/${vehicleId}/start`,
        {},
      )
      .pipe(map((conversation) => normalizeApiPayloadUrls(conversation)));
  }

  getMyConversations() {
    return this.http
      .get<ChatConversationItem[]>(`${environment.apiBaseUrl}/chats`)
      .pipe(map((conversations) => normalizeApiPayloadUrls(conversations)));
  }

  getMessages(conversationId: string) {
    return this.http
      .get<
        ChatMessage[]
      >(`${environment.apiBaseUrl}/chats/${conversationId}/messages`)
      .pipe(map((messages) => normalizeApiPayloadUrls(messages)));
  }

  sendMessage(conversationId: string, content: string) {
    return this.http
      .post<ChatMessage>(
        `${environment.apiBaseUrl}/chats/${conversationId}/messages`,
        {
          content,
        },
      )
      .pipe(map((message) => normalizeApiPayloadUrls(message)));
  }

  markAsRead(conversationId: string) {
    return this.http.patch<{
      success: boolean;
      conversationId: string;
      readAt: string;
    }>(`${environment.apiBaseUrl}/chats/${conversationId}/read`, {});
  }
}
