import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RentalEstimateComponent } from '../../../shared/components/rental-estimate/rental-estimate.component';
import { AnnouncePreviewCardComponent } from './announce-preview-card.component';

@Component({
  selector: 'app-announce-photos-price-step',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AnnouncePreviewCardComponent,
    RentalEstimateComponent,
  ],
  templateUrl: './announce-photos-price-step.component.html',
})
export class AnnouncePhotosPriceStepComponent {
  @Input({ required: true }) owner!: any;
}
