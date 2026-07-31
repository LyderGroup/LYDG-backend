import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: getDataSourceToken(), useValue: { query } },
      ],
    }).compile();

    controller = moduleRef.get<AppController>(AppController);
  });

  it('répond sur la route racine', () => {
    expect(controller.getHello()).toBe('Hello World!');
  });

  describe('GET /health/db', () => {
    // Cette route est le healthCheckPath de Render (render.yaml) ET une route
    // publique de FirebaseAuthGuard : elle ne doit jamais lever, sinon Render
    // considère le déploiement en échec et fait rouler le service en boucle.
    it('renvoie healthy quand la base répond', async () => {
      const result = await controller.checkDatabaseHealth();

      expect(query).toHaveBeenCalledWith('SELECT 1');
      expect(result.status).toBe('healthy');
      expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
    });

    it('renvoie unhealthy sans lever quand la base est injoignable', async () => {
      query.mockRejectedValue(new Error('connection refused'));

      await expect(controller.checkDatabaseHealth()).resolves.toEqual({
        status: 'unhealthy',
        timestamp: expect.any(String),
      });
    });
  });
});
