import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RequestTraceService {
  createRequestId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }

    return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
