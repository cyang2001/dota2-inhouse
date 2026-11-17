# 在 Discord 查看内战战绩

现有 Cloudflare Worker 已能读取 D1 中的私房战绩。Discord 接入可以直接调用 `server/matches.js`，沿用网页对私人房间、十人阵容和胜率的定义。

| 目标 | 所需组件 | 预期效果 |
| --- | --- | --- |
| 自动发赛后战报 | Discord 频道的 Incoming Webhook，Cloudflare 密钥，D1 通知记录 | 新比赛入库后，在指定频道发比分和详情链接。 |
| 在 Discord 主动查询 | Discord Application，指向 Worker 的 HTTPS 交互地址，注册服务器命令 | `/last` 看最近一局。后续 `/stats` 可以选择一位玩家查英雄战绩。 |
| 接收成员、消息等实时事件 | 持久运行的 Discord Gateway 客户端，可部署到 Docker 主机 | Bot 可以订阅需要的实时事件。容器需要有主机运行并负责重启。 |

## 第一次接入

1. 在 Discord 选一个测试频道。打开「频道设置 → 整合 → Webhooks」。有管理 Webhook 权限的成员可以创建一个只指向该频道的 webhook。
2. 将 webhook 地址保存为 Cloudflare Secret `DISCORD_WEBHOOK_URL`。收到一场新比赛时，在 D1 里按比赛 ID 保存通知状态。写入战绩和待发送状态放在同一次数据库提交里。发送成功后记录 Discord 返回的消息 ID，遇到限流按返回的时间重试。
3. 用一条测试战报确认频道和链接。之后用新比赛验证自动发送，历史 BP 回填不产生新战报。 [Webhook API](https://docs.discord.com/developers/resources/webhook)

如果要做 `/last`，在 Discord Developer Portal 创建应用并安装到目标服务器，把 Interactions Endpoint URL 指向 Worker 的 `/discord/interactions`。Worker 先验证 Discord 的 Ed25519 签名、响应 PING，然后用现有 D1 查询拿最近一局。命令要在 3 秒内先响应，查询较慢时可以先发送延迟响应。只允许项目指定的 Discord 服务器访问这个入口，玩家查询可以用仅调用者可见的回复。 [Discord 的 Workers 教程](https://docs.discord.com/developers/tutorials/hosting-on-cloudflare-workers) · [交互响应文档](https://docs.discord.com/developers/interactions/receiving-and-responding)

Webhook 和上述 HTTP 交互都能用当前 Worker。Docker 可以在需要长连接的 Gateway bot 时再评估，届时容器里运行 bot 客户端，比赛记录仍由现有 D1 保存。 [Docker 概览](https://docs.docker.com/get-started/docker-overview/)
