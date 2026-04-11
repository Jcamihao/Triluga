import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-fixed-action-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fixed-action-button.component.html',
  styleUrls: ['./fixed-action-button.component.scss'],
})
export class FixedActionButtonComponent {
  @Input() helper = 'Pronto para seguir?';
  @Input() label = 'Continue';
  @Input() actionLabel = 'Avançar';
  @Input() actionIcon = 'arrow_forward';
  @Input() secondaryActionLabel?: string;
  @Input() secondaryActionIcon = 'chat_bubble';
  @Input() secondaryBadgeCount = 0;
  @Output() action = new EventEmitter<void>();
  @Output() secondaryAction = new EventEmitter<void>();

  get secondaryBadgeLabel() {
    if (!this.secondaryBadgeCount) {
      return '';
    }

    return this.secondaryBadgeCount > 99
      ? '99+'
      : String(this.secondaryBadgeCount);
  }
}
