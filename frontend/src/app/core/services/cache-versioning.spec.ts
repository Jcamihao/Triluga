import { TestBed } from '@angular/core/testing';
import { CompareService } from './compare.service';
import { RecentlyViewedService } from './recently-viewed.service';

describe('caches locais versionados', () => {
  const stale = JSON.stringify([{ id: 'v1', dailyRate: 100 }]);

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => localStorage.clear());

  it('CompareService descarta e remove o cache antigo', () => {
    localStorage.setItem('triluga.compare.vehicles', stale);
    const service = TestBed.inject(CompareService);
    expect(service.items()).toEqual([]);
    expect(localStorage.getItem('triluga.compare.vehicles')).toBeNull();
  });

  it('CompareService persiste na chave .v2', () => {
    const service = TestBed.inject(CompareService);
    service.toggle({ id: 'v2' } as any);
    expect(localStorage.getItem('triluga.compare.vehicles.v2')).toContain('v2');
    expect(localStorage.getItem('triluga.compare.vehicles')).toBeNull();
  });

  it('RecentlyViewedService descarta e remove o cache antigo', () => {
    localStorage.setItem('triluga.recentlyViewed', stale);
    const service = TestBed.inject(RecentlyViewedService);
    expect(service.getAll()).toEqual([]);
    expect(localStorage.getItem('triluga.recentlyViewed')).toBeNull();
  });

  it('RecentlyViewedService persiste na chave .v2', () => {
    const service = TestBed.inject(RecentlyViewedService);
    service.track({ id: 'v3' } as any);
    expect(localStorage.getItem('triluga.recentlyViewed.v2')).toContain('v3');
  });
});
