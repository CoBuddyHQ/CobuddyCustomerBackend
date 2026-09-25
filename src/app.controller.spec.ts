import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let prismaService: any;

  beforeEach(async () => {
    prismaService = {
      $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return health status', async () => {
      const res = await appController.getHealth();
      expect(res.status).toBe('ok');
      expect(res.database).toBe('connected');
    });
  });
});

