# 青木私语学苑后台设计维护

沿用已确认暖橙桌面视觉；主题唯一运行时来源为src/styles，组件沿用Element Plus中文配置和现有AdminShell、PageHeading、EntityForm、ReasonDialog。真实接口与演示模式共享视觉，不另建主题。

数据源选择属于启动/构建配置；API授权由Java最终判断，不用演示数据推断权限。失败保留输入，未知结果不伪报成功。

运营图表沿用CSS主题变量--brand/--green，使用ECharts按需模块、数据表替代查看和减少动态效果。公开图像用MediaPreview，私有凭证用AttachmentGallery；不把私有图片转公开URL。信息提示使用--muted映射--el-color-info，保证正文对比度。

按钮悬停与轻量链接统一使用--brand-ink作为文字色；实色主按钮悬停背景使用同一深橙变量，避免暖浅底上的普通橙文字对比不足。

错误文本以--danger映射Element Plus error/danger和既有error-text，沿用深红#a83928，保证浅底警示文字对比度。
