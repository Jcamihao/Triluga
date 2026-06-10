import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PixChargeResult {
  txid: string;
  pixCopiaECola: string;
  qrCodeImage: string;
}

@Injectable()
export class EfipayService {
  private readonly logger = new Logger(EfipayService.name);
  private efipay: any;
  private readonly pixKey: string;

  constructor(private readonly config: ConfigService) {
    this.pixKey = this.config.get<string>('efipay.pixKey', 'triluga@empresa.com.br');
    const clientId = this.config.get<string>('efipay.clientId');
    const clientSecret = this.config.get<string>('efipay.clientSecret');

    if (!clientId || !clientSecret) {
      this.logger.warn('EFIPAY_CLIENT_ID/SECRET not set — using static PIX key fallback');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const EfiPay = require('sdk-typescript-apis-efi').default;
      this.efipay = new EfiPay({
        client_id: clientId,
        client_secret: clientSecret,
        certificate: this.config.get<string>('efipay.certificate') || undefined,
        sandbox: this.config.get<boolean>('efipay.sandbox', true),
        validateMtls: false,
      });
      this.logger.log(
        `Efipay SDK initialized (${this.config.get('efipay.sandbox') !== false ? 'sandbox' : 'production'})`,
      );
    } catch (err) {
      this.logger.error('Failed to init Efipay SDK', (err as Error).message);
    }
  }

  get staticPixKey(): string {
    return this.pixKey;
  }

  isConfigured(): boolean {
    return !!this.efipay;
  }

  async createPixCharge(amount: number, description: string): Promise<PixChargeResult | null> {
    if (!this.efipay) return null;

    try {
      const charge = await this.efipay.pixCreateImmediateCharge([], {
        calendario: { expiracao: 86400 },
        valor: { original: amount.toFixed(2) },
        chave: this.pixKey,
        infoAdicionais: [{ nome: 'Destaque Triluga', valor: description.slice(0, 200) }],
      });

      const qr = await this.efipay.pixGenerateQRCode({ id: String(charge.loc.id) });

      return {
        txid: charge.txid as string,
        pixCopiaECola: qr.qrcode as string,
        qrCodeImage: qr.imagemQrcode as string,
      };
    } catch (err) {
      this.logger.error('Efipay createPixCharge failed', err);
      return null;
    }
  }
}
