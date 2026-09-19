import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { request } from 'node:https';
import { URL } from 'node:url';
import { CacheQueueService } from '../cache-queue/cache-queue.service';

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

type FipeBrand = {
  code: string;
  name: string;
};

type FipeModel = {
  code: string;
  name: string;
};

type FipeYear = {
  code: string;
  name: string;
};

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
};

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  displayName: string;
};

type FipePriceRaw = {
  fipeCode?: string;
  brand?: string;
  model?: string;
  modelYear?: number;
  fuel?: string;
  referenceMonth?: string;
  price?: string;
};

export type FipePriceResult = {
  fipeCode: string;
  brand: string;
  model: string;
  modelYear: number;
  fuel: string;
  referenceMonth: string;
  priceValue: number;
  priceFormatted: string;
  suggestedWeeklyRateMin: number;
  suggestedWeeklyRateMax: number;
};

@Injectable()
export class LookupsService {
  constructor(private readonly cacheQueue: CacheQueueService) {}
  async lookupZipCode(zipCode: string) {
    const digits = String(zipCode ?? '')
      .replace(/\D/g, '')
      .slice(0, 8);

    if (digits.length !== 8) {
      throw new BadRequestException('Informe um CEP válido com 8 dígitos.');
    }

    try {
      const response = await this.fetchViaCep(digits);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new BadGatewayException(
          'Não foi possível consultar o serviço de CEP.',
        );
      }

      const payload = response.payload;

      if (payload.erro) {
        throw new NotFoundException('CEP não encontrado.');
      }

      return {
        zipCode: this.formatZipCode(payload.cep ?? digits),
        addressLine: payload.logradouro?.trim() ?? '',
        city: payload.localidade?.trim() ?? '',
        state: payload.uf?.trim().toUpperCase() ?? '',
        addressComplement: payload.complemento?.trim() ?? '',
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }

      throw new BadGatewayException(
        'Não foi possível consultar o serviço de CEP.',
      );
    }
  }

  async geocodeAddress(address: string): Promise<GeocodeResult> {
    const query = String(address ?? '').trim();

    if (query.length < 5) {
      throw new BadRequestException(
        'Informe um endereço mais completo para localizar no mapa.',
      );
    }

    const cacheKey = `geocode:${query.toLowerCase()}`;
    const cached = await this.cacheQueue.getJson<GeocodeResult>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const response = await this.fetchNominatim(query);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadGatewayException(
        'Não foi possível localizar o endereço no mapa.',
      );
    }

    const [match] = response.payload;

    if (!match?.lat || !match?.lon) {
      throw new NotFoundException(
        'Não encontramos esse endereço. Tente ser mais específico.',
      );
    }

    const result: GeocodeResult = {
      latitude: parseFloat(match.lat),
      longitude: parseFloat(match.lon),
      displayName: match.display_name ?? query,
    };

    await this.cacheQueue.setJson(cacheKey, result, 2592000);

    return result;
  }

  async getFipeBrands(type: 'cars' | 'motorcycles'): Promise<FipeBrand[]> {
    const cacheKey = `fipe:${type}:brands`;
    const cached = await this.cacheQueue.getJson<FipeBrand[]>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const response = await this.fetchFipe(`${type}/brands`);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadGatewayException(
        'Não foi possível consultar a Tabela FIPE.',
      );
    }

    const brands = response.payload as FipeBrand[];
    await this.cacheQueue.setJson(cacheKey, brands, 2592000);

    return brands;
  }

  async getFipeModels(
    type: 'cars' | 'motorcycles',
    brandCode: string,
  ): Promise<FipeModel[]> {
    const cacheKey = `fipe:${type}:brands:${brandCode}:models`;
    const cached = await this.cacheQueue.getJson<FipeModel[]>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const response = await this.fetchFipe(`${type}/brands/${brandCode}/models`);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadGatewayException(
        'Não foi possível consultar a Tabela FIPE.',
      );
    }

    const models = response.payload as FipeModel[];
    await this.cacheQueue.setJson(cacheKey, models, 2592000);

    return models;
  }

  async getFipeYears(
    type: 'cars' | 'motorcycles',
    brandCode: string,
    modelCode: string,
  ): Promise<FipeYear[]> {
    const cacheKey = `fipe:${type}:brands:${brandCode}:models:${modelCode}:years`;
    const cached = await this.cacheQueue.getJson<FipeYear[]>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const response = await this.fetchFipe(
      `${type}/brands/${brandCode}/models/${modelCode}/years`,
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadGatewayException(
        'Não foi possível consultar a Tabela FIPE.',
      );
    }

    const years = response.payload as FipeYear[];
    await this.cacheQueue.setJson(cacheKey, years, 604800);

    return years;
  }

  async getFipePrice(
    type: 'cars' | 'motorcycles',
    brandCode: string,
    modelCode: string,
    yearCode: string,
  ): Promise<FipePriceResult> {
    const cacheKey = `fipe:${type}:brands:${brandCode}:models:${modelCode}:years:${yearCode}`;
    const cached = await this.cacheQueue.getJson<FipePriceResult>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const response = await this.fetchFipe(
      `${type}/brands/${brandCode}/models/${modelCode}/years/${yearCode}`,
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadGatewayException(
        'Não foi possível consultar a Tabela FIPE.',
      );
    }

    const raw = response.payload as FipePriceRaw;
    const priceFormatted = raw.price ?? 'R$ 0,00';
    const priceValue = this.parseFipePrice(priceFormatted);
    const suggestedWeeklyRateMin = Math.round((priceValue * 0.01) / 10) * 10;
    const suggestedWeeklyRateMax = Math.round((priceValue * 0.02) / 10) * 10;

    const result: FipePriceResult = {
      fipeCode: raw.fipeCode ?? '',
      brand: raw.brand ?? '',
      model: raw.model ?? '',
      modelYear: raw.modelYear ?? 0,
      fuel: raw.fuel ?? '',
      referenceMonth: raw.referenceMonth ?? '',
      priceValue,
      priceFormatted,
      suggestedWeeklyRateMin,
      suggestedWeeklyRateMax,
    };

    await this.cacheQueue.setJson(cacheKey, result, 86400);

    return result;
  }

  private parseFipePrice(priceString: string): number {
    const cleaned = priceString
      .replace('R$', '')
      .trim()
      .replace(/\./g, '')
      .replace(',', '.');

    return parseFloat(cleaned) || 0;
  }

  private fetchFipe(
    path: string,
  ): Promise<{ statusCode: number; payload: unknown }> {
    const url = new URL(`https://parallelum.com.br/fipe/api/v2/${path}`);

    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        },
        (response) => {
          let rawBody = '';

          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            rawBody += chunk;
          });
          response.on('end', () => {
            try {
              resolve({
                statusCode: response.statusCode ?? 502,
                payload: rawBody ? JSON.parse(rawBody) : {},
              });
            } catch (error) {
              reject(error);
            }
          });
        },
      );

      req.setTimeout(8000, () => {
        req.destroy(new Error('FIPE lookup timed out.'));
      });
      req.on('error', reject);
      req.end();
    });
  }

  private fetchViaCep(zipCode: string) {
    const url = new URL(`https://viacep.com.br/ws/${zipCode}/json/`);

    return new Promise<{ statusCode: number; payload: ViaCepResponse }>(
      (resolve, reject) => {
        const req = request(
          url,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
          },
          (response) => {
            let rawBody = '';

            response.setEncoding('utf8');
            response.on('data', (chunk) => {
              rawBody += chunk;
            });
            response.on('end', () => {
              try {
                resolve({
                  statusCode: response.statusCode ?? 502,
                  payload: rawBody ? JSON.parse(rawBody) : {},
                });
              } catch (error) {
                reject(error);
              }
            });
          },
        );

        req.setTimeout(8000, () => {
          req.destroy(new Error('CEP lookup timed out.'));
        });
        req.on('error', reject);
        req.end();
      },
    );
  }

  private fetchNominatim(
    query: string,
  ): Promise<{ statusCode: number; payload: NominatimResult[] }> {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'br');

    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            // Exigido pela política de uso do Nominatim: identificar a aplicação.
            'User-Agent': 'Triluga/1.0 (contato: noreply@triluga.com.br)',
          },
        },
        (response) => {
          let rawBody = '';

          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            rawBody += chunk;
          });
          response.on('end', () => {
            try {
              resolve({
                statusCode: response.statusCode ?? 502,
                payload: rawBody ? JSON.parse(rawBody) : [],
              });
            } catch (error) {
              reject(error);
            }
          });
        },
      );

      req.setTimeout(8000, () => {
        req.destroy(new Error('Geocoding lookup timed out.'));
      });
      req.on('error', reject);
      req.end();
    });
  }

  private formatZipCode(value: string) {
    const digits = String(value ?? '')
      .replace(/\D/g, '')
      .slice(0, 8);

    if (digits.length <= 5) {
      return digits;
    }

    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
}
