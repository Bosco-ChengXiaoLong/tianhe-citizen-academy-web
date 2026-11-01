import type { Database, AdminAccount } from "../types";
export function actionScopes(
  db: Database,
  account: AdminAccount | undefined,
  action: string,
): "*" | string[] {
  if (!account?.active) return [];
  const grants = db.roles
    .filter((r) => account.roleIds.includes(r.id))
    .flatMap((r) => r.grants)
    .filter((g) => g.action === action || g.action === "*");
  if (grants.some((g) => g.scope === "*")) return "*";
  return [...new Set(grants.flatMap((g) => (g.scope === "*" ? [] : g.scope)))];
}
export function allowed(
  db: Database,
  account: AdminAccount | undefined,
  action: string,
  academyIds?: string[],
): boolean {
  const scope = actionScopes(db, account, action);
  return (
    scope === "*" ||
    (academyIds
      ? academyIds.length > 0 && academyIds.every((id) => scope.includes(id))
      : scope.length > 0)
  );
}
export function safeReturn(value: unknown) {
  return typeof value === "string" &&
    /^\/(?!\/)/.test(value) &&
    !/[\\\u0000-\u001f]/.test(value) &&
    !/^\/(login|403)/.test(value)
    ? value
    : "/overview";
}
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
