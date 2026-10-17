import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { method } = request;
    const requestPath = request.path || request.url.split('?')[0];

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorBody =
      typeof message === 'object'
        ? message
        : { message };

    if (status >= 500) {
      this.logger.error(`[HTTP ERROR ${status}] ${method} ${requestPath}`);
    } else {
      this.logger.warn(`[HTTP WARN ${status}] ${method} ${requestPath}`);
    }

    if (response.headersSent) {
      return;
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: requestPath,
      ...(status >= 500
        ? { message: 'Internal server error' }
        : typeof errorBody === 'object'
          ? errorBody
          : { message: errorBody }),
    });
  }
}
