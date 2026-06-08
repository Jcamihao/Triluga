import { Component } from '@angular/core';
import { CHAT_IMPORTS, ChatPageBase } from './chat-page.base';

@Component({
  selector: 'app-chat-desktop',
  standalone: true,
  imports: CHAT_IMPORTS,
  templateUrl: './chat-desktop.component.html',
  styleUrls: ['./chat-desktop.component.scss'],
})
export class ChatDesktopComponent extends ChatPageBase {
  constructor() {
    super();
  }
}
