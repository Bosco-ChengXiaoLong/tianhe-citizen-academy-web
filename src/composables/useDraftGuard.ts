import { onScopeDispose } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { ElMessageBox } from "element-plus";
export function useDraftGuard(dirty: () => boolean) {
  let confirming = false;
  async function allowDiscard() {
    if (!dirty()) return true;
    if (confirming) return false;
    confirming = true;
    try {
      await ElMessageBox.confirm(
        "尚有未保存内容，离开将放弃本次修改。",
        "放弃修改？",
        {
          confirmButtonText: "放弃修改",
          cancelButtonText: "继续编辑",
          type: "warning",
        },
      );
      return true;
    } catch {
      return false;
    } finally {
      confirming = false;
    }
  }
  onBeforeRouteLeave(allowDiscard);
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty()) event.preventDefault();
  };
  window.addEventListener("beforeunload", beforeUnload);
  onScopeDispose(() =>
    window.removeEventListener("beforeunload", beforeUnload),
  );
  return { allowDiscard };
}
