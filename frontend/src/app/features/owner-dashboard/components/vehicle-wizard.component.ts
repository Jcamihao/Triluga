import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnnounceConditionsStepComponent } from './announce-conditions-step.component';
import { AnnounceDataStepComponent } from './announce-data-step.component';
import { AnnouncePhotosPriceStepComponent } from './announce-photos-price-step.component';
import { WebHeaderComponent } from '../../../shared/components/web-header/web-header.component';

@Component({
  selector: 'app-vehicle-wizard',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    AnnounceDataStepComponent,
    AnnouncePhotosPriceStepComponent,
    AnnounceConditionsStepComponent,
    WebHeaderComponent,
    RouterLink,
  ],
  templateUrl: './vehicle-wizard.component.html',
})
export class VehicleWizardComponent {
  @Input({ required: true }) owner!: any;
}
