# mail-digest

第二大脑的每日邮件分析模块。读取 UWA（Microsoft 365）、Gmail、QQ、163 四个邮箱的新邮件，
交给 DeepSeek 分类和提取待办，结果写进 vault：

- `mail/<日期> 邮件日报.md`：按「需要处理 / 有截止日期 / 仅供参考 / 已忽略」分组的日报
- `inbox/<日期> <任务名>.md`：每条待办一个任务提案，审批后移入 `tasks/`

所有邮箱都是**只读**访问：IMAP 用只读方式打开收件箱，Graph 只申请 `Mail.Read`。不会发信、删信或改变已读状态。

## 安装（Windows）

需要 Node.js 22 或更高版本。依赖在仓库根目录统一安装：

```powershell
# 在仓库根目录
npm install
cd packages\mail-digest
copy config.example.json config.json
copy .env.example .env
```

`config.json` 和 `.env` 已在根目录 `.gitignore` 中排除，不会被提交。

编辑 `config.json`：把 `vaultPath` 改成你的 vault 路径（用正斜杠），填好各邮箱地址；不用的邮箱直接从 `accounts` 里删掉。
编辑 `.env`：填 DeepSeek API key 和各邮箱的授权码。

## 各邮箱的准备工作

**Gmail**：Google 账号需开启两步验证，然后在 Google 账号 → 安全性 → 应用专用密码 生成一个 16 位密码，填到 `GMAIL_APP_PASSWORD`。
`gmailQuery` 默认排除「推广」和「社交」标签页的邮件，不需要可以删掉这一行。

**QQ 邮箱**：网页版 设置 → 账号 → 开启 IMAP/SMTP 服务，按提示用短信验证后得到授权码，填到 `QQ_AUTH_CODE`。

**163 邮箱**：网页版 设置 → POP3/SMTP/IMAP → 开启 IMAP/SMTP 服务，得到客户端授权码，填到 `NETEASE_AUTH_CODE`。

**UWA（Microsoft 365）**：学校邮箱不支持密码登录 IMAP，需要通过 Microsoft Graph 授权。

1. 用 UWA 账号登录 <https://entra.microsoft.com>，进入「应用注册」→「新注册」。
   名称随意；支持的账户类型选「任何组织目录中的账户」；重定向 URI 留空。
2. 注册后复制「应用程序(客户端) ID」，填到 `config.json` 里 UWA 账户的 `clientId`。
3. 「身份验证」→ 高级设置 → 「允许公共客户端流」设为「是」，保存。
4. 「API 权限」→ 添加权限 → Microsoft Graph → 委托的权限 → 勾选 `Mail.Read`。
5. 运行 `npm run login`，按终端提示打开网址、输入代码、用 UWA 账号登录并同意授权。
   令牌缓存在 `%USERPROFILE%\.second-brain\mail-digest\`，之后定时运行不需要再登录（长期不用后需重新 login）。

如果第 1 步提示你没有权限注册应用，或第 5 步出现「需要管理员批准」，说明学校的租户策略禁止学生自行授权，
这条路走不通，见下方「UWA 授权失败时」。

## 运行

```powershell
npm run mock       # 不连邮箱、不调 API，用 fixtures/ 里的示例邮件跑一遍，输出到 mock-vault/
npm run dry        # 真实抓取和分析，只在终端打印结果，不写 vault、不推进进度
npm run digest     # 正式运行
```

第一次运行取最近 24 小时（`firstRunHours`）的邮件，之后只取上次运行之后的新邮件。
抓取进度保存在 `%USERPROFILE%\.second-brain\mail-digest\state.json`，删掉它就会从头取。
某个邮箱抓取失败只会跳过该邮箱，其他照常；DeepSeek 调用失败则整次不写入、不推进进度，下次自动重试。

## 每天自动运行

在 Electron 应用做好之前，先用 Windows 任务计划程序，每天早上 7:30 跑一次：

```powershell
schtasks /create /tn "SecondBrain MailDigest" /sc daily /st 07:30 /tr "cmd /c cd /d C:\path\to\second-brain\packages\mail-digest && npm run digest >> digest.log 2>&1"
```

## 调整

- `ignore.senders`：发件人匹配规则（支持 `*` 通配），命中的邮件不发给 API，直接归入「已忽略」
- `ignore.subjects`：主题正则（不区分大小写）
- `maxBodyChars`：每封邮件发给模型的正文上限，去掉引用的历史回复后再截断
- `deepseek.model`：日常用 flash 即可；模型名以 DeepSeek API 文档为准
- 分类标准和摘要要求在 `src/analyze.ts` 的 `systemPrompt` 里，跑几天后按实际效果改

## UWA 授权失败时

按顺序尝试：

1. 在 Outlook 网页版设置一条规则，把收件箱邮件自动转发到 Gmail，由 Gmail 账户统一分析。部分学校会禁止转发到外部邮箱，设置后发一封测试邮件确认。
2. 如果电脑上装的是经典版 Outlook 桌面客户端（不是新版 Outlook），可以通过 Windows COM 接口读取本地邮件，这个方案留到 Electron 阶段再实现。
