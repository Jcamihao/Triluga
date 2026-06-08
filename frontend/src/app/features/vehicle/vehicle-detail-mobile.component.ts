import { Component } from '@angular/core';
import { VEHICLE_DETAIL_IMPORTS, VehicleDetailPageBase } from './vehicle-detail-page.base';

@Component({
  selector: 'app-vehicle-detail-mobile',
  standalone: true,
  imports: VEHICLE_DETAIL_IMPORTS,
  templateUrl: './vehicle-detail-mobile.component.html',
  styleUrls: ['./vehicle-detail-mobile.component.scss'],
})
export class VehicleDetailMobileComponent extends VehicleDetailPageBase {}
