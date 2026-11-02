# 青木私语学苑后台交互约定

语言zh-CN，时区Asia/Shanghai；暖橙桌面基线。mock/API共用控件，API身份及权限由Java确定。真实读写不回退演示资料。

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Form | components/EntityForm.vue | DESIGN.md | 文本、密码、数字、图片 | tests/api-browser.mjs |
| Select/Listbox | Element Plus el-select | components/EntityForm.vue | 单选、多选、关系选择 | tests/browser.mjs |
| Date | Element Plus el-date-picker | components/EntityForm.vue | 日期时间、范围 | tests/browser.mjs |
| Table Selection | Element Plus el-table | pages/EntityList.vue | 当前页选择、按查询导出 | tests/browser.mjs |
| Scrollbar | src/styles | DESIGN.md | 文档滚动、表格横向滚动 | tests/browser.mjs |
| Toast | Element Plus ElMessage | composables/useOperation.ts | 成功、错误 | tests/browser.mjs |
| CRUD | useList/useOperation/ReasonDialog | Java API | 服务端分页，显式原因和版本 | tests/api-browser.mjs |

API列表使用服务端total；查询条件保留URL。操作等服务器确认后显示成功，失败保留输入；权限或版本过期不得覆盖新状态。角色、账号及邀请更正需确认原因。

> 2026-11-02 用户确认：默认手机号登录；账号/学号登录不依赖手机号，允许号码为空，不强制验证或补绑，不弹出补绑提示。执行规则见文档/决策/ADR-001_账号登录与手机号可选规则.md；该决策优先于旧UI稿。
