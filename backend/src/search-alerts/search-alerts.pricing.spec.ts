import { SearchAlertsService } from './search-alerts.service';

// Os métodos sob teste são puros; as dependências nunca são tocadas.
const service = new SearchAlertsService(null as never, null as never);
const normalize = (filters: Record<string, unknown>) =>
  (service as any).normalizeFilters(filters);
const matches = (vehicle: object, filters: object) =>
  (service as any).matchesVehicleFilters(vehicle, filters);

const baseVehicle = {
  title: 'Moto',
  brand: 'Honda',
  model: 'CG',
  description: '',
  city: 'São Paulo',
  state: 'SP',
  vehicleType: 'MOTORCYCLE',
  category: 'STREET',
  motorcycleStyle: null,
  engineCc: 160,
  dailyRate: 100,
  latitude: null,
  longitude: null,
};

describe('alertas por diária', () => {
  describe('normalizeFilters', () => {
    it('converte minPrice/maxPrice legados em diária, sem as chaves antigas', () => {
      const result = normalize({ minPrice: 700, maxPrice: 1400 });
      expect(result).toEqual({ minDailyRate: 100, maxDailyRate: 200 });
      expect(result).not.toHaveProperty('minPrice');
      expect(result).not.toHaveProperty('maxPrice');
    });

    it('aceita legado como string (formato do exemplo do DTO)', () => {
      expect(normalize({ minPrice: '800', maxPrice: '1800' })).toEqual({
        minDailyRate: 114.29,
        maxDailyRate: 257.14,
      });
    });

    it('preserva chaves novas', () => {
      expect(normalize({ minDailyRate: 50 })).toEqual({ minDailyRate: 50 });
    });

    it('novas vencem legadas por lado', () => {
      expect(
        normalize({ minDailyRate: 50, minPrice: 700, maxPrice: 1400 }),
      ).toEqual({ minDailyRate: 50, maxDailyRate: 200 });
    });

    it('preserva zero', () => {
      expect(normalize({ minPrice: 0 })).toEqual({ minDailyRate: 0 });
      expect(normalize({ maxDailyRate: 0 })).toEqual({ maxDailyRate: 0 });
    });

    it('string vazia não vira 0: lado legado continua valendo', () => {
      expect(
        normalize({ minDailyRate: '', minPrice: 700, maxPrice: 1400 }),
      ).toEqual({ minDailyRate: 100, maxDailyRate: 200 });
    });

    it('string vazia sem legado: sem limite', () => {
      expect(normalize({ maxDailyRate: '', city: 'SP' })).toEqual({
        city: 'SP',
      });
    });

    it('null e só espaços: sem limite', () => {
      expect(normalize({ maxPrice: null })).toEqual({});
      expect(normalize({ minPrice: '   ', maxDailyRate: '  ' })).toEqual({});
    });

    it("preserva '0' string", () => {
      expect(normalize({ minDailyRate: '0' })).toEqual({ minDailyRate: 0 });
    });

    it('vazio nos demais numéricos também é descartado (não vira 0)', () => {
      expect(
        normalize({ minEngineCc: '', radiusKm: '', latitude: null }),
      ).toEqual({});
    });

    it('filtro armazenado idempotente (re-normalizar não muda)', () => {
      const once = normalize({ minPrice: 700, city: 'SP' });
      expect(normalize(once)).toEqual(once);
    });
  });

  describe('matchesVehicleFilters', () => {
    it('diária 100 casa com min 50 / max 150', () => {
      expect(
        matches(baseVehicle, { minDailyRate: 50, maxDailyRate: 150 }),
      ).toBe(true);
    });

    it('diária 100 não casa com max 90', () => {
      expect(matches(baseVehicle, { maxDailyRate: 90 })).toBe(false);
    });

    it('diária 100 não casa com min 120', () => {
      expect(matches(baseVehicle, { minDailyRate: 120 })).toBe(false);
    });

    it('aceita dailyRate como string/Decimal-like', () => {
      expect(
        matches({ ...baseVehicle, dailyRate: '100.00' }, { maxDailyRate: 100 }),
      ).toBe(true);
    });
  });
});
