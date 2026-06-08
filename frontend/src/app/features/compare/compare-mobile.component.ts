import { Component } from '@angular/core';
import { COMPARE_IMPORTS, ComparePageBase } from './compare-page.base';

@Component({
  selector: 'app-compare-mobile',
  standalone: true,
  imports: COMPARE_IMPORTS,
  templateUrl: './compare-mobile.component.html',
  styleUrls: ['./compare-mobile.component.scss'],
})
export class CompareMobileComponent extends ComparePageBase {}
