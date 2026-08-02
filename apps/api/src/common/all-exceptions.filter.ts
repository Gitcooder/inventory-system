import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Request, Response } from 'express';

/**
 * Catches everything, HttpException or not, so no unhandled error ever
 * reaches the client as a raw stack trace or an inconsistent shape.
 *
 * Two different logging levels on purpose: a 404 or a 409 from a duplicate
 * SKU is expected traffic — normal business-logic rejections, not
 * incidents — and logging every one at error level would drown out the
 * things that actually need attention. Anything that isn't already a
 * well-formed HttpException (a genuine bug, a Prisma error that slipped past
 * toHttpException, etc.) is logged at error level with the full exception.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (isHttpException && status < 500) {
      this.logger.debug({ status, path: request.url }, 'Handled exception');
    } else {
      this.logger.error(
        { err: exception, path: request.url },
        'Unhandled exception',
      );
    }

    const body = isHttpException
      ? exception.getResponse()
      : { statusCode: status, message: 'Internal server error' };

    response
      .status(status)
      .json(
        typeof body === 'string' ? { statusCode: status, message: body } : body,
      );
  }
}
