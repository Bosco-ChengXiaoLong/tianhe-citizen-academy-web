# 青木私语学苑后台设计维护

沿用已确认暖橙桌面视觉；主题唯一运行时来源为src/styles，组件沿用Element Plus中文配置和现有AdminShell、PageHeading、EntityForm、ReasonDialog。真实接口与演示模式共享视觉，不另建主题。

数据源选择属于启动/构建配置；API授权由Java最终判断，不用演示数据推断权限。失败保留输入，未知结果不伪报成功。
