# 后端架构复核

| 当前设计 | 建议与触发点 |
| --- | --- |
| D1 每局存一条战绩 JSON，`match_id` 唯一 | 暂时保留。导入可靠，比赛详情也可以直接重建。给摘要定义明确字段和可选字段，用同一份验证规则处理新比赛和历史比赛。 |
| 网页每次读整批比赛并计算总榜 | 先把供网页和 Discord 共用的玩家英雄统计放在 Worker。数据增长后分页读取比赛。等 D1 查询的延迟和读取量值得优化时，再增建由战绩可重算的 `match_players` 和索引。 |
| 导入器负责文件、解析、SQLite 和上传 | 保持 Windows 与 Worker 分离。接口新增字段时同时考虑导入器待重试记录、D1 旧记录及先后升级。对已有比赛回填 BP 应只补 BP 字段，保留已验证的赛果。 |
| D1 摘要含玩家昵称和稳定 ID | 保留当前派生 ID 用于内战归并。另建由玩家自愿绑定的公开账号映射后，才由服务器查询外部公开战绩。 |

## 录像 BP 实测

对 16 份已确认的私房录像读取文件尾的 `picks_bans`。队长模式每场 14 禁 10 选，另一种选人模式每场 6 禁 10 选。全部 16 局的十个选人都和赛后英雄及阵营一致。另用两局跑了完整事件解析，禁选数量一致，其中部分阵营标签与录像文件尾不同。功能分支采用录像文件尾的顺序和阵营，旧记录没有 BP 时仍可查看原战绩。历史补录应在部署前单独验证。

## 公开 API 的用途

OpenDota 的 `/players/{account_id}/heroes` 可按公开账号取英雄使用和胜场统计。私房英雄胜率可以直接从本项目已入库的英雄和胜方计算。若后续接 OpenDota，适合在同一个玩家页增加「公开比赛」数据，并独立标出来源和统计范围。当前内战玩家 ID 无法直接作为 OpenDota 的 `account_id` 使用。 [OpenDota API 源码](https://github.com/odota/core/blob/master/svc/api/spec.ts)

## Discord 和 Docker

赛后通知可以用指定频道的 incoming webhook。Worker 在新比赛入库后记录待发送通知，通知完成后保存回执。这样可以按比赛 ID 管理重试，并让历史回填保持安静。Webhook URL 保存在 Cloudflare Secret。 [Discord Webhook](https://docs.discord.com/developers/resources/webhook)

如果朋友想在群里用 `/stats` 查询，Discord 应用可以把交互发送到现有 Worker 的 HTTPS 接口。该接口验证 Discord 签名后，复用网站的统计查询。Docker 把程序和依赖封装到容器里，适用于朋友已有容器主机、希望常驻 Gateway bot 的部署方式。Cloudflare Workers 可以直接托管 HTTP 交互。 [Discord Workers 教程](https://docs.discord.com/developers/tutorials/hosting-on-cloudflare-workers) · [Docker 概览](https://docs.docker.com/get-started/docker-overview/)
