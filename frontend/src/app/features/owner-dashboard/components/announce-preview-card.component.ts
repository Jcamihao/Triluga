import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-announce-preview-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="bg-white rounded-xl shadow-xl shadow-on-surface/5 overflow-hidden max-w-sm mx-auto"
    >
      <div class="aspect-video bg-surface-container relative group">
        <img
          class="w-full h-full object-cover"
          [src]="owner.vehicleSummaryImageUrl"
          alt="Prévia do veículo"
        />
        <div
          class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4"
        >
          <span class="text-white font-bold text-sm">Prévia do Anúncio</span>
        </div>
      </div>

      <div class="p-5 space-y-3">
        <div class="flex justify-between items-start gap-4">
          <div class="min-w-0">
            <h3 class="announce-preview-title font-bold leading-tight">
              {{ owner.generatedVehicleTitle }}
            </h3>
            <p class="text-sm text-on-surface-variant">
              {{ owner.vehicleDraft.year }} •
              {{ owner.transmissionLabel(owner.vehicleDraft.transmission) }}
            </p>
          </div>

          <div class="text-right">
            <p class="text-xs uppercase font-bold text-outline">Por semana</p>
            <p class="text-lg font-extrabold text-primary whitespace-nowrap">
              R$ {{ owner.vehicleDraft.weeklyRate || 0 | number: '1.0-0' }}
            </p>
          </div>
        </div>

        <div class="flex gap-2 flex-wrap">
          <span
            class="bg-surface-container text-on-surface-variant px-3 py-1 rounded-full text-xs font-semibold"
          >
            {{ owner.fuelTypeLabel(owner.vehicleDraft.fuelType) }}
          </span>
          <span
            class="bg-surface-container text-on-surface-variant px-3 py-1 rounded-full text-xs font-semibold"
          >
            {{ owner.vehicleDraft.seats }} lugares
          </span>
        </div>
      </div>
    </div>
  `,
})
export class AnnouncePreviewCardComponent {
  @Input({ required: true }) owner!: any;
}
