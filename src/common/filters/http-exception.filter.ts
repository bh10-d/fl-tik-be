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

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details: any = [];

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as Record<string, any>;
        message = resObj.message || exception.message;
        details = resObj.details || (Array.isArray(resObj.message) ? resObj.message : []);
        code = resObj.error || resObj.code || this.mapStatusToCode(statusCode);
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
      message = exception.message;
    }

    // Ensure status codes have human-readable error codes
    if (statusCode === HttpStatus.BAD_REQUEST && code === 'INTERNAL_SERVER_ERROR') {
      code = 'VALIDATION_ERROR';
    } else if (statusCode === HttpStatus.NOT_FOUND && code === 'INTERNAL_SERVER_ERROR') {
      code = 'NOT_FOUND';
    } else if (statusCode === HttpStatus.CONFLICT && code === 'INTERNAL_SERVER_ERROR') {
      code = 'CONFLICT';
    }

    response.status(statusCode).json({
      statusCode,
      code,
      message: Array.isArray(message) ? 'Validation failed' : message,
      details: Array.isArray(message) ? message : details,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT_ERROR';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}

