import { Logger } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { REQUEST_ID_HEADER } from '../constants/request-trace.constants';
import { RequestWithContext } from '../interfaces/request-with-context.interface';
import { resolveRequestId } from '../utils/request-id.util';

type RequestContextLogger = Pick<Logger, 'log' | 'warn' | 'error'>;

/**
 * Middleware de contexto do request: define requestId (validado), guarda o início,
 * devolve o header x-request-id e loga início e fim. Deve ser registrado logo após
 * setGlobalPrefix, antes de CORS, helmet e pipes.
 */
export function requestContextMiddleware(logger: RequestContextLogger) {
  return (req: RequestWithContext, res: Response, next: NextFunction) => {
    const requestId = resolveRequestId(req.header(REQUEST_ID_HEADER));
    const startedAt = Date.now();

    req.requestId = requestId;
    req.startedAt = startedAt;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    logger.log(
      `request_started requestId=${requestId} method=${req.method} path=${req.originalUrl ?? req.url}`,
    );

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const userId = req.user?.sub ?? 'anonymous';
      const statusCode = res.statusCode;
      const level =
        statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'log';
      const logMessage =
        `request_completed requestId=${requestId} method=${req.method} ` +
        `path=${req.originalUrl ?? req.url} status=${statusCode} durationMs=${durationMs} userId=${userId}`;

      if (level === 'error') {
        logger.error(logMessage);
        return;
      }

      if (level === 'warn') {
        logger.warn(logMessage);
        return;
      }

      logger.log(logMessage);
    });

    next();
  };
}
