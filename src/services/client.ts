import { api } from "./http";
import { apiIdentity } from "./api-repository";
import { Repository } from "./repository";
import type { Session } from "../types";
import { DomainError } from "../domain/permissions";
let fallback = "";
export const localStorageAdapter = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return fallback || null;
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      fallback = value;
    }
  },
};
export function readSession(): Session | null {
  if (isApi)
    return api.session
      ? {
          accountId: apiIdentity.current?.id ?? "",
          expiresAt: api.session.expiresAt,
          securityVersion: 1,
        }
      : null;
  try {
    const value = JSON.parse(
      sessionStorage.getItem("qmsy-admin-session") ?? "null",
    ) as Session | null;
    return value && typeof value.expiresAt === "number" ? value : null;
  } catch {
    return null;
  }
}
import { isApi } from "./data-source";
import { apiRepository } from "./api-repository";
// Legacy presentation reads a hydrated API cache; all API mutations are awaited by useOperation.
export const repository = isApi
  ? (apiRepository as unknown as Repository)
  : new Repository(localStorageAdapter, readSession, "demo");
let fault = "";
export function failNext(value: string) {
  fault = value;
}
export async function request<T>(
  action: () => T | Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const next = fault;
  fault = "";
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 180);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
  if (!navigator.onLine || next === "network")
    throw new DomainError("NETWORK", "网络连接异常，请重试，原内容已保留");
  if (next === "timeout") throw new DomainError("TIMEOUT", "请求超时，请重试");
  if (next === "unauthorized")
    throw new DomainError("UNAUTHORIZED", "登录已过期，请重新登录");
  const value = await action();
  if (next === "unknown")
    throw new DomainError(
      "RESULT_UNKNOWN",
      "操作结果不确定，请重新加载核对，不要重复提交",
    );
  return value;
}
