import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, RequestMethod } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('CoBuddy Customer API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: [{ path: 'health', method: RequestMethod.GET }],
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health -> 200 OK', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.status).toBe('ok');
        expect(res.body.data.service).toBe('cobuddy-customer-backend');
      });
  });

  it('GET /api/v1/system/config -> 200 OK', () => {
    return request(app.getHttpServer())
      .get('/api/v1/system/config')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('minAppVersion');
        expect(res.body.data).toHaveProperty('policyUrls');
      });
  });

  it('GET /api/v1/discovery/activities -> 200 OK', () => {
    return request(app.getHttpServer())
      .get('/api/v1/discovery/activities')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
      });
  });

  it('GET /api/v1/discovery/interests -> 200 OK', () => {
    return request(app.getHttpServer())
      .get('/api/v1/discovery/interests')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
      });
  });

  it('GET /api/v1/support/categories -> 200 OK', () => {
    return request(app.getHttpServer())
      .get('/api/v1/support/categories')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBe(4);
      });
  });

  it('POST /api/v1/auth/send-otp -> 200 OK', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/send-otp')
      .send({ phone: '+919876543210' })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('message');
      });
  });
});
