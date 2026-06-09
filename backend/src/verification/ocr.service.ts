import { Injectable } from '@nestjs/common';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createWorker } from 'tesseract.js';
import * as sharp from 'sharp';

const DOCKER_TESSDATA = '/app/tessdata';
const LOCAL_TESSDATA = path.join(process.cwd(), 'tessdata');

function resolveLangPath(): string | undefined {
  if (fs.existsSync(DOCKER_TESSDATA)) return DOCKER_TESSDATA;
  if (fs.existsSync(LOCAL_TESSDATA)) return LOCAL_TESSDATA;
  return undefined; // tesseract.js baixa automaticamente em dev local
}

@Injectable()
export class OcrService {
  async extractText(imageBuffer: Buffer): Promise<string> {
    const processed = await sharp(imageBuffer)
      .grayscale()
      .normalize()
      .sharpen()
      .toBuffer();

    const langPath = resolveLangPath();
    const worker = await createWorker('por', 1, langPath ? { langPath } : {});
    try {
      const { data } = await worker.recognize(processed);
      return data.text?.trim() ?? '';
    } finally {
      await worker.terminate();
    }
  }
}
