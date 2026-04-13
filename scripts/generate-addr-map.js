const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT_DIR, 'data', 'latest.db');
const HTML_PATH = path.join(ROOT_DIR, 'outputs', 'maps', 'addr-codes-map.html');

const db = new DatabaseSync(DB_PATH, { readonly: true });

const ADMIN_TYPE_CN = {
  '[unknown]': '未详',
  anfusi: '安抚司',
  banshidacheng: '办事大臣',
  bao: '堡',
  'bawan tong': '八万同',
  bingbeidao: '兵备道',
  bu: '部',
  buzhengsi: '布政司',
  chang: '场',
  cheng: '城',
  chengxiang: '城厢',
  county: '县',
  dao: '道',
  daoxuanweisi: '道宣慰司',
  'dependent kingdom': '属国',
  'dependent state': '附属州',
  difang: '地方',
  dong: '峒',
  du: '都',
  dudufu: '都督府',
  duhufu: '都护府',
  duzhihuishisi: '都指挥使司',
  fengguo: '封国',
  fengjun: '封郡',
  fenshoudao: '分守道',
  fenxian: '分县',
  fenxundao: '分巡道',
  fenzhou: '分州',
  fu: '府',
  guan: '关',
  haianhaishui: '海岸海税机构',
  'hanguo (khanate)': '汗国',
  huwei: '护卫',
  'independent state': '独立政区',
  'independent tribe': '独立部族',
  jian: '监',
  jianchadao: '监察道',
  jiangjun: '将军辖区',
  jianjundao: '监军道',
  jiedu: '节度',
  jiedushisi: '节度使司',
  jimizhou: '羁縻州',
  jinglue: '经略',
  jun: '郡',
  'jun (zhou)': '郡（州）',
  'jun commandery': '郡',
  'junmin anfusi': '军民安抚司',
  junminfu: '军民府',
  junminxuanweishisi: '军民宣慰使司',
  junminzhihuishisi: '军民指挥使司',
  junzhen: '军镇',
  kalun: '卡伦',
  lishiguan: '理事官',
  lu: '路',
  lushisi: '录事司',
  'manyi zhangguansi': '蛮夷长官司',
  mountain: '山',
  muchang: '牧场',
  pu: '铺',
  qi: '旗',
  qian: '钱',
  qianhusuo: '千户所',
  region: '区域',
  sheng: '省',
  shezhiju: '设治局',
  shi: '市',
  shizhen: '市镇',
  'shouyu qianhusuo': '守御千户所',
  si: '司',
  state: '州',
  suo: '所',
  suoling: '所领',
  tijusi: '提举司',
  ting: '厅',
  'tribal federation': '部族联盟',
  'tributary state': '朝贡属国',
  tufu: '土府',
  tunwei: '屯卫',
  tusi: '土司',
  tuxian: '土县',
  tuzhou: '土州',
  wangfu: '王府',
  wanhufu: '万户府',
  wei: '卫',
  'wei (capital)': '卫（京卫）',
  weisi: '卫司',
  weiyuan: '卫垣',
  xian: '县',
  xianji: '县级',
  xingsheng: '行省',
  xuanfusi: '宣抚司',
  xuanweishisi: '宣慰使司',
  xuanweisi: '宣慰司',
  xunfu: '巡抚',
  xunjian: '巡检',
  xunjianfu: '巡检府',
  yi: '驿',
  yuan: '院',
  zhai: '寨',
  zhangguansi: '长官司',
  zhaotaoshisi: '招讨使司',
  zhen: '镇',
  zhiliting: '直隶厅',
  zhilizhou: '直隶州',
  zhixiadifang: '直辖地方',
  zhou: '州',
  'zhou (jun)': '州（郡）',
  zong: '总',
  zongguanfu: '总管府',
  capital: '京师',
  cun: '村',
  market: '市场',
  mausoleum: '陵墓',
};

function safeJsonForHtml(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/<\/script/gi, '<\\/script');
}

function normalizeAdminType(value) {
  return String(value || '[Unknown]').trim().toLowerCase();
}

function adminTypeLabel(value) {
  return ADMIN_TYPE_CN[normalizeAdminType(value)] || String(value || '未详');
}

const COMPOUND_SURNAMES = [
  '欧阳','司马','上官','夏侯','诸葛','闻人','东方','赫连','皇甫','尉迟','公羊','澹台','公冶','宗政','濮阳','淳于',
  '单于','太叔','申屠','公孙','仲孙','轩辕','令狐','钟离','宇文','长孙','慕容','鲜于','闾丘','司徒','司空','亓官',
  '司寇','子车','颛孙','端木','巫马','公西','漆雕','乐正','壤驷','公良','拓跋','夹谷','宰父','谷梁','段干','百里',
  '东郭','南门','呼延','归海','羊舌','微生','梁丘','左丘','东门','西门','南宫','第五'
];

function extractSurname(nameChn) {
  const text = nameChn === null || nameChn === undefined ? '' : String(nameChn).trim();
  if (!text) return '';
  const normalized = text.replace(/[（(].*?[)）]/g, '').trim();
  if (!normalized) return '';
  const match = COMPOUND_SURNAMES.find((surname) => normalized.startsWith(surname));
  return match || normalized.slice(0, 1);
}

function buildDataset() {
  const rows = db.prepare(`
    SELECT
      c_addr_id,
      c_name,
      c_name_chn,
      c_firstyear,
      c_lastyear,
      c_admin_type,
      c_admin_cat_code,
      x_coord,
      y_coord,
      CHGIS_PT_ID,
      c_notes,
      c_alt_names
    FROM "ADDR_CODES"
    WHERE x_coord IS NOT NULL AND y_coord IS NOT NULL
    ORDER BY c_admin_type, c_name_chn, c_name
  `).all();

  const personStatsRows = db.prepare(`
    WITH point_addrs AS (
      SELECT c_addr_id
      FROM "ADDR_CODES"
      WHERE x_coord IS NOT NULL AND y_coord IS NOT NULL
    )
    SELECT
      b.c_index_addr_id AS c_addr_id,
      COUNT(*) AS person_count,
      SUM(CASE WHEN b.c_birthyear IS NOT NULL AND b.c_birthyear <> 0 THEN 1 ELSE 0 END) AS with_birthyear,
      SUM(CASE WHEN b.c_deathyear IS NOT NULL AND b.c_deathyear <> 0 THEN 1 ELSE 0 END) AS with_deathyear,
      SUM(CASE WHEN b.c_female = 1 THEN 1 ELSE 0 END) AS female_count,
      COUNT(DISTINCT COALESCE(d.c_dynasty_chn, '[未知]')) AS dynasty_count
    FROM "BIOG_MAIN" b
    JOIN point_addrs p ON b.c_index_addr_id = p.c_addr_id
    LEFT JOIN "DYNASTIES" d ON b.c_dy = d.c_dy
    GROUP BY b.c_index_addr_id
  `).all();

  const personSamplesRows = db.prepare(`
    WITH point_addrs AS (
      SELECT c_addr_id
      FROM "ADDR_CODES"
      WHERE x_coord IS NOT NULL AND y_coord IS NOT NULL
    )
    SELECT
      b.c_index_addr_id AS c_addr_id,
      b.c_personid,
      b.c_name,
      b.c_name_chn,
      b.c_birthyear,
      b.c_deathyear,
      b.c_fl_earliest_year,
      b.c_fl_latest_year,
      b.c_fl_ey_notes,
      COALESCE(d.c_dynasty_chn, '[未知]') AS dynasty
    FROM "BIOG_MAIN" b
    JOIN point_addrs p ON b.c_index_addr_id = p.c_addr_id
    LEFT JOIN "DYNASTIES" d ON b.c_dy = d.c_dy
    ORDER BY
      b.c_index_addr_id,
      CASE WHEN b.c_name_chn IS NOT NULL AND TRIM(b.c_name_chn) <> '' THEN 0 ELSE 1 END,
      CASE WHEN b.c_birthyear IS NOT NULL AND b.c_birthyear <> 0 THEN 0 ELSE 1 END,
      b.c_personid
  `).all();

  const personSurnameRows = db.prepare(`
    WITH point_addrs AS (
      SELECT c_addr_id
      FROM "ADDR_CODES"
      WHERE x_coord IS NOT NULL AND y_coord IS NOT NULL
    )
    SELECT
      b.c_index_addr_id AS c_addr_id,
      b.c_name_chn
    FROM "BIOG_MAIN" b
    JOIN point_addrs p ON b.c_index_addr_id = p.c_addr_id
    WHERE b.c_name_chn IS NOT NULL AND TRIM(b.c_name_chn) <> ''
  `).all();

  const allPersonSurnameRows = db.prepare(`
    SELECT c_name_chn
    FROM "BIOG_MAIN"
    WHERE c_name_chn IS NOT NULL AND TRIM(c_name_chn) <> ''
  `).all();

  const personStatsMap = new Map();
  for (const row of personStatsRows) {
    personStatsMap.set(row.c_addr_id, {
      personCount: row.person_count,
      withBirthyear: row.with_birthyear,
      withDeathyear: row.with_deathyear,
      femaleCount: row.female_count,
      dynastyCount: row.dynasty_count,
      dynasties: [],
      dynastyCounts: {},
      dynastySamples: {},
      surnames: [],
      surnameCounts: {},
      surnameSamples: {},
      comboCounts: {},
      samples: [],
    });
  }

  const surnameMap = new Map();
  for (const row of personSurnameRows) {
    const surname = extractSurname(row.c_name_chn);
    if (!surname) continue;
    if (!surnameMap.has(row.c_addr_id)) {
      surnameMap.set(row.c_addr_id, new Map());
    }
    const bucket = surnameMap.get(row.c_addr_id);
    bucket.set(surname, (bucket.get(surname) || 0) + 1);
  }

  const surnameGlobalCounts = new Map();
  for (const row of allPersonSurnameRows) {
    const surname = extractSurname(row.c_name_chn);
    if (!surname) continue;
    surnameGlobalCounts.set(surname, (surnameGlobalCounts.get(surname) || 0) + 1);
  }

  const surnameLocatedCounts = new Map();
  for (const counts of surnameMap.values()) {
    for (const [surname, count] of counts.entries()) {
      surnameLocatedCounts.set(surname, (surnameLocatedCounts.get(surname) || 0) + count);
    }
  }

  const dynastyGlobalCounts = new Map();

  for (const [addrId, surnames] of surnameMap.entries()) {
    const bucket = personStatsMap.get(addrId);
    if (!bucket) continue;
    bucket.surnames = [...surnames.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    bucket.surnameCounts = Object.fromEntries(surnames.entries());
  }

  for (const sample of personSamplesRows) {
    const bucket = personStatsMap.get(sample.c_addr_id);
    if (!bucket) continue;
    const person = {
      c_personid: sample.c_personid,
      c_name: sample.c_name,
      c_name_chn: sample.c_name_chn,
      surname: extractSurname(sample.c_name_chn),
      c_birthyear: sample.c_birthyear,
      c_deathyear: sample.c_deathyear,
      c_fl_earliest_year: sample.c_fl_earliest_year,
      c_fl_latest_year: sample.c_fl_latest_year,
      c_fl_ey_notes: sample.c_fl_ey_notes,
      dynasty: sample.dynasty,
    };

    if (bucket.samples.length < 30) {
      bucket.samples.push(person);
    }

    if (person.surname && !bucket.surnameSamples[person.surname]) {
      bucket.surnameSamples[person.surname] = person;
    }

    const dynasty = person.dynasty || '[未知]';
    bucket.dynastyCounts[dynasty] = (bucket.dynastyCounts[dynasty] || 0) + 1;
    dynastyGlobalCounts.set(dynasty, (dynastyGlobalCounts.get(dynasty) || 0) + 1);

    if (!bucket.dynastySamples[dynasty]) {
      bucket.dynastySamples[dynasty] = person;
    }

    if (person.surname) {
      const comboKey = person.surname + '||' + dynasty;
      bucket.comboCounts[comboKey] = (bucket.comboCounts[comboKey] || 0) + 1;
    }
  }

  for (const bucket of personStatsMap.values()) {
    bucket.dynasties = Object.keys(bucket.dynastyCounts).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }

  const typeCounts = new Map();
  for (const row of rows) {
    const key = row.c_admin_type || '[Unknown]';
    typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
  }

  const topTypes = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([type, count]) => ({ type, count }));

  const enrichedRows = rows.map((row) => ({
    ...row,
    biogMain: personStatsMap.get(row.c_addr_id) || {
      personCount: 0,
      withBirthyear: 0,
      withDeathyear: 0,
      femaleCount: 0,
      dynastyCount: 0,
      dynasties: [],
      dynastyCounts: {},
      dynastySamples: {},
      surnames: [],
      surnameCounts: {},
      surnameSamples: {},
      comboCounts: {},
      samples: [],
    },
  }));

  const topDynasties = [...dynastyGlobalCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([dynasty, count]) => ({ dynasty, count }));

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      totalWithCoords: rows.length,
      adminTypeCount: typeCounts.size,
      topTypes,
      topDynasties,
      relatedAddrCount: personStatsMap.size,
      surnameGlobalCounts: Object.fromEntries(surnameGlobalCounts.entries()),
      surnameLocatedCounts: Object.fromEntries(surnameLocatedCounts.entries()),
      dynastyGlobalCounts: Object.fromEntries(dynastyGlobalCounts.entries()),
    },
    points: enrichedRows,
  };
}

function buildHtml(dataset) {
  const dataJson = safeJsonForHtml(dataset);
  const adminTypeMapJson = safeJsonForHtml(ADMIN_TYPE_CN);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CBDB 人物索引地分布地图</title>
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
    crossorigin=""
  >
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"
  >
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"
  >
  <style>
    :root {
      --bg: #efe7db;
      --panel: rgba(255, 251, 246, 0.95);
      --line: rgba(59, 67, 78, 0.16);
      --text: #1f2630;
      --muted: #5d6673;
      --accent: #a24619;
      --shadow: 0 18px 42px rgba(31, 38, 48, 0.14);
      --radius: 18px;
      --radius-sm: 14px;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at top right, rgba(162, 70, 25, 0.14), transparent 26%),
        radial-gradient(circle at left 20%, rgba(23, 118, 122, 0.1), transparent 24%),
        linear-gradient(180deg, #f6f0e7 0%, var(--bg) 54%, #eadfce 100%);
    }

    .shell {
      width: min(1600px, calc(100vw - 24px));
      margin: 12px auto;
      display: grid;
      grid-template-columns: 340px minmax(0, 1fr);
      gap: 14px;
      align-items: start;
    }

    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }

    .sidebar {
      padding: 18px;
      position: sticky;
      top: 12px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-height: calc(100vh - 24px);
      overflow: hidden;
    }

    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 700;
    }

    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 28px; line-height: 1.1; }
    .muted { color: var(--muted); line-height: 1.55; }

    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .stat {
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      background: rgba(255,255,255,0.7);
    }

    .stat strong {
      display: block;
      margin-top: 6px;
      font-size: 18px;
    }

    .controls {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    input[type="search"] {
      width: 100%;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.82);
      border-radius: 14px;
      padding: 12px 14px;
      font-size: 14px;
    }

    select {
      width: 100%;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.82);
      border-radius: 14px;
      padding: 12px 14px;
      font-size: 14px;
      color: var(--text);
    }

    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .chip {
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.76);
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      color: var(--muted);
      transition: 140ms ease;
    }

    .chip.active, .chip:hover {
      background: rgba(162, 70, 25, 0.09);
      border-color: rgba(162, 70, 25, 0.28);
      color: var(--accent);
    }

    .legend {
      min-height: 0;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-right: 4px;
    }

    .summary-panel {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: rgba(255,255,255,0.7);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .summary-stat {
      padding: 10px;
      border: 1px solid rgba(59, 67, 78, 0.12);
      border-radius: 12px;
      background: rgba(255,255,255,0.72);
    }

    .summary-stat strong {
      display: block;
      margin-top: 4px;
      font-size: 18px;
    }

    .summary-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .summary-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      border: 1px solid rgba(59, 67, 78, 0.12);
      border-radius: 12px;
      padding: 10px 12px;
      background: rgba(255,255,255,0.66);
    }

    .summary-item strong {
      font-size: 16px;
    }

    .summary-empty {
      border: 1px dashed rgba(59, 67, 78, 0.2);
      border-radius: 12px;
      padding: 12px;
      background: rgba(255,255,255,0.46);
    }

    .legend-item {
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
      background: rgba(255,255,255,0.68);
      cursor: pointer;
    }

    .legend-item.active {
      border-color: rgba(162, 70, 25, 0.3);
      background: rgba(162, 70, 25, 0.08);
    }

    .swatch {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      border: 1px solid rgba(0,0,0,0.18);
    }

    .map-panel {
      padding: 14px;
      display: grid;
      grid-template-rows: auto auto 1fr;
      gap: 12px;
      min-height: calc(100vh - 24px);
    }

    .map-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .map-head .muted {
      max-width: 860px;
    }

    .map-summary-panel {
      background: rgba(255,255,255,0.78);
    }

    .map-summary-panel .summary-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
    }

    #map {
      width: 100%;
      min-height: 720px;
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid var(--line);
    }

    .marker-dot {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      border: 2px solid rgba(255,255,255,0.92);
      box-shadow: 0 3px 10px rgba(0,0,0,0.18);
    }

    .cluster-wrap {
      border-radius: 999px;
      display: grid;
      place-items: center;
      color: #fff;
      font-weight: 700;
      border: 3px solid rgba(255,255,255,0.92);
      box-shadow: 0 10px 18px rgba(0,0,0,0.16);
    }

    .cluster-wrap span {
      line-height: 1;
    }

    .leaflet-popup-content {
      min-width: 220px;
      line-height: 1.55;
      font-size: 13px;
    }

    .popup-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 8px;
      margin-top: 8px;
    }

    .person-section {
      margin-top: 10px;
      border-top: 1px solid rgba(59, 67, 78, 0.12);
      padding-top: 10px;
    }

    .person-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 240px;
      overflow: auto;
      margin-top: 8px;
      padding-right: 4px;
    }

    .person-item {
      border: 1px solid rgba(59, 67, 78, 0.12);
      border-radius: 10px;
      padding: 8px 10px;
      background: rgba(255,255,255,0.74);
    }

    .person-item strong {
      display: block;
      margin-bottom: 2px;
    }

    @media (max-width: 1120px) {
      .shell {
        grid-template-columns: 1fr;
      }

      .sidebar {
        position: static;
        max-height: none;
      }

      .map-panel {
        min-height: auto;
      }
    }

    @media (max-width: 720px) {
      .shell {
        width: min(100vw - 12px, 100%);
        margin: 6px auto;
      }

      .sidebar, .map-panel {
        padding: 14px;
      }

      .stats {
        grid-template-columns: 1fr 1fr;
      }

      #map {
        min-height: 560px;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="panel sidebar">
      <div>
        <div class="eyebrow">CBDB 人地分布</div>
        <h1>人物索引地聚合分析地图</h1>
        <p class="muted" id="sidebar-desc"></p>
      </div>

      <div class="stats" id="stats"></div>

      <div class="controls">
        <input id="search-input" type="search" placeholder="搜索地点名、中文名或行政类型">
        <input id="surname-input" type="search" placeholder="按人物姓氏过滤，如：苏、王、欧阳">
        <select id="dynasty-select"></select>
        <div class="chip-row" id="quick-filters"></div>
      </div>

      <section class="summary-panel">
        <div>
          <div class="eyebrow">姓氏统计</div>
          <p class="muted" id="surname-summary-desc">输入姓氏后，这里会显示该姓人物总数、带位置信息的人数，以及 Top 5 区域分布。</p>
        </div>
        <div class="summary-grid" id="surname-summary-stats"></div>
        <div class="summary-list" id="surname-summary-top"></div>
      </section>

      <div>
        <div class="eyebrow">图例</div>
        <p class="muted" style="margin-top:6px;">颜色按行政类型自动分类。点击图例可单独查看某一类地点。</p>
      </div>

      <div class="legend" id="legend"></div>
    </aside>

    <main class="panel map-panel">
      <div class="map-head">
        <div>
          <div class="eyebrow">空间聚合视图</div>
          <h2 id="map-title">全部点位</h2>
          <p class="muted" id="map-subtitle"></p>
        </div>
      </div>
      <section class="summary-panel map-summary-panel">
        <div>
          <div class="eyebrow">朝代统计</div>
          <p class="muted" id="dynasty-summary-desc">输入姓氏或地点名后，这里会显示当前查询结果的人物朝代分布。</p>
        </div>
        <div class="summary-grid" id="dynasty-summary-stats"></div>
        <div class="summary-list" id="dynasty-summary-top"></div>
      </section>
      <div id="map"></div>
    </main>
  </div>

  <script id="dataset" type="application/json">${dataJson}</script>
  <script
    src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
    crossorigin=""
  ></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <script>
    const ADMIN_TYPE_CN = ${adminTypeMapJson};
    const dataset = JSON.parse(document.getElementById('dataset').textContent);
    const state = {
      query: '',
      surnameQuery: '',
      activeDynasty: 'ALL',
      activeType: 'ALL',
    };

    const points = dataset.points;
    const topTypes = dataset.meta.topTypes;
    const topDynasties = dataset.meta.topDynasties || [];
    const paletteCache = new Map();
    let clusterGroup = null;
    let visiblePoints = [];

    const normalizeAdminType = (value) => String(value || '[Unknown]').trim().toLowerCase();
    const adminTypeLabel = (value) => ADMIN_TYPE_CN[normalizeAdminType(value)] || String(value || '未详');
    window.normalizeAdminType = normalizeAdminType;
    window.adminTypeLabel = adminTypeLabel;

    const el = {
      stats: document.getElementById('stats'),
      legend: document.getElementById('legend'),
      quickFilters: document.getElementById('quick-filters'),
      searchInput: document.getElementById('search-input'),
      surnameInput: document.getElementById('surname-input'),
      dynastySelect: document.getElementById('dynasty-select'),
      surnameSummaryDesc: document.getElementById('surname-summary-desc'),
      surnameSummaryStats: document.getElementById('surname-summary-stats'),
      surnameSummaryTop: document.getElementById('surname-summary-top'),
      dynastySummaryDesc: document.getElementById('dynasty-summary-desc'),
      dynastySummaryStats: document.getElementById('dynasty-summary-stats'),
      dynastySummaryTop: document.getElementById('dynasty-summary-top'),
      sidebarDesc: document.getElementById('sidebar-desc'),
      mapTitle: document.getElementById('map-title'),
      mapSubtitle: document.getElementById('map-subtitle'),
    };

    function hashString(value) {
      let hash = 0;
      const text = value || '[Unknown]';
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash);
    }

    function colorForType(type) {
      const key = type || '[Unknown]';
      if (paletteCache.has(key)) return paletteCache.get(key);
      const hash = hashString(key);
      const hue = hash % 360;
      const saturation = 62 + (hash % 12);
      const lightness = 46 + (hash % 8);
      const color = 'hsl(' + hue + ' ' + saturation + '% ' + lightness + '%)';
      paletteCache.set(key, color);
      return color;
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatYearPair(start, end) {
      const a = start && start !== 0 ? start : '?';
      const b = end && end !== 0 ? end : '?';
      return a + ' - ' + b;
    }

    function formatPersonYears(person) {
      if ((person.c_birthyear && person.c_birthyear !== 0) || (person.c_deathyear && person.c_deathyear !== 0)) {
        return formatYearPair(person.c_birthyear, person.c_deathyear);
      }
      if ((person.c_fl_earliest_year && person.c_fl_earliest_year !== 0) || (person.c_fl_latest_year && person.c_fl_latest_year !== 0)) {
        return '活动年代 ' + formatYearPair(person.c_fl_earliest_year, person.c_fl_latest_year);
      }
      return '年代未详';
    }

    function surnameMatchesQueryValue(surname, query) {
      const surnameText = String(surname || '').trim();
      const queryText = String(query || '').trim();
      if (!queryText) return true;
      if (!surnameText) return false;
      return surnameText === queryText || surnameText.startsWith(queryText) || queryText.startsWith(surnameText);
    }

    function dynastyMatchesFilterValue(dynasty, filterValue) {
      if (!filterValue || filterValue === 'ALL') return true;
      return String(dynasty || '[未知]').trim() === filterValue;
    }

    function getMatchedSurnames(biog) {
      const query = state.surnameQuery.trim();
      const surnames = biog && Array.isArray(biog.surnames) ? biog.surnames : [];
      if (!query) return surnames;
      return surnames.filter((surname) => surnameMatchesQueryValue(surname, query));
    }

    function getMatchedPersonCount(biog) {
      const query = state.surnameQuery.trim();
      const dynasty = state.activeDynasty;
      if (!query && dynasty === 'ALL') return biog.personCount || 0;

      if (query && dynasty !== 'ALL') {
        const comboCounts = biog && biog.comboCounts ? biog.comboCounts : {};
        return Object.entries(comboCounts).reduce((sum, [comboKey, count]) => {
          const parts = comboKey.split('||');
          const surname = parts[0] || '';
          const comboDynasty = parts[1] || '[未知]';
          return surnameMatchesQueryValue(surname, query) && dynastyMatchesFilterValue(comboDynasty, dynasty)
            ? sum + Number(count || 0)
            : sum;
        }, 0);
      }

      if (query) {
        const counts = biog && biog.surnameCounts ? biog.surnameCounts : {};
        return Object.entries(counts).reduce((sum, [surname, count]) => {
          return surnameMatchesQueryValue(surname, query) ? sum + Number(count || 0) : sum;
        }, 0);
      }

      const dynastyCounts = biog && biog.dynastyCounts ? biog.dynastyCounts : {};
      return Number(dynastyCounts[dynasty] || 0);
    }

    function getVisiblePeople(biog) {
      const query = state.surnameQuery.trim();
      const dynasty = state.activeDynasty;
      const people = biog && Array.isArray(biog.samples) ? biog.samples : [];
      if (!query && dynasty === 'ALL') return people;
      const matched = people.filter((person) => (
        surnameMatchesQueryValue(person.surname, query) &&
        dynastyMatchesFilterValue(person.dynasty, dynasty)
      ));
      const byId = new Map(matched.map((person) => [String(person.c_personid), person]));
      const surnameSamples = biog && biog.surnameSamples ? biog.surnameSamples : {};
      for (const [surname, person] of Object.entries(surnameSamples)) {
        if (!surnameMatchesQueryValue(surname, query)) continue;
        if (!dynastyMatchesFilterValue(person.dynasty, dynasty)) continue;
        const personId = String(person.c_personid);
        if (!byId.has(personId)) {
          byId.set(personId, person);
        }
      }
      const dynastySamples = biog && biog.dynastySamples ? biog.dynastySamples : {};
      for (const [personDynasty, person] of Object.entries(dynastySamples)) {
        if (!dynastyMatchesFilterValue(personDynasty, dynasty)) continue;
        if (!surnameMatchesQueryValue(person.surname, query)) continue;
        const personId = String(person.c_personid);
        if (!byId.has(personId)) {
          byId.set(personId, person);
        }
      }
      return [...byId.values()];
    }

    function buildPeopleSection(point) {
      const biog = point.biogMain || { personCount: 0, samples: [] };
      if (!biog.personCount) {
        return (
          '<div class="person-section">' +
            '<strong>关联人物</strong>' +
            '<div style="margin-top:6px;">这个地点当前没有匹配到“人物主表”中的索引地人物记录。</div>' +
          '</div>'
        );
      }

      const matchedSurnames = getMatchedSurnames(biog);
      const matchedPersonCount = getMatchedPersonCount(biog);
      const visiblePeople = getVisiblePeople(biog);
      const isSurnameFiltering = Boolean(state.surnameQuery.trim());
      const isDynastyFiltering = state.activeDynasty !== 'ALL';
      const visibleSurnameText = [...new Set(
        visiblePeople
          .map((person) => String(person.surname || '').trim())
          .filter(Boolean)
      )].join('、');

      const peopleStats = (isSurnameFiltering || isDynastyFiltering)
        ? '<div class="popup-grid">' +
            '<div>命中人数</div><div>' + escapeHtml(matchedPersonCount) + '</div>' +
            '<div>命中姓氏</div><div>' + escapeHtml(visibleSurnameText || matchedSurnames.join('、') || (state.surnameQuery.trim() || '全部')) + '</div>' +
            '<div>命中朝代</div><div>' + escapeHtml(isDynastyFiltering ? state.activeDynasty : '全部') + '</div>' +
            '<div>当前展示人物</div><div>' + escapeHtml(visiblePeople.length) + '</div>' +
            '<div>地点关联总人数</div><div>' + escapeHtml(biog.personCount) + '</div>' +
          '</div>'
        : '<div class="popup-grid">' +
            '<div>关联人数</div><div>' + escapeHtml(biog.personCount) + '</div>' +
            '<div>有生年</div><div>' + escapeHtml(biog.withBirthyear) + '</div>' +
            '<div>有卒年</div><div>' + escapeHtml(biog.withDeathyear) + '</div>' +
            '<div>女性人数</div><div>' + escapeHtml(biog.femaleCount) + '</div>' +
            '<div>涉及朝代</div><div>' + escapeHtml(biog.dynastyCount) + '</div>' +
            '<div>关联姓氏</div><div>' + escapeHtml((biog.surnames || []).slice(0, 12).join('、') || '未详') + '</div>' +
          '</div>';

      const peopleList = visiblePeople.length
        ? '<div class="person-list">' + visiblePeople.map((person) => (
            '<div class="person-item">' +
              '<strong>' + escapeHtml(person.c_name_chn || '[无中文名]') + '</strong>' +
              '<div>' + escapeHtml(person.c_name || '') + '</div>' +
              '<div>' + escapeHtml(person.dynasty || '[未知]') + ' · ' + escapeHtml(formatPersonYears(person)) + '</div>' +
              (person.c_fl_ey_notes && String(person.c_fl_ey_notes).trim()
                ? '<div>官职：' + escapeHtml(person.c_fl_ey_notes) + '</div>'
                : '<div>官职：未详</div>') +
              '<div>人物编号：' + escapeHtml(person.c_personid) + '</div>' +
            '</div>'
          )).join('') + '</div>'
        : '<div style="margin-top:8px;">当前姓氏过滤下，这个地点没有可展示的人物样本。</div>';

      const sampleHint = isSurnameFiltering && matchedPersonCount > visiblePeople.length
        ? '<div class="muted" style="margin-top:4px;">该地点实际命中 ' + escapeHtml(matchedPersonCount) + ' 人；为保证页面性能，弹窗仅内置部分人物样本，因此这里展示的是命中的样本子集。</div>'
        : '<div class="muted" style="margin-top:4px;">为避免弹窗过长，这里最多展示前 30 人。</div>';

      return (
        '<div class="person-section">' +
          '<strong>关联人物</strong>' +
          '<div style="margin-top:6px;" class="muted">关联依据：人物主表中的索引地编号与当前地点编号一致。</div>' +
          peopleStats +
          '<div style="margin-top:8px;"><strong>' + ((isSurnameFiltering || isDynastyFiltering) ? '命中人物列表' : '关联人物列表') + '</strong></div>' +
          sampleHint +
          peopleList +
        '</div>'
      );
    }

    function buildMarker(point) {
      const adminType = point.c_admin_type || '[Unknown]';
      const matchedPersonCount = getMatchedPersonCount(point.biogMain || {});
      const marker = L.marker([point.y_coord, point.x_coord], {
        icon: L.divIcon({
          className: '',
          html: '<div class="marker-dot" style="background:' + colorForType(adminType) + '"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        title: point.c_name_chn || point.c_name || String(point.c_addr_id),
      });

      const yearText = [point.c_firstyear || '?', point.c_lastyear || '?'].join(' - ');
      marker.__adminType = adminType;
      marker.__personCount = matchedPersonCount;
      marker.bindPopup(
        '<strong>' + escapeHtml(point.c_name_chn || '[无中文名]') + '</strong>' +
        (point.c_name ? '<div>拼写：' + escapeHtml(point.c_name) + '</div>' : '') +
        '<div class="popup-grid">' +
          '<div>地点编号</div><div>' + escapeHtml(point.c_addr_id) + '</div>' +
          '<div>行政类型</div><div>' + escapeHtml(window.adminTypeLabel(adminType)) + '</div>' +
          '<div>关联人物数</div><div>' + escapeHtml(matchedPersonCount) + '</div>' +
          '<div>存续年代</div><div>' + escapeHtml(yearText) + '</div>' +
          '<div>坐标</div><div>' + escapeHtml(point.x_coord + ', ' + point.y_coord) + '</div>' +
          '<div>CHGIS 点位</div><div>' + escapeHtml(point.CHGIS_PT_ID ?? '') + '</div>' +
        '</div>' +
        (point.c_alt_names ? '<div style="margin-top:8px;"><strong>地名别称</strong><br>' + escapeHtml(point.c_alt_names) + '</div>' : '') +
        (point.c_notes ? '<div style="margin-top:8px;"><strong>备注</strong><br>' + escapeHtml(point.c_notes) + '</div>' : '') +
        buildPeopleSection(point)
      );
      return marker;
    }

    function buildClusterIcon(cluster) {
      const peopleCount = cluster.getAllChildMarkers().reduce((sum, marker) => sum + Number(marker.__personCount || 0), 0);
      const displayCount = peopleCount > 0 ? peopleCount : cluster.getChildCount();
      const scale = Math.min(1, Math.log(displayCount + 1) / Math.log(20000));
      const size = Math.round(34 + (scale * 28));
      const fontSize = Math.round(11 + (scale * 6));
      const hueA = Math.round(196 - (scale * 164));
      const hueB = Math.round(156 - (scale * 120));
      const saturation = Math.round(68 + (scale * 14));
      const lightnessA = Math.round(68 - (scale * 24));
      const lightnessB = Math.round(58 - (scale * 16));
      const gradient = 'linear-gradient(135deg, ' +
        'hsl(' + hueA + ' ' + saturation + '% ' + lightnessA + '%), ' +
        'hsl(' + hueB + ' ' + Math.max(60, saturation - 6) + '% ' + lightnessB + '%))';
      const shadow = '0 10px 18px rgba(0,0,0,' + (0.12 + scale * 0.16).toFixed(2) + ')';
      return L.divIcon({
        html:
          '<div class="cluster-wrap" style="' +
            'width:' + size + 'px;' +
            'height:' + size + 'px;' +
            'background:' + gradient + ';' +
            'box-shadow:' + shadow + ';' +
          '">' +
            '<span style="font-size:' + fontSize + 'px;">' + displayCount + '</span>' +
          '</div>',
        className: '',
        iconSize: [size, size],
        iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
      });
    }

    function buildClusterGroup() {
      return L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        maxClusterRadius: 48,
        iconCreateFunction: buildClusterIcon,
      });
    }

    function matchesQuery(point) {
      const q = state.query.trim().toLowerCase();
      if (!q) return true;
      return [
        point.c_name,
        point.c_name_chn,
        point.c_admin_type,
        window.adminTypeLabel(point.c_admin_type),
        point.c_alt_names,
        point.c_notes,
      ].filter(Boolean).join(' ').toLowerCase().includes(q);
    }

    function matchesType(point) {
      return state.activeType === 'ALL' || (point.c_admin_type || '[Unknown]') === state.activeType;
    }

    function matchesSurname(point) {
      const q = state.surnameQuery.trim();
      if (!q) return true;
      const surnames = point.biogMain && Array.isArray(point.biogMain.surnames) ? point.biogMain.surnames : [];
      if (!surnames.length) return false;
      return surnames.some((surname) => surnameMatchesQueryValue(surname, q));
    }

    function matchesDynasty(point) {
      if (state.activeDynasty === 'ALL') return true;
      const counts = point.biogMain && point.biogMain.dynastyCounts ? point.biogMain.dynastyCounts : {};
      return Number(counts[state.activeDynasty] || 0) > 0;
    }

    function baseFilteredPoints() {
      return points.filter((point) => matchesQuery(point) && matchesSurname(point) && matchesType(point));
    }

    function filteredPoints() {
      return baseFilteredPoints().filter((point) => matchesDynasty(point));
    }

    function getSurnameSummary() {
      const query = state.surnameQuery.trim();
      if (!query) return null;

      const globalCounts = dataset.meta.surnameGlobalCounts || {};
      const matchedSurnameEntries = Object.entries(globalCounts)
        .filter(([surname]) => surnameMatchesQueryValue(surname, query))
        .sort((a, b) => b[1] - a[1]);

      const totalCount = matchedSurnameEntries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
      const locatedCount = visiblePoints.reduce((sum, point) => sum + getMatchedPersonCount(point.biogMain || {}), 0);
      const regionTop = visiblePoints
        .map((point) => ({
          name: point.c_name_chn || point.c_name || ('地点 ' + point.c_addr_id),
          adminType: window.adminTypeLabel(point.c_admin_type),
          count: getMatchedPersonCount(point.biogMain || {}),
          addrId: point.c_addr_id,
        }))
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name), 'zh-CN'))
        .slice(0, 5);

      return {
        query,
        matchedSurnames: matchedSurnameEntries.map(([surname]) => surname),
        totalCount,
        locatedCount,
        regionTop,
      };
    }

    function getDynastySummary() {
      const basePoints = baseFilteredPoints();
      const dynastyCounts = new Map();

      for (const point of basePoints) {
        const biog = point.biogMain || {};
        if (state.surnameQuery.trim()) {
          const comboCounts = biog.comboCounts || {};
          for (const [comboKey, count] of Object.entries(comboCounts)) {
            const parts = comboKey.split('||');
            const surname = parts[0] || '';
            const dynasty = parts[1] || '[未知]';
            if (!surnameMatchesQueryValue(surname, state.surnameQuery.trim())) continue;
            dynastyCounts.set(dynasty, (dynastyCounts.get(dynasty) || 0) + Number(count || 0));
          }
        } else {
          const counts = biog.dynastyCounts || {};
          for (const [dynasty, count] of Object.entries(counts)) {
            dynastyCounts.set(dynasty, (dynastyCounts.get(dynasty) || 0) + Number(count || 0));
          }
        }
      }

      const top = [...dynastyCounts.entries()]
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-CN'))
        .slice(0, 5)
        .map(([dynasty, count]) => ({ dynasty, count }));

      const totalCount = [...dynastyCounts.values()].reduce((sum, count) => sum + Number(count || 0), 0);

      return {
        totalCount,
        dynastyCount: dynastyCounts.size,
        top,
        hasQueryContext: Boolean(state.query.trim() || state.surnameQuery.trim() || state.activeType !== 'ALL'),
      };
    }

    function renderStats() {
      const stats = [
        ['总点位', dataset.meta.totalWithCoords],
        ['行政类型', dataset.meta.adminTypeCount],
        ['当前显示', visiblePoints.length],
        ['有关联人物的地点', dataset.meta.relatedAddrCount],
      ];
      el.stats.innerHTML = stats.map(([label, value]) => (
        '<div class="stat"><div class="eyebrow">' + escapeHtml(label) + '</div><strong>' + escapeHtml(value) + '</strong></div>'
      )).join('');
    }

    function renderSurnameSummary() {
      const summary = getSurnameSummary();
      if (!summary) {
        el.surnameSummaryDesc.textContent = '输入姓氏后，这里会显示该姓人物总数、带位置信息的人数，以及 Top 5 区域分布。';
        el.surnameSummaryStats.innerHTML = '';
        el.surnameSummaryTop.innerHTML = '<div class="summary-empty muted">当前还没有输入姓氏。</div>';
        return;
      }

      const surnameLabel = summary.matchedSurnames.slice(0, 8).join('、') || summary.query;
      el.surnameSummaryDesc.textContent =
        '当前命中姓氏：' + surnameLabel + (summary.matchedSurnames.length > 8 ? ' 等' : '') + '。Top 5 区域按当前地图筛选结果统计。';

      const stats = [
        ['总数量', summary.totalCount],
        ['包含位置信息的总数', summary.locatedCount],
      ];
      el.surnameSummaryStats.innerHTML = stats.map(([label, value]) => (
        '<div class="summary-stat"><div class="eyebrow">' + escapeHtml(label) + '</div><strong>' + escapeHtml(value) + '</strong></div>'
      )).join('');

      if (!summary.regionTop.length) {
        el.surnameSummaryTop.innerHTML = '<div class="summary-empty muted">当前地图范围内没有可统计的区域分布。</div>';
        return;
      }

      el.surnameSummaryTop.innerHTML = summary.regionTop.map((item, index) => (
        '<div class="summary-item">' +
          '<div>' +
            '<div class="eyebrow">Top ' + escapeHtml(index + 1) + '</div>' +
            '<strong>' + escapeHtml(item.name) + '</strong>' +
            '<div class="muted" style="margin-top:4px;">' + escapeHtml(item.adminType) + ' · 地点编号 ' + escapeHtml(item.addrId) + '</div>' +
          '</div>' +
          '<strong>' + escapeHtml(item.count) + '</strong>' +
        '</div>'
      )).join('');
    }

    function renderDynastySummary() {
      const summary = getDynastySummary();
      const selectedDynastyText = state.activeDynasty === 'ALL' ? '全部朝代' : state.activeDynasty;
      el.dynastySummaryDesc.textContent =
        (summary.hasQueryContext ? '以下统计基于当前地名 / 姓氏 / 类型筛选结果。' : '以下统计基于当前地图全部可见人物。') +
        ' 当前朝代过滤：' + selectedDynastyText + '。这里显示的是关联人物数量，不是朝代代码。';

      const stats = [
        ['命中人物总数', summary.totalCount],
        ['涉及朝代数', summary.dynastyCount],
      ];
      el.dynastySummaryStats.innerHTML = stats.map(([label, value]) => (
        '<div class="summary-stat"><div class="eyebrow">' + escapeHtml(label) + '</div><strong>' + escapeHtml(value) + '</strong></div>'
      )).join('');

      if (!summary.top.length) {
        el.dynastySummaryTop.innerHTML = '<div class="summary-empty muted">当前结果中没有可统计的朝代分布。</div>';
        return;
      }

      el.dynastySummaryTop.innerHTML = summary.top.map((item, index) => (
        '<div class="summary-item">' +
          '<div>' +
            '<div class="eyebrow">Top ' + escapeHtml(index + 1) + '</div>' +
            '<strong>' + escapeHtml(item.dynasty) + '</strong>' +
            '<div class="muted" style="margin-top:4px;">当前查询结果中的人物数量</div>' +
          '</div>' +
          '<strong>' + escapeHtml(item.count) + '</strong>' +
        '</div>'
      )).join('');
    }

    function renderDynastyOptions() {
      const options = [
        { value: 'ALL', label: '全部朝代' },
        ...topDynasties.map((item) => ({ value: item.dynasty || '[未知]', label: item.dynasty || '[未知]' })),
      ];
      el.dynastySelect.innerHTML = options.map((item) => (
        '<option value="' + escapeHtml(item.value) + '"' + (state.activeDynasty === item.value ? ' selected' : '') + '>' +
        escapeHtml(item.label) +
        '</option>'
      )).join('');
    }

    function renderQuickFilters() {
      const chips = [
        { type: 'ALL', label: '全部' },
        ...topTypes.slice(0, 7).map((item) => ({ type: item.type || '[Unknown]', label: window.adminTypeLabel(item.type) })),
      ];
      el.quickFilters.innerHTML = chips.map((item) => (
        '<button class="chip ' + (state.activeType === item.type ? 'active' : '') + '" data-type="' + escapeHtml(item.type) + '">' +
        escapeHtml(item.label) +
        '</button>'
      )).join('');

      el.quickFilters.querySelectorAll('[data-type]').forEach((node) => {
        node.addEventListener('click', () => {
          state.activeType = node.dataset.type;
          rerenderMap();
        });
      });
    }

    function renderLegend() {
      const items = topTypes.map((item) => {
        const type = item.type || '[Unknown]';
        return (
          '<div class="legend-item ' + (state.activeType === type ? 'active' : '') + '" data-type="' + escapeHtml(type) + '">' +
            '<span class="swatch" style="background:' + colorForType(type) + '"></span>' +
            '<div>' + escapeHtml(window.adminTypeLabel(type)) + '</div>' +
            '<strong>' + escapeHtml(item.count) + '</strong>' +
          '</div>'
        );
      }).join('');

      const allItem =
        '<div class="legend-item ' + (state.activeType === 'ALL' ? 'active' : '') + '" data-type="ALL">' +
          '<span class="swatch" style="background:linear-gradient(135deg,#17767a,#a24619)"></span>' +
          '<div>全部类型</div>' +
          '<strong>' + escapeHtml(dataset.meta.totalWithCoords) + '</strong>' +
        '</div>';

      el.legend.innerHTML = allItem + items;
      el.legend.querySelectorAll('[data-type]').forEach((node) => {
        node.addEventListener('click', () => {
          state.activeType = node.dataset.type;
          rerenderMap();
        });
      });
    }

    const map = L.map('map', {
      zoomSnap: 0.25,
      worldCopyJump: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    function rerenderMap() {
      visiblePoints = filteredPoints();
      renderStats();
      renderSurnameSummary();
      renderDynastySummary();
      renderDynastyOptions();
      renderQuickFilters();
      renderLegend();

      if (clusterGroup) {
        map.removeLayer(clusterGroup);
      }

      clusterGroup = buildClusterGroup();
      for (const point of visiblePoints) {
        clusterGroup.addLayer(buildMarker(point));
      }
      map.addLayer(clusterGroup);

      el.mapTitle.textContent = state.activeType === 'ALL' ? '全部点位' : window.adminTypeLabel(state.activeType);
      const subtitleParts = [
        '当前显示 ' + visiblePoints.length + ' 个带坐标地点；点击点位可查看地点信息，以及按“人物主表索引地”关联到该地点的人物列表。',
      ];
      if (state.surnameQuery.trim()) {
        subtitleParts.push('当前姓氏过滤：' + state.surnameQuery.trim());
      }
      if (state.activeDynasty !== 'ALL') {
        subtitleParts.push('当前朝代过滤：' + state.activeDynasty);
      }
      el.mapSubtitle.textContent = subtitleParts.join(' ');

      if (visiblePoints.length) {
        const bounds = L.latLngBounds(visiblePoints.map((point) => [point.y_coord, point.x_coord]));
        map.fitBounds(bounds.pad(0.08), { maxZoom: state.activeType === 'ALL' ? 6.5 : 8 });
      } else {
        map.setView([34.5, 108.8], 4.5);
      }
    }

    el.sidebarDesc.textContent = '本页基于 ADDR_CODES 中的 ' + dataset.meta.totalWithCoords + ' 个带坐标地点，结合 BIOG_MAIN 的人物索引地信息，展示人物与地点的空间分布。支持按地名、姓氏、朝代和行政类型筛选，聚合图标会随点位数量变化大小与颜色，点击点位可查看地点详情、关联人物与统计信息。';

    el.searchInput.addEventListener('input', (event) => {
      state.query = event.target.value;
      rerenderMap();
    });

    el.surnameInput.addEventListener('input', (event) => {
      state.surnameQuery = event.target.value;
      rerenderMap();
    });

    el.dynastySelect.addEventListener('change', (event) => {
      state.activeDynasty = event.target.value;
      rerenderMap();
    });

    rerenderMap();
  </script>
</body>
</html>`;
}

function main() {
  const dataset = buildDataset();
fs.mkdirSync(path.dirname(HTML_PATH), { recursive: true });
fs.writeFileSync(HTML_PATH, buildHtml(dataset), 'utf8');
  console.log(JSON.stringify({
    html: path.basename(HTML_PATH),
    totalWithCoords: dataset.meta.totalWithCoords,
    adminTypeCount: dataset.meta.adminTypeCount,
  }, null, 2));
}

main();
