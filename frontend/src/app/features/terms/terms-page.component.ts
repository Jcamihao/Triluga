import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-terms-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './terms-page.component.html',
  styleUrls: ['./terms-page.component.scss'],
})
export class TermsPageComponent {
  readonly lastUpdated = '12 de setembro de 2026';
}
