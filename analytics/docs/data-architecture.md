# 录像分析工程

## 目录和依赖

| 目录 | 职责 |
| --- | --- |
| `src/dota_inhouse/parser` | 读取录像、验证私人 5v5、派生稳定玩家 ID，输出解析结果和线上摘要。只有这里和分析适配层依赖 gem 的录像对象。 |
| `src/dota_inhouse/analysis` | 把解析对象变成玩家经济、战斗、成长、视野、位置与全局数据。 |
| `src/dota_inhouse/dataset` | 按版本和比赛 ID 保存 JSON，提供玩家、全局查询以及 BP 训练样本导出。数据集代码读取标准记录。 |
| `src/dota_inhouse/config.py` | 分析版本和全场团战规则。 |
| `tests`、`docs` | 分别放测试和数据契约。 |
| `windows`、`server` | Windows 自动导入及赛后摘要上传，Cloudflare Worker 提供现有网站和 Discord 的查询。 |

目录沿用 CSP 项目按解析、分析和数据集拆分的习惯。训练模块可以在这个数据边界上添加。数据的依赖方向为 `录像 → 解析 → 版本化档案 → 玩家与全局查询、训练样本`。

## 数据契约

每场保存为 `<archive>/v1/<match_id>.json`。顶层存 `schema_version`、`parser_version`、`match_id`、`global_data` 和以稳定 ID 为键的 `players`。

| 数据 | 字段和口径 |
| --- | --- |
| 全局 | 比赛模式、房间类型、日期、时长、胜方、比分、BP、天辉经济和经验差曲线、插眼事件及团战窗口。 |
| 玩家基本数据 | 稳定 ID、录像内昵称、阵营、英雄、K/D/A。玩家查询跨局汇总英雄使用和胜率。 |
| 经济 | GPM/XPM 读录像结算字段。每分钟序列保留游戏秒数、净资产、手上金钱、累计金钱和经验、正补反补。缺失样本返回 `null`。 |
| 成长 | 购买条目的游戏秒数和录像 tick，结算装备、技能习得顺序、每项技能使用次数、符文拾取。 |
| 战斗 | 对英雄伤害、建筑伤害和对友方英雄治疗、按目标划分的日志汇总、实际英雄击杀事件、击杀参与率和团战参与率。 |
| 视野、位置 | 插眼者按玩家槽位及阵营核对。排眼使用录像记载的击杀者，只有英雄身份能唯一对应时才关联到玩家。位置轨迹保留 tick、游戏秒数与世界 X/Y。 |

击杀参与率为个人的击杀加助攻除以本队总击杀。击杀事件按录像战斗日志记录，数量可能与记分板不同。团战定义为 gem 检出的交战窗口中，至少三次英雄死亡且至少六人有直接战斗贡献。直接贡献包括死亡、对英雄造成或受到伤害，以及治疗队友。团战参与率为参与窗口数除以全场符合定义的窗口数。分母为零时返回 `null`。 [gem 团战字段](https://whanyu1212.github.io/gem-dota/guides/06_fights)

原始录像和完整报告保留在本机。报告会保留昵称和派生 ID，Steam ID 和身份密钥不进入报告。档案按比赛 ID 读写，同版本可重算。同场比赛重复导入只保留一份。未完成的比赛、天梯及人数不符的房间不进入分析档案。

## Windows 使用

在仓库根目录运行 `.\windows\setup.ps1`。如果电脑还没有 Python，可先在 PowerShell 运行 `winget install --id Python.Python.3.12 --exact --source winget --scope user`。

```powershell
$analysis = '.\.venv\Scripts\dota-inhouse.exe'
& $analysis ingest --identity-key '.data\player-id.key' --replays 'D:\SteamLibrary\steamapps\common\dota 2 beta\game\dota\replays' --workers 3
& $analysis overview
& $analysis player '<稳定玩家 ID>'
& $analysis export-draft | Set-Content '.data\draft-examples.jsonl' -Encoding utf8
& .\.venv\Scripts\python.exe -m unittest discover -s analytics/tests
```

已有站点应传原来那份 32 字节身份密钥。可用 `--archive` 指定数据目录，放在子命令前面。导入器加 `--analytics-dir` 后会给新录像同时写全量报告。已有比赛用 `ingest` 批量回填。

## BP 数据集

每条 JSONL 对应一次选禁决策。输入包含当前轮到的阵营、动作、模式和本步之前已发生的 BP。当前英雄与胜方是单独的标签，赛后 GPM、伤害和位置不会进入此输入。训练与评估应以比赛为组，按时间划分。加入历史玩家特征时，只使用该局开始前可获得的比赛。当前提供样本，不包含训练出来的预测模型。
