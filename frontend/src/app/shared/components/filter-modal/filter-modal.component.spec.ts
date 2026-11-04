import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FilterDraft, FilterModalComponent } from './filter-modal.component';

describe('FilterModalComponent (preço)', () => {
  let fixture: ComponentFixture<FilterModalComponent>;
  let emitted: FilterDraft | null;

  function open(filters: Partial<FilterDraft>) {
    fixture.componentInstance.filters = filters;
    fixture.detectChanges();
  }

  function apply() {
    (fixture.componentInstance as any).applyDraft();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FilterModalComponent] });
    fixture = TestBed.createComponent(FilterModalComponent);
    emitted = null;
    fixture.componentInstance.apply.subscribe((value) => (emitted = value));
  });

  it('sem filtro de preço: aplicar emite vazio (sem faixa padrão) e mostra R$ 0 - R$ 300+', () => {
    open({ vehicleType: 'CAR', minDailyRate: '', maxDailyRate: '' });
    expect(fixture.nativeElement.textContent).toContain('R$ 0');
    expect(fixture.nativeElement.textContent).toContain('R$ 300+');
    apply();
    expect(emitted!.minDailyRate).toBe('');
    expect(emitted!.maxDailyRate).toBe('');
  });

  it('com 30/120: aplicar emite 30/120', () => {
    open({ minDailyRate: '30', maxDailyRate: '120' });
    apply();
    expect(emitted!.minDailyRate).toBe('30');
    expect(emitted!.maxDailyRate).toBe('120');
  });

  it('teto 0 legado é mantido ao aplicar', () => {
    open({ minDailyRate: '', maxDailyRate: '0' });
    apply();
    expect(emitted!.minDailyRate).toBe('');
    expect(emitted!.maxDailyRate).toBe('0');
  });

  it('só mudar o tipo de veículo não cria filtro de preço', () => {
    open({ minDailyRate: '', maxDailyRate: '' });
    (fixture.componentInstance as any).setVehicleType('MOTORCYCLE');
    apply();
    expect(emitted!.vehicleType).toBe('MOTORCYCLE');
    expect(emitted!.minDailyRate).toBe('');
    expect(emitted!.maxDailyRate).toBe('');
  });
});
