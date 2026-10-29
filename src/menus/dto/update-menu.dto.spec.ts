import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateMenuDto } from './update-menu.dto';

describe('UpdateMenuDto', () => {
  // Same options as main.ts
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const run = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: UpdateMenuDto });

  it('rejects an attempt to move the item to another restaurant', async () => {
    await expect(
      run({ restaurant: '507f1f77bcf86cd799439011', price: 5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still allows editing ordinary fields', async () => {
    await expect(
      run({ price: 9.5, isAvailable: false }),
    ).resolves.toMatchObject({ price: 9.5, isAvailable: false });
  });
});
