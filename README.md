# Dota 2 私房战绩

一位参赛者在 Dota 2 里下载赛后录像。Windows 导入器等待 `.dem` 写完，提取战绩摘要并上传。Cloudflare Worker 校验比赛，D1 保存记录，网页显示比赛详情和个人胜率。电脑关机后，其他人仍能查看已经上传的比赛。

## 代码入口

| 文件 | 作用 |
| --- | --- |
| [`server/worker.js`](server/worker.js) | HTTP 路由和网页查看鉴权。 |
| [`server/src/http/site.js`](server/src/http/site.js) | HTTP 请求处理、上传鉴权和页面数据。 |
| [`server/src/domain/`](server/src/domain/) | 战绩、阵容、BP 和热图上传格式校验。 |
| [`server/src/repositories/matches.js`](server/src/repositories/matches.js) | D1 写入、已验证比赛查询和玩家英雄统计。 |
| [`server/src/services/analytics.js`](server/src/services/analytics.js) | 网页和 Discord 使用的胜率统计，以及全局英雄选禁总览。 |
| [`server/src/services/spatial.js`](server/src/services/spatial.js) | 计算全站和玩家热图，统计录像覆盖率。 |
| [`server/schema.sql`](server/schema.sql) | 新装数据库结构，含战绩表和独立的热图表。 |
| [`server/public/app/`](server/public/app/) | 网页路由、总览、玩家主页和地图渲染。 |
| [`windows/watch_replays.py`](windows/watch_replays.py) | 监听文件、校验录像来源、维护 SQLite 队列。 |
| [`windows/upload_replays.py`](windows/upload_replays.py) | 发送本地待上传记录并记录回执。 |
| [`analytics/src/dota_inhouse/parser/`](analytics/src/dota_inhouse/parser/) | 从 `.dem` 验证房间、解析完整比赛、生成既有网站摘要。 |
| [`analytics/src/dota_inhouse/analysis/`](analytics/src/dota_inhouse/analysis/) | 玩家与全局分析、经济和经验时间序列、战斗与空间数据。 |
| [`analytics/src/dota_inhouse/dataset/`](analytics/src/dota_inhouse/dataset/) | 版本化档案、玩家和全局查询、BP 训练样本导出。 |

## 数据从哪里来

Windows 从录像读取 `lobbyType`、比赛 ID 和真人阵容，用本机密钥从 Steam ID 派生稳定的玩家 ID。换昵称以后，战绩仍能归到同一个人。保留同一份玩家密钥才能在更换导入电脑后延续统计。

后端 `POST /api/matches` 用 Bearer 密钥鉴权。比赛必须是 `PRACTICE` 私人房间（`lobbyType=1`），两队各五名真人。上传的录像字段和战绩摘要必须使用相同比赛 ID。接口还检查胜方、十个唯一玩家 ID 和完整 K/D/A。D1 以比赛 ID 去重。原始 `.dem`、Steam ID 和玩家身份密钥都保存在 Windows 本机。朋友通过 HTTPS 和共享查看密码读取网页。

点击胜率榜中的玩家名，进入玩家主页。接口 `GET /api/players/{playerId}` 返回英雄使用情况、活动热图和眼位热图。原有的 `GET /api/players/{playerId}/heroes` 依然可用。`winRate` 是 `0` 到 `1` 的比例。

「数据分析」由 `GET /api/analytics` 提供。选用率以所有已验证比赛为分母。禁用率以带有效 BP 的比赛为分母。同一个英雄每局最多记一次选用或禁用，英雄胜率以实际选用人次计算。使用前三按稳定玩家 ID 汇总，并显示最新昵称。进入 `server/` 后运行 `node --test` 可以检查统计口径。

`GET /api/analytics/wards?patch=7.41` 汇总指定大版本的内战眼位。每张热图显示样本覆盖；旧战绩可单独补传空间数据。活动图按游戏时钟每 5 秒最多取一个英雄位置。假眼和真眼按放置次数统计，汇总到北向上的 36 × 36 坐标网格。

顶部「比赛版本」支持全部版本、7.41 和 7.42，作用于首页、比赛列表、玩家和英雄统计。各统计接口可用 `?patch=7.41` 或 `?patch=7.42` 选择样本；没有这个参数时统计全部比赛。无法确认版本的比赛可在全部版本查看。新版录像从文件头中的服务器构建识别；现有 7.41 历史记录可按录像内日期归类。

眼位地图从 `GET /api/analytics/ward-events?patch=7.41` 读取每次放置的坐标、时间、阵营和玩家 ID。全局和个人眼位地图每次只读一个大版本，默认 7.41，单场地图随比赛版本。活动热图在个人统计选择全部版本时显示 7.41，切到具体版本后显示该版本。

部署前，将两个固定底图放到 `server/public/maps/`，图像文件随 Worker 的受保护静态资源部署。

| 文件 | 来源 | SHA-256 |
| --- | --- | --- |
| `dota-741.webp` | gem 7.41 底图快照，对应 gem 的 7.41 校准 | `92c6f365579b769f72519c141e59286f352257be16a2149a8badc912681569e0` |
| `dota-742.png` | Steam Dota 2 构建 6979 的 `game/dota/pak01_dir.vpk`，使用 Source 2 Viewer CLI 导出 `materials/overviews/dota_tga_d8178876.vtex_c` | `45bc89cd7d9af2026e1de7e9b1835a0cb4e374ead36b4503b884678011dd5228` |

7.42 坐标使用该构建的 `resource/overviews/dota.txt`，以两边泉水的地图位置校验。对局详情按 7.41／7.42 的技能 ID 表显示中文加点、技能使用和装备。名称来自 Valve 简体中文游戏资源与官方数据接口，历史 ID 来自 7.41f 的游戏文件快照。天赋显示效果名称，缺少中文名称时保留录像里的代码。生成表的入口是 `server/scripts/build-match-names.py`。[7.41 底图说明](https://github.com/whanyu1212/gem-dota/blob/main/assets/maps/README.md) · [Valve 7.42 补丁](https://www.dota2.com/patches/7.42)

## 本机试跑

后端需要 Node.js 和 npm。在 `server/` 中创建 `.dev.vars`，填入本机测试值。

```dotenv
UPLOAD_TOKEN=local-upload-token
VIEW_PASSWORD=local-view-password
```

```powershell
npx --yes wrangler@4.163.0 d1 execute dota-inhouse --local --file=schema.sql
npx --yes wrangler@4.163.0 dev --ip 127.0.0.1 --port 8787
```

保持 Worker 运行，在另一个 PowerShell 窗口从 `server/` 上传合成比赛。首次上传返回 `201`，再上传一次返回 `200` 和 `inserted: false`。

```powershell
curl.exe -i 'http://127.0.0.1:8787/api/matches' `
  -H 'Authorization: Bearer local-upload-token' `
  -H 'Content-Type: application/json' `
  --data-binary '@example-match.json'
```

打开 `http://127.0.0.1:8787/`，用 `dota` 和 `local-view-password` 登录，应看到一场 15–10 的示例比赛。

Windows 导入器用 Python 3.12 验证过。从仓库根目录运行下面的命令。将录像路径换成本机的 Dota 2 `replays` 文件夹。已有安装从原路径读取玩家身份密钥。

```powershell
.\windows\setup.ps1
$env:DOTA_UPLOAD_TOKEN = 'local-upload-token'
.\.venv\Scripts\python.exe -u windows\watch_replays.py `
  --replays 'D:\SteamLibrary\steamapps\common\dota 2 beta\game\dota\replays' `
  --database .data\matches.sqlite3 `
  --analytics-dir .data\analytics `
  --upload-url 'http://127.0.0.1:8787/api/matches'
```

## 云端及分支

部署时，在自己的 Cloudflare 账户创建 D1，把数据库 ID 填入单独保存的生产 Wrangler 配置。初始化生产表后，用 `wrangler deploy --secrets-file <本机密钥文件>` 同时部署代码和 `UPLOAD_TOKEN`、`VIEW_PASSWORD`。Windows 使用同一个上传密钥。 [D1 入门](https://developers.cloudflare.com/d1/get-started/) · [Workers 密钥](https://developers.cloudflare.com/workers/configuration/secrets/)

已有数据库部署热图前，先对目标 D1 执行 `migrations/0002_match_spatial.sql`。迁移可重复执行。新装使用 `schema.sql` 即可。

升级已有数据库时也执行 `migrations/0003_display_snapshot.sql`。Windows 导入器加 `--snapshot-script server/scripts/publish-display-snapshot.js` 后每分钟检查一次已验证数据的版本，由本机 Node 生成并发布网页统计快照。有需要时用 `--node` 指定 Node 路径。

比赛详情分析使用 `migrations/0004_match_analysis.sql`。Windows 导入器启用 `--publish-analysis` 后，从本机 `--analytics-dir` 的报告生成单场展示数据并上传。线上按比赛 ID 读取。走位最多每 10 秒保留一个采样点，基准使用同一已识别大版本、此前日期的同英雄内战数据。

Windows 导入器可加 `--account-map <本机私有 JSON>`，JSON 的键为大号 SteamID64 字符串，值为小号 SteamID64 字符串数组。使用原录像身份密钥，账号表留在本机。

从最新 `main` 开 `feature/<功能名>` 分支，在该分支验证并开 PR。D1 结构变化先用样例和现有数据副本验证迁移。提交前运行 `git status --short` 检查改动。公开仓库只保存源码、文档和合成示例。项目本地数据、录像、SQLite、密钥和生产配置由 `.gitignore` 排除。

架构复核、录像 BP 实测及 Discord 方案见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。
Windows 本地分析、字段口径与 BP 数据导出见 [`analytics/docs/data-architecture.md`](analytics/docs/data-architecture.md)。
Discord 的部署步骤见 [`DISCORD.md`](DISCORD.md)。
