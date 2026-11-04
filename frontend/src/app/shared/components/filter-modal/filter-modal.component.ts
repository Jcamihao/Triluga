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
  rateOr,
  toPriceFilters,
} from '../../../features/search/search-price.util';

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
    // Sem filtro de preço, os controles ficam nas pontas (R$ 0 a R$ 300+) e
    // toPriceFilters devolve '' ao aplicar. Zero é um teto válido.
    this.draft.minDailyRate = String(rateOr(this.draft.minDailyRate, 0));
    this.draft.maxDailyRate = String(
      rateOr(this.draft.maxDailyRate, PRICE_RANGE_MAX),
    );
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
    const min = rateOr(this.draft.minDailyRate, 0);
    const max = rateOr(this.draft.maxDailyRate, PRICE_RANGE_MAX);

    if (min > max) {
      if (changed === 'min') {
        this.draft.minDailyRate = max.toString();
      } else {
        this.draft.maxDailyRate = min.toString();
      }
    }
  }

  protected get isMaxBounded() {
    return rateOr(this.draft.maxDailyRate, PRICE_RANGE_MAX) < PRICE_RANGE_MAX;
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
      minDailyRate: '0',
      maxDailyRate: String(PRICE_RANGE_MAX),
      radiusKm: '',
    };
  }
}
