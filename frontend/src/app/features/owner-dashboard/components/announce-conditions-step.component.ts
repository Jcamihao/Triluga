import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AnnouncePreviewCardComponent } from './announce-preview-card.component';

@Component({
  selector: 'app-announce-conditions-step',
  standalone: true,
  imports: [CommonModule, FormsModule, AnnouncePreviewCardComponent, RouterLink],
  templateUrl: './announce-conditions-step.component.html',
})
export class AnnounceConditionsStepComponent {
  @Input({ required: true }) owner!: any;
}
