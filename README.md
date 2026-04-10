# CBDB 本地分析与可视化项目

## 项目简介

本项目基于本地 SQLite 数据库 `latest.db`，面向 CBDB（中国历代人物传记数据库）数据进行结构分析、人物专题分析、地点地图展示、人物时空 GIS 展示等工作。

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
  - 包含与 `BIOG_MAIN.c_index_addr_id` 的关联展示

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
- 提炼每张表的摘要说明
- 推断表之间的可能关系
- 生成数据库总览可视化报告

### 地点地图

- 基于 `ADDR_CODES` 中的 `x_coord`、`y_coord` 绘制地图
- 支持点位聚合、缩放展开、颜色分类
- 可展示与人物索引地的关联信息

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
