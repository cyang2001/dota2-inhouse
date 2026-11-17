# 在 Discord 查看内战战绩

Discord 和网页都通过 `server/src/repositories/matches.js` 读取 D1 中的已验证私人 5v5，并复用 `server/src/services/analytics.js` 计算胜率。

## 安装胜率命令

1. 由邮箱已验证、能向目标服务器添加应用的成员打开 [Discord Developer Portal](https://discord.com/developers/applications)，创建应用。在 General Information 记录 Application ID 和 Public Key。
2. 在应用的 Installation 中启用 Guild Install，选择 `applications.commands`，将应用安装到测试频道所在的服务器。测试使用已有的 `#测试ing` 私有频道。
3. 将 `DISCORD_PUBLIC_KEY`、`DISCORD_GUILD_ID`、`DISCORD_CHANNEL_ID` 配置到线上 Worker。后两项来自频道链接 `discord.com/channels/服务器ID/频道ID`。将 Interactions Endpoint URL 保存为战绩网站地址加 `/discord/interactions`。保存时 Discord 会发送签名 PING，Worker 应返回 PONG。
4. 设置本机环境变量 `DISCORD_APPLICATION_ID`、`DISCORD_GUILD_ID` 和 `DISCORD_BOT_TOKEN`，在项目根目录运行 `node server/scripts/register-discord-winrate.js`。脚本只注册本服务器的 `/winrate`。Bot Token 通过本机环境读取，用于这一步的 Discord API 请求。
5. 在测试频道执行 `/winrate` 看全员。需要翻页时选 `page`。填 `player` 后从建议中选一位，可以看个人胜率。结果只有发命令的人能看到。 [交互和签名验证](https://docs.discord.com/developers/interactions/overview) · [注册服务器命令](https://docs.discord.com/developers/interactions/application-commands#create-guild-application-command)

| 目标 | 所需组件 | 预期效果 |
| --- | --- | --- |
| 自动发赛后战报 | Discord 频道的 Incoming Webhook，Cloudflare 密钥，D1 通知记录 | 新比赛入库后，在指定频道发比分和详情链接。 |
| 在 Discord 主动查询 | Discord Application，指向 Worker 的 HTTPS 交互地址，注册服务器命令 | `/winrate` 查询全员或指定玩家。 |
| 接收成员、消息等实时事件 | 持久运行的 Discord Gateway 客户端，可部署到 Docker 主机 | Bot 可以订阅需要的实时事件。容器需要有主机运行并负责重启。 |

## 后续可选功能：自动战报

1. 在 Discord 选一个测试频道。打开「频道设置 → 整合 → Webhooks」。有管理 Webhook 权限的成员可以创建一个只指向该频道的 webhook。
2. 将 webhook 地址保存为 Cloudflare Secret `DISCORD_WEBHOOK_URL`。收到一场新比赛时，在 D1 里按比赛 ID 保存通知状态。写入战绩和待发送状态放在同一次数据库提交里。发送成功后记录 Discord 返回的消息 ID，遇到限流按返回的时间重试。
3. 用一条测试战报确认频道和链接。之后用新比赛验证自动发送，历史 BP 回填不产生新战报。 [Webhook API](https://docs.discord.com/developers/resources/webhook)

`/winrate` 由 Cloudflare Worker 接收 HTTPS 请求，游戏电脑关机后也能查询。只有订阅 Discord 实时事件这类需要长连接的功能才需要额外运行 Gateway 客户端，可以届时再评估 Docker。 [Discord 的 Workers 教程](https://docs.discord.com/developers/tutorials/hosting-on-cloudflare-workers)
