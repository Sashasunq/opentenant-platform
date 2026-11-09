import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { FFMPEGLAB_PLATFORM_PORT } from './config';
import { apiReference } from '@scalar/nestjs-api-reference';
import session from 'express-session';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Capture raw body for webhook signature verification
  app.use(
    express.json({
      verify: (req, res, buf) => {
        (req as any).rawBody = buf;
      },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('OpenTenant Platform')
    .setDescription('OpenTenant Platform API')
    .setVersion('1.0')
    .addTag('OpenTenant Platform')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  const document = documentFactory();
  const externalSpecPath = path.join(
    __dirname.replace('src', '').replace('dist', ''),
    '/supabase.yml',
  );
  const externalSpec: any = yaml.load(
    fs.readFileSync(externalSpecPath, 'utf8'),
  );

  if (externalSpec.components && externalSpec.components.schemas) {
    document.components = document.components || {};
    document.components.schemas = {
      ...document.components.schemas,
      ...externalSpec.components.schemas,
    };
  }

  SwaggerModule.setup('api', app, document);
  app.use(
    '/docs',
    apiReference({
      content: document,
    }),
  );

  // Session cookie with secure, sameSite=none for cross-origin
  app.use(
    session({
      secret: process.env.COOKIE_SECRET as string,
      resave: false,
      saveUninitialized: true, // needed for GitLab state
      cookie: {
        secure: true, // required for sameSite=none
        sameSite: 'none',
        maxAge: 10 * 60 * 1000,
      },
    }),
  );

  // CORS with credentials support
  app.enableCors();

  await app.listen(FFMPEGLAB_PLATFORM_PORT);
}
bootstrap();
