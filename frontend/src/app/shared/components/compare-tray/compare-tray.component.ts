import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompareService } from '../../../core/services/compare.service';

@Component({
  selector: 'app-compare-tray',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './compare-tray.component.html',
  styleUrls: ['./compare-tray.component.scss'],
})
export class CompareTrayComponent {
  protected readonly compareService = inject(CompareService);

  protected trackById(_index: number, item: { id: string }) {
    return item.id;
  }
}
