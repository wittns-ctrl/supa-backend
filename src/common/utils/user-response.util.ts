import { UserDocument } from 'src/users/schema/user.schema';

export function sanitizeUser(user: UserDocument) {
  const obj = user.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.resetToken;
  delete obj.resetTokenExpiration;
  delete obj.emailVerificationOtp;
  delete obj.emailVerificationOtpExpires;
  return {
    ...obj,
    id: obj._id.toString(),
    role: obj.role === 'owner' ? 'restaurant_owner' : obj.role,
    joinDate: obj.createdAt
      ? new Date(obj.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : undefined,
  };
}

export function mapFrontendRole(role: string): string {
  if (role === 'restaurant_owner') return 'owner';
  return role;
}
