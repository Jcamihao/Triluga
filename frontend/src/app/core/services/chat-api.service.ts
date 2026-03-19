import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  ChatConversationItem,
  ChatMessage,
} from '../models/domain.models';

@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private readonly http = inject(HttpClient);

  startVehicleConversation(vehicleId: string) {
    return this.http.post<ChatConversationItem>(
      `${environment.apiBaseUrl}/chats/vehicle/${vehicleId}/start`,
      {},
    );
  }

  getMyConversations() {
    return this.http.get<ChatConversationItem[]>(
      `${environment.apiBaseUrl}/chats`,
    );
  }

  getMessages(conversationId: string) {
    return this.http.get<ChatMessage[]>(
      `${environment.apiBaseUrl}/chats/${conversationId}/messages`,
    );
  }

  sendMessage(conversationId: string, content: string) {
    return this.http.post<ChatMessage>(
      `${environment.apiBaseUrl}/chats/${conversationId}/messages`,
      { content },
    );
  }

  markAsRead(conversationId: string) {
    return this.http.patch<{
      success: boolean;
      conversationId: string;
      readAt: string;
    }>(`${environment.apiBaseUrl}/chats/${conversationId}/read`, {});
  }
}
