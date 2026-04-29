import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnnouncePreviewCardComponent } from './announce-preview-card.component';

@Component({
  selector: 'app-announce-conditions-step',
  standalone: true,
  imports: [CommonModule, FormsModule, AnnouncePreviewCardComponent],
  templateUrl: './announce-conditions-step.component.html',
})
export class AnnounceConditionsStepComponent {
  @Input({ required: true }) owner!: any;
}
