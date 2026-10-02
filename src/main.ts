import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, RequestMethod, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { PrismaService } from './prisma/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');
import helmet from 'helmet';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create(AppModule, {
    // Show logs in terminal so requests, responses and OTP are visible
    logger: ['error', 'warn', 'log', 'debug'],
    rawBody: true,
  });

  // ── SHUTDOWN HOOKS ────────────────────────────────────────────────────────
  // Prisma and NestJS both need this for graceful shutdown (SIGTERM/SIGINT)
  app.enableShutdownHooks();

  // ── SECURITY & COMPRESSION ────────────────────────────────────────────────
  app.use(helmet());
  app.use(compression());

  // ── CORS ──────────────────────────────────────────────────────────────────
  // In production CORS_ORIGIN must be explicitly set; fallback to '*' only in dev.
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : (isProd ? [] : ['*']);

  if (isProd && allowedOrigins.length === 0) {
    logger.warn('⚠️  CORS_ORIGIN is not set in production — all cross-origin requests will be blocked.');
  }

  app.enableCors({
    origin: allowedOrigins.length === 1 && allowedOrigins[0] === '*' ? '*' : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // ── GLOBAL PREFIX ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  // ── VALIDATION PIPE — strict whitelist ────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip unknown fields
      forbidNonWhitelisted: true, // Throw 400 on unknown fields (tightened from false)
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── GLOBAL FILTERS & INTERCEPTORS ─────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());

  // ── SWAGGER ───────────────────────────────────────────────────────────────
  const enableSwagger = process.env.DISABLE_SWAGGER !== 'true';
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('CoBuddy Customer API')
      .setDescription(
        'Complete backend for CoBuddy Customer Mobile Application. ' +
        'All endpoints match customer screens and store interfaces exactly.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'customer-jwt',
      )
      .addTag('Auth', 'Phone OTP, JWT, Device sessions')
      .addTag('Profile', 'Customer profile & photo management')
      .addTag('KYC', 'Aadhaar/PAN/Passport verification & liveness')
      .addTag('Discovery', 'Browse & filter companion profiles')
      .addTag('Bookings', 'Booking lifecycle & counter offers')
      .addTag('Sessions', 'Live session check-in & digital pass')
      .addTag('Wallet', 'Balance, top-up & transactions')
      .addTag('Payments', 'Razorpay orders & payment verification')
      .addTag('Safety', 'Emergency SOS, trusted contacts, incidents')
      .addTag('Notifications', 'In-app & push notifications')
      .addTag('Support', 'Help tickets & concierge messaging')
      .addTag('Reviews', 'Session ratings & reviews')
      .addTag('Account', 'Settings, blocks, deactivation, deletion')
      .addTag('Chat', 'Companion & Concierge chat')
      .addTag('Uploads', 'Generic file uploads')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    logger.log('📚 Swagger OpenAPI Docs: enabled');
  } else {
    logger.log('🔒 Swagger disabled (set ENABLE_SWAGGER=true to enable)');
  }

  // ── DB HEALTH PROBE ───────────────────────────────────────────────────────
  // Verify DB connection at startup; log error if unreachable (do not hard crash app)
  try {
    const prisma = app.get(PrismaService);
    await prisma.$queryRaw`SELECT 1`;
    logger.log('✅ Database connection verified');
  } catch (err: any) {
    logger.error('⚠️ Database connection failed at startup — continuing app startup', err?.message || err);
  }

  // ── START ──────────────────────────────────────────────────────────────────
  const port = process.env.PORT ?? 4002;
  await app.listen(port);
  logger.log(`🚀 CoBuddy Customer Backend running on: http://localhost:${port}`);
  if (enableSwagger) {
    logger.log(`📚 Swagger OpenAPI Docs: http://localhost:${port}/api/docs`);
  }
}
bootstrap();
