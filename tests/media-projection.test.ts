import { expect, it } from "vitest";
import { viewRow } from "../src/services/api-repository";
import { LOGIN_POLICY } from "../../shared/contracts/login-policy";

it("accepts phone-less members without a binding requirement", () => {
  expect(
    viewRow({
      id: "member-without-phone",
      displayName: "测试学员",
      studentNo: "NO_PHONE_001",
    }).phoneMasked,
  ).toBe("");
  expect(LOGIN_POLICY.accountPasswordRequiresPhone).toBe(false);
  expect(LOGIN_POLICY.requirePhoneBindingAfterLogin).toBe(false);
  expect(LOGIN_POLICY.promptPhoneBindingAfterLogin).toBe(false);
  expect(LOGIN_POLICY.defaultLoginMethod).toBe("phone");
});

it("projects metadata-only media list rows to the canonical public image route", () => {
  const id = "5dc54b6c-3b7f-4d85-b7e8-6bdf4ed7555f";
  const media = viewRow({
    id,
    contentType: "image/png",
    bytes: 1024,
    enabled: true,
  });
  expect(media.url).toBe(`/api/media/${id}`);
  expect(viewRow({ id, name: "学院" }).url).toBeUndefined();
});
