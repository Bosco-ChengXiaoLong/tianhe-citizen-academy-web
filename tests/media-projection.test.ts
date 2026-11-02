import { expect, it } from "vitest";
import { viewRow } from "../src/services/api-repository";

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
