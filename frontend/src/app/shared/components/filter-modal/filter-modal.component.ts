import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PRICE_RANGE_MAX,
  priceTrackLeft,
  priceTrackWidth,
  toPriceFilters,
} from '../../../features/search/search-price.util';

const PRICE_MODAL_DEFAULT_MIN = 10;
const PRICE_MODAL_DEFAULT_MAX = 80;

export type FilterDraft = {
  vehicleType: string;
  category: string;
  motorcycleStyle: string;
  transmission: string;
  fuelType: string;
  minEngineCc: string;
  maxEngineCc: string;
  minDailyRate: string;
  maxDailyRate: string;
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
    if (!this.draft.minDailyRate && !this.draft.maxDailyRate) {
      this.draft.minDailyRate = String(PRICE_MODAL_DEFAULT_MIN);
      this.draft.maxDailyRate = String(PRICE_MODAL_DEFAULT_MAX);
    } else {
      // Máximo vazio = sem teto: o controle fica no topo ("R$ 300+").
      this.draft.minDailyRate = this.draft.minDailyRate || '0';
      this.draft.maxDailyRate = this.draft.maxDailyRate || String(PRICE_RANGE_MAX);
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
      minDailyRate: '',
      maxDailyRate: '',
      radiusKm: '',
    });
  }

  protected applyDraft() {
    this.apply.emit(toPriceFilters(this.draft));
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
    const min = parseInt(this.draft.minDailyRate) || 0;
    const max = parseInt(this.draft.maxDailyRate) || PRICE_RANGE_MAX;

    if (min > max) {
      if (changed === 'min') {
        this.draft.minDailyRate = max.toString();
      } else {
        this.draft.maxDailyRate = min.toString();
      }
    }
  }

  protected get isMaxBounded() {
    return (parseInt(this.draft.maxDailyRate) || PRICE_RANGE_MAX) < PRICE_RANGE_MAX;
  }

  protected get priceTrackLeft() {
    return priceTrackLeft(this.draft);
  }

  protected get priceTrackWidth() {
    return priceTrackWidth(this.draft);
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
      minDailyRate: String(PRICE_MODAL_DEFAULT_MIN),
      maxDailyRate: String(PRICE_MODAL_DEFAULT_MAX),
      radiusKm: '',
    };
  }
}
