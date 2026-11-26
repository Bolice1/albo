import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RedisService } from '@database/redis.service';
import { AuthenticatedPrincipal } from '../decorators/authenticated-principal.interface';
import { RateLimitExceededException } from '../errors/app.exception';

export const RATE_LIMIT_OPTIONS_KEY = 'rateLimitOptions';

export interface RateLimitOptions {
  category: string;
  limit: number;
  windowSeconds: number;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_OPTIONS_KEY, options);

interface RequestWithPrincipal extends Request {
  user?: AuthenticatedPrincipal;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_OPTIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithPrincipal>();
    const response = http.getResponse<Response>();

    const actorKey = request.user?.userAccountId ?? request.ip ?? 'anonymous-client';
    const windowBucket = Math.floor(Date.now() / (options.windowSeconds * 1000));
    const redisKey = `albo:rl:${options.category}:${actorKey}:${windowBucket}`;

    const { count, ttlSeconds } = await this.redis.incrementRateLimitWindow(
      redisKey,
      options.windowSeconds,
    );

    const remaining = Math.max(0, options.limit - count);
    response.setHeader('X-RateLimit-Limit', String(options.limit));
    response.setHeader('X-RateLimit-Remaining', String(remaining));
    response.setHeader('X-RateLimit-Reset', String(ttlSeconds));

    if (count > options.limit) {
      response.setHeader('Retry-After', String(ttlSeconds));
      throw new RateLimitExceededException();
    }

    return true;
  }
}
