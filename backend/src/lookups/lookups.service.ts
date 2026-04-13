import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { request } from 'node:https';
import { URL } from 'node:url';

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

@Injectable()
export class LookupsService {
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
