import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
    rawBody: true,
  });

  // Security & Compression
  app.use(helmet());
  app.use(compression());

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Validation pipe — strict mode
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter & response wrapper
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Swagger OpenAPI Documentation
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

  const port = process.env.PORT ?? 4002;
  await app.listen(port);
  console.log(`🚀 CoBuddy Customer Backend running on: http://localhost:${port}`);
  console.log(`📚 Swagger OpenAPI Docs: http://localhost:${port}/api/docs`);
}
bootstrap();
