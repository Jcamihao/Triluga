import { Component } from '@angular/core';
import { PLAN_PAGE_IMPORTS, PlanPageBase } from './plan-page.base';

@Component({
  selector: 'app-plan-page-mobile',
  standalone: true,
  imports: PLAN_PAGE_IMPORTS,
  templateUrl: './plan-page-mobile.component.html',
  styleUrls: ['./plan-page-mobile.component.scss'],
})
export class PlanPageMobileComponent extends PlanPageBase {}
