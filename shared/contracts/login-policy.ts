/** Approved 2026-11-02. UI drafts must not introduce phone binding after password login. */
export const LOGIN_POLICY = Object.freeze({
  defaultLoginMethod: "phone" as const,
  accountPasswordRequiresPhone: false,
  requirePhoneBindingAfterLogin: false,
  promptPhoneBindingAfterLogin: false,
});
