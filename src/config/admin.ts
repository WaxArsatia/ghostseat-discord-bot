const ADMIN_USER_IDS = ["321830337833467907"] as const;

const adminUserIdSet = new Set<string>(ADMIN_USER_IDS);

export function isAdminUser(userId: string): boolean {
  return adminUserIdSet.has(userId);
}
