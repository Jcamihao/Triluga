import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { VehiclesApiService } from '../../core/services/vehicles-api.service';
import { SearchHeaderComponent } from '../../shared/components/search-header/search-header.component';
import { VehicleCardComponent } from '../../shared/components/vehicle-card/vehicle-card.component';
import { VehicleCardItem } from '../../core/models/domain.models';

type BrandShortcut = {
  label: string;
  query: string;
  iconPath?: string;
  iconKind?: 'path' | 'volkswagen' | 'byd';
  iconViewBox?: string;
  iconWide?: boolean;
};

const POPULAR_BRANDS: BrandShortcut[] = [
  {
    label: 'Chevrolet',
    query: 'Chevrolet',
    iconPath:
      'M20.65 9.77h-4.53L14.8 7H9.2L7.88 9.77H3.35L2 12.5l1.35 2.73h4.53L9.2 18h5.6l1.32-2.77h4.53L22 12.5l-1.35-2.73zm-5.71 4.13-1.32 2.77h-3.24L9.06 13.9H4.21l-.66-1.4.66-1.4h4.85l1.32-2.77h3.24l1.32 2.77h4.85l.66 1.4-.66 1.4h-4.85z',
  },
  {
    label: 'BMW',
    query: 'BMW',
    iconPath:
      'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 .78C18.196.78 23.219 5.803 23.219 12c0 6.196-5.022 11.219-11.219 11.219C5.803 23.219.781 18.196.781 12S5.804.78 12 .78zm-.678.63c-.33.014-.66.042-.992.078l-.107 2.944a9.95 9.95 0 0 1 .71-.094l.07-1.988-.013-.137.043.13.664 1.489h.606l.664-1.488.04-.131-.01.137.07 1.988c.232.022.473.054.71.094l-.109-2.944a14.746 14.746 0 0 0-.992-.078l-.653 1.625-.023.12-.023-.12-.655-1.625zM12 4.883a7.114 7.114 0 0 0-7.08 6.388v.002a7.122 7.122 0 0 0 8.516 7.697 7.112 7.112 0 0 0 5.68-6.97A7.122 7.122 0 0 0 12 4.885v-.002zM12 5.818A6.175 6.175 0 0 1 18.182 12H12v6.182A6.175 6.175 0 0 1 5.818 12H12V5.818Z',
  },
  {
    label: 'Jeep',
    query: 'Jeep',
    iconPath:
      'M4.1651 7.1687v5.2011c0 .6762-.444 1.0777-1.1628 1.0777-.7185 0-1.0992-.5283-1.0992-1.0992v-.9299H0v.9514c0 .972.296 2.7068 3.0235 2.7068 2.7272 0 3.1082-1.8614 3.1082-2.7488V7.1687Zm4.9177 2.1562c-1.7973 0-2.6003 1.6485-2.6003 3.0657 0 1.4168.9094 2.7912 2.7695 2.7912 1.6285.021 2.707-1.0361 2.707-1.8187h-1.7977s-.2113.5078-.8458.5078c-.6343 0-.9934-.3596-.9934-1.2265h3.6576c0-2.7277-1.3526-3.3195-2.897-3.3195zm5.8471 0c-1.7968 0-2.6007 1.6485-2.6007 3.0657 0 1.4168.9094 2.7912 2.7705 2.7912 1.628.021 2.7067-1.0361 2.7067-1.8187h-1.7978s-.2116.5078-.8454.5078c-.6348 0-.9942-.3596-.9942-1.2265h3.6574c0-2.7277-1.3523-3.3195-2.8965-3.3195zm6.7435.0635c-.9132 0-1.3186.4962-1.3401.522-.1283.1538-.2875.3165-.2875-.0782v-.2959h-1.8193v7.295h1.8398V14.822c0-.148.1478-.126.2543 0 .1063.1277.5711.4443 1.3752.4443C23.155 15.2663 24 13.9978 24 12.264c0-2.2415-1.4162-2.8757-2.3266-2.8756z',
  },
  {
    label: 'Fiat',
    query: 'Fiat',
    iconPath:
      'M21.175 6.25c.489 1.148.726 2.442.726 3.956 0 .818-.068 1.69-.206 2.666-.286 2.01-1.048 4.11-1.75 5.494-.114.223-.205.371-.388.533-.32.282-.602.352-.706.291-.084-.05-.131-.302-.114-.673.014-.316.089-.55.204-.924a36.261 36.261 0 0 0 1.2-5.416c.385-2.664.37-5.06-.201-6.52a2.224 2.224 0 0 0-.22-.427c-.062-.09-.106-.136-.106-.136-1.181-1.183-4.37-1.776-7.56-1.776-3.19 0-6.378.593-7.558 1.776 0 0-.045.045-.106.136a2.122 2.122 0 0 0-.221.426c-.572 1.46-.586 3.857-.201 6.521.26 1.807.672 3.72 1.227 5.504.096.307.158.516.173.84.016.369-.03.62-.114.67-.104.06-.389-.01-.71-.295-.23-.205-.345-.405-.49-.701-.68-1.385-1.393-3.397-1.667-5.323a18.884 18.884 0 0 1-.206-2.666c0-1.514.238-2.807.726-3.954.367-.86.983-1.58 1.782-2.083a13.892 13.892 0 0 1 6.526-2.122 13.9 13.9 0 0 1 .815-.026h.02c.274 0 .548.01.818.026 2.282.138 4.539.873 6.525 2.122a4.583 4.583 0 0 1 1.782 2.082zM23.975 12c0 6.617-5.372 12-11.976 12C5.397 24 .025 18.617.025 12S5.397 0 12 0c6.604 0 11.976 5.383 11.976 12z',
  },
  {
    label: 'Ford',
    query: 'Ford',
    iconPath:
      'M12 8.236C5.872 8.236.905 9.93.905 12.002S5.872 15.767 12 15.767c6.127 0 11.094-1.693 11.094-3.765 0-2.073-4.967-3.766-11.094-3.766zM12 7.5C5.34 7.5 0 9.497 0 12c0 2.488 5.383 4.5 12 4.5s12-2.02 12-4.5-5.383-4.5-12-4.5zm0 8.608C5.649 16.108.5 14.27.5 12.002.5 9.733 5.65 7.895 12 7.895s11.498 1.838 11.498 4.107c0 2.268-5.148 4.106-11.498 4.106z',
  },
  {
    label: 'Volkswagen',
    query: 'Volkswagen',
    iconKind: 'volkswagen',
  },
  {
    label: 'BYD',
    query: 'BYD',
    iconKind: 'byd',
    iconViewBox: '0 0 48 24',
    iconWide: true,
  },
];

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, SearchHeaderComponent, VehicleCardComponent],
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss'],
})
export class HomePageComponent {
  private readonly router = inject(Router);
  private readonly vehiclesApiService = inject(VehiclesApiService);

  @ViewChild('adsRail') adsRailRef?: ElementRef<HTMLDivElement>;

  protected readonly popularBrands = POPULAR_BRANDS.slice(0, 7);
  protected carouselAds: VehicleCardItem[] = [];
  protected carList: VehicleCardItem[] = [];
  protected carouselLoading = true;
  protected carsLoading = true;

  constructor() {
    this.loadCarouselAds();
    this.loadCarList();
  }

  protected goToSearch(params: Record<string, string | undefined>) {
    this.router.navigate(['/search'], {
      queryParams: params,
    });
  }

  protected goToHost() {
    this.router.navigateByUrl('/anunciar');
  }

  protected scrollAds(direction: -1 | 1) {
    const rail = this.adsRailRef?.nativeElement;

    if (!rail) {
      return;
    }

    rail.scrollBy({
      left: direction * Math.min(rail.clientWidth * 0.9, 760),
      behavior: 'smooth',
    });
  }

  protected trackByVehicleId(_index: number, vehicle: VehicleCardItem) {
    return vehicle.id;
  }

  protected get carListSummary() {
    return this.carList.length
      ? `${this.carList.length} carros disponíveis agora`
      : 'Carros disponíveis agora';
  }

  private loadCarouselAds() {
    this.carouselLoading = true;
    this.vehiclesApiService.search({ limit: 12 }).subscribe({
      next: (response) => {
        this.carouselAds = response.items;
        this.carouselLoading = false;
      },
      error: () => {
        this.carouselAds = [];
        this.carouselLoading = false;
      },
    });
  }

  private loadCarList() {
    this.carsLoading = true;
    this.vehiclesApiService.search({ limit: 35, vehicleType: 'CAR' }).subscribe({
      next: (response) => {
        this.carList = response.items;
        this.carsLoading = false;
      },
      error: () => {
        this.carList = [];
        this.carsLoading = false;
      },
    });
  }
}
