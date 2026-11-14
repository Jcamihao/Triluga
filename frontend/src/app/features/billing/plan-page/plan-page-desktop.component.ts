import { Component } from '@angular/core';
import { PLAN_PAGE_IMPORTS, PlanPageBase } from './plan-page.base';
import { WebHeaderComponent } from '../../../shared/components/web-header/web-header.component';

@Component({
  selector: 'app-plan-page-desktop',
  standalone: true,
  imports: [...PLAN_PAGE_IMPORTS, WebHeaderComponent],
  templateUrl: './plan-page-desktop.component.html',
  styleUrls: ['./plan-page-desktop.component.scss'],
})
export class PlanPageDesktopComponent extends PlanPageBase {}
