import { Injectable, Logger } from '@nestjs/common';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createWorker } from 'tesseract.js';
import * as sharp from 'sharp';

const DOCKER_TESSDATA = '/app/tessdata';
const LOCAL_TESSDATA = path.join(process.cwd(), 'tessdata');
const OCR_TIMEOUT_MS = 60_000;

function resolveLangPath(): string | undefined {
  if (fs.existsSync(DOCKER_TESSDATA)) return DOCKER_TESSDATA;
  if (fs.existsSync(LOCAL_TESSDATA)) return LOCAL_TESSDATA;
  return undefined;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  async extractText(imageBuffer: Buffer): Promise<string> {
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      const processed = await sharp(imageBuffer)
        .grayscale()
        .normalize()
        .sharpen()
        .toBuffer();

      const langPath = resolveLangPath();
      worker = await createWorker('por', 1, langPath ? { langPath } : {});

      const recognizePromise = worker.recognize(processed);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR timeout')), OCR_TIMEOUT_MS),
      );

      const { data } = (await Promise.race([
        recognizePromise,
        timeoutPromise,
      ])) as Awaited<ReturnType<typeof worker.recognize>>;

      return data.text?.trim() ?? '';
    } catch (err) {
      this.logger.error(`ocr_extract_failed error=${(err as Error).message}`);
      return '';
    } finally {
      await worker?.terminate().catch(() => {});
    }
  }
}
