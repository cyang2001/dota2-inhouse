# Dota 2 私房战绩

一位参赛者在 Dota 2 里下载赛后录像。Windows 导入器等待 `.dem` 写完，提取战绩摘要并上传。Cloudflare Worker 校验比赛，D1 保存记录，网页显示比赛详情和个人胜率。电脑关机后，其他人仍能查看已经上传的比赛。

## 代码入口

| 文件 | 作用 |
| --- | --- |
| [`server/worker.js`](server/worker.js) | 上传鉴权、私人房间校验、去重和网页读取。 |
| [`server/matches.js`](server/matches.js) | D1 写入、已验证比赛查询和玩家英雄统计。网页与后续 Discord 功能可以共用。 |
| [`server/schema.sql`](server/schema.sql) | D1 的 `matches` 表。比赛 ID 是主键。 |
| [`server/public/index.html`](server/public/index.html) | 托管页面模板。Worker 从 D1 加载数据，页面计算胜率榜。 |
| [`windows/watch_replays.py`](windows/watch_replays.py) | 监听文件、校验来源、保存本地队列、重试上传。 |
| [`windows/read_replays.py`](windows/read_replays.py) | 用 `gem-dota` 解析赛后战绩，生成统一摘要。 |

## 数据从哪里来

Windows 从录像读取 `lobbyType`、比赛 ID 和真人阵容，用本机密钥从 Steam ID 派生稳定的玩家 ID。换昵称以后，战绩仍能归到同一个人。保留同一份玩家密钥才能在更换导入电脑后延续统计。

后端 `POST /api/matches` 用 Bearer 密钥鉴权。比赛必须是 `PRACTICE` 私人房间（`lobbyType=1`），两队各五名真人。上传的录像字段和战绩摘要必须使用相同比赛 ID。接口还检查胜方、十个唯一玩家 ID 和完整 K/D/A。D1 以比赛 ID 去重。原始 `.dem`、Steam ID 和玩家身份密钥都保存在 Windows 本机。朋友通过 HTTPS 和共享查看密码读取网页。

点击胜率榜中的玩家名，可查看每个英雄的场次、胜、负和胜率。读取接口 `GET /api/players/{playerId}/heroes` 使用同一查看密码，依据玩家的稳定 ID 汇总已校验的私房记录。`winRate` 是 `0` 到 `1` 的比例。

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

Windows 导入器用 Python 3.12 验证过。从仓库根目录运行下面的命令。将录像路径换成本机的 Dota 2 `replays` 文件夹。

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r windows\requirements.txt
$env:DOTA_UPLOAD_TOKEN = 'local-upload-token'
.\.venv\Scripts\python.exe -u windows\watch_replays.py `
  --replays 'D:\SteamLibrary\steamapps\common\dota 2 beta\game\dota\replays' `
  --database .data\matches.sqlite3 `
  --upload-url 'http://127.0.0.1:8787/api/matches'
```

## 云端及分支

部署时，在自己的 Cloudflare 账户创建 D1，把数据库 ID 填入单独保存的生产 Wrangler 配置。初始化生产表后，用 `wrangler deploy --secrets-file <本机密钥文件>` 同时部署代码和 `UPLOAD_TOKEN`、`VIEW_PASSWORD`。Windows 使用同一个上传密钥。 [D1 入门](https://developers.cloudflare.com/d1/get-started/) · [Workers 密钥](https://developers.cloudflare.com/workers/configuration/secrets/)

从最新 `main` 开 `feature/<功能名>` 分支，在该分支验证并开 PR。D1 结构变化先用样例和现有数据副本验证迁移。提交前运行 `git status --short` 检查改动。公开仓库只保存源码、文档和合成示例。项目本地数据、录像、SQLite、密钥和生产配置由 `.gitignore` 排除。

架构复核、录像 BP 实测及 Discord 方案见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。
Discord 的部署步骤见 [`DISCORD.md`](DISCORD.md)。
