import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppConfigService } from '@config/app-config.service';
import { AppModule } from './app.module';
import { configureHttpApplication } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  configureHttpApplication(app);

  const config = app.get(AppConfigService);
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
