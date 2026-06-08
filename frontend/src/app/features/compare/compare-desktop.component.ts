import { Component } from '@angular/core';
import { COMPARE_IMPORTS, ComparePageBase } from './compare-page.base';

@Component({
  selector: 'app-compare-desktop',
  standalone: true,
  imports: COMPARE_IMPORTS,
  templateUrl: './compare-desktop.component.html',
  styleUrls: ['./compare-desktop.component.scss'],
})
export class CompareDesktopComponent extends ComparePageBase {}
