import { UserDocument } from 'src/users/schema/user.schema';

export function sanitizeUser(user: UserDocument) {
  const obj = user.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.previousRefreshToken;
  delete obj.previousRefreshTokenExpiresAt;
  delete obj.resetToken;
  delete obj.resetTokenExpiration;
  delete obj.emailVerificationOtp;
  delete obj.emailVerificationOtpExpires;
  delete obj.emailVerificationOtpAttempts;
  delete obj.authSessions;
  const restaurantMemberships = (obj.restaurantMemberships || []).map((membership: any) => ({
    restaurantId: membership.restaurantId?.toString?.() || membership.restaurantId,
    role: membership.role,
    status: membership.status,
  }));
  const roles = new Set<string>([obj.role]);
  for (const membership of restaurantMemberships) {
    if (membership.status === 'active') roles.add(membership.role);
  }
  return {
    ...obj,
    id: obj._id.toString(),
    role: obj.role,
    roles: [...roles],
    restaurantMemberships,
    joinDate: obj.createdAt
      ? new Date(obj.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : undefined,
  };
}
