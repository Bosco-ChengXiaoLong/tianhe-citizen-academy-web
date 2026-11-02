import { uuid } from "../utils/uuid";
import type { ApiEnvelope, TokenBundle } from "../contracts/protocol";
export interface HttpRequest {
  method: string;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  responseType?: "json" | "blob";
}
export type HttpPort = (request: HttpRequest) => Promise<{ data: unknown }>;
export class JavaApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public requestId?: string,
  ) {
    super(message);
    this.name = "JavaApiError";
  }
}
export function createJavaClient(
  port: HttpPort,
  options: {
    refreshPath: string;
    storageKey: string;
    storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
    onExpired?: () => void;
  },
) {
  type Stored = TokenBundle & { expiresAt: number };
  let current: Stored | undefined;
  try {
    const raw = options.storage?.getItem(options.storageKey);
    if (raw) {
      const value = JSON.parse(raw) as Stored;
      if (
        typeof value.accessToken === "string" &&
        typeof value.refreshToken === "string" &&
        typeof value.expiresAt === "number"
      )
        current = value;
    }
  } catch {
    /* unavailable storage never establishes an identity */
  }
  const save = (bundle: TokenBundle) => {
    current = { ...bundle, expiresAt: Date.now() + bundle.expiresIn * 1000 };
    try {
      options.storage?.setItem(options.storageKey, JSON.stringify(current));
    } catch {
      /* memory-only session */
    }
  };
  const clear = () => {
    current = undefined;
    try {
      options.storage?.removeItem(options.storageKey);
    } catch {
      /* already cleared in memory */
    }
  };
  const unwrap = <T>(body: unknown): T => {
    const envelope = body as ApiEnvelope<T>;
    if (!envelope || envelope.code !== "OK")
      throw new JavaApiError(
        envelope?.code ?? "RESPONSE_INVALID",
        envelope?.message ?? "服务返回格式异常",
        0,
        envelope?.requestId,
      );
    return envelope.data;
  };
  let refreshing: Promise<void> | undefined;
  const refresh = () => {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      if (!current) throw new JavaApiError("AUTH_EXPIRED", "请重新登录", 401);
      try {
        const response = await port({
          method: "POST",
          url: options.refreshPath,
          data: { refreshToken: current.refreshToken },
        });
        save(unwrap<TokenBundle>(response.data));
      } catch (e) {
        clear();
        options.onExpired?.();
        throw e;
      }
    })().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  };
  function failure(error: unknown): JavaApiError {
    if (error instanceof JavaApiError) return error;
    const e = error as {
      response?: { status?: number; data?: Partial<ApiEnvelope<never>> };
      code?: string;
    };
    const status = e?.response?.status ?? 0;
    return new JavaApiError(
      e?.response?.data?.code ??
        (status === 401
          ? "AUTH_EXPIRED"
          : e?.code === "ECONNABORTED"
            ? "TIMEOUT"
            : "NETWORK_ERROR"),
      e?.response?.data?.message ??
        (status === 401 ? "登录已过期，请重新登录" : "请求未完成，请稍后重试"),
      status,
      e?.response?.data?.requestId,
    );
  }
  const pendingWrites=new Map<string,string>();
  async function request<T>(
    method: string,
    url: string,
    data?: unknown,
    settings: {
      authenticated?: boolean;
      requestId?: string;
      signal?: AbortSignal;
      blob?: boolean;
    } = {},
  ): Promise<T> {
    if (settings.authenticated && !current)
      throw new JavaApiError("AUTH_EXPIRED", "请先登录", 401);
    if (
      settings.authenticated &&
      current &&
      current.expiresAt <= Date.now() + 5000
    )
      await refresh().catch((error) => {
        throw failure(error);
      });
    const fingerprint=!["GET","HEAD"].includes(method)&&!(typeof FormData!=="undefined"&&data instanceof FormData)?JSON.stringify([method,url,data]):undefined;
    const automaticId=fingerprint?(pendingWrites.get(fingerprint)??uuid()):uuid();
    if(fingerprint&&!settings.requestId){if(pendingWrites.size>=100)pendingWrites.delete(pendingWrites.keys().next().value!);pendingWrites.set(fingerprint,automaticId);}
    const headers: Record<string, string> = {};
    if (!["GET", "HEAD"].includes(method))
      headers["Idempotency-Key"] = settings.requestId ?? automaticId;
    const send = () =>
      port({
        method,
        url,
        data,
        signal: settings.signal,
        responseType: settings.blob ? "blob" : "json",
        headers: {
          ...headers,
          ...(settings.authenticated && current
            ? { Authorization: `Bearer ${current.accessToken}` }
            : {}),
        },
      });
    try {
      let response;
      try {
        response = await send();
      } catch (e) {
        if (
          settings.authenticated &&
          (e as { response?: { status: number } })?.response?.status === 401 &&
          current
        ) {
          await refresh();
          response = await send();
        } else throw e;
      }
      if(fingerprint)pendingWrites.delete(fingerprint);
      return settings.blob ? (response.data as T) : unwrap<T>(response.data);
    } catch (e) {
      let error = failure(e);
      if(fingerprint&&error.status)pendingWrites.delete(fingerprint);
      if(!["GET","HEAD"].includes(method)&&error.status===0){error=new JavaApiError("RESULT_UNKNOWN","提交结果尚未确认，请核对记录后重试",0,headers["Idempotency-Key"]);}
      if (error.status === 401) {
        clear();
        options.onExpired?.();
      }
      throw error;
    }
  }
  return {
    request,
    save,
    clear,
    get session() {
      return current;
    },
    async login(path: string, credentials: unknown) {
      const tokens = await request<TokenBundle>("POST", path, credentials);
      save(tokens);
      return tokens;
    },
    async logout(path: string) {
      try {
        await request("POST", path, undefined, { authenticated: true });
      } finally {
        clear();
      }
    },
  };
}
