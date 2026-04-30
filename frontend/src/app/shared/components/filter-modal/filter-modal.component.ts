import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

type FilterDraft = {
  vehicleType: string;
  category: string;
  motorcycleStyle: string;
  transmission: string;
  fuelType: string;
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
export class FilterModalComponent implements OnDestroy {
  private _open = false;

  @Input() get open() {
    return this._open;
  }

  set open(value: boolean) {
    this._open = value;
    if (typeof document !== 'undefined') {
      if (value) {
        document.body.classList.add('hide-bottom-nav');
      } else {
        document.body.classList.remove('hide-bottom-nav');
      }
    }
  }

  ngOnDestroy() {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('hide-bottom-nav');
    }
  }
  @Input() set filters(value: Partial<FilterDraft>) {
    this.draft = {
      ...this.createDraft(),
      ...value,
    };

    if (!this.draft.vehicleType) {
      this.draft.vehicleType = 'CAR';
    }
    if (!this.draft.minPrice && !this.draft.maxPrice) {
      this.draft.minPrice = '50';
      this.draft.maxPrice = '500';
    }
  }

  @Output() close = new EventEmitter<void>();
  @Output() apply = new EventEmitter<FilterDraft>();

  protected draft: FilterDraft = this.createDraft();

  reset() {
    this.draft = this.createDraft();
    this.apply.emit({
      vehicleType: '',
      category: '',
      motorcycleStyle: '',
      transmission: '',
      fuelType: '',
      minEngineCc: '',
      maxEngineCc: '',
      minPrice: '',
      maxPrice: '',
      radiusKm: '',
    });
  }

  protected onVehicleTypeChange() {
    if (this.draft.vehicleType === 'MOTORCYCLE') {
      this.draft.category = '';
    } else if (this.draft.vehicleType === 'CAR') {
      this.draft.motorcycleStyle = '';
      this.draft.minEngineCc = '';
      this.draft.maxEngineCc = '';
    } else {
      this.draft.category = '';
      this.draft.motorcycleStyle = '';
      this.draft.minEngineCc = '';
      this.draft.maxEngineCc = '';
    }
  }

  protected setVehicleType(type: string) {
    if (this.draft.vehicleType === type) {
      this.draft.vehicleType = '';
    } else {
      this.draft.vehicleType = type;
    }
    this.onVehicleTypeChange();
  }

  protected setCategory(cat: string) {
    if (this.draft.category === cat) {
      this.draft.category = '';
    } else {
      this.draft.category = cat;
    }
  }

  protected setTransmission(trans: string) {
    if (this.draft.transmission === trans) {
      this.draft.transmission = '';
    } else {
      this.draft.transmission = trans;
    }
  }

  protected setFuel(fuel: string) {
    if (this.draft.fuelType === fuel) {
      this.draft.fuelType = '';
    } else {
      this.draft.fuelType = fuel;
    }
  }

  protected syncPriceSliders(changed: 'min' | 'max') {
    const min = parseInt(this.draft.minPrice) || 50;
    const max = parseInt(this.draft.maxPrice) || 1000;

    if (min > max) {
      if (changed === 'min') {
        this.draft.minPrice = max.toString();
      } else {
        this.draft.maxPrice = min.toString();
      }
    }
  }

  protected get priceTrackLeft() {
    const min = parseInt(this.draft.minPrice) || 50;
    return ((min - 50) / 950) * 100;
  }

  protected get priceTrackWidth() {
    const min = parseInt(this.draft.minPrice) || 50;
    const max = parseInt(this.draft.maxPrice) || 1000;
    return ((max - min) / 950) * 100;
  }

  private createDraft(): FilterDraft {
    return {
      vehicleType: 'CAR',
      category: '',
      motorcycleStyle: '',
      transmission: '',
      fuelType: '',
      minEngineCc: '',
      maxEngineCc: '',
      minPrice: '50',
      maxPrice: '500',
      radiusKm: '',
    };
  }
}
