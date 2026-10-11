import * as http from 'node:http';
import * as https from 'node:https';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AsaasPixPayment {
  id: string;
  value: number;
  status: string;
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string;
}

interface RawResponse {
  statusCode: number;
  body: string;
}

const MAX_ATTEMPTS = 3; // 1 tentativa inicial + 2 retentativas (só GET/DELETE)
const RETRY_BACKOFF_MS = 250;
// Só métodos idempotentes repetem: repetir um POST pode duplicar a cobrança.
const RETRYABLE_METHODS = new Set(['GET', 'DELETE']);

export class AsaasClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AsaasClientError';
  }
}

@Injectable()
export class AsaasClient {
  private readonly logger = new Logger(AsaasClient.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return this.getApiKey().length > 0;
  }

  async findCustomerByExternalReference(
    externalReference: string,
  ): Promise<{ id: string } | null> {
    const query = new URLSearchParams({ externalReference }).toString();
    const result = await this.request<{ data?: Array<{ id: string }> }>(
      'GET',
      `/customers?${query}`,
    );
    return result.data?.[0] ?? null;
  }

  async createCustomer(params: {
    name: string;
    cpfCnpj: string;
    email: string;
    externalReference: string;
  }): Promise<{ id: string }> {
    const result = await this.request<{ id: string }>(
      'POST',
      '/customers',
      params,
    );
    return { id: result.id };
  }

  async createPixPayment(params: {
    customer: string;
    value: number;
    dueDate: string;
    description: string;
    externalReference: string;
  }): Promise<AsaasPixPayment> {
    const result = await this.request<AsaasPixPayment>('POST', '/payments', {
      customer: params.customer,
      billingType: 'PIX',
      value: params.value,
      dueDate: params.dueDate,
      description: params.description,
      externalReference: params.externalReference,
    });
    return { id: result.id, value: result.value, status: result.status };
  }

  async getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
    const result = await this.request<AsaasPixQrCode>(
      'GET',
      `/payments/${paymentId}/pixQrCode`,
    );
    return {
      encodedImage: result.encodedImage,
      payload: result.payload,
      expirationDate: result.expirationDate,
    };
  }

  async deletePayment(paymentId: string): Promise<void> {
    await this.request<unknown>('DELETE', `/payments/${paymentId}`);
  }

  /**
   * Orquestra a chamada HTTP com retry/backoff e conversão de erro.
   * Retry (até `MAX_ATTEMPTS - 1` vezes) só para GET/DELETE e só em erro de
   * rede/timeout ou 5xx; POST faz uma única tentativa (evita cobrança
   * duplicada) e 4xx nunca repete (é erro de dado, repetir não resolve).
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const maxAttempts = RETRYABLE_METHODS.has(method) ? MAX_ATTEMPTS : 1;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;

      let response: RawResponse | undefined;
      try {
        response = await this.performRequest(method, path, body);
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts) {
          throw new AsaasClientError(
            `Falha ao chamar o Asaas (${method} ${path}): ${
              error instanceof Error ? error.message : 'erro desconhecido'
            }`,
            undefined,
            error,
          );
        }
        await this.delay(attempt);
        continue;
      }

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return response.body
          ? (JSON.parse(response.body) as T)
          : (undefined as T);
      }

      if (response.statusCode >= 500 && attempt < maxAttempts) {
        lastError = new AsaasClientError(
          `Asaas respondeu ${response.statusCode} para ${method} ${path}`,
          response.statusCode,
        );
        await this.delay(attempt);
        continue;
      }

      // 4xx nunca repete; 5xx que esgotou as tentativas também não.
      throw new AsaasClientError(
        `Asaas respondeu ${response.statusCode} para ${method} ${path}: ${response.body}`,
        response.statusCode,
      );
    }

    // Inalcançável na prática (o loop sempre retorna ou lança antes), mas
    // mantém o TypeScript feliz e cobre um eventual erro perdido.
    throw lastError instanceof AsaasClientError
      ? lastError
      : new AsaasClientError(`Falha ao chamar o Asaas (${method} ${path}).`);
  }

  private delay(attempt: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, RETRY_BACKOFF_MS * attempt);
    });
  }

  private performRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<RawResponse> {
    const url = new URL(`${this.getBaseUrl()}${path}`);
    const requestImpl =
      url.protocol === 'https:' ? https.request : http.request;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const timeoutMs = this.getTimeoutMs();

    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        access_token: this.getApiKey(),
        Accept: 'application/json',
      };
      if (payload !== undefined) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(Buffer.byteLength(payload));
      }

      const request = requestImpl(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port ? parseInt(url.port, 10) : undefined,
          path: `${url.pathname}${url.search}`,
          method,
          headers,
        },
        (response) => {
          const chunks: Buffer[] = [];

          response.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

          response.on('end', () => {
            resolve({
              statusCode: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );

      request.setTimeout(timeoutMs, () => {
        request.destroy(
          new Error(`Timeout ao chamar o Asaas (${timeoutMs}ms).`),
        );
      });

      request.on('error', (error) => {
        this.logger.warn(
          `Erro ao chamar o Asaas (${method} ${path}): ${error.message}`,
        );
        reject(error);
      });

      if (payload !== undefined) {
        request.write(payload);
      }
      request.end();
    });
  }

  private getApiKey(): string {
    return this.configService.get<string>('asaas.apiKey') ?? '';
  }

  private getBaseUrl(): string {
    return (
      this.configService.get<string>('asaas.baseUrl') ??
      'https://api-sandbox.asaas.com/v3'
    );
  }

  private getTimeoutMs(): number {
    return this.configService.get<number>('asaas.timeoutMs') ?? 10000;
  }
}
