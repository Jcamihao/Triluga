import {
  HttpErrorResponse,
  HttpEventType,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { AppLoggerService } from '../services/app-logger.service';
import { RequestTraceService } from '../services/request-trace.service';

export const traceInterceptor: HttpInterceptorFn = (req, next) => {
  const logger = inject(AppLoggerService);
  const traceService = inject(RequestTraceService);
  const requestId = traceService.createRequestId();
  const startedAt = performance.now();

  logger.info('http', 'request_started', {
    requestId,
    method: req.method,
    url: req.urlWithParams,
  });

  return next(
    req.clone({
      setHeaders: {
        'X-Request-Id': requestId,
      },
    }),
  ).pipe(
    tap({
      next: (event) => {
        if (event.type !== HttpEventType.Response) {
          return;
        }

        logger.info('http', 'request_completed', {
          requestId,
          method: req.method,
          url: req.urlWithParams,
          status: event.status,
          durationMs: Math.round(performance.now() - startedAt),
          responseRequestId: event.headers.get('x-request-id') ?? requestId,
        });
      },
      error: (error: unknown) => {
        const httpError =
          error instanceof HttpErrorResponse
            ? error
            : new HttpErrorResponse({ error });

        logger.error('http', 'request_failed', {
          requestId,
          method: req.method,
          url: req.urlWithParams,
          status: httpError.status,
          durationMs: Math.round(performance.now() - startedAt),
          message: httpError.message,
          responseRequestId:
            httpError.headers?.get('x-request-id') ?? requestId,
        });
      },
    }),
  );
};
