import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Uploads vão em base64: imagens até ~10 MB e músicas até ~30 MB.
  app.useBodyParser('json', { limit: '45mb' });
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });

  const doc = new DocumentBuilder()
    .setTitle('Criador de Vídeos YouTube')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`API em http://localhost:${port} (Swagger em /docs)`);
}
bootstrap();
