import { PartialType } from '@nestjs/mapped-types';
import { CreateAuthDto } from './signup-auth.dto';

export class UpdateAuthDto extends PartialType(CreateAuthDto) {}
