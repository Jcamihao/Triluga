import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';

export type KycResult = {
  documentApproved: boolean;
  cnhApproved: boolean;
  faceMatch: boolean;
  reason: string;
};

export type FaceMatchResult = {
  docMatch: boolean;
  docSimilarity: number;
  docFaceFound: boolean;
  cnhMatch: boolean;
  cnhSimilarity: number;
  cnhFaceFound: boolean;
};

@Injectable()
export class AiVerificationService {
  private readonly logger = new Logger(AiVerificationService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('OLLAMA_BASE_URL', '');
    this.model = config.get<string>('OLLAMA_VISION_MODEL', 'llava:13b');
    this.enabled = Boolean(this.baseUrl);

    if (this.enabled) {
      this.logger.log(
        `AI verification enabled — model=${this.model} url=${this.baseUrl}`,
      );
    } else {
      this.logger.warn(
        'OLLAMA_BASE_URL não configurado. Verificação por IA desabilitada.',
      );
    }
  }

  get isEnabled() {
    return this.enabled;
  }

  async verifyFaceMatch(options: {
    selfieUrl: string;
    docUrl: string;
    cnhUrl: string;
  }): Promise<FaceMatchResult | null> {
    const faceUrl = this.config.get<string>('FACE_VERIFICATION_URL', '');
    if (!faceUrl) return null;

    try {
      const result = await this.postJson(
        `${faceUrl}/verify`,
        JSON.stringify({
          selfie_url: options.selfieUrl,
          doc_url: options.docUrl,
          cnh_url: options.cnhUrl,
        }),
      );
      return {
        docMatch: Boolean(result.doc_match),
        docSimilarity: Number(result.doc_similarity ?? 0),
        docFaceFound: Boolean(result.doc_face_found),
        cnhMatch: Boolean(result.cnh_match),
        cnhSimilarity: Number(result.cnh_similarity ?? 0),
        cnhFaceFound: Boolean(result.cnh_face_found),
      };
    } catch (err) {
      this.logger.warn(
        `face_match_failed error=${(err as Error).message}`,
      );
      return null;
    }
  }

  async verifyKyc(options: {
    documentBuffer: Buffer;
    cnhBuffer: Buffer;
    selfieBuffer: Buffer;
    fullName: string;
  }): Promise<KycResult> {
    const prompt = `Você é um sistema de verificação KYC. Analise as imagens fornecidas:
- Imagem 1: Documento de identidade (RG ou similar)
- Imagem 2: CNH (Carteira Nacional de Habilitação)
- Imagem 3: Selfie da pessoa

Nome informado pelo usuário: "${options.fullName}"

Verifique:
1. O documento de identidade parece genuíno e legível?
2. A CNH parece genuína e legível?
3. O rosto na selfie corresponde ao rosto nos documentos?

Responda SOMENTE com JSON válido, sem texto extra:
{"documentApproved":true,"cnhApproved":true,"faceMatch":true,"reason":"motivo breve em português"}`;

    const body = JSON.stringify({
      model: this.model,
      prompt,
      images: [
        options.documentBuffer.toString('base64'),
        options.cnhBuffer.toString('base64'),
        options.selfieBuffer.toString('base64'),
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0 },
    });

    const raw = await this.postJson(`${this.baseUrl}/api/generate`, body);
    const responseText: string = raw?.response ?? JSON.stringify(raw);

    try {
      const jsonStart = responseText.indexOf('{');
      const jsonEnd = responseText.lastIndexOf('}');
      const jsonStr = responseText.slice(jsonStart, jsonEnd + 1);
      const result = JSON.parse(jsonStr);

      return {
        documentApproved: Boolean(result.documentApproved),
        cnhApproved: Boolean(result.cnhApproved),
        faceMatch: Boolean(result.faceMatch),
        reason: String(result.reason ?? ''),
      };
    } catch {
      this.logger.error(
        `ai_kyc_parse_failed response="${responseText.slice(0, 200)}"`,
      );
      throw new Error('Falha ao interpretar resposta da IA.');
    }
  }

  private postJson(urlStr: string, body: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const lib = url.protocol === 'https:' ? https : http;

      const req = lib.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(
                new Error(
                  `Ollama response parse failed: ${data.slice(0, 100)}`,
                ),
              );
            }
          });
        },
      );

      req.setTimeout(120_000, () =>
        req.destroy(new Error('Ollama request timeout')),
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
