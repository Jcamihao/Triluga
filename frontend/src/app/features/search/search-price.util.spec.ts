import { VehiclesApiService } from '../../core/services/vehicles-api.service';
import {
  applyPriceChange,
  buildAlertFilters,
  readDailyRateParams,
  toPriceFilters,
} from './search-price.util';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

const read = (qs: string) =>
  readDailyRateParams(new URLSearchParams(qs));

const emptyQuery = {
  q: '', city: '', vehicleType: '', category: '', minDailyRate: '',
  maxDailyRate: '', transmission: '', fuelType: '', minYear: '', maxYear: '',
  latitude: '', longitude: '', radiusKm: '',
};

describe('search-price.util', () => {
  describe('readDailyRateParams (URLs antigas)', () => {
    it('converte minPrice/maxPrice semanais para diária inteira', () => {
      expect(read('minPrice=700&maxPrice=1400')).toEqual({
        minDailyRate: '100',
        maxDailyRate: '200',
      });
    });

    it('699/semana vira 99.86/dia, sem arredondar para inteiro', () => {
      expect(read('minPrice=699').minDailyRate).toBe('99.86');
      expect(read('maxPrice=699').maxDailyRate).toBe('99.86');
    });

    it('parâmetros novos inválidos (negativo, NaN, mais de 2 casas) viram vazio', () => {
      expect(read('minDailyRate=-5&maxDailyRate=abc')).toEqual({
        minDailyRate: '',
        maxDailyRate: '',
      });
      expect(read('minDailyRate=10.999&maxDailyRate=Infinity')).toEqual({
        minDailyRate: '',
        maxDailyRate: '',
      });
      expect(read('minDailyRate=10.5&maxDailyRate=99.86')).toEqual({
        minDailyRate: '10.5',
        maxDailyRate: '99.86',
      });
    });

    it('zero legado é valor válido', () => {
      expect(read('minPrice=0')).toEqual({ minDailyRate: '0', maxDailyRate: '' });
      expect(read('maxPrice=0').maxDailyRate).toBe('0');
    });

    it('parâmetros novos vencem os legados', () => {
      expect(read('minDailyRate=50&minPrice=700&maxPrice=1400')).toEqual({
        minDailyRate: '50',
        maxDailyRate: '200',
      });
      expect(read('minDailyRate=0&minPrice=700').minDailyRate).toBe('0');
    });

    it('lê os parâmetros novos e ignora vazio e lixo', () => {
      expect(read('minDailyRate=20&maxDailyRate=90')).toEqual({
        minDailyRate: '20',
        maxDailyRate: '90',
      });
      expect(read('')).toEqual({ minDailyRate: '', maxDailyRate: '' });
      expect(read('minPrice=&maxPrice=abc')).toEqual({
        minDailyRate: '',
        maxDailyRate: '',
      });
    });
  });

  describe('applyPriceChange (controle 0 a 300)', () => {
    const unset = { minDailyRate: '', maxDailyRate: '' };

    it('topo do controle (300) = sem teto', () => {
      expect(applyPriceChange(unset, 'max', '300').maxDailyRate).toBe('');
      expect(applyPriceChange(unset, 'max', '250').maxDailyRate).toBe('250');
    });

    it('mínimo 0 = sem piso', () => {
      expect(applyPriceChange(unset, 'min', '0').minDailyRate).toBe('');
      expect(applyPriceChange(unset, 'min', '40').minDailyRate).toBe('40');
    });

    it('teto 0 é mantido ao mexer no mínimo', () => {
      expect(
        applyPriceChange({ minDailyRate: '', maxDailyRate: '0' }, 'min', '5'),
      ).toEqual({ minDailyRate: '', maxDailyRate: '0' });
    });

    it('um controle não passa o outro e valores são limitados a 0..300', () => {
      const range = { minDailyRate: '', maxDailyRate: '100' };
      expect(applyPriceChange(range, 'min', '200').minDailyRate).toBe('100');
      expect(
        applyPriceChange({ minDailyRate: '80', maxDailyRate: '' }, 'max', '10')
          .maxDailyRate,
      ).toBe('80');
      expect(applyPriceChange(unset, 'max', '9999').maxDailyRate).toBe('');
    });
  });

  describe('toPriceFilters (modal)', () => {
    it('R$ 0 a R$ 300+ vira sem limites', () => {
      expect(
        toPriceFilters({ minDailyRate: '0', maxDailyRate: '300' }),
      ).toEqual({ minDailyRate: '', maxDailyRate: '' });
    });

    it('teto zero é válido e não vira "300+"', () => {
      expect(
        toPriceFilters({ minDailyRate: '0', maxDailyRate: '0' }),
      ).toEqual({ minDailyRate: '', maxDailyRate: '0' });
    });

    it('vazio nos dois = sem filtro de preço', () => {
      expect(
        toPriceFilters({ minDailyRate: '', maxDailyRate: '' }),
      ).toEqual({ minDailyRate: '', maxDailyRate: '' });
    });

    it('mantém faixa real', () => {
      expect(
        toPriceFilters({ minDailyRate: '10', maxDailyRate: '80' }),
      ).toEqual({ minDailyRate: '10', maxDailyRate: '80' });
    });
  });

  describe('buildAlertFilters', () => {
    it('usa minDailyRate/maxDailyRate e nunca minPrice/maxPrice', () => {
      const filters = buildAlertFilters({
        ...emptyQuery,
        city: 'Goiânia',
        minDailyRate: '100',
        maxDailyRate: '200',
      });
      expect(filters).toEqual({
        city: 'Goiânia',
        minDailyRate: '100',
        maxDailyRate: '200',
      });
      expect(Object.keys(filters)).not.toContain('minPrice');
      expect(Object.keys(filters)).not.toContain('maxPrice');
    });

    it('vazio não vira chave ("" ou 0)', () => {
      expect(buildAlertFilters({ ...emptyQuery, city: 'Goiânia' })).toEqual({
        city: 'Goiânia',
      });
    });
  });

  describe('parâmetros enviados à API', () => {
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
      http = TestBed.inject(HttpTestingController);
    });

    it('envia minDailyRate/maxDailyRate e omite faixa vazia', () => {
      const service = TestBed.inject(VehiclesApiService);
      service.search({ ...emptyQuery, minDailyRate: '100', maxDailyRate: '200', page: 1 }).subscribe();
      const req = http.expectOne((r) => r.url.endsWith('/vehicles'));
      expect(req.request.params.get('minDailyRate')).toBe('100');
      expect(req.request.params.get('maxDailyRate')).toBe('200');
      expect(req.request.params.has('minPrice')).toBeFalse();
      expect(req.request.params.has('maxPrice')).toBeFalse();
      req.flush({ items: [], meta: {} });

      service.search({ ...emptyQuery, page: 1 }).subscribe();
      const req2 = http.expectOne((r) => r.url.endsWith('/vehicles'));
      expect(req2.request.params.has('minDailyRate')).toBeFalse();
      expect(req2.request.params.has('maxDailyRate')).toBeFalse();
      req2.flush({ items: [], meta: {} });
    });
  });
});
