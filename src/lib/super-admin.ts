export const SUPER_ADMIN_EMAIL = "admin@noponto.io";

export function isSuperAdmin(email: string | undefined | null): boolean {
  return email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}
