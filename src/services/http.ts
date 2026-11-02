import axios from "axios";
import { createJavaClient } from "../../shared/transport/java-client";
let onSessionExpired: (() => void) | undefined;
export function registerSessionExpired(handler: () => void) {
  onSessionExpired = handler;
}
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/admin/v1",
  timeout: 15000,
  withCredentials: false,
  headers: { Accept: "application/json" },
});
let storage: Storage | undefined;
try {
  storage = globalThis.sessionStorage;
} catch {
  /* memory-only */
}
export const api = createJavaClient((config) => http.request(config), {
  refreshPath: "/auth/refresh",
  storageKey: "qingmu-admin-api-tokens",
  storage,
  onExpired: () => onSessionExpired?.(),
});
