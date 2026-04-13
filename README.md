# CBDB 本地分析与可视化项目

## 项目简介

本项目基于本地 SQLite 数据库 `data/latest.db`，面向 CBDB（中国历代人物传记数据库）数据开展结构分析、人物专题分析、地点地图展示、人物时空 GIS 展示等工作。

当前项目采用“Node.js 读取 SQLite，本地生成静态 HTML / JSON，浏览器直接打开成果”的方式运行，不依赖后端服务。

## 数据源说明

中国历代人物传记数据库（China Biographical Database Project，简称 CBDB）是由哈佛大学费正清中国研究中心、台湾“中研院”历史语言研究所与北京大学中国古代史研究中心联合主持的国际数字人文前沿项目，核心目标是系统性收录中国历史上重要人物的传记资料，构建可量化、可分析的关系型数据库，免费供学术研究使用。截至 2025 年 5 月，本数据库共收录约 649,533 人的传记资料，这些人物主要出自七世纪至十九世纪，本数据库现正致力于增录更多明清的人物传记资料。

本项目中的 `data/latest.db` 即为本地分析所使用的 SQLite 数据库文件。

## 当前目录结构

```text
CBDB/
├─ data/
│  └─ latest.db
├─ scripts/
│  ├─ analyze-db.js
│  ├─ generate-addr-map.js
│  ├─ generate-person-report.js
│  └─ generate-person-gis-timeline.js
├─ templates/
│  └─ report-template.html
├─ outputs/
│  ├─ db/
│  │  ├─ latest-db-analysis.json
│  │  └─ latest-db-report.html
│  ├─ maps/
│  │  └─ addr-codes-map.html
│  └─ person/
│     └─ 3767/
│        ├─ person-3767-analysis.json
│        ├─ person-3767-report.html
│        ├─ person-3767-gis-timeline.json
│        ├─ person-3767-gis-timeline.html
│        └─ person-report-er.html
├─ .gitignore
└─ README.md
```

## 各文件 / 各目录作用

### 1. 数据目录

- `data/latest.db`
  - 原始 SQLite 数据库文件
  - 是所有分析、报告、地图页面的基础数据源

### 2. 脚本目录

- `scripts/analyze-db.js`
  - 数据库结构分析脚本
  - 扫描表、字段、记录量、潜在关联关系
  - 输出数据库总览 JSON 和 HTML 报告

- `scripts/generate-addr-map.js`
  - 地点地图生成脚本
  - 基于 `ADDR_CODES` 中的经纬度数据生成地点分布地图
  - 使用 `ADDR_CODES.c_addr_id = BIOG_MAIN.c_index_addr_id` 进行人物与地点关联
  - 支持行政类型着色、点位聚合、姓氏过滤、人物弹窗、姓氏统计区域分布

- `scripts/generate-person-report.js`
  - 人物专题分析脚本
  - 围绕指定 `c_personid` 汇总人物主表、别名、亲属、关系、任官、地点、文本、来源等信息
  - 输出人物专题 JSON 和 HTML 报告

- `scripts/generate-person-gis-timeline.js`
  - 人物时空 GIS 生成脚本
  - 围绕指定 `c_personid` 提取所有“有明确时间且有坐标”的地点事件
  - 生成时间轴 + 地图联动的可视化页面
  - 当前版本支持路径高亮、年份过渡、当前停留地点强调

### 3. 模板目录

- `templates/report-template.html`
  - 数据库结构分析报告的 HTML 模板

### 4. 输出目录

- `outputs/db/latest-db-analysis.json`
  - 数据库结构分析的结构化结果

- `outputs/db/latest-db-report.html`
  - 数据库结构总览可视化报告

- `outputs/maps/addr-codes-map.html`
  - `ADDR_CODES` 地点地图页面
  - 包含姓氏过滤、命中人物展示、姓氏统计卡片和 Top 5 区域分布

- `outputs/person/3767/person-3767-analysis.json`
  - `c_personid = 3767` 的人物专题结构化分析结果

- `outputs/person/3767/person-3767-report.html`
  - `c_personid = 3767` 的人物专题报告页面

- `outputs/person/3767/person-3767-gis-timeline.json`
  - `c_personid = 3767` 的人物时空 GIS 结构化数据

- `outputs/person/3767/person-3767-gis-timeline.html`
  - `c_personid = 3767` 的人物时空 GIS 页面

- `outputs/person/3767/person-report-er.html`
  - 人物专题的 E-R 关系展示页面

## 已实现的主要功能

### 数据库结构分析

- 自动扫描所有表和视图
- 提炼每张表的概要说明
- 推断表之间的可能关系
- 生成数据库总览可视化报告

### 地点地图

- 基于 `ADDR_CODES` 中的 `x_coord`、`y_coord` 绘制地图
- 支持点位聚合、缩放展开、颜色分类
- 可展示与人物索引地的关联信息
- 支持按人物姓氏过滤地图点位
- 支持在弹窗中仅展示命中姓氏的人物信息
- 为每个地点的每个姓氏保留至少 1 个代表人物样本，避免“命中人数存在但列表为空”
- 支持显示姓氏统计卡片，包括总数量、包含位置信息的总数，以及 Top 5 区域分布

### 人物专题报告

- 围绕指定人物抽取主表信息
- 汇总人物别名、亲属、入仕、状态、任官、地点、关系、文本、来源等数据
- 对英文 / 缩写字段给出中文理解说明

### 人物时空 GIS

- 提取人物所有位置相关记录
- 只显示“有明确时间且有坐标”的事件
- 支持年份切换、播放、累计模式、全部模式
- 支持地图与时间轴联动
- 支持生平路径线展示
- 支持当前停留地点高亮
- 支持路径逐段高亮，增强迁徙演化过程感

## 地图页的数据来源与关联口径

### 使用到的主要表

- `BIOG_MAIN`
  - 地图中的人物信息、姓氏过滤、人数统计主要来自这张表
  - 关键字段是 `c_index_addr_id`

- `ADDR_CODES`
  - 地图点位、坐标、地点名称、行政类型主要来自这张表
  - 关键字段是 `c_addr_id`、`x_coord`、`y_coord`

- `DYNASTIES`
  - 用于补充人物朝代中文名
  - 通过 `BIOG_MAIN.c_dy = DYNASTIES.c_dy` 关联

### 地图页当前采用的人地关联方式

- `ADDR_CODES.c_addr_id = BIOG_MAIN.c_index_addr_id`

这表示当前地图页展示的是人物“索引地 / 基本关联地”层面的分布。

### 当前不包括的范围

- 当前地图页不是基于 `BIOG_ADDR_DATA` 的“全部人物-地点关系全集”
- 因此它更适合做“人物主索引地点分布”和“按姓氏筛选的地点分布”分析
- 如果需要完整的人地关系网络或迁徙轨迹，应使用更完整的地点关系表另行建模

## 如何运行

请在项目根目录执行以下命令。

### 1. 生成数据库结构分析报告

```powershell
node .\scripts\analyze-db.js
```

生成结果：

- `outputs/db/latest-db-analysis.json`
- `outputs/db/latest-db-report.html`

### 2. 生成地点地图

```powershell
node .\scripts\generate-addr-map.js
```

生成结果：

- `outputs/maps/addr-codes-map.html`

### 3. 生成人物专题报告

```powershell
node .\scripts\generate-person-report.js 3767
```

生成结果：

- `outputs/person/3767/person-3767-analysis.json`
- `outputs/person/3767/person-3767-report.html`

### 4. 生成人物时空 GIS 页面

```powershell
node .\scripts\generate-person-gis-timeline.js 3767
```

生成结果：

- `outputs/person/3767/person-3767-gis-timeline.json`
- `outputs/person/3767/person-3767-gis-timeline.html`

## 如何打开成果

直接在浏览器中打开以下文件即可：

- 数据库总览报告
  - `outputs/db/latest-db-report.html`

- 地点地图
  - `outputs/maps/addr-codes-map.html`

- 人物专题报告
  - `outputs/person/3767/person-3767-report.html`

- 人物时空 GIS
  - `outputs/person/3767/person-3767-gis-timeline.html`

- 人物 E-R 图
  - `outputs/person/3767/person-report-er.html`

## 数据加载方式

浏览器不会直接查询 SQLite。

当前项目采用如下流程：

1. Node.js 脚本读取 `data/latest.db`
2. 在本地完成清洗、关联、统计与中文化处理
3. 将结果写入静态 HTML / JSON
4. 浏览器直接打开生成后的页面进行展示

这种方式的优点：

- 交付简单
- 无需额外后端服务
- 更适合离线展示和内部汇报
- 便于直接推送到 GitHub 保存脚本和成果页

## 更新日志

### 2026-04-13

- 更新 `outputs/maps/addr-codes-map.html` 的姓氏过滤功能，支持按姓氏实时筛选地图点位
- 修正姓氏过滤后的弹窗展示逻辑，弹窗只显示命中该姓氏的人物，不再混入其他姓氏人物
- 修正“命中人数存在但人物列表为空”的问题，改为“前 30 条通用样本 + 每个姓氏至少 1 条代表样本”的保底策略
- 新增姓氏统计卡片，展示输入姓氏后的总数量、包含位置信息的总数，以及当前地图结果中的 Top 5 区域分布
- 在文档中明确地图页的数据来源与关联口径：人物来自 `BIOG_MAIN`，位置来自 `ADDR_CODES`，朝代补充来自 `DYNASTIES`

### 2026-04-10

- 完成项目目录重构，将数据库、脚本、模板和输出结果分离整理
- 更新各脚本的输入输出路径，统一改为基于项目根目录的相对路径生成结果
- 补充 `.gitignore`，忽略本地数据库文件和输出目录
- 更新 README，补充目录说明、运行方式、数据源说明和文件作用说明
- 完成地点地图、人物专题报告、人物 E-R 图、人物时空 GIS 页面的一体化整理
