import { Component } from '@angular/core';
import { OWNER_DASHBOARD_IMPORTS, OwnerDashboardPageBase } from './owner-dashboard-page.base';

@Component({
  selector: 'app-owner-dashboard-mobile',
  standalone: true,
  imports: OWNER_DASHBOARD_IMPORTS,
  templateUrl: './owner-dashboard-mobile.component.html',
  styleUrls: ['./owner-dashboard-mobile.component.scss'],
})
export class OwnerDashboardMobileComponent extends OwnerDashboardPageBase {}
