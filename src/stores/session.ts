import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { repository, readSession, request } from "../services/client";
import { DomainError } from "../domain/permissions";
import { isApi } from "../services/data-source";
import { apiRepository, apiIdentity } from "../services/api-repository";
import { javaAdmin } from "../services/java-api";
export const useSessionStore = defineStore("admin-session", () => {
  const session = ref(readSession());
  const account = computed(() => {
    try {
      return repository
        .read()
        .accounts.find((a) => a.id === session.value?.accountId);
    } catch {
      return undefined;
    }
  });
  async function login(username: string, password: string) {
    if (isApi) {
      await javaAdmin.login(username, password);
      await apiRepository.identity();
      session.value = readSession();
      return;
    }
    await request(() => {
      const db = repository.read();
      const a = db.accounts.find((a) => a.username === username && a.active);
      if (!a || password !== "Demo@2026")
        throw new DomainError("LOGIN_FAILED", "账号或口令不正确");
      session.value = {
        accountId: a.id,
        expiresAt: Date.now() + 7200000,
        securityVersion: db.securityVersion,
      };
      sessionStorage.setItem(
        "qmsy-admin-session",
        JSON.stringify(session.value),
      );
    });
  }
  async function logout() {
    if (isApi) {
      try {
        await javaAdmin.logout();
      } finally {
        apiIdentity.current = undefined;
        session.value = null;
      }
      return;
    }
    session.value = null;
    sessionStorage.removeItem("qmsy-admin-session");
  }
  return { session, account, login, logout };
});
