import type { Row } from "../types";
import { DomainError } from "./permissions";
export function ancestors(members: Row[], id: string): Row[] {
  const result: Row[] = [];
  const visited = new Set<string>([id]);
  let cursor = members.find((m) => m.id === id);
  while (cursor?.inviterId) {
    const next = members.find((m) => m.id === cursor!.inviterId);
    if (!next || visited.has(next.id)) break;
    visited.add(next.id);
    result.push(next);
    cursor = next;
  }
  return result;
}
export function descendants(members: Row[], id: string): Row[] {
  return members.filter(
    (m) => m.id !== id && ancestors(members, m.id).some((a) => a.id === id),
  );
}
export function validateParent(members: Row[], id: string, parentId: string) {
  if (
    !members.some((m) => m.id === id) ||
    !members.some((m) => m.id === parentId && m.status === "启用")
  )
    throw new DomainError("INVALID_MEMBER", "请选择有效会员");
  if (
    id === parentId ||
    descendants(members, id).some((m) => m.id === parentId)
  )
    throw new DomainError("REFERRAL_CYCLE", "不能选择本人或下游作为直属邀请人");
}
