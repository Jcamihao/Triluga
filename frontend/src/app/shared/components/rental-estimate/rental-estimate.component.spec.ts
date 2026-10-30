import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RENTAL_DISCLAIMER } from '../../utils/rental-pricing.util';
import { RentalEstimateComponent } from './rental-estimate.component';

registerLocaleData(localePt);

describe('RentalEstimateComponent', () => {
  let fixture: ComponentFixture<RentalEstimateComponent>;

  const text = () =>
    (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RentalEstimateComponent],
      providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
    }).compileComponents();
    fixture = TestBed.createComponent(RentalEstimateComponent);
  });

  it('mostra diária, 7 dias, 30 dias e o aviso, sem período mínimo', () => {
    fixture.componentRef.setInput('dailyRate', 100);
    fixture.detectChanges();

    expect(text()).toContain('Quanto você pagaria (estimativa)');
    expect(text()).toContain('100,00');
    expect(text()).toContain('700,00');
    expect(text()).toContain('3.000,00');
    expect(text()).not.toContain('Período mínimo');
    expect(text()).toContain(RENTAL_DISCLAIMER);
  });

  it('mostra o período mínimo com rótulo e total quando há mínimo', () => {
    fixture.componentRef.setInput('dailyRate', 100);
    fixture.componentRef.setInput('minRentalDays', 7);
    fixture.detectChanges();

    expect(text()).toContain('Período mínimo: 1 semana');
    expect(fixture.nativeElement.querySelector('section').getAttribute('aria-labelledby'))
      .toBe(fixture.nativeElement.querySelector('h3').id);
  });
});
