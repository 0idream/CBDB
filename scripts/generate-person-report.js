const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT_DIR, 'data', 'latest.db');
const PERSON_ID = Number(process.argv[2] || 3767);
const PERSON_OUTPUT_DIR = path.join(ROOT_DIR, 'outputs', 'person', String(PERSON_ID));
const JSON_PATH = path.join(PERSON_OUTPUT_DIR, `person-${PERSON_ID}-analysis.json`);
const HTML_PATH = path.join(PERSON_OUTPUT_DIR, `person-${PERSON_ID}-report.html`);

const db = new DatabaseSync(DB_PATH, { readonly: true });

function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\u007f+/g, '').trim();
}

function label(value, fallback = '未详') {
  const text = clean(value);
  return text || fallback;
}

function spanText(a, b) {
  const x = a === null || a === undefined || a === 0 ? '?' : a;
  const y = b === null || b === undefined || b === 0 ? '?' : b;
  if (x === '?' && y === '?') return '未详';
  return `${x} - ${y}`;
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function hitTables(personId) {
  const descriptions = {
    ALTNAME_DATA: '人物别名、字、号、谥号',
    ASSOC_DATA: '社会关系、文人交往、通信与题跋关系',
    BIOG_ADDR_DATA: '人物相关地点',
    BIOG_MAIN: '人物主表',
    BIOG_SOURCE_DATA: '人物来源文献',
    BIOG_TEXT_DATA: '人物与文本关系',
    ENTRY_DATA: '入仕与科举记录',
    KIN_DATA: '亲属关系',
    POSTED_TO_ADDR_DATA: '任职与地点桥接',
    POSTED_TO_OFFICE_DATA: '任官记录',
    POSTING_DATA: '任职事件桥接',
    STATUS_DATA: '人物身份标签'
  };
  const tables = all(`
    SELECT name
    FROM sqlite_master
    WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);
  const result = [];
  for (const { name } of tables) {
    const cols = all(`PRAGMA table_info(${JSON.stringify(name)})`);
    if (!cols.some((c) => c.name === 'c_personid')) continue;
    const row = get(`SELECT COUNT(*) AS cnt FROM "${name}" WHERE c_personid = ?`, personId);
    if (row.cnt > 0) {
      result.push({
        table: name,
        rows: row.cnt,
        description: descriptions[name] || '与该人物有直接记录的表'
      });
    }
  }
  return result;
}

function buildDataset(personId) {
  const person = get(`
    SELECT
      b.*,
      d.c_dynasty_chn,
      iy.c_index_year_type_hz,
      ch.c_choronym_chn,
      hs.c_household_status_desc_chn,
      et.c_name_chn AS ethnicity_chn,
      a.c_name_chn AS index_addr_chn,
      a.c_name AS index_addr,
      bac.c_addr_desc_chn AS index_addr_type_chn,
      byh.c_nianhao_chn AS birth_nh_chn,
      dyh.c_nianhao_chn AS death_nh_chn
    FROM BIOG_MAIN b
    LEFT JOIN DYNASTIES d ON b.c_dy = d.c_dy
    LEFT JOIN INDEXYEAR_TYPE_CODES iy ON b.c_index_year_type_code = iy.c_index_year_type_code
    LEFT JOIN CHORONYM_CODES ch ON b.c_choronym_code = ch.c_choronym_code
    LEFT JOIN HOUSEHOLD_STATUS_CODES hs ON b.c_household_status_code = hs.c_household_status_code
    LEFT JOIN ETHNICITY_TRIBE_CODES et ON b.c_ethnicity_code = et.c_ethnicity_code
    LEFT JOIN ADDR_CODES a ON b.c_index_addr_id = a.c_addr_id
    LEFT JOIN BIOG_ADDR_CODES bac ON b.c_index_addr_type_code = bac.c_addr_type
    LEFT JOIN NIAN_HAO byh ON b.c_by_nh_code = byh.c_nianhao_id
    LEFT JOIN NIAN_HAO dyh ON b.c_dy_nh_code = dyh.c_nianhao_id
    WHERE b.c_personid = ?
  `, personId);

  if (!person) throw new Error(`未找到 c_personid = ${personId}`);

  const altNames = all(`
    SELECT a.*, c.c_name_type_desc_chn, t.c_title_chn AS source_title_chn
    FROM ALTNAME_DATA a
    LEFT JOIN ALTNAME_CODES c ON a.c_alt_name_type_code = c.c_name_type_code
    LEFT JOIN TEXT_CODES t ON a.c_source = t.c_textid
    WHERE a.c_personid = ?
    ORDER BY a.c_alt_name_type_code, a.c_alt_name_chn
  `, personId);

  const kin = all(`
    SELECT k.*, kc.c_kinrel_chn, kc.c_kinrel, p.c_name_chn AS kin_name_chn, p.c_name AS kin_name, t.c_title_chn AS source_title_chn
    FROM KIN_DATA k
    LEFT JOIN KINSHIP_CODES kc ON k.c_kin_code = kc.c_kincode
    LEFT JOIN BIOG_MAIN p ON k.c_kin_id = p.c_personid
    LEFT JOIN TEXT_CODES t ON k.c_source = t.c_textid
    WHERE k.c_personid = ?
    ORDER BY k.c_kin_code, k.c_kin_id
  `, personId);

  const statuses = all(`
    SELECT s.*, sc.c_status_desc_chn, sc.c_status_desc, t.c_title_chn AS source_title_chn
    FROM STATUS_DATA s
    LEFT JOIN STATUS_CODES sc ON s.c_status_code = sc.c_status_code
    LEFT JOIN TEXT_CODES t ON s.c_source = t.c_textid
    WHERE s.c_personid = ?
    ORDER BY s.c_status_code
  `, personId);

  const entries = all(`
    SELECT e.*, ec.c_entry_desc_chn, a.c_name_chn AS entry_addr_chn, a.c_name AS entry_addr, psc.c_parental_status_desc_chn, nh.c_nianhao_chn, t.c_title_chn AS source_title_chn
    FROM ENTRY_DATA e
    LEFT JOIN ENTRY_CODES ec ON e.c_entry_code = ec.c_entry_code
    LEFT JOIN ADDR_CODES a ON e.c_entry_addr_id = a.c_addr_id
    LEFT JOIN PARENTAL_STATUS_CODES psc ON e.c_parental_status_code = psc.c_parental_status_code
    LEFT JOIN NIAN_HAO nh ON e.c_entry_nh_id = nh.c_nianhao_id
    LEFT JOIN TEXT_CODES t ON e.c_source = t.c_textid
    WHERE e.c_personid = ?
    ORDER BY e.c_sequence, e.c_year
  `, personId);

  const addresses = all(`
    SELECT b.*, a.c_name_chn AS addr_name_chn, a.c_name AS addr_name, a.c_admin_type, c.c_addr_desc_chn, t.c_title_chn AS source_title_chn
    FROM BIOG_ADDR_DATA b
    LEFT JOIN ADDR_CODES a ON b.c_addr_id = a.c_addr_id
    LEFT JOIN BIOG_ADDR_CODES c ON b.c_addr_type = c.c_addr_type
    LEFT JOIN TEXT_CODES t ON b.c_source = t.c_textid
    WHERE b.c_personid = ?
    ORDER BY b.c_sequence, b.c_firstyear, b.c_addr_id
  `, personId);

  const offices = all(`
    SELECT
      p.*,
      oc.c_office_chn,
      oc.c_office_pinyin,
      ap.c_appt_desc_chn,
      apt.c_appt_type_desc_chn,
      aso.c_assume_office_desc_chn,
      cat.c_category_desc_chn,
      pa.c_addr_id,
      aa.c_name_chn AS addr_name_chn,
      t.c_title_chn AS source_title_chn
    FROM POSTED_TO_OFFICE_DATA p
    LEFT JOIN OFFICE_CODES oc ON p.c_office_id = oc.c_office_id
    LEFT JOIN APPOINTMENT_CODES ap ON CAST(p.c_appt_code AS INTEGER) = ap.c_appt_code
    LEFT JOIN APPOINTMENT_TYPES apt ON CAST(p.c_appt_type_code AS TEXT) = apt.c_appt_type_code
    LEFT JOIN ASSUME_OFFICE_CODES aso ON p.c_assume_office_code = aso.c_assume_office_code
    LEFT JOIN OFFICE_CATEGORIES cat ON p.c_office_category_id = cat.c_office_category_id
    LEFT JOIN POSTED_TO_ADDR_DATA pa
      ON p.c_posting_id = pa.c_posting_id
      AND p.c_personid = pa.c_personid
      AND p.c_office_id = pa.c_office_id
    LEFT JOIN ADDR_CODES aa ON pa.c_addr_id = aa.c_addr_id
    LEFT JOIN TEXT_CODES t ON p.c_source = t.c_textid
    WHERE p.c_personid = ?
    ORDER BY p.c_firstyear, p.c_sequence, p.c_posting_id
  `, personId);

  const assocRows = all(`
    SELECT
      ad.*,
      ac.c_assoc_desc_chn,
      at.c_assoc_type_desc_chn,
      p.c_name_chn AS assoc_name_chn,
      p.c_name AS assoc_name,
      src.c_title_chn AS source_title_chn
    FROM ASSOC_DATA ad
    LEFT JOIN ASSOC_CODES ac ON ad.c_assoc_code = ac.c_assoc_code
    LEFT JOIN ASSOC_CODE_TYPE_REL rel ON ad.c_assoc_code = rel.c_assoc_code
    LEFT JOIN ASSOC_TYPES at ON rel.c_assoc_type_code = at.c_assoc_type_code
    LEFT JOIN BIOG_MAIN p ON ad.c_assoc_id = p.c_personid
    LEFT JOIN TEXT_CODES src ON ad.c_source = src.c_textid
    WHERE ad.c_personid = ?
    ORDER BY at.c_assoc_type_desc_chn, ad.c_assoc_code, ad.c_assoc_id
  `, personId);

  const texts = all(`
    SELECT bt.*, tc.c_title_chn, tc.c_title, tr.c_role_desc_chn, src.c_title_chn AS source_title_chn
    FROM BIOG_TEXT_DATA bt
    LEFT JOIN TEXT_CODES tc ON bt.c_textid = tc.c_textid
    LEFT JOIN TEXT_ROLE_CODES tr ON bt.c_role_id = tr.c_role_id
    LEFT JOIN TEXT_CODES src ON bt.c_source = src.c_textid
    WHERE bt.c_personid = ?
    ORDER BY bt.c_textid
  `, personId);

  const sources = all(`
    SELECT bs.*, tc.c_title_chn, tc.c_title, tc.c_title_trans
    FROM BIOG_SOURCE_DATA bs
    LEFT JOIN TEXT_CODES tc ON bs.c_textid = tc.c_textid
    WHERE bs.c_personid = ?
    ORDER BY bs.c_textid
  `, personId);

  const assocTypeSummary = all(`
    SELECT COALESCE(at.c_assoc_type_desc_chn, '未分类') AS label, COUNT(*) AS count
    FROM ASSOC_DATA ad
    LEFT JOIN ASSOC_CODE_TYPE_REL rel ON ad.c_assoc_code = rel.c_assoc_code
    LEFT JOIN ASSOC_TYPES at ON rel.c_assoc_type_code = at.c_assoc_type_code
    WHERE ad.c_personid = ?
    GROUP BY label
    ORDER BY count DESC, label
  `, personId);

  const assocTopPeople = all(`
    SELECT p.c_name_chn AS label, COUNT(*) AS count
    FROM ASSOC_DATA ad
    LEFT JOIN BIOG_MAIN p ON ad.c_assoc_id = p.c_personid
    WHERE ad.c_personid = ? AND ad.c_assoc_id > 0
    GROUP BY p.c_name_chn
    ORDER BY count DESC, p.c_name_chn
    LIMIT 16
  `, personId);

  const glossary = [
    { field: 'c_personid', cn: '人物ID', basis: '主键，官方字段', confidence: '高' },
    { field: 'c_name', cn: '英文/拼音姓名', basis: '与 c_name_chn 对照', confidence: '高' },
    { field: 'c_index_year', cn: '索引年份', basis: '结合 index year type 判断', confidence: '中' },
    { field: 'c_index_addr_id', cn: '索引地ID / 基本地址ID', basis: '可连到 ADDR_CODES', confidence: '高' },
    { field: 'c_index_addr_type_code', cn: '索引地类型代码', basis: 'BIOG_ADDR_CODES 可解析', confidence: '高' },
    { field: 'c_fl_earliest_year', cn: '最早活动年', basis: 'fl 常指 floruit', confidence: '中' },
    { field: 'c_fl_latest_year', cn: '最晚活动年', basis: '与 earliest 配对出现', confidence: '中' },
    { field: 'c_fl_ey_notes', cn: '最早活动年备注 / 官职线索', basis: '字段内容常是说明性文字', confidence: '中' },
    { field: 'c_pages', cn: '页码或定位信息', basis: '多张来源表通用', confidence: '高' },
    { field: 'c_source', cn: '来源文献ID', basis: '通常连到 TEXT_CODES', confidence: '高' },
    { field: 'c_assoc_id', cn: '关联人物ID', basis: 'ASSOC_DATA 中可连回 BIOG_MAIN', confidence: '高' },
    { field: 'c_assoc_code', cn: '关系类型代码', basis: 'ASSOC_CODES 可解析', confidence: '高' },
    { field: 'c_kin_code', cn: '亲属关系代码', basis: 'KINSHIP_CODES 可解析', confidence: '高' },
    { field: 'c_entry_code', cn: '入仕方式代码', basis: 'ENTRY_CODES 可解析', confidence: '高' },
    { field: 'c_posting_id', cn: '任职事件ID', basis: '任官桥接键', confidence: '高' },
    { field: 'c_appt_code', cn: '任命方式代码', basis: 'APPOINTMENT_CODES 可解析', confidence: '高' },
    { field: 'c_role_id', cn: '文本角色代码', basis: 'TEXT_ROLE_CODES 可解析', confidence: '高' }
  ];

  return {
    meta: { personId, generatedAt: new Date().toISOString(), db: path.basename(DB_PATH) },
    person,
    hits: hitTables(personId),
    indirectTables: [
      { table: 'ALTNAME_CODES', via: 'ALTNAME_DATA.c_alt_name_type_code', role: '别名类型解释表' },
      { table: 'KINSHIP_CODES', via: 'KIN_DATA.c_kin_code', role: '亲属关系解释表' },
      { table: 'STATUS_CODES', via: 'STATUS_DATA.c_status_code', role: '身份标签解释表' },
      { table: 'ENTRY_CODES', via: 'ENTRY_DATA.c_entry_code', role: '入仕方式解释表' },
      { table: 'BIOG_ADDR_CODES', via: 'BIOG_ADDR_DATA.c_addr_type', role: '地点类型解释表' },
      { table: 'ADDR_CODES', via: '地址类 ID 字段', role: '地点主表' },
      { table: 'OFFICE_CODES', via: 'POSTED_TO_OFFICE_DATA.c_office_id', role: '官职主表' },
      { table: 'APPOINTMENT_CODES', via: 'POSTED_TO_OFFICE_DATA.c_appt_code', role: '任命方式表' },
      { table: 'APPOINTMENT_TYPES', via: 'POSTED_TO_OFFICE_DATA.c_appt_type_code', role: '任命类型表' },
      { table: 'ASSOC_CODES', via: 'ASSOC_DATA.c_assoc_code', role: '关系类型表' },
      { table: 'ASSOC_TYPES', via: 'ASSOC_CODE_TYPE_REL', role: '关系大类表' },
      { table: 'TEXT_CODES', via: 'c_textid / c_source', role: '文献与文本主表' },
      { table: 'TEXT_ROLE_CODES', via: 'BIOG_TEXT_DATA.c_role_id', role: '文本角色表' },
      { table: 'NIAN_HAO', via: '年号代码字段', role: '年号表' },
      { table: 'DYNASTIES', via: 'c_dy', role: '朝代表' }
    ],
    stats: {
      directTableCount: hitTables(personId).length,
      assocCount: assocRows.length,
      kinCount: kin.length,
      addrCount: addresses.length,
      officeCount: offices.length,
      textCount: texts.length,
      sourceCount: sources.length
    },
    altNames,
    kin,
    statuses,
    entries,
    addresses,
    offices,
    assocRows,
    assocTypeSummary,
    assocTopPeople,
    texts,
    sources,
    glossary
  };
}

function buildHtml(dataset) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>人物专项报告 - ${dataset.person.c_name_chn} (${dataset.meta.personId})</title>
  <style>
    :root{--bg:#f5efe6;--panel:rgba(255,251,246,.96);--line:rgba(70,84,102,.18);--text:#1d2430;--muted:#5b6675;--a:#a04022;--b:#255f6b;--c:#8a7a2d;--shadow:0 16px 38px rgba(39,28,20,.10)}
    *{box-sizing:border-box}body{margin:0;font:14px/1.7 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--text);background:linear-gradient(180deg,#f7f1e8,#f1e9de)}
    .app{display:grid;grid-template-columns:280px 1fr;min-height:100vh}.side{position:sticky;top:0;height:100vh;overflow:auto;padding:22px;border-right:1px solid var(--line);background:rgba(248,242,233,.9)}
    .main{padding:24px}.card,.hero,.section{background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow)}.hero,.section{padding:22px}.section{margin-top:18px}
    .brand{padding:18px}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--a);font-weight:700}.muted{color:var(--muted)}h1,h2,h3{margin:0}h1{font-size:26px;line-height:1.2}h2{font-size:42px;line-height:1.05;margin-top:8px}h3{font-size:24px}
    .meta,.nav,.stats,.facts,.grid,.bars,.timeline{display:grid;gap:10px}.meta{margin-top:14px}.meta div{display:flex;justify-content:space-between;gap:10px;padding-bottom:6px;border-bottom:1px dashed var(--line)}
    .nav{margin-top:18px}.nav a{text-decoration:none;color:var(--muted);padding:8px 10px;border-radius:10px}.nav a:hover{background:rgba(160,64,34,.08);color:var(--text)}
    .tags{display:flex;flex-wrap:wrap;gap:8px}.tag{padding:6px 10px;border-radius:999px;background:rgba(37,95,107,.10);color:var(--b);font-weight:700;font-size:12px}
    .stats{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-top:18px}.stat{padding:14px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.68)}.stat strong{display:block;font-size:28px;line-height:1;margin-top:8px}
    .two{display:grid;grid-template-columns:1.1fr .9fr;gap:16px;margin-top:16px}.facts{grid-template-columns:repeat(2,minmax(0,1fr))}.fact{padding:12px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.60)}.fact b{display:block;font-size:12px;color:var(--muted);margin-bottom:6px}
    .mini{padding:14px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.65)}.mini h4{margin:0 0 8px;font-size:16px}.bars{margin-top:14px}.bar{display:grid;grid-template-columns:210px 1fr 54px;gap:10px;align-items:center}.track{height:12px;background:rgba(37,95,107,.10);border-radius:999px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,var(--a),var(--b));border-radius:999px}
    .network{position:relative;height:520px;margin-top:16px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.55);overflow:hidden}.network svg{position:absolute;inset:0;width:100%;height:100%}.node{position:absolute;transform:translate(-50%,-50%);padding:10px 12px;min-width:132px;max-width:180px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.92);box-shadow:0 10px 22px rgba(0,0,0,.08)}.node.core{background:rgba(160,64,34,.12)}.node.direct{background:rgba(37,95,107,.10)}.node.indirect{background:rgba(138,122,45,.10)}.node strong{display:block;font-size:13px}.node span{display:block;font-size:12px;color:var(--muted);line-height:1.5}
    .timeline{margin-top:16px}.tl{display:grid;grid-template-columns:120px 1fr;gap:12px;padding:12px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.65)}.tl .time{font-family:Consolas,monospace;color:var(--a);font-weight:700}
    .tool{margin-top:14px;display:flex;gap:10px;flex-wrap:wrap}.tool input{width:min(360px,100%);padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.85)}
    .table{margin-top:14px;overflow:auto;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.74)}table{width:100%;border-collapse:collapse;min-width:860px}th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px}th{position:sticky;top:0;background:rgba(245,239,230,.96);color:var(--muted)}
    details{margin-top:12px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.64)}summary{cursor:pointer;padding:12px 14px;font-weight:700}.body{padding:0 14px 14px}.mono{font-family:Consolas,monospace}
    @media (max-width:1080px){.app{grid-template-columns:1fr}.side{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}.two,.facts{grid-template-columns:1fr}.network{height:760px}}
  </style>
</head>
<body>
  <div class="app">
    <aside class="side">
      <div class="card brand">
        <div class="eyebrow">CBDB 人物专项报告</div>
        <h1 id="s-name"></h1>
        <div class="muted" id="s-sub" style="margin-top:8px"></div>
        <div class="meta" id="s-meta"></div>
      </div>
      <nav class="nav" id="nav"></nav>
    </aside>
    <main class="main">
      <section class="hero">
        <div class="eyebrow">人物总览</div>
        <h2 id="hero-name"></h2>
        <div class="muted" id="hero-sub" style="margin-top:8px"></div>
        <div class="tags" id="hero-tags" style="margin-top:14px"></div>
        <div class="stats" id="stats"></div>
      </section>

      <section class="section" id="overview">
        <h3>基本档案</h3>
        <div class="muted">综合 <span class="mono">BIOG_MAIN</span> 以及直接可解析的朝代、郡望、索引地、年号等解释表，给出人物的核心档案。</div>
        <div class="two">
          <div>
            <div class="facts" id="facts"></div>
            <div class="mini" id="main-note" style="margin-top:14px"></div>
          </div>
          <div class="grid" id="overview-grid"></div>
        </div>
      </section>

      <section class="section" id="network">
        <h3>表关联网络</h3>
        <div class="muted">中间是人物主表；左边是直接命中的业务表；右边是帮助解释代码和 ID 的间接关联表。</div>
        <div class="network" id="network-box"></div>
      </section>

      <section class="section" id="aliases"><h3>别名与称谓</h3><div class="table" id="aliases-table"></div></section>
      <section class="section" id="kin"><h3>亲属关系</h3><div class="grid" id="kin-cards" style="margin-top:14px"></div><div class="table" id="kin-table"></div></section>
      <section class="section" id="status"><h3>身份标签</h3><div class="table" id="status-table"></div></section>
      <section class="section" id="entry"><h3>入仕与科举</h3><div class="table" id="entry-table"></div></section>
      <section class="section" id="addr"><h3>地点轨迹</h3><div class="bars" id="addr-bars"></div><div class="timeline" id="addr-timeline"></div><div class="table" id="addr-table"></div></section>
      <section class="section" id="office"><h3>任官记录</h3><div class="grid" id="office-cards" style="margin-top:14px"></div><div class="timeline" id="office-timeline"></div><div class="table" id="office-table"></div></section>
      <section class="section" id="assoc"><h3>社会关系与交往网络</h3><div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;margin-top:14px"><div class="mini"><h4 style="margin:0 0 8px">关系大类分布</h4><div class="bars" id="assoc-bars"></div></div><div class="mini"><h4 style="margin:0 0 8px">高频关联人物</h4><div class="bars" id="assoc-people"></div></div></div><div class="tool"><input id="assoc-search" type="search" placeholder="搜索关系类型、关联人物、备注"></div><div class="table" id="assoc-table"></div></section>
      <section class="section" id="texts"><h3>文本与著述</h3><div class="grid" id="text-cards" style="margin-top:14px"></div><div class="tool"><input id="text-search" type="search" placeholder="搜索书名、角色、来源"></div><div class="table" id="text-table"></div></section>
      <section class="section" id="sources"><h3>资料来源</h3><div class="table" id="source-table"></div></section>
      <section class="section" id="tables"><h3>命中表与关联表清单</h3><div class="grid" id="hit-tables" style="margin-top:14px"></div><div class="grid" id="indirect-tables" style="margin-top:14px"></div></section>
      <section class="section" id="glossary"><h3>英文字段与缩写字段中文解释</h3><div class="table" id="glossary-table"></div></section>
      <section class="section" id="raw"><h3>原始命中表展开</h3><div id="raw-box"></div></section>
    </main>
  </div>
  <script id="dataset" type="application/json">${safeJson(dataset)}</script>
  <script>
    const data = JSON.parse(document.getElementById('dataset').textContent);
    const person = data.person;
    const navItems = [['overview','基本档案'],['network','表关联网络'],['aliases','别名'],['kin','亲属'],['status','身份'],['entry','入仕'],['addr','地点'],['office','任官'],['assoc','社会关系'],['texts','文本'],['sources','来源'],['tables','表清单'],['glossary','字段解释'],['raw','原始展开']];
    const byId = (id) => document.getElementById(id);
    const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const txt = (v,f='未详') => { const s = String(v ?? '').trim(); return s ? s : f; };
    const span = (a,b) => (a||b) ? \`\${a || '?'} - \${b || '?'}\` : '未详';
    function table(cols, rows) { return '<table><thead><tr>' + cols.map(c => '<th>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + cols.map(c => '<td>' + (c.html ? c.html(row) : esc(txt(row[c.key]))) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'; }
    function bars(target, rows) { const max = Math.max(...rows.map(r => r.count), 1); target.innerHTML = rows.map(r => '<div class="bar"><div>' + esc(txt(r.label)) + '</div><div class="track"><div class="fill" style="width:' + Math.max(4, r.count / max * 100) + '%"></div></div><strong>' + esc(r.count) + '</strong></div>').join(''); }
    function render() {
      byId('s-name').textContent = person.c_name_chn;
      byId('s-sub').textContent = '人物 ID ' + data.meta.personId + ' · 直接命中 ' + data.stats.directTableCount + ' 张表';
      byId('s-meta').innerHTML = [['朝代',txt(person.c_dynasty_chn)],['索引地',txt(person.index_addr_chn)],['出生',txt(person.c_birthyear)],['去世',txt(person.c_deathyear)],['生成',new Date(data.meta.generatedAt).toLocaleString('zh-CN',{hour12:false})]].map(([k,v]) => '<div><span>' + esc(k) + '</span><strong>' + esc(v) + '</strong></div>').join('');
      byId('nav').innerHTML = navItems.map(([id,name]) => '<a href="#' + id + '">' + esc(name) + '</a>').join('');
      byId('hero-name').textContent = person.c_name_chn;
      byId('hero-sub').textContent = txt(person.c_name) + ' · 朝代：' + txt(person.c_dynasty_chn) + ' · 索引地：' + txt(person.index_addr_chn);
      byId('hero-tags').innerHTML = [person.c_choronym_chn, person.index_addr_type_chn, data.statuses.slice(0,4).map(r => r.c_status_desc_chn)].flat().filter(Boolean).map(v => '<span class="tag">' + esc(v) + '</span>').join('');
      byId('stats').innerHTML = [['社会关系记录',data.stats.assocCount],['亲属记录',data.stats.kinCount],['地点记录',data.stats.addrCount],['任官记录',data.stats.officeCount],['文本记录',data.stats.textCount],['来源记录',data.stats.sourceCount]].map(([k,v]) => '<div class="stat"><span>' + esc(k) + '</span><strong>' + esc(v) + '</strong></div>').join('');
      const facts = [['中文姓名',person.c_name_chn],['英文/拼音名',person.c_name],['姓 / 名',txt(person.c_surname_chn) + ' / ' + txt(person.c_mingzi_chn)],['朝代',person.c_dynasty_chn],['索引年份',txt(person.c_index_year) + '（' + txt(person.c_index_year_type_hz) + '）'],['出生',txt(person.c_birthyear) + '（' + txt(person.birth_nh_chn) + '）'],['去世',txt(person.c_deathyear) + '（' + txt(person.death_nh_chn) + '）'],['享年',txt(person.c_death_age)],['索引地',txt(person.index_addr_chn) + ' / ' + txt(person.index_addr)],['索引地类型',person.index_addr_type_chn],['郡望',person.c_choronym_chn],['族属',person.ethnicity_chn],['户类',person.c_household_status_desc_chn],['女性标记',person.c_female === 1 ? '是' : '否'],['自述传记标记',person.c_self_bio === 1 ? '是' : '否'],['创建/修改',txt(person.c_created_date) + ' / ' + txt(person.c_modified_date)]];
      byId('facts').innerHTML = facts.map(([k,v]) => '<div class="fact"><b>' + esc(k) + '</b><div>' + esc(txt(v)) + '</div></div>').join('');
      byId('main-note').innerHTML = '<h4 style="margin:0 0 8px">主表备注</h4><div>' + esc(txt(person.c_notes)) + '</div>';
      byId('overview-grid').innerHTML = ['这个人物在库中的关系数据极其丰富，尤其集中在 ASSOC_DATA。','BIOG_ADDR_DATA 与 POSTED_TO_OFFICE_DATA 共同构成其生平轨迹与仕宦路径。','主表里的英文说明更像数据库编者的综合注记，不是史料原文全文。'].map(t => '<div class="mini"><div>' + esc(t) + '</div></div>').join('');
    }
    function renderNetwork() {
      const core = { x: 50, y: 50, cls: 'core', title: 'BIOG_MAIN', sub: 'center' };
      const direct = data.hits.map((r, i) => ({ x: 22, y: 8 + i * 7, cls: 'direct', title: r.table, sub: r.rows + ' rows' }));
      const indirect = data.indirectTables.slice(0, 15).map((r, i) => ({ x: 78, y: 8 + i * 6, cls: 'indirect', title: r.table, sub: r.role }));
      const lines = [...direct.map(n => ({ x1: n.x + 8, y1: n.y, x2: 42, y2: 50 })), ...indirect.map(n => ({ x1: 58, y1: 50, x2: n.x - 8, y2: n.y }))];
      byId('network-box').innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' + lines.map(l => '<line x1="' + l.x1 + '" y1="' + l.y1 + '" x2="' + l.x2 + '" y2="' + l.y2 + '" stroke="rgba(90,102,118,.35)" stroke-width="0.25" />').join('') + '</svg>' + [core, ...direct, ...indirect].map(n => '<div class="node ' + n.cls + '" style="left:' + n.x + '%;top:' + n.y + '%"><strong>' + esc(n.title) + '</strong><span>' + esc(n.sub) + '</span></div>').join('');
    }
    function renderCoreTables() {
      byId('aliases-table').innerHTML = table([{ label: '中文称谓', key: 'c_alt_name_chn' }, { label: '拼音/英文', key: 'c_alt_name' }, { label: '类型', key: 'c_name_type_desc_chn' }, { label: '来源', key: 'source_title_chn' }, { label: '页码', key: 'c_pages' }], data.altNames);
      byId('kin-cards').innerHTML = data.kin.slice(0, 6).map(r => '<div class="mini"><h4>' + esc(txt(r.c_kinrel_chn)) + '</h4><div>' + esc(txt(r.kin_name_chn || r.kin_name)) + '</div></div>').join('');
      byId('kin-table').innerHTML = table([{ label: '关系', key: 'c_kinrel_chn' }, { label: '缩写', key: 'c_kinrel' }, { label: '亲属', html: r => esc(txt(r.kin_name_chn || r.kin_name)) }, { label: '亲属ID', key: 'c_kin_id' }, { label: '来源', key: 'source_title_chn' }, { label: '备注', key: 'c_notes' }], data.kin);
      byId('status-table').innerHTML = table([{ label: '身份标签', key: 'c_status_desc_chn' }, { label: '英文原文', key: 'c_status_desc' }, { label: '时间范围', html: r => esc(span(r.c_firstyear, r.c_lastyear)) }, { label: '来源', key: 'source_title_chn' }], data.statuses);
      byId('entry-table').innerHTML = table([{ label: '序号', key: 'c_sequence' }, { label: '入仕方式', key: 'c_entry_desc_chn' }, { label: '年份', key: 'c_year' }, { label: '年龄', key: 'c_age' }, { label: '地点', html: r => esc(txt(r.entry_addr_chn || r.entry_addr)) }, { label: '附注', html: r => esc(txt(r.c_posting_notes || r.c_notes)) }, { label: '来源', key: 'source_title_chn' }], data.entries);
      const addrTypes = Object.values(data.addresses.reduce((a, r) => { const k = txt(r.c_addr_desc_chn); a[k] = a[k] || { label: k, count: 0 }; a[k].count += 1; return a; }, {})).sort((x, y) => y.count - x.count);
      bars(byId('addr-bars'), addrTypes);
      byId('addr-timeline').innerHTML = data.addresses.map(r => '<div class="tl"><div class="time">' + esc(span(r.c_firstyear, r.c_lastyear)) + '</div><div><strong>' + esc(txt(r.addr_name_chn || r.addr_name)) + ' [' + esc(txt(r.c_addr_desc_chn)) + ']</strong><div class="muted">行政类型：' + esc(txt(r.c_admin_type)) + (r.c_notes ? '；备注：' + esc(r.c_notes) : '') + '</div></div></div>').join('');
      byId('addr-table').innerHTML = table([{ label: '序号', key: 'c_sequence' }, { label: '地点类型', key: 'c_addr_desc_chn' }, { label: '地点', html: r => esc(txt(r.addr_name_chn || r.addr_name)) }, { label: '时间范围', html: r => esc(span(r.c_firstyear, r.c_lastyear)) }, { label: '来源', key: 'source_title_chn' }, { label: '备注', key: 'c_notes' }], data.addresses);
      byId('office-cards').innerHTML = [['任官记录', data.offices.length], ['亲属记录', data.kin.length], ['文本记录', data.texts.length], ['来源记录', data.sources.length]].map(([k, v]) => '<div class="mini"><h4>' + esc(k) + '</h4><div>' + esc(v) + '</div></div>').join('');
      byId('office-timeline').innerHTML = data.offices.slice(0, 18).map(r => '<div class="tl"><div class="time">' + esc(span(r.c_firstyear, r.c_lastyear)) + '</div><div><strong>' + esc(txt(r.c_office_chn || r.c_office_pinyin)) + '</strong><div class="muted">地点：' + esc(txt(r.addr_name_chn)) + '；任命方式：' + esc(txt(r.c_appt_desc_chn)) + '；任命类型：' + esc(txt(r.c_appt_type_desc_chn)) + (r.c_notes ? '；备注：' + esc(r.c_notes) : '') + '</div></div></div>').join('');
      byId('office-table').innerHTML = table([{ label: 'posting_id', key: 'c_posting_id' }, { label: '官职', html: r => esc(txt(r.c_office_chn || r.c_office_pinyin)) }, { label: '时间范围', html: r => esc(span(r.c_firstyear, r.c_lastyear)) }, { label: '地点', key: 'addr_name_chn' }, { label: '任命方式', key: 'c_appt_desc_chn' }, { label: '任命类型', key: 'c_appt_type_desc_chn' }, { label: '官职类别', key: 'c_category_desc_chn' }, { label: '来源', key: 'source_title_chn' }, { label: '备注', key: 'c_notes' }], data.offices);
    }
    function renderAssocTextsAndLists() {
      bars(byId('assoc-bars'), data.assocTypeSummary.slice(0, 12));
      bars(byId('assoc-people'), data.assocTopPeople.slice(0, 12));
      const assocCols = [{ label: '关系大类', key: 'c_assoc_type_desc_chn' }, { label: '关系类型', key: 'c_assoc_desc_chn' }, { label: '关联人物', html: r => esc(txt(r.assoc_name_chn || r.assoc_name)) }, { label: '关联人物ID', key: 'c_assoc_id' }, { label: '时间范围', html: r => esc(span(r.c_assoc_first_year, r.c_assoc_last_year)) }, { label: '文本题名', key: 'c_text_title' }, { label: '来源', key: 'source_title_chn' }, { label: '备注', key: 'c_notes' }];
      const drawAssoc = () => { const q = byId('assoc-search').value.trim().toLowerCase(); const rows = data.assocRows.filter(r => !q || [r.c_assoc_type_desc_chn, r.c_assoc_desc_chn, r.assoc_name_chn, r.assoc_name, r.c_text_title, r.c_notes].filter(Boolean).join(' ').toLowerCase().includes(q)); byId('assoc-table').innerHTML = table(assocCols, rows); };
      byId('assoc-search').addEventListener('input', drawAssoc); drawAssoc();
      byId('text-cards').innerHTML = [['文本关系记录', data.texts.length], ['来源记录', data.sources.length], ['别名记录', data.altNames.length]].map(([k, v]) => '<div class="mini"><h4>' + esc(k) + '</h4><div>' + esc(v) + '</div></div>').join('');
      const textCols = [{ label: 'text_id', key: 'c_textid' }, { label: '书名', key: 'c_title_chn' }, { label: '拼音/英文', key: 'c_title' }, { label: '角色', key: 'c_role_desc_chn' }, { label: '来源书目', key: 'source_title_chn' }, { label: '页码', key: 'c_pages' }, { label: '备注', key: 'c_notes' }];
      const drawText = () => { const q = byId('text-search').value.trim().toLowerCase(); const rows = data.texts.filter(r => !q || [r.c_title_chn, r.c_title, r.c_role_desc_chn, r.source_title_chn, r.c_notes].filter(Boolean).join(' ').toLowerCase().includes(q)); byId('text-table').innerHTML = table(textCols, rows); };
      byId('text-search').addEventListener('input', drawText); drawText();
      byId('source-table').innerHTML = table([{ label: 'text_id', key: 'c_textid' }, { label: '来源名称', key: 'c_title_chn' }, { label: '英文/拼音', key: 'c_title' }, { label: '定位', key: 'c_pages' }, { label: '主来源', html: r => esc(r.c_main_source === 1 ? '是' : '否') }, { label: '自传性材料', html: r => esc(r.c_self_bio === 1 ? '是' : '否') }, { label: '备注', key: 'c_notes' }], data.sources);
      byId('hit-tables').innerHTML = data.hits.map(r => '<div class="mini"><h4>' + esc(r.table) + ' (' + esc(r.rows) + ')</h4><div>' + esc(r.description) + '</div></div>').join('');
      byId('indirect-tables').innerHTML = data.indirectTables.map(r => '<div class="mini"><h4>' + esc(r.table) + '</h4><div>' + esc(r.via) + ' · ' + esc(r.role) + '</div></div>').join('');
      byId('glossary-table').innerHTML = table([{ label: '字段名', key: 'field' }, { label: '中文解释', key: 'cn' }, { label: '判断依据', key: 'basis' }, { label: '可信度', key: 'confidence' }], data.glossary);
      const rawDefs = [['BIOG_MAIN', [data.person], Object.keys(data.person)], ['ALTNAME_DATA', data.altNames, ['c_alt_name_chn','c_alt_name','c_name_type_desc_chn','source_title_chn','c_pages']], ['KIN_DATA', data.kin, ['c_kin_id','kin_name_chn','c_kinrel_chn','source_title_chn','c_notes']], ['STATUS_DATA', data.statuses, ['c_status_desc_chn','c_status_desc','c_firstyear','c_lastyear','source_title_chn']], ['ENTRY_DATA', data.entries, ['c_sequence','c_entry_desc_chn','c_year','c_age','entry_addr_chn','c_posting_notes','source_title_chn']], ['BIOG_ADDR_DATA', data.addresses, ['c_sequence','addr_name_chn','c_addr_desc_chn','c_firstyear','c_lastyear','source_title_chn','c_notes']], ['POSTED_TO_OFFICE_DATA', data.offices, ['c_posting_id','c_office_chn','c_firstyear','c_lastyear','addr_name_chn','c_appt_desc_chn','source_title_chn']], ['ASSOC_DATA', data.assocRows, ['c_assoc_type_desc_chn','c_assoc_desc_chn','assoc_name_chn','c_assoc_id','c_assoc_first_year','c_assoc_last_year','source_title_chn','c_notes']], ['BIOG_TEXT_DATA', data.texts, ['c_textid','c_title_chn','c_role_desc_chn','source_title_chn','c_pages']], ['BIOG_SOURCE_DATA', data.sources, ['c_textid','c_title_chn','c_pages','c_main_source','c_self_bio','c_notes']]];
      byId('raw-box').innerHTML = rawDefs.map(([name, rows, cols]) => '<details><summary>' + esc(name) + ' · ' + esc(rows.length) + ' 条</summary><div class="body"><div class="table">' + table(cols.map(c => ({ label: c, key: c })), rows) + '</div></div></details>').join('');
    }
    render();
    renderNetwork();
    renderCoreTables();
    renderAssocTextsAndLists();
  </script>
</body>
</html>`;
}

const dataset = buildDataset(PERSON_ID);
fs.mkdirSync(PERSON_OUTPUT_DIR, { recursive: true });
fs.writeFileSync(JSON_PATH, JSON.stringify(dataset, null, 2), 'utf8');
fs.writeFileSync(HTML_PATH, buildHtml(dataset), 'utf8');

console.log(JSON.stringify({
  personId: PERSON_ID,
  name: dataset.person.c_name_chn,
  html: path.basename(HTML_PATH),
  json: path.basename(JSON_PATH),
  directTables: dataset.hits.length,
  assocRows: dataset.assocRows.length
}, null, 2));
