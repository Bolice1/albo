import { Controller, Get } from '@nestjs/common';
import { Public } from '@common/decorators/public.decorator';
import { DependencyUnavailableException, ErrorDetail } from '@common/errors/app.exception';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@database/redis.service';
import { AiServiceClient } from '@integrations/ai-service/ai-service.client';

export interface LivenessPayload {
  status: 'ok';
  service: 'albo-core-api';
}

export interface ReadinessPayload {
  status: 'ready';
  service: 'albo-core-api';
  dependencies: {
    postgres: 'up' | 'down';
    redis: 'up' | 'down';
    ai_service: 'up' | 'down';
  };
}

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly aiServiceClient: AiServiceClient,
  ) {}

  @Get('live')
  getLiveness(): LivenessPayload {
    return {
      status: 'ok',
      service: 'albo-core-api',
    };
  }

  @Get('ready')
  async getReadiness(): Promise<ReadinessPayload> {
    const [postgresUp, redisUp, aiServiceUp] = await Promise.all([
      this.prisma.checkReady(),
      this.redis.ping(),
      this.checkAiServiceUp(),
    ]);

    const dependencies: ReadinessPayload['dependencies'] = {
      postgres: postgresUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
      ai_service: aiServiceUp ? 'up' : 'down',
    };

    const unhealthyDetails: ErrorDetail[] = [];
    if (!postgresUp) {
      unhealthyDetails.push({ field: 'postgres', reason: 'down' });
    }
    if (!redisUp) {
      unhealthyDetails.push({ field: 'redis', reason: 'down' });
    }
    if (!aiServiceUp) {
      unhealthyDetails.push({ field: 'ai_service', reason: 'down' });
    }

    if (unhealthyDetails.length > 0) {
      throw new DependencyUnavailableException(
        'One or more required dependencies are unavailable.',
        unhealthyDetails,
      );
    }

    return {
      status: 'ready',
      service: 'albo-core-api',
      dependencies,
    };
  }

  private async checkAiServiceUp(): Promise<boolean> {
    try {
      const health = await this.aiServiceClient.checkHealth();
      return health.status === 'ok';
    } catch {
      return false;
    }
  }
}
