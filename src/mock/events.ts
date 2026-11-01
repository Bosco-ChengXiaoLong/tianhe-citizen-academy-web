import dictionary from "../../../文档/H5/开发/event-dictionary.json";
export { dictionary };
export const eventSamples = Array.from({ length: 32 }, (_, i) => ({
  event_id: `sample-${String(i + 1).padStart(3, "0")}`,
  event_name:
    i % 4 === 0
      ? "course_view"
      : i % 4 === 1
        ? "course_click"
        : i % 4 === 2
          ? "course_impression"
          : "page_view",
  source: "client",
  schema_version: dictionary.schema_version,
  member_id: i % 7 === 0 ? "" : `member-${(i % 12) + 1}`,
  course_id: i % 3 === 0 ? "photography" : "calligraphy",
  academy_id: i % 3 === 0 ? "life" : "humanities",
  page_code: i % 2 ? "H03" : "H01",
  occurred_at: "2026-11-01T01:00:00Z",
  received_at: "2026-11-01T01:00:01Z",
  status: i === 29 ? "重复" : i === 30 ? "拒绝" : i === 31 ? "迟到" : "已接收",
}));
