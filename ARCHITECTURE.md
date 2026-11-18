# 后端架构复核

Windows 按文件路径、字节数和修改时间跳过已检查文件。完整报告按比赛 ID 和报告版本保存，SQLite 和 D1 以比赛 ID 为唯一键，空间事件按比赛 ID 和空间版本写入。复制或重命名录像不会增加比赛场次。导入器只在缺少该场的当前版本报告时为历史记录重新解析。

Windows 的快照任务使用同一套统计函数预计算排行榜、全局英雄统计、全局眼位汇总和玩家页。原始输入是 D1 已验证的轻量比赛摘要和最新空间版本，包含历史云端回填。Worker 通常只读取快照中的对应文档。新比赛或回填会使快照过期，Worker 此时继续用实时聚合，直到本机发布与当前数据版本一致的快照。单场眼位按比赛 ID 查询。

Python 录像分析按 `parser → analysis → dataset` 独立组织。版本化比赛报告含全局块和按稳定 ID 索引的玩家对象，由本机查询和 BP 样本导出共用。Worker 的现有网页摘要继续由同一次解析产生。详见 [录像分析工程](analytics/docs/data-architecture.md)。

| 当前设计 | 建议与触发点 |
| --- | --- |
| D1 每局存一条战绩 JSON，`match_id` 唯一 | 暂时保留。导入可靠，比赛详情也可以直接重建。给摘要定义明确字段和可选字段，用同一份验证规则处理新比赛和历史比赛。 |
| 首页仍下发全量比赛摘要，打开玩家主页也需要在 D1 按阵容检索历史 | 下一步先让首页对比赛列表分页，比赛详情按 ID 读取。规模需要时，再建可从战绩重算的 `match_players` 投影，给个人战绩查询加索引。 |
| 文件监听、解析、待上传队列和 HTTP 客户端都在 Windows | 监听和队列在 `watch_replays.py`，解析和分析分别在 Python 包的 `parser` 和 `analysis`，HTTP 上传及回执在 `upload_replays.py`。有 D1 变更时先迁移再部署 Worker 与导入器。 |
| D1 摘要含玩家昵称和稳定 ID | 保留当前派生 ID 用于内战归并。另建由玩家自愿绑定的公开账号映射后，才由服务器查询外部公开战绩。 |

## 玩家主页和空间数据

Windows 用录像事件的玩家槽位和阵营核对插眼者，再使用既有稳定 ID 归属。活动轨迹使用录像里的英雄位置，用游戏时钟分桶，每 5 秒取最多一次。两个数据集共用 36 × 36 网格。未匹配归属或坐标的已识别眼位计入汇总里的缺失数字。活动覆盖按有可用位置样本的比赛计，地图亮度表示本图内的相对强度。 [gem 眼位与位置说明](https://whanyu1212.github.io/gem-dota/cookbook/wards)

D1 的 `match_spatial` 按比赛 ID 和数据版本存放网格，阵容必须与已验证比赛的玩家 ID、阵营和英雄一致。战绩和空间记录同批提交。历史补传只向新表写入，同版本可重试且不累计两次。新网格版本可由原始录像重算。常规比赛和 Discord 查询只读战绩表。

HTTP 层负责鉴权和编排，数据访问层负责 D1 查询，统计层接收普通 JavaScript 对象。空间数据 v1 包含格子次数，v2 新增插眼事件，坐标按 gem 7.41 投影窗口量化到 0–16383。查询汇总取每场受支持的最新版本，v1 与 v2 不会重复计入。眼位地图只读 v2 事件，因此只能按目前保留的放置时间、种类、阵营和玩家筛选。跨版本地形和眼位存续时间需要另行从录像提取。

## 录像 BP 实测

对 16 份已确认的私房录像读取文件尾的 `picks_bans`。队长模式每场 14 禁 10 选，另一种选人模式每场 6 禁 10 选。全部 16 局的十个选人都和赛后英雄及阵营一致。另用两局跑了完整事件解析，禁选数量一致，其中部分阵营标签与录像文件尾不同。功能分支采用录像文件尾的顺序和阵营，旧记录没有 BP 时仍可查看原战绩。历史补录应在部署前单独验证。

## 公开 API 的用途

用一个公开职业账号实测了 OpenDota 的 `/players/{account_id}/heroes`，接口返回 `hero_id`、`games` 和 `win`。STRATZ 提供 GraphQL，可作为公开比赛数据的候选来源，当前未用 STRATZ 凭据发请求。私房英雄胜率直接从本项目已入库的英雄和胜方计算。若后续接入外部数据，可以在同一个玩家页显示公开比赛的统计范围和来源。玩家先自愿提供公开 `account_id`，再进行查询。 [OpenDota API 源码](https://github.com/odota/core/blob/master/svc/api/spec.ts) · [STRATZ](https://stratz.com/api)

## Discord 和 Docker

赛后通知可以用指定频道的 incoming webhook。Worker 在新比赛入库后记录待发送通知，通知完成后保存回执。这样可以按比赛 ID 管理重试，并让历史回填保持安静。Webhook URL 保存在 Cloudflare Secret。 [Discord Webhook](https://docs.discord.com/developers/resources/webhook)

如果朋友想在群里用 `/stats` 查询，Discord 应用可以把交互发送到现有 Worker 的 HTTPS 接口。该接口验证 Discord 签名后，复用网站的统计查询。Docker 把程序和依赖封装到容器里，适用于朋友已有容器主机、希望常驻 Gateway bot 的部署方式。Cloudflare Workers 可以直接托管 HTTP 交互。 [Discord Workers 教程](https://docs.discord.com/developers/tutorials/hosting-on-cloudflare-workers) · [Docker 概览](https://docs.docker.com/get-started/docker-overview/)
