export function userHasRole(user: any, role: string): boolean {
  const granted: string[] = user?.roles || (user?.role ? [user.role] : []);
  return granted.includes(role);
}

export function effectiveRestaurantRole(user: any): string {
  if (userHasRole(user, 'admin')) return 'admin';
  if (userHasRole(user, 'owner')) return 'owner';
  return user?.role || '';
}
