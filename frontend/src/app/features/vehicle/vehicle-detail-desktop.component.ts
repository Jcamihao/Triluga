import { Component } from '@angular/core';
import { VEHICLE_DETAIL_IMPORTS, VehicleDetailPageBase } from './vehicle-detail-page.base';

@Component({
  selector: 'app-vehicle-detail-desktop',
  standalone: true,
  imports: VEHICLE_DETAIL_IMPORTS,
  templateUrl: './vehicle-detail-desktop.component.html',
  styleUrls: ['./vehicle-detail-desktop.component.scss'],
})
export class VehicleDetailDesktopComponent extends VehicleDetailPageBase {}
