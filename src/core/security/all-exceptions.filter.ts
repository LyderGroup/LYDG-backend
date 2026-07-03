import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface SafeErrorPayload {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
}

/**
 * Filtre global d'exceptions.
 *
 * - Conserve la sémantique des HttpException de Nest (BadRequest, Forbidden…).
 * - Masque les détails techniques des erreurs non maîtrisées en production
 *   (stack traces, messages TypeORM, contraintes SQL) pour ne pas divulguer
 *   le schéma ou la structure interne.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProd = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorName: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const obj = payload as Record<string, unknown>;
        message = (obj.message as string | string[]) ?? exception.message;
        errorName = (obj.error as string | undefined) ?? undefined;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      // Erreurs non-HTTP (TypeORM, runtime…)
      message = this.isProd ? 'Internal server error' : exception.message;
      errorName = exception.name;
    }

    const payload: SafeErrorPayload = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      method: request.method,
      message,
      error: errorName,
    };

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${payload.path} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status >= 400 && !this.isProd) {
      this.logger.debug(`[${request.method}] ${payload.path} -> ${status} ${JSON.stringify(message)}`);
    }

    response.status(status).json(payload);
  }
}
