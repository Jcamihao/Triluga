import { Component } from '@angular/core';
import { CHAT_IMPORTS, ChatPageBase } from './chat-page.base';

@Component({
  selector: 'app-chat-mobile',
  standalone: true,
  imports: CHAT_IMPORTS,
  templateUrl: './chat-mobile.component.html',
  styleUrls: ['./chat-mobile.component.scss'],
})
export class ChatMobileComponent extends ChatPageBase {
  constructor() {
    super();
  }
}
