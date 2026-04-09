import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

type FilterDraft = {
  vehicleType: string;
  category: string;
  motorcycleStyle: string;
  minEngineCc: string;
  maxEngineCc: string;
  minPrice: string;
  maxPrice: string;
  radiusKm: string;
};

@Component({
  selector: 'app-filter-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './filter-modal.component.html',
  styleUrls: ['./filter-modal.component.scss'],
})
export class FilterModalComponent {
  @Input() open = false;
  @Input() set filters(value: Partial<FilterDraft>) {
    this.draft = {
      ...this.createDraft(),
      ...value,
    };
  }

  @Output() close = new EventEmitter<void>();
  @Output() apply = new EventEmitter<FilterDraft>();

  protected draft: FilterDraft = this.createDraft();

  reset() {
    this.draft = this.createDraft();
    this.apply.emit(this.draft);
  }

  protected onVehicleTypeChange() {
    if (this.draft.vehicleType === 'MOTORCYCLE') {
      this.draft.category = '';
      return;
    }

    this.draft.motorcycleStyle = '';
    this.draft.minEngineCc = '';
    this.draft.maxEngineCc = '';
  }

  private createDraft(): FilterDraft {
    return {
      vehicleType: '',
      category: '',
      motorcycleStyle: '',
      minEngineCc: '',
      maxEngineCc: '',
      minPrice: '',
      maxPrice: '',
      radiusKm: '',
    };
  }
}
