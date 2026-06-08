import { Component } from '@angular/core';
import { OWNER_DASHBOARD_IMPORTS, OwnerDashboardPageBase } from './owner-dashboard-page.base';

@Component({
  selector: 'app-owner-dashboard-desktop',
  standalone: true,
  imports: OWNER_DASHBOARD_IMPORTS,
  templateUrl: './owner-dashboard-desktop.component.html',
  styleUrls: ['./owner-dashboard-desktop.component.scss'],
})
export class OwnerDashboardDesktopComponent extends OwnerDashboardPageBase {}
