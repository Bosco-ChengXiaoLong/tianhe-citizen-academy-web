import { expect, it } from "vitest";
import { formatDateTime } from "../src/utils/date-time";
it("formats UTC and fractional seconds as Beijing business time", () => {
  expect(formatDateTime("2026-11-02T07:35:53.613811Z")).toBe(
    "2026-11-02 15:35:53",
  );
  expect(formatDateTime("2026-11-02T16:00:00Z")).toBe("2026-11-03 00:00:00");
  expect(formatDateTime(null)).toBe("—");
  expect(formatDateTime("invalid")).toBe("—");
});
