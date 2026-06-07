import { SetMetadata } from '@nestjs/common';
import { roles } from 'src/users/schema/user.schema';

export const ROLES_KEY = 'roles';
export const Roles = (...rolesList: roles[]) => SetMetadata(ROLES_KEY, rolesList);
