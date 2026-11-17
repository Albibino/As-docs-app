import { Test, TestingModule } from '@nestjs/testing';
import { EnvironmentService } from './environment.service';

describe('EnvironmentService', () => {
  let service: EnvironmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EnvironmentService],
    })
      .useMocker(() => ({}))
      .compile();

    service = module.get<EnvironmentService>(EnvironmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('recognizes the Railway development environment even with a production build', () => {
    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          NODE_ENV: 'production',
          RAILWAY_ENVIRONMENT_NAME: 'development',
        };
        return values[key] ?? fallback;
      }),
    };
    const developmentEnvironment = new EnvironmentService(
      configService as never,
    );

    expect(developmentEnvironment.isDevelopmentEnvironment()).toBe(true);
  });

  it('does not treat the Railway production environment as development', () => {
    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          NODE_ENV: 'production',
          RAILWAY_ENVIRONMENT_NAME: 'production',
        };
        return values[key] ?? fallback;
      }),
    };
    const productionEnvironment = new EnvironmentService(
      configService as never,
    );

    expect(productionEnvironment.isDevelopmentEnvironment()).toBe(false);
  });

  it('lets the Railway environment name override NODE_ENV for isolation', () => {
    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          NODE_ENV: 'development',
          RAILWAY_ENVIRONMENT_NAME: 'production',
        };
        return values[key] ?? fallback;
      }),
    };
    const productionEnvironment = new EnvironmentService(
      configService as never,
    );

    expect(productionEnvironment.isDevelopmentEnvironment()).toBe(false);
  });
});
