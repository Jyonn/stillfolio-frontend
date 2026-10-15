# StillFolio Frontend

留幅摄影作品集工作台。`npm run dev` 启动开发服务，`npm test` 执行测试，`npm run build` 构建 GitHub Pages 静态站。
生产 API 通过 `VITE_API_ORIGIN=https://api.stillfolio.jyonn.space` 配置。

## Sermo 登录

### Sermo 直达入口

`https://stillfolio.jyonn.space/auth/sermo/start?source=sermo&login_hint=wzry%3A54`
（也支持尾斜杠）。入口自动开始既有 PKCE 流程，不加载工作台、不检查已有登录来跳过授权。
`source` 和其他参数不参与授权；可选 hint 只接受 1–64 位小写 slug（字母/数字开头，之后可含 `_`、`-`）和正的安全整数 ID。
非法、重复 hint 忽略，仍可普通授权；hint 不是身份凭据，不传给 StillFolio start/complete API 或 Sermo token 接口。
后端返回的 authorize URL 仍严格验证全部原参数，验证后才追加 hint。
hint 随当前标签页 pending 事务保存；合法回调消费后用于失败/取消重试，每次重试生成新 state/verifier。
无效 state 或已过期事务不恢复账号提示。失败不清空已有会话、作品数据，也不会自动循环跳转。

构建脚本 `scripts/build-sermo-callback.mjs` 同时生成
`dist/auth/sermo/start/index.html` 与 `dist/auth/sermo/callback/index.html`；
GitHub Pages workflow 检查两者与主入口一致。Service Worker 不缓存或离线替换这两个授权路径。
新入口复用现有登录状态页样式，无新增视觉系统；本轮无需后端迁移或修改 Sermo。

自动测试覆盖 hint 边界/重复参数、严格 URL 校验、hint 不进入 API、取消后重试的新 PKCE、两标签页事务隔离，
以及原有 state/PKCE/回调安全测试。真实多空间账号选择与授权同意需在 Sermo 有效登录态下手动验收；
测试不自动同意授权，也不使用真实账号兑换凭据。

首次进入、手机号登录页和用户设置的连接账户页均提供“使用 Sermo 登录”，现有手机号登录保留。
授权由 Sermo 页面完成，不在 StillFolio 收集 Sermo 密码。

客户端 ID 为 `stillfolio`；唯一注册回调是 `https://stillfolio.jyonn.space/auth/sermo/callback`。
`sermo-pkce.js` 用 Web Crypto 随机生成 state（32 字节 / 43 字符）和 verifier（64 字节 / 86 字符），
计算无填充 base64url SHA256 challenge。仅在当前标签页 sessionStorage 临时保存 PKCE 上下文，五分钟过期。
授权 URL 严格检查 host/path、client ID、回调、scope=`profile phone vip`、state 和 S256；不接受重复参数或未知参数。

后端 start 为该请求增加 HttpOnly 浏览器绑定 cookie。回调读取 code/state 后，`entry.js` 立即清理地址栏，
在加载任何回调模块/日志前删除 query 和 fragment。HTML 使用 `referrer=no-referrer`。
前端严格核对并一次性消费 pending state/verifier，再 POST 给后端 complete；token/userinfo 的网络请求仅发生在后端。
Sermo token 不进入前端；后端返回的 StillFolio access token也不写浏览器存储，返回工作台后通过自身 refresh cookie恢复会话。

取消、网络失败、跨账户身份冲突、无效/过期/重复回调均展示失败原因及“重新使用 Sermo 登录 / 使用手机号登录 / 返回作品集”。
相同的已验证手机号会自动绑定既有账户，已绑定另一 Sermo 身份时自动换绑；旧会话失效，手机号登录保留。
云端请求遇到过期 access token 时共享一次 refresh 并只重试一次；已被换绑撤销的会话不能刷新或重试获取权限。
重试创建全新的 state/verifier，不重新兑换旧 code。回调刷新缺少上下文时安全失败，不重放授权。
成功使用同源相对路径返回，不接受外部跳转或携带凭据的返回 URL；移动端保留登录前的作品集详情入口。
无手机号用户显示“未设置手机号”；Sermo VIP 与自身 VIP 的权益来源由后端区分，不自动获得创始铭牌。

## GitHub Pages 与离线壳

`npm run build` 的 `scripts/build-sermo-callback.mjs` 把构建入口复制到 `dist/auth/sermo/callback/index.html`。
GitHub Pages 可将无尾斜杠地址 canonicalize 到目录尾斜杠，前端识别两种路径，但授权请求中的注册回调始终保持无斜杠原值。
该路径直接访问/刷新有真实静态页，而不是仅依赖 HTTP 404 SPA 回退；CI 检查回调文件存在且与入口一致。
Service Worker 不处理/缓存回调导航，也不会把它缓存为首页；授权页面不注册离线应用壳。

本地真实授权不受支持：唯一回调返回生产域名，无法读取 localhost 标签页的临时上下文。
本地跑 mock/RFC PKCE 测试，真实授权联调在生产站进行。不要添加未注册的 localhost 回调或放宽校验。

测试：`npm test`。构建：`npm run build`。回调与入口需人工验证直接访问、刷新、取消、失败、重试，以及成功后主页刷新/退出。
后端 API、数据迁移、安全和权益规则见 `../stillfolio-backend/README.md`。
