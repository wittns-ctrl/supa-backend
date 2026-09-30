import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppleAuthService } from './apple-auth.service';
import { OAuthStateService } from './oauth-state.service';
// token: AppleAuthService

describe('AuthController', () => {
  let controller: AuthController;

  const mockSvc = {
    findAll: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockSvc },
        { provide: AppleAuthService, useValue: {} },
        { provide: OAuthStateService, useValue: { issue: jest.fn(), consume: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
