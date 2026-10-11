import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { VehiclesApiService } from '../../core/services/vehicles-api.service';
import { FeaturedApiService } from '../../core/services/featured-api.service';
import { PlateApiService } from '../../core/services/plate-api.service';
import { GeocodeApiService } from '../../core/services/geocode-api.service';
import { FipeApiService, FipeBrand, FipeModel, FipeYear, FipePriceResult } from '../../core/services/fipe-api.service';
import { VehicleCardComponent } from '../../shared/components/vehicle-card/vehicle-card.component';
import { OwnerDashboardListComponent } from './components/owner-dashboard-list.component';
import { VehicleWizardComponent } from './components/vehicle-wizard.component';
import {
  CreateVehiclePayload,
  FeaturedOrder,
  FeaturedOrderResult,
  FeaturedPlan,
  FuelType,
  MechanicsCondition,
  MotorcycleStyle,
  OwnerVehicleItem,
  TransmissionType,
  VehicleImage,
  VehicleCategory,
  VehicleType,
} from '../../core/models/domain.models';

type SelectOption<T extends string> = {
  label: string;
  value: T;
};

type PublicationChecklistItem = {
  title: string;
  description: string;
  done: boolean;
};

type OwnerViewMode = 'ads';

export const OWNER_DASHBOARD_IMPORTS = [
  CommonModule,
  FormsModule,
  CurrencyPipe,
  VehicleCardComponent,
  VehicleWizardComponent,
  OwnerDashboardListComponent,
];

@Component({ template: '' })
export abstract class OwnerDashboardPageBase implements OnDestroy {
  protected readonly ownerContext = this;
  private readonly authService = inject(AuthService);
  protected readonly uiStateService = inject(UiStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly vehiclesApiService = inject(VehiclesApiService);
  private readonly featuredApiService = inject(FeaturedApiService);
  private readonly plateApi = inject(PlateApiService);
  private readonly geocodeApi = inject(GeocodeApiService);
  private readonly fipeApi = inject(FipeApiService);
  private editingVehicleCacheSource: OwnerVehicleItem[] | null = null;
  private editingVehicleCacheId: string | null = null;
  private editingVehicleCache: OwnerVehicleItem | null = null;

  private publicationChecklistCacheKey = '';
  private publicationChecklistCache: PublicationChecklistItem[] = [];
  private publicationChecklistSummaryCacheSource:
    | PublicationChecklistItem[]
    | null = null;
  private publicationChecklistSummaryCache = {
    completed: 0,
    percentage: 0,
    suggestions: [] as string[],
  };

  protected readonly fallbackImage =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='280' viewBox='0 0 400 280'%3E%3Crect width='400' height='280' fill='%23f1f5f9'/%3E%3Cpath d='M60 180 L80 145 L110 108 L290 108 L320 145 L340 180 L340 196 L60 196Z' fill='%23cbd5e1'/%3E%3Cpath d='M115 108 L135 72 L265 72 L285 108Z' fill='%2394a3b8'/%3E%3Cpath d='M140 74 L154 74 L154 102 L130 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M162 70 L238 70 L248 102 L152 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M246 74 L260 74 L270 102 L246 102Z' fill='%23e2e8f0'/%3E%3Ccircle cx='115' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='115' cy='196' r='16' fill='%2394a3b8'/%3E%3Ccircle cx='285' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='285' cy='196' r='16' fill='%2394a3b8'/%3E%3C/svg%3E";
  protected readonly vehicleTypeOptions: SelectOption<VehicleType>[] = [
    { label: 'Carro', value: 'CAR' },
    { label: 'Moto', value: 'MOTORCYCLE' },
  ];
  protected readonly categoryOptions: SelectOption<VehicleCategory>[] = [
    { label: 'Econômico', value: 'ECONOMY' },
    { label: 'Hatch', value: 'HATCH' },
    { label: 'Sedan', value: 'SEDAN' },
    { label: 'SUV', value: 'SUV' },
    { label: 'Pickup', value: 'PICKUP' },
    { label: 'Van', value: 'VAN' },
    { label: 'Esportivo', value: 'SPORT' },
    { label: 'Luxo', value: 'LUXURY' },
  ];
  protected readonly transmissionOptions: SelectOption<TransmissionType>[] = [
    { label: 'Manual', value: 'MANUAL' },
    { label: 'Automático', value: 'AUTOMATIC' },
    { label: 'CVT', value: 'CVT' },
  ];
  protected readonly fuelOptions: SelectOption<FuelType>[] = [
    { label: 'Flex', value: 'FLEX' },
    { label: 'Gasolina', value: 'GASOLINE' },
    { label: 'Etanol', value: 'ETHANOL' },
    { label: 'Diesel', value: 'DIESEL' },
    { label: 'Elétrico', value: 'ELECTRIC' },
    { label: 'Híbrido', value: 'HYBRID' },
  ];
  protected readonly motorcycleStyleOptions: SelectOption<MotorcycleStyle>[] = [
    { label: 'Scooter', value: 'SCOOTER' },
    { label: 'Street', value: 'STREET' },
    { label: 'Sport', value: 'SPORT' },
    { label: 'Trail', value: 'TRAIL' },
    { label: 'Custom', value: 'CUSTOM' },
    { label: 'Touring', value: 'TOURING' },
  ];
  protected readonly mechanicsConditionOptions: SelectOption<MechanicsCondition>[] =
    [
      { label: 'Revisar', value: 'REVIEW' },
      { label: 'Bom', value: 'GOOD' },
      { label: 'Impecável', value: 'EXCELLENT' },
    ];
  protected vehicles: OwnerVehicleItem[] = [];
  protected loading = true;
  protected vehicleFeedback = '';
  protected vehicleError = '';
  protected mediaFeedback = '';
  protected mediaError = '';
  protected submittingVehicle = false;
  protected uploadingVehicleImages = false;
  protected currentStep = 1;
  protected vehicleActionId: string | null = null;
  protected imageActionId: string | null = null;
  protected editingVehicleId: string | null = null;
  protected createMode = false;
  protected readonly viewMode: OwnerViewMode = 'ads';
  protected pendingVehicleFiles: File[] = [];
  protected pendingVehiclePreviews: Array<{ name: string; url: string }> = [];
  protected vehicleDraft = this.createVehicleDraft();
  protected readonly photoSlots = Array.from(
    { length: 4 },
    (_, index) => index,
  );
  protected readonly maxVehiclePhotoCount = 5;
  protected readonly minimumVehiclePhotoCount = 3;

  // Promote modal state
  protected promotingVehicle: OwnerVehicleItem | null = null;
  protected featuredPlans: FeaturedPlan[] = [];
  protected selectedPlanId = '';
  protected wizardSelectedPlanId = '';
  protected wizardFeaturedResult: FeaturedOrderResult | null = null;
  protected wizardFeaturedSubmitting = false;
  protected promoteSubmitting = false;
  protected promoteResult: FeaturedOrderResult | null = null;
  protected promoteError = '';

  // My featured orders
  protected myFeaturedOrders: FeaturedOrder[] = [];
  protected cancellingOrderId: string | null = null;

  // Plate lookup
  protected plateLookupLoading = false;
  protected plateLookupFilled = false;
  protected plateStolenWarning = false;

  // Address geocoding (localização exata do anúncio no mapa)
  protected addressLookupLoading = false;
  protected addressLookupStatus: 'idle' | 'found' | 'not-found' = 'idle';

  // FIPE lookup
  protected fipeOpen = false;
  protected fipeBrands: FipeBrand[] = [];
  protected fipeModels: FipeModel[] = [];
  protected fipeYears: FipeYear[] = [];
  protected fipeSelectedBrandCode = '';
  protected fipeSelectedModelCode = '';
  protected fipeSelectedYearCode = '';
  protected fipePrice: FipePriceResult | null = null;
  protected fipeLoading = false;

  constructor() {
    this.createMode =
      this.isAdsView &&
      this.route.snapshot.queryParamMap.get('editor') === 'create';

    if (this.createMode) {
      this.vehicleDraft = this.createVehicleDraft();
    }

    this.loadData();
  }

  ngOnDestroy() {
    this.revokePendingPreviewUrls();
  }

  protected get ownerAvatarUrl() {
    return (
      this.authService.currentUser()?.profile?.avatarUrl || this.fallbackImage
    );
  }

  protected get totalAds() {
    return this.vehicles.length;
  }

  protected get totalViews() {
    return this.vehicles.reduce((acc, v) => acc + (v.viewsCount || 0), 0);
  }

  protected get totalViews30Days() {
    return this.vehicles.reduce((acc, v) => acc + (v.viewsLast30Days || 0), 0);
  }

  protected get totalFavorites() {
    return this.vehicles.reduce((acc, v) => acc + (v.favoritesCount || 0), 0);
  }

  protected get totalContacts() {
    return this.vehicles.reduce((acc, v) => acc + (v.contactsCount || 0), 0);
  }

  protected get ownerRating() {
    return 5.0;
  }

  protected get isEditingVehicle() {
    return !!this.editingVehicleId;
  }

  protected get isAdsView() {
    return this.viewMode === 'ads';
  }

  protected get showVehicleEditor() {
    return this.isAdsView && (this.isEditingVehicle || this.createMode);
  }

  protected get vehicleSubmitLabel() {
    if (this.uploadingVehicleImages) {
      return 'Enviando fotos...';
    }

    if (this.submittingVehicle) {
      return this.isEditingVehicle
        ? 'Salvando anúncio...'
        : 'Publicando anúncio...';
    }

    return this.isEditingVehicle ? 'Salvar alterações' : 'Publicar anúncio';
  }

  protected get stepProgressLabel() {
    return `${Math.round((this.currentStep / 4) * 100)}% Concluído`;
  }

  protected get stepProgressWidth() {
    return `${(this.currentStep / 4) * 100}%`;
  }

  protected get stepTitle() {
    if (this.currentStep === 1) return 'Dados Principais';
    if (this.currentStep === 2) return 'Fotos e Preços';
    if (this.currentStep === 4) return 'Destaque do Anúncio';
    return 'Condições do Veículo';
  }

  protected get cityStateValue() {
    const city = this.vehicleDraft.city?.trim();
    const state = this.vehicleDraft.state?.trim();

    return [city, state].filter(Boolean).join(city && state ? ', ' : '');
  }

  protected get selectedVehicleImages() {
    return [
      ...(this.editingVehicle?.images ?? []).map((image) => ({
        id: image.id,
        url: image.url,
        source: 'saved' as const,
      })),
      ...this.pendingVehiclePreviews.map((preview, index) => ({
        id: preview.url,
        url: preview.url,
        source: 'pending' as const,
        pendingIndex: index,
      })),
    ];
  }

  protected get primaryVehicleImageUrl() {
    return this.selectedVehicleImages[0]?.url || '';
  }

  protected get vehicleSummaryImageUrl() {
    return this.primaryVehicleImageUrl || this.fallbackImage;
  }

  protected get vehicleSummaryTitle() {
    return this.generatedVehicleTitle;
  }

  protected get vehicleSummarySubtitle() {
    return [
      this.transmissionLabel(this.vehicleDraft.transmission),
      this.fuelOptions.find(
        (option) => option.value === this.vehicleDraft.fuelType,
      )?.label,
      this.vehicleDraft.year || null,
    ]
      .filter(Boolean)
      .join(' • ');
  }

  protected updateCityState(value: string) {
    const [cityPart, statePart] = value.split(',').map((part) => part.trim());

    this.vehicleDraft.city = cityPart || '';
    this.vehicleDraft.state = (statePart || this.vehicleDraft.state || '')
      .slice(0, 2)
      .toUpperCase();

    this.invalidateAddressCoordinates();
  }

  protected onAddressLineChange(value: string) {
    this.vehicleDraft.addressLine = value;
    this.invalidateAddressCoordinates();
  }

  protected lookupAddressCoordinates() {
    const addressLine = this.vehicleDraft.addressLine?.trim();
    const city = this.vehicleDraft.city?.trim();
    const state = this.vehicleDraft.state?.trim();

    if (!addressLine || !city || !state) return;

    const query = `${addressLine}, ${city} - ${state}, Brasil`;

    this.addressLookupLoading = true;
    this.addressLookupStatus = 'idle';

    this.geocodeApi.lookup(query).subscribe({
      next: (result) => {
        this.addressLookupLoading = false;
        this.addressLookupStatus = 'found';
        this.vehicleDraft.latitude = result.latitude;
        this.vehicleDraft.longitude = result.longitude;
      },
      error: () => {
        this.addressLookupLoading = false;
        this.addressLookupStatus = 'not-found';
        this.vehicleDraft.latitude = undefined;
        this.vehicleDraft.longitude = undefined;
      },
    });
  }

  private invalidateAddressCoordinates() {
    this.addressLookupStatus = 'idle';
    this.vehicleDraft.latitude = undefined;
    this.vehicleDraft.longitude = undefined;
  }

  protected lookupPlate() {
    const plate = this.vehicleDraft.plate?.trim();
    if (!plate || plate.replace(/[^a-zA-Z0-9]/g, '').length < 7) return;

    this.plateLookupLoading = true;
    this.plateLookupFilled = false;
    this.plateStolenWarning = false;

    this.plateApi.lookup(plate).subscribe((info) => {
      this.plateLookupLoading = false;
      if (!info) return;

      let filled = false;
      if (info.brand && !this.vehicleDraft.brand?.trim()) {
        this.vehicleDraft.brand = info.brand;
        filled = true;
      }
      if (info.model && !this.vehicleDraft.model?.trim()) {
        this.vehicleDraft.model = info.model;
        filled = true;
      }
      if (info.year && !this.vehicleDraft.year) {
        this.vehicleDraft.year = info.year;
        filled = true;
      }
      if (info.city && !this.vehicleDraft.city?.trim()) {
        this.vehicleDraft.city = info.city;
        filled = true;
      }
      if (info.state && !this.vehicleDraft.state?.trim()) {
        this.vehicleDraft.state = info.state.slice(0, 2).toUpperCase();
        filled = true;
      }

      this.plateLookupFilled = filled;
      this.plateStolenWarning = info.stolen;
    });
  }

  protected openFipe() {
    this.fipeOpen = true;
    this.fipePrice = null;
    this.fipeSelectedBrandCode = '';
    this.fipeSelectedModelCode = '';
    this.fipeSelectedYearCode = '';
    this.fipeBrands = [];
    this.fipeModels = [];
    this.fipeYears = [];

    const type = this.vehicleDraft.vehicleType === 'MOTORCYCLE' ? 'motorcycles' : 'cars';
    this.fipeLoading = true;
    this.fipeApi.getBrands(type).subscribe((brands) => {
      this.fipeLoading = false;
      this.fipeBrands = brands ?? [];
    });
  }

  protected onFipeBrandChange() {
    this.fipeModels = [];
    this.fipeYears = [];
    this.fipeSelectedModelCode = '';
    this.fipeSelectedYearCode = '';
    this.fipePrice = null;
    if (!this.fipeSelectedBrandCode) return;

    const type = this.vehicleDraft.vehicleType === 'MOTORCYCLE' ? 'motorcycles' : 'cars';
    this.fipeLoading = true;
    this.fipeApi.getModels(type, this.fipeSelectedBrandCode).subscribe((models) => {
      this.fipeLoading = false;
      this.fipeModels = models ?? [];
    });
  }

  protected onFipeModelChange() {
    this.fipeYears = [];
    this.fipeSelectedYearCode = '';
    this.fipePrice = null;
    if (!this.fipeSelectedModelCode) return;

    const type = this.vehicleDraft.vehicleType === 'MOTORCYCLE' ? 'motorcycles' : 'cars';
    this.fipeLoading = true;
    this.fipeApi.getYears(type, this.fipeSelectedBrandCode, this.fipeSelectedModelCode).subscribe((years) => {
      this.fipeLoading = false;
      this.fipeYears = years ?? [];
    });
  }

  protected onFipeYearChange() {
    this.fipePrice = null;
    if (!this.fipeSelectedYearCode) return;

    const type = this.vehicleDraft.vehicleType === 'MOTORCYCLE' ? 'motorcycles' : 'cars';
    this.fipeLoading = true;
    this.fipeApi.getPrice(type, this.fipeSelectedBrandCode, this.fipeSelectedModelCode, this.fipeSelectedYearCode).subscribe((price) => {
      this.fipeLoading = false;
      this.fipePrice = price ?? null;
    });
  }

  protected useFipePrice() {
    if (!this.fipePrice) return;
    this.vehicleDraft.weeklyRate = this.fipePrice.suggestedWeeklyRateMin;
    this.fipeOpen = false;
  }

  protected setVehicleType(vehicleType: VehicleType) {
    this.vehicleDraft.vehicleType = vehicleType;

    if (vehicleType !== 'MOTORCYCLE') {
      this.vehicleDraft.motorcycleStyle = undefined;
      this.vehicleDraft.engineCc = undefined;
      this.vehicleDraft.hasAbs = false;
      this.vehicleDraft.hasTopCase = false;
    }
  }

  protected setTransmission(transmission: TransmissionType) {
    this.vehicleDraft.transmission = transmission;
  }

  protected setFuelType(fuelType: FuelType) {
    this.vehicleDraft.fuelType = fuelType;
  }

  protected setSeats(seats: number) {
    this.vehicleDraft.seats = Math.min(9, Math.max(2, seats));
  }

  protected adjustSeats(delta: number) {
    this.setSeats(Number(this.vehicleDraft.seats || 5) + delta);
  }

  protected setKmPolicy(kmPolicy: 'FREE' | 'FIXED') {
    this.vehicleDraft.kmPolicy = kmPolicy;
  }

  protected setDetranStatus(status: 'OK' | 'ISSUES') {
    this.vehicleDraft.hasDetranIssues = status === 'ISSUES';
  }

  protected setInsuranceStatus(hasInsurance: boolean) {
    this.vehicleDraft.hasInsurance = hasInsurance;
  }

  protected setMechanicsCondition(condition: MechanicsCondition) {
    this.vehicleDraft.mechanicsCondition = condition;
  }

  protected get detranStatus() {
    return this.vehicleDraft.hasDetranIssues ? 'ISSUES' : 'OK';
  }

  protected get selectedPhotoCount() {
    return (
      (this.editingVehicle?.images.length ?? 0) +
      this.pendingVehicleFiles.length
    );
  }

  protected get hasMinimumVehiclePhotos() {
    return this.selectedPhotoCount >= this.minimumVehiclePhotoCount;
  }

  protected get estimatedDraftMonthlyRevenue() {
    return Number(this.vehicleDraft.weeklyRate || 0) * 4;
  }

  protected get generatedVehicleTitle() {
    return (
      [
        this.vehicleDraft.brand.trim(),
        this.vehicleDraft.model.trim(),
        this.vehicleDraft.year || null,
      ]
        .filter(Boolean)
        .join(' ') || 'Seu veículo'
    );
  }

  protected photoSlotUrl(index: number) {
    return this.selectedVehicleImages[index + 1]?.url || '';
  }

  protected photoSlotImage(index: number) {
    return this.selectedVehicleImages[index + 1] ?? null;
  }

  protected get editingVehicle() {
    if (
      this.editingVehicleCacheSource === this.vehicles &&
      this.editingVehicleCacheId === this.editingVehicleId
    ) {
      return this.editingVehicleCache;
    }

    this.editingVehicleCacheSource = this.vehicles;
    this.editingVehicleCacheId = this.editingVehicleId;
    this.editingVehicleCache =
      this.vehicles.find((vehicle) => vehicle.id === this.editingVehicleId) ??
      null;

    return this.editingVehicleCache;
  }

  protected get publicationChecklist() {
    const totalPhotos =
      (this.editingVehicle?.images.length ?? 0) +
      this.pendingVehicleFiles.length;
    const descriptionLength = this.vehicleDraft.description.trim().length;
    const hasPickupPoint = !!this.vehicleDraft.addressLine?.trim();
    const hasTitleContext =
      !!this.vehicleDraft.brand.trim() &&
      !!this.vehicleDraft.model.trim() &&
      !!this.vehicleDraft.year;
    const checklistCacheKey = [
      totalPhotos,
      descriptionLength,
      hasPickupPoint ? 1 : 0,
      hasTitleContext ? 1 : 0,
      this.vehicleDraft.vehicleType,
      this.vehicleDraft.motorcycleStyle ?? '',
      this.vehicleDraft.engineCc ?? '',
    ].join('|');

    if (this.publicationChecklistCacheKey === checklistCacheKey) {
      return this.publicationChecklistCache;
    }

    this.publicationChecklistCacheKey = checklistCacheKey;
    this.publicationChecklistCache = [
      {
        title: 'Fotos do anúncio',
        description:
          totalPhotos >= 3
            ? `${totalPhotos} fotos prontas para publicar.`
            : 'Adicione pelo menos 3 fotos reais do veículo.',
        done: totalPhotos >= 3,
      },
      {
        title: 'Descrição completa',
        description:
          descriptionLength >= 80
            ? 'A descrição já responde as dúvidas principais.'
            : 'Explique diferenciais, retirada e condições básicas da negociação.',
        done: descriptionLength >= 80,
      },
      {
        title: 'Retirada definida',
        description: hasPickupPoint
          ? 'O endereço de retirada já está definido.'
          : 'Defina onde o carro pode ser retirado.',
        done: hasPickupPoint,
      },
      {
        title:
          this.vehicleDraft.vehicleType === 'MOTORCYCLE'
            ? 'Ficha da moto'
            : 'Título específico',
        description:
          this.vehicleDraft.vehicleType === 'MOTORCYCLE'
            ? this.vehicleDraft.motorcycleStyle && this.vehicleDraft.engineCc
              ? 'Estilo e cilindrada ajudam a filtrar melhor a moto.'
              : 'Informe estilo e cilindrada para melhorar a descoberta da moto.'
            : hasTitleContext
              ? 'O título será gerado com marca, modelo e ano.'
              : 'Informe marca, modelo e ano para gerar um título claro.',
        done:
          this.vehicleDraft.vehicleType === 'MOTORCYCLE'
            ? !!this.vehicleDraft.motorcycleStyle &&
              !!this.vehicleDraft.engineCc
            : hasTitleContext,
      },
      {
        title: 'Preço definido',
        description:
          Number(this.vehicleDraft.weeklyRate) > 0
            ? 'O preço semanal já está pronto para publicação.'
            : 'Informe o preço por semana para publicar.',
        done: Number(this.vehicleDraft.weeklyRate) > 0,
      },
    ];

    return this.publicationChecklistCache;
  }

  protected get publicationChecklistCompleted() {
    return this.publicationChecklistSummary.completed;
  }

  protected get publicationReadinessPercentage() {
    return this.publicationChecklistSummary.percentage;
  }

  protected nextStep() {
    if (this.currentStep === 2 && !this.hasMinimumVehiclePhotos) {
      this.mediaError = `Adicione pelo menos ${this.minimumVehiclePhotoCount} fotos para continuar.`;
      return;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.currentStep = Math.min(4, this.currentStep + 1);

    if (this.currentStep === 4 && !this.featuredPlans.length) {
      this.featuredApiService.getPlans().subscribe({
        next: (plans) => (this.featuredPlans = plans),
        error: () => undefined,
      });
    }
  }

  protected maxVisitedStep = 1;

  protected prevStep() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.currentStep = Math.max(1, this.currentStep - 1);
  }

  protected goToStep(step: number) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.currentStep = step;
    if (step > this.maxVisitedStep) {
      this.maxVisitedStep = step;
    }
  }

  protected checkStepCompletion(step: number): boolean {
    const d = this.vehicleDraft;
    if (step === 1) {
      return !!(
        d.plate?.trim() &&
        d.brand?.trim() &&
        d.model?.trim() &&
        Number(d.year)
      );
    }
    if (step === 2) {
      return !!(
        (this.editingVehicle?.images?.length ?? 0) +
          this.pendingVehicleFiles.length >
          2 &&
        Number(d.weeklyRate) > 0 &&
        d.city?.trim() &&
        d.state?.trim().length === 2 &&
        d.addressLine?.trim() &&
        d.description?.trim()
      );
    }
    if (step === 3) {
      const isMotoComplete =
        d.vehicleType === 'MOTORCYCLE'
          ? !!(d.motorcycleStyle && Number(d.engineCc))
          : true;
      return !!(d.mechanicsCondition && Number(d.seats) > 0 && isMotoComplete);
    }
    if (step === 4) return true;
    return false;
  }

  protected getStepStatus(
    step: number,
  ): 'active' | 'completed' | 'warning' | 'pending' {
    if (this.currentStep === step) return 'active';

    const isComplete = this.checkStepCompletion(step);

    if (
      !isComplete &&
      (step < this.currentStep || step < this.maxVisitedStep)
    ) {
      return 'warning';
    }

    return isComplete ? 'completed' : 'pending';
  }

  protected saveVehicle() {
    if (!this.hasMinimumVehiclePhotos) {
      this.vehicleFeedback = '';
      this.vehicleError = `O anúncio precisa ter no mínimo ${this.minimumVehiclePhotoCount} fotos.`;
      this.mediaError = `Adicione pelo menos ${this.minimumVehiclePhotoCount} fotos reais do veículo.`;
      this.goToStep(2);
      return;
    }

    const payload = this.normalizeVehicleDraft();

    if (!payload) {
      const missingFields = this.collectMissingVehicleFields();
      this.vehicleError = this.formatMissingVehicleFieldsError(missingFields);
      this.vehicleFeedback = '';
      this.goToStep(this.resolveMissingVehicleFieldsStep(missingFields));
      return;
    }

    const wasEditing = this.isEditingVehicle;
    const successMessage = wasEditing
      ? 'Anúncio atualizado com sucesso.'
      : 'Anúncio criado com sucesso. Seu carro já pode receber contatos.';

    this.submittingVehicle = true;
    this.vehicleError = '';
    this.vehicleFeedback = '';
    this.mediaFeedback = '';
    this.mediaError = '';

    const isNewAd = !this.editingVehicleId;
    const request$ = this.editingVehicleId
      ? this.vehiclesApiService.update(this.editingVehicleId, payload)
      : this.vehiclesApiService.create(payload);

    request$.subscribe({
      next: (vehicle) => {
        const vehicleId = vehicle.id;
        const shouldRedirectToList = isNewAd && payload.isPublished;

        this.submittingVehicle = false;
        this.createMode = false;
        this.currentStep = 1;
        this.clearCreateIntent();

        if (shouldRedirectToList) {
          this.editingVehicleId = null;
        } else {
          this.editingVehicleId = vehicleId;
          this.vehicleDraft = {
            ...payload,
            addressLine: payload.addressLine || '',
            isPublished: payload.isPublished ?? true,
          };
        }

        if (this.pendingVehicleFiles.length > 0) {
          this.uploadPendingVehicleFiles(
            vehicleId,
            successMessage,
            shouldRedirectToList ? undefined : vehicleId,
          );
          return;
        }

        this.vehicleFeedback = successMessage;
        this.loadData(shouldRedirectToList ? undefined : vehicleId);
      },
      error: (error) => {
        this.submittingVehicle = false;
        this.vehicleFeedback = '';
        this.vehicleError =
          error?.error?.message || 'Não foi possível publicar o anúncio agora.';
      },
    });
  }

  protected saveVehicleAndFeatured() {
    if (!this.wizardSelectedPlanId || this.wizardFeaturedSubmitting) return;

    if (!this.hasMinimumVehiclePhotos) {
      this.vehicleError = `O anúncio precisa ter no mínimo ${this.minimumVehiclePhotoCount} fotos.`;
      this.goToStep(2);
      return;
    }

    const payload = this.normalizeVehicleDraft();
    if (!payload) {
      const missingFields = this.collectMissingVehicleFields();
      this.vehicleError = this.formatMissingVehicleFieldsError(missingFields);
      this.goToStep(this.resolveMissingVehicleFieldsStep(missingFields));
      return;
    }

    const planId = this.wizardSelectedPlanId;
    this.wizardFeaturedSubmitting = true;
    this.vehicleError = '';

    this.vehiclesApiService.create(payload).subscribe({
      next: (vehicle) => {
        const vehicleId = vehicle.id;
        const createFeaturedOrder = () => {
          this.featuredApiService.createOrder(vehicleId, planId).subscribe({
            next: (result) => {
              this.wizardFeaturedSubmitting = false;
              this.wizardFeaturedResult = result;
              this.editingVehicleId = vehicleId;
              window.scrollTo({ top: 0, behavior: 'smooth' });
            },
            error: (error) => {
              this.wizardFeaturedSubmitting = false;
              this.vehicleFeedback =
                'Anúncio publicado! ' +
                (error?.error?.message || 'O destaque não pôde ser criado agora.');
              this.loadData(vehicleId);
            },
          });
        };

        if (this.pendingVehicleFiles.length > 0) {
          this.uploadingVehicleImages = true;
          this.vehiclesApiService.uploadImages(vehicleId, this.pendingVehicleFiles).subscribe({
            next: () => {
              this.uploadingVehicleImages = false;
              this.clearPendingVehicleFiles();
              createFeaturedOrder();
            },
            error: () => {
              this.uploadingVehicleImages = false;
              this.clearPendingVehicleFiles();
              createFeaturedOrder();
            },
          });
        } else {
          createFeaturedOrder();
        }
      },
      error: (error) => {
        this.wizardFeaturedSubmitting = false;
        this.vehicleError = error?.error?.message || 'Não foi possível publicar o anúncio agora.';
      },
    });
  }

  protected copyPixCopiaECola(code: string) {
    navigator.clipboard.writeText(code).catch(() => {});
  }

  protected startEditingVehicle(vehicle: OwnerVehicleItem) {
    this.createMode = false;
    this.currentStep = 1;
    this.clearCreateIntent();
    this.editingVehicleId = vehicle.id;
    this.vehicleDraft = {
      title: vehicle.title,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      plate: vehicle.plate,
      city: vehicle.city,
      state: vehicle.state,
      vehicleType: vehicle.vehicleType || 'CAR',
      category: vehicle.category,
      transmission: vehicle.transmission,
      fuelType: vehicle.fuelType,
      seats: vehicle.seats,
      weeklyRate: vehicle.weeklyRate || vehicle.dailyRate,
      kmPolicy: vehicle.kmPolicy || 'FREE',
      motorcycleStyle: vehicle.motorcycleStyle || undefined,
      engineCc: vehicle.engineCc || undefined,
      hasAbs: !!vehicle.hasAbs,
      hasTopCase: !!vehicle.hasTopCase,
      hasInsurance: !!vehicle.hasInsurance,
      mechanicsCondition: vehicle.mechanicsCondition || undefined,
      hasDetranIssues: !!vehicle.hasDetranIssues,
      trunkSize: vehicle.trunkSize || undefined,
      description: vehicle.description,
      addressLine: vehicle.addressLine || '',
      latitude: vehicle.latitude ?? undefined,
      longitude: vehicle.longitude ?? undefined,
      isPublished: vehicle.isPublished,
    };
    this.addressLookupStatus =
      vehicle.latitude != null && vehicle.longitude != null ? 'found' : 'idle';
    this.clearPendingVehicleFiles();
    this.vehicleFeedback = '';
    this.vehicleError = '';
    this.mediaFeedback = '';
    this.mediaError = '';
  }

  protected cancelEditingVehicle() {
    this.createMode = false;
    this.currentStep = 1;
    this.editingVehicleId = null;
    this.vehicleDraft = this.createVehicleDraft();
    this.clearPendingVehicleFiles();
    this.vehicleFeedback = '';
    this.vehicleError = '';
    this.mediaFeedback = '';
    this.mediaError = '';
    this.clearCreateIntent();
  }

  protected goToCreateView() {
    if (this.isAdsView) {
      this.createMode = true;
      this.currentStep = 1;
      this.editingVehicleId = null;
      this.vehicleDraft = this.createVehicleDraft();
      this.clearPendingVehicleFiles();
      this.vehicleFeedback = '';
      this.vehicleError = '';
      this.mediaFeedback = '';
      this.mediaError = '';
    }

    this.router.navigate(['/anunciar-carro'], {
      queryParams: { editor: 'create' },
    });
  }

  protected onVehicleFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const selectedFiles = Array.from(input.files ?? []);

    if (!selectedFiles.length) {
      return;
    }

    const imageFiles = selectedFiles.filter((file) =>
      file.type.startsWith('image/'),
    );
    const availableSlots = Math.max(
      this.maxVehiclePhotoCount - this.selectedPhotoCount,
      0,
    );
    const exceededLimit = imageFiles.length > availableSlots;
    const limitedFiles = [
      ...this.pendingVehicleFiles,
      ...imageFiles.slice(0, availableSlots),
    ];

    this.setPendingVehicleFiles(limitedFiles);
    this.mediaError =
      imageFiles.length !== selectedFiles.length
        ? 'Somente arquivos de imagem podem ser enviados.'
        : exceededLimit
          ? `Você pode enviar até ${this.maxVehiclePhotoCount} fotos por anúncio.`
          : '';
    this.mediaFeedback = `${this.pendingVehicleFiles.length} foto(s) pronta(s) para envio.`;
    input.value = '';
  }

  protected onVehicleFileReplace(event: Event, selectedIndex: number) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.mediaError = 'Somente arquivos de imagem podem ser enviados.';
      return;
    }

    const selectedImage = this.selectedVehicleImages[selectedIndex];

    if (!selectedImage) {
      this.setPendingVehicleFiles([...this.pendingVehicleFiles, file]);
      this.mediaFeedback = 'Foto adicionada.';
      return;
    }

    if (selectedImage.source === 'pending') {
      const nextFiles = [...this.pendingVehicleFiles];
      nextFiles[selectedImage.pendingIndex] = file;
      this.setPendingVehicleFiles(nextFiles);
      this.mediaFeedback = 'Foto substituída.';
      this.mediaError = '';
      return;
    }

    this.replaceSavedVehicleImage(selectedImage.id, file);
  }

  protected removeSelectedVehicleImage(selectedIndex: number) {
    const selectedImage = this.selectedVehicleImages[selectedIndex];

    if (!selectedImage) {
      return;
    }

    if (selectedImage.source === 'pending') {
      this.removePendingVehicleFile(selectedImage.pendingIndex);
      return;
    }

    this.removeVehicleImageById(selectedImage.id);
  }

  protected removePendingVehicleFile(index: number) {
    const nextFiles = this.pendingVehicleFiles.filter(
      (_, fileIndex) => fileIndex !== index,
    );
    this.setPendingVehicleFiles(nextFiles);
    this.mediaFeedback = nextFiles.length
      ? `${nextFiles.length} foto(s) pronta(s) para envio.`
      : '';
  }

  protected removeVehicleImage(image: VehicleImage) {
    this.removeVehicleImageById(image.id);
  }

  private removeVehicleImageById(imageId: string) {
    if (!this.editingVehicleId) {
      return;
    }

    const vehicleId = this.editingVehicleId;

    this.imageActionId = imageId;
    this.mediaError = '';

    this.vehiclesApiService.removeImage(vehicleId, imageId).subscribe({
      next: () => {
        this.imageActionId = null;
        this.mediaFeedback = 'Foto removida do anúncio.';
        this.loadData(vehicleId);
      },
      error: (error) => {
        this.imageActionId = null;
        this.mediaFeedback = '';
        this.mediaError =
          error?.error?.message || 'Não foi possível remover esta foto agora.';
      },
    });
  }

  private replaceSavedVehicleImage(imageId: string, file: File) {
    if (!this.editingVehicleId) {
      return;
    }

    const vehicleId = this.editingVehicleId;
    this.imageActionId = imageId;
    this.mediaError = '';

    this.vehiclesApiService.removeImage(vehicleId, imageId).subscribe({
      next: () => {
        this.vehiclesApiService.uploadImages(vehicleId, [file]).subscribe({
          next: () => {
            this.imageActionId = null;
            this.mediaFeedback = 'Foto substituída com sucesso.';
            this.loadData(vehicleId);
          },
          error: (error) => {
            this.imageActionId = null;
            this.mediaFeedback = '';
            this.mediaError =
              error?.error?.message || 'Foto antiga removida, mas não foi possível enviar a nova foto.';
            this.loadData(vehicleId);
          },
        });
      },
      error: (error) => {
        this.imageActionId = null;
        this.mediaFeedback = '';
        this.mediaError =
          error?.error?.message || 'Não foi possível substituir esta foto.';
      },
    });
  }

  protected toggleVehiclePublication(vehicle: OwnerVehicleItem) {
    const nextPublishedState = !vehicle.isPublished;

    this.vehicleActionId = vehicle.id;
    this.vehicleError = '';

    this.vehiclesApiService
      .update(vehicle.id, { isPublished: nextPublishedState })
      .subscribe({
        next: () => {
          this.vehicleActionId = null;
          this.vehicleFeedback = nextPublishedState
            ? 'Anúncio publicado com sucesso.'
            : 'Anúncio movido para rascunho.';

          if (this.editingVehicleId === vehicle.id) {
            this.vehicleDraft.isPublished = nextPublishedState;
          }

          this.loadData(vehicle.id);
        },
        error: (error) => {
          this.vehicleActionId = null;
          this.vehicleFeedback = '';
          this.vehicleError =
            error?.error?.message ||
            'Não foi possível alterar a publicação do anúncio.';
        },
      });
  }

  public deactivateVehicle(vehicle: OwnerVehicleItem) {
    if (
      !globalThis.confirm(
        `Tem certeza que deseja excluir o anúncio "${vehicle.title}"?`,
      )
    ) {
      return;
    }

    this.vehicleActionId = vehicle.id;
    this.vehicleError = '';

    this.vehiclesApiService.remove(vehicle.id).subscribe({
      next: () => {
        this.vehicleActionId = null;

        if (this.editingVehicleId === vehicle.id) {
          this.cancelEditingVehicle();
        }

        this.vehicleFeedback = 'Anúncio excluído com sucesso.';
        this.loadData();
      },
      error: (error) => {
        this.vehicleActionId = null;
        this.vehicleFeedback = '';
        this.vehicleError =
          error?.error?.message || 'Não foi possível excluir o anúncio agora.';
      },
    });
  }

  protected categoryLabel(category: VehicleCategory) {
    return (
      this.categoryOptions.find((option) => option.value === category)?.label ??
      category
    );
  }

  protected vehicleTypeLabel(vehicleType: VehicleType) {
    return (
      this.vehicleTypeOptions.find((option) => option.value === vehicleType)
        ?.label ?? vehicleType
    );
  }

  protected transmissionLabel(transmission: TransmissionType) {
    return (
      this.transmissionOptions.find((option) => option.value === transmission)
        ?.label ?? transmission
    );
  }

  protected fuelTypeLabel(fuelType: FuelType) {
    return (
      this.fuelOptions.find((option) => option.value === fuelType)?.label ??
      fuelType
    );
  }

  protected trackById(_index: number, item: { id: string }) {
    return item.id;
  }

  protected openPromoteModal(vehicle: OwnerVehicleItem) {
    this.promotingVehicle = vehicle;
    this.selectedPlanId = '';
    this.promoteResult = null;
    this.promoteError = '';
    if (!this.featuredPlans.length) {
      this.featuredApiService.getPlans().subscribe({
        next: (plans) => (this.featuredPlans = plans),
        error: () => undefined,
      });
    }
  }

  protected closePromoteModal() {
    this.promotingVehicle = null;
    this.promoteResult = null;
    this.promoteError = '';
    this.selectedPlanId = '';
  }

  protected submitPromote() {
    if (!this.promotingVehicle || !this.selectedPlanId || this.promoteSubmitting) return;
    this.promoteSubmitting = true;
    this.promoteError = '';
    this.featuredApiService
      .createOrder(this.promotingVehicle.id, this.selectedPlanId)
      .subscribe({
        next: (result) => {
          this.promoteResult = result;
          this.promoteSubmitting = false;
        },
        error: (error) => {
          this.promoteSubmitting = false;
          this.promoteError = error?.error?.message || 'Não foi possível gerar o PIX agora.';
        },
      });
  }

  protected vehicleViewsLabel(vehicle: OwnerVehicleItem) {
    const viewsCount = vehicle.viewsCount ?? 0;
    return viewsCount === 1 ? '1 visualização' : `${viewsCount} visualizações`;
  }

  protected vehicleRecentViewsLabel(vehicle: OwnerVehicleItem) {
    const viewsCount = vehicle.viewsLast30Days ?? 0;
    return viewsCount === 1
      ? '1 nos últimos 30 dias'
      : `${viewsCount} nos últimos 30 dias`;
  }

  protected trackByString(_index: number, value: string) {
    return value;
  }

  protected trackByIndex(index: number) {
    return index;
  }

  protected trackByChecklistTitle(
    _index: number,
    item: PublicationChecklistItem,
  ) {
    return item.title;
  }

  protected trackByPreview(
    _index: number,
    item: { name: string; url: string },
  ) {
    return item.url;
  }

  private uploadPendingVehicleFiles(
    vehicleId: string,
    successMessage: string,
    focusVehicleId?: string,
  ) {
    this.uploadingVehicleImages = true;
    this.mediaError = '';

    this.vehiclesApiService
      .uploadImages(vehicleId, this.pendingVehicleFiles)
      .subscribe({
        next: () => {
          this.uploadingVehicleImages = false;
          this.vehicleFeedback = successMessage;
          this.mediaFeedback = 'Fotos enviadas com sucesso.';
          this.clearPendingVehicleFiles();
          this.loadData(focusVehicleId);
        },
        error: (error) => {
          this.uploadingVehicleImages = false;
          this.vehicleFeedback = successMessage;
          this.mediaFeedback = '';
          this.mediaError =
            error?.error?.message ||
            'O anúncio foi salvo, mas as fotos não puderam ser enviadas agora.';
          this.loadData(focusVehicleId);
        },
      });
  }

  private setPendingVehicleFiles(files: File[]) {
    this.revokePendingPreviewUrls();
    this.pendingVehicleFiles = files;
    this.pendingVehiclePreviews = files.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }));
  }

  private clearPendingVehicleFiles() {
    this.setPendingVehicleFiles([]);
  }

  private revokePendingPreviewUrls() {
    this.pendingVehiclePreviews.forEach((preview) =>
      URL.revokeObjectURL(preview.url),
    );
  }

  protected cancelFeaturedOrder(orderId: string) {
    if (this.cancellingOrderId) return;
    this.cancellingOrderId = orderId;
    this.featuredApiService.cancelOrder(orderId).subscribe({
      next: () => {
        this.cancellingOrderId = null;
        this.loadMyFeaturedOrders();
      },
      error: () => { this.cancellingOrderId = null; },
    });
  }

  protected featuredOrderStatusLabel(status: string) {
    const map: Record<string, string> = {
      PENDING: 'Aguardando pagamento',
      ACTIVE: 'Ativo',
      EXPIRED: 'Expirado',
      CANCELLED: 'Cancelado',
    };
    return map[status] ?? status;
  }

  private loadData(focusVehicleId?: string) {
    this.loading = true;
    this.vehiclesApiService.getMine().subscribe({
      next: (vehicles) => {
        this.vehicles = vehicles;

        if (
          this.editingVehicleId &&
          !this.vehicles.some((vehicle) => vehicle.id === this.editingVehicleId)
        ) {
          this.cancelEditingVehicle();
        }

        if (
          focusVehicleId &&
          !this.editingVehicleId &&
          this.vehicles.some((vehicle) => vehicle.id === focusVehicleId)
        ) {
          this.editingVehicleId = focusVehicleId;
        }

        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
    this.loadMyFeaturedOrders();
  }

  private loadMyFeaturedOrders() {
    this.featuredApiService.getMyOrders().subscribe({
      next: (orders) => { this.myFeaturedOrders = orders; },
      error: () => {},
    });
  }

  private clearCreateIntent() {
    if (!this.route.snapshot.queryParamMap.has('editor')) {
      return;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { editor: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private createVehicleDraft(): CreateVehiclePayload {
    const profile = this.authService.currentUser()?.profile;

    return {
      title: '',
      brand: '',
      model: '',
      year: new Date().getFullYear(),
      plate: '',
      city: profile?.city || '',
      state: profile?.state || '',
      vehicleType: 'CAR',
      category: 'HATCH',
      transmission: 'AUTOMATIC',
      fuelType: 'FLEX',
      seats: 5,
      weeklyRate: 1050,
      kmPolicy: 'FREE',
      motorcycleStyle: undefined,
      engineCc: undefined,
      hasAbs: false,
      hasTopCase: false,
      hasInsurance: false,
      mechanicsCondition: undefined,
      hasDetranIssues: false,
      trunkSize: undefined,
      description: '',
      addressLine: profile?.addressLine || '',
      isPublished: true,
    };
  }

  private normalizeVehicleDraft(): CreateVehiclePayload | null {
    const payload: CreateVehiclePayload = {
      ...this.vehicleDraft,
      brand: this.vehicleDraft.brand.trim(),
      model: this.vehicleDraft.model.trim(),
      plate: this.vehicleDraft.plate.trim().toUpperCase(),
      city: this.vehicleDraft.city.trim(),
      state: this.vehicleDraft.state.trim().toUpperCase(),
      description: this.vehicleDraft.description.trim(),
      addressLine: this.vehicleDraft.addressLine?.trim() || '',
      year: Number(this.vehicleDraft.year),
      seats: Number(this.vehicleDraft.seats),
      weeklyRate: Number(this.vehicleDraft.weeklyRate),
      kmPolicy: this.vehicleDraft.kmPolicy || 'FREE',
      hasInsurance: !!this.vehicleDraft.hasInsurance,
      mechanicsCondition: this.vehicleDraft.mechanicsCondition || undefined,
      hasDetranIssues: !!this.vehicleDraft.hasDetranIssues,
      trunkSize: this.parseOptionalNumber(this.vehicleDraft.trunkSize),
      engineCc: this.parseOptionalNumber(this.vehicleDraft.engineCc),
    };

    payload.title = [payload.brand, payload.model, payload.year]
      .filter(Boolean)
      .join(' ');

    if (
      !payload.title ||
      !payload.brand ||
      !payload.model ||
      !payload.plate ||
      !payload.city ||
      payload.state.length !== 2 ||
      !payload.addressLine ||
      !payload.description ||
      Number.isNaN(payload.year) ||
      Number.isNaN(payload.seats) ||
      !payload.weeklyRate ||
      Number.isNaN(payload.weeklyRate) ||
      payload.weeklyRate < 1 ||
      (payload.trunkSize !== undefined && Number.isNaN(payload.trunkSize)) ||
      (payload.engineCc !== undefined && Number.isNaN(payload.engineCc))
    ) {
      return null;
    }

    return payload;
  }

  private parseOptionalNumber(value: number | null | undefined) {
    if (value === undefined || value === null) {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private collectMissingVehicleFields() {
    const missingFields: string[] = [];

    if (!this.vehicleDraft.plate.trim()) {
      missingFields.push('placa');
    }

    if (!this.vehicleDraft.brand.trim()) {
      missingFields.push('marca');
    }

    if (!this.vehicleDraft.model.trim()) {
      missingFields.push('modelo');
    }

    if (!Number(this.vehicleDraft.year)) {
      missingFields.push('ano');
    }

    if (!this.vehicleDraft.city.trim()) {
      missingFields.push('cidade');
    }

    if (this.vehicleDraft.state.trim().length !== 2) {
      missingFields.push('estado');
    }

    if (!this.vehicleDraft.addressLine?.trim()) {
      missingFields.push('endereço de retirada');
    }

    if (!Number(this.vehicleDraft.seats)) {
      missingFields.push('assentos');
    }

    if (Number(this.vehicleDraft.weeklyRate) < 1) {
      missingFields.push('preço por semana');
    }

    if (!this.vehicleDraft.description.trim()) {
      missingFields.push('descrição');
    }

    if (!this.hasMinimumVehiclePhotos) {
      missingFields.push('mínimo de 3 fotos');
    }

    return missingFields;
  }

  private resolveMissingVehicleFieldsStep(missingFields: string[]) {
    const stepOneFields = new Set(['placa', 'marca', 'modelo', 'ano']);
    const stepTwoFields = new Set([
      'cidade',
      'estado',
      'endereço de retirada',
      'preço por semana',
      'descrição',
      'mínimo de 3 fotos',
    ]);

    if (missingFields.some((field) => stepOneFields.has(field))) {
      return 1;
    }

    if (missingFields.some((field) => stepTwoFields.has(field))) {
      return 2;
    }

    return 3;
  }

  private formatMissingVehicleFieldsError(missingFields: string[]) {
    if (!missingFields.length) {
      return 'Não foi possível publicar. Revise os campos obrigatórios do anúncio.';
    }

    const fieldHints: Record<string, string> = {
      placa: 'informe a placa do veículo',
      marca: 'informe a marca',
      modelo: 'informe o modelo',
      ano: 'informe um ano válido',
      cidade: 'informe a cidade de retirada',
      estado: 'informe a UF com 2 letras',
      'endereço de retirada': 'informe bairro, avenida ou ponto de encontro',
      assentos: 'informe a quantidade de lugares',
      'preço por semana': 'informe um valor semanal maior que zero',
      descrição: 'escreva a descrição do anúncio',
      'mínimo de 3 fotos': `adicione pelo menos ${this.minimumVehiclePhotoCount} fotos reais do veículo`,
    };

    const stepLabels = [
      { label: 'Dados do veículo', step: 1 },
      { label: 'Fotos, valor e retirada', step: 2 },
      { label: 'Condições do veículo', step: 3 },
    ];
    const step = this.resolveMissingVehicleFieldsStep(missingFields);
    const stepLabel =
      stepLabels.find((item) => item.step === step)?.label || 'Cadastro';
    const hints = missingFields
      .map((field) => fieldHints[field] || `preencha ${field}`)
      .join('; ');

    return `Não foi possível publicar. Na etapa "${stepLabel}", falta: ${hints}.`;
  }

  private get publicationChecklistSummary() {
    const checklist = this.publicationChecklist;

    if (this.publicationChecklistSummaryCacheSource === checklist) {
      return this.publicationChecklistSummaryCache;
    }

    const completed = checklist.filter((item) => item.done).length;

    this.publicationChecklistSummaryCacheSource = checklist;
    this.publicationChecklistSummaryCache = {
      completed,
      percentage: Math.round((completed / Math.max(checklist.length, 1)) * 100),
      suggestions: checklist
        .filter((item) => !item.done)
        .map((item) => item.description)
        .slice(0, 3),
    };

    return this.publicationChecklistSummaryCache;
  }
}
