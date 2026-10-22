import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from '../auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token missing. Please log in.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      (request as any).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Session expired or token invalid. Please log in again.');
    }
  }

  private extractTokenFromRequest(request: Request): string | undefined {
    // 1. Primary: HttpOnly Cookie
    if (request.cookies && request.cookies.access_token) {
      return request.cookies.access_token;
    }

    // 2. Secondary: Bearer Header (for Swagger or curl)
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

