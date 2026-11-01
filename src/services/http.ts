import { uuid } from "../utils/uuid";
import axios from "axios";
import { DomainError } from "../domain/permissions";
/** Reserved transport for Java integration. Demo repository never calls it or silently falls back. */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api/admin/v1",
  timeout: 15000,
  withCredentials: true,
  headers: { Accept: "application/json" },
});
http.interceptors.request.use((config) => {
  if (["post", "put", "patch", "delete"].includes(config.method ?? ""))
    config.headers["X-Request-ID"] ??= uuid();
  return config;
});
http.interceptors.response.use(
  (response) => {
    const body = response.data as { code?: number; message?: string };
    if (body?.code === 401)
      throw new DomainError("UNAUTHORIZED", "登录已过期，请重新登录");
    if (typeof body?.code === "number" && ![0, 200].includes(body.code))
      throw new DomainError(String(body.code), body.message ?? "操作未完成");
    return response;
  },
  (error: unknown) => {
    if (axios.isCancel(error)) return Promise.reject(error);
    if (axios.isAxiosError(error))
      return Promise.reject(
        new DomainError(
          error.response?.status === 401
            ? "UNAUTHORIZED"
            : error.code === "ECONNABORTED"
              ? "TIMEOUT"
              : "HTTP_ERROR",
          error.response?.status === 401
            ? "登录已过期，请重新登录"
            : error.code === "ECONNABORTED"
              ? "请求超时，请重试"
              : "服务暂时不可用，请稍后重试",
        ),
      );
    return Promise.reject(error);
  },
);
