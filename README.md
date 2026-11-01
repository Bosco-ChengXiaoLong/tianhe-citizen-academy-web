# 青木私语学苑 · admin

Vue3 + TypeScript + Vite。完整仓库中的shared目录须一起检出。npm ci安装依赖。

| 命令 | 数据模式 |
| --- | --- |
| npm run dev:mock | 独立本地演示，无真实业务写入 |
| npm run dev:api | 真实Java，需先启动本机后端 |
| npm run build:mock | 生成演示包 |
| npm run build:api | 生成真实接口包 |

VITE_DATA_SOURCE允许mock/api，旧demo兼容为mock；非法值拒绝启动。API地址由VITE_API_BASE_URL配置；开发代理由API_PROXY_TARGET配置。Vite变量在启动/构建时生效，Docker中的Nginx运行变量不能改变已构建的数据模式。显式进程环境变量优先，切换后重启；不得把密码放入VITE变量。

两模式隔离会话及持久化数据；API错误不回退mock。API支持真实登录刷新、按动作授权和服务端分页。短信仍未开放。配置与测试证据见../文档/后端/双端本机联调准备.md及../文档/校验记录。
