const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT_DIR, 'data', 'latest.db');
const PERSON_ID = Number(process.argv[2] || 3767);
const PERSON_OUTPUT_DIR = path.join(ROOT_DIR, 'outputs', 'person', String(PERSON_ID));
const HTML_PATH = path.join(PERSON_OUTPUT_DIR, `person-${PERSON_ID}-gis-timeline.html`);
const JSON_PATH = path.join(PERSON_OUTPUT_DIR, `person-${PERSON_ID}-gis-timeline.json`);

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
  return clean(value) || fallback;
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function toYear(value) {
  if (value === null || value === undefined || value === '' || value === 0) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRange(start, end, person) {
  let a = toYear(start);
  let b = toYear(end);
  let anomaly = '';
  const upperBound = person?.c_deathyear ? Number(person.c_deathyear) + 150 : null;

  const fixLikelyCenturyError = (year) => {
    if (year === null) return null;
    if (upperBound !== null && year > upperBound && year >= 1900 && year < 2000) {
      anomaly = anomaly || '检测到疑似世纪录入错误，已按人物生卒范围做温和修正';
      return year - 900;
    }
    return year;
  };

  a = fixLikelyCenturyError(a);
  b = fixLikelyCenturyError(b);

  if (a === null && b === null) return { start: null, end: null, anomaly };
  if (a === null) a = b;
  if (b === null) b = a;
  if (a > b) {
    anomaly = anomaly || '原始起止年顺序异常，已按较小年至较大年展示';
    [a, b] = [b, a];
  }
  return { start: a, end: b, anomaly };
}

function extractRows(personId) {
  const person = get(
    `
      SELECT
        b.c_personid,
        b.c_name,
        b.c_name_chn,
        b.c_birthyear,
        b.c_deathyear,
        d.c_dynasty_chn,
        a.c_name_chn AS index_addr_chn,
        a.c_name AS index_addr
      FROM BIOG_MAIN b
      LEFT JOIN DYNASTIES d ON b.c_dy = d.c_dy
      LEFT JOIN ADDR_CODES a ON b.c_index_addr_id = a.c_addr_id
      WHERE b.c_personid = ?
    `,
    personId
  );

  if (!person) {
    throw new Error(`未找到 c_personid = ${personId} 的人物`);
  }

  const rows = [
    ...all(
      `
        SELECT
          'BIOG_MAIN' AS source_table,
          '索引地' AS dimension,
          '索引地 / 基本地址' AS category,
          b.c_index_addr_id AS c_addr_id,
          a.c_name_chn,
          a.c_name,
          a.c_admin_type,
          a.x_coord,
          a.y_coord,
          b.c_index_year AS raw_start_year,
          b.c_index_year AS raw_end_year,
          NULL AS source_title_chn,
          NULL AS note,
          NULL AS extra_title,
          NULL AS extra_desc,
          NULL AS seq
        FROM BIOG_MAIN b
        LEFT JOIN ADDR_CODES a ON b.c_index_addr_id = a.c_addr_id
        WHERE b.c_personid = ?
      `,
      personId
    ),
    ...all(
      `
        SELECT
          'BIOG_ADDR_DATA' AS source_table,
          '生平地点' AS dimension,
          COALESCE(c.c_addr_desc_chn, '地点记录') AS category,
          d.c_addr_id,
          a.c_name_chn,
          a.c_name,
          a.c_admin_type,
          a.x_coord,
          a.y_coord,
          d.c_firstyear AS raw_start_year,
          d.c_lastyear AS raw_end_year,
          t.c_title_chn AS source_title_chn,
          d.c_notes AS note,
          NULL AS extra_title,
          NULL AS extra_desc,
          d.c_sequence AS seq
        FROM BIOG_ADDR_DATA d
        LEFT JOIN ADDR_CODES a ON d.c_addr_id = a.c_addr_id
        LEFT JOIN BIOG_ADDR_CODES c ON d.c_addr_type = c.c_addr_type
        LEFT JOIN TEXT_CODES t ON d.c_source = t.c_textid
        WHERE d.c_personid = ?
        ORDER BY d.c_sequence, d.c_firstyear, d.c_addr_id
      `,
      personId
    ),
    ...all(
      `
        SELECT
          'ENTRY_DATA' AS source_table,
          '入仕地点' AS dimension,
          '入仕 / 科举地点' AS category,
          e.c_entry_addr_id AS c_addr_id,
          a.c_name_chn,
          a.c_name,
          a.c_admin_type,
          a.x_coord,
          a.y_coord,
          e.c_year AS raw_start_year,
          e.c_year AS raw_end_year,
          t.c_title_chn AS source_title_chn,
          e.c_notes AS note,
          COALESCE(ec.c_entry_desc_chn, '入仕方式未详') AS extra_title,
          e.c_posting_notes AS extra_desc,
          e.c_sequence AS seq
        FROM ENTRY_DATA e
        LEFT JOIN ADDR_CODES a ON e.c_entry_addr_id = a.c_addr_id
        LEFT JOIN ENTRY_CODES ec ON e.c_entry_code = ec.c_entry_code
        LEFT JOIN TEXT_CODES t ON e.c_source = t.c_textid
        WHERE e.c_personid = ?
        ORDER BY e.c_sequence, e.c_year
      `,
      personId
    ),
    ...all(
      `
        SELECT
          'POSTED_TO_OFFICE_DATA' AS source_table,
          '任官地点' AS dimension,
          COALESCE(cat.c_category_desc_chn, '任官记录') AS category,
          pa.c_addr_id,
          a.c_name_chn,
          a.c_name,
          a.c_admin_type,
          a.x_coord,
          a.y_coord,
          p.c_firstyear AS raw_start_year,
          p.c_lastyear AS raw_end_year,
          t.c_title_chn AS source_title_chn,
          p.c_notes AS note,
          COALESCE(oc.c_office_chn, oc.c_office_pinyin, '官职未详') AS extra_title,
          TRIM(
            COALESCE(ap.c_appt_desc_chn, '') ||
            CASE
              WHEN apt.c_appt_type_desc_chn IS NOT NULL AND apt.c_appt_type_desc_chn <> ''
                THEN ' / ' || apt.c_appt_type_desc_chn
              ELSE ''
            END
          ) AS extra_desc,
          p.c_sequence AS seq
        FROM POSTED_TO_OFFICE_DATA p
        JOIN POSTED_TO_ADDR_DATA pa
          ON p.c_posting_id = pa.c_posting_id
         AND p.c_personid = pa.c_personid
         AND p.c_office_id = pa.c_office_id
        LEFT JOIN ADDR_CODES a ON pa.c_addr_id = a.c_addr_id
        LEFT JOIN OFFICE_CODES oc ON p.c_office_id = oc.c_office_id
        LEFT JOIN APPOINTMENT_CODES ap ON CAST(p.c_appt_code AS INTEGER) = ap.c_appt_code
        LEFT JOIN APPOINTMENT_TYPES apt ON CAST(p.c_appt_type_code AS TEXT) = apt.c_appt_type_code
        LEFT JOIN OFFICE_CATEGORIES cat ON p.c_office_category_id = cat.c_office_category_id
        LEFT JOIN TEXT_CODES t ON p.c_source = t.c_textid
        WHERE p.c_personid = ?
        ORDER BY p.c_firstyear, p.c_sequence, p.c_posting_id
      `,
      personId
    ),
    ...all(
      `
        SELECT
          'ASSOC_DATA' AS source_table,
          '关系发生地' AS dimension,
          COALESCE(ac.c_assoc_desc_chn, '关系地点') AS category,
          ad.c_addr_id,
          a.c_name_chn,
          a.c_name,
          a.c_admin_type,
          a.x_coord,
          a.y_coord,
          ad.c_assoc_first_year AS raw_start_year,
          ad.c_assoc_last_year AS raw_end_year,
          t.c_title_chn AS source_title_chn,
          ad.c_notes AS note,
          bm.c_name_chn AS extra_title,
          ad.c_text_title AS extra_desc,
          ad.c_sequence AS seq
        FROM ASSOC_DATA ad
        LEFT JOIN ADDR_CODES a ON ad.c_addr_id = a.c_addr_id
        LEFT JOIN ASSOC_CODES ac ON ad.c_assoc_code = ac.c_assoc_code
        LEFT JOIN BIOG_MAIN bm ON ad.c_assoc_id = bm.c_personid
        LEFT JOIN TEXT_CODES t ON ad.c_source = t.c_textid
        WHERE ad.c_personid = ? AND ad.c_addr_id IS NOT NULL AND ad.c_addr_id > 0
        ORDER BY ad.c_assoc_first_year, ad.c_sequence, ad.c_addr_id
      `,
      personId
    )
  ];

  return { person, rows };
}

function buildDataset(personId) {
  const { person, rows } = extractRows(personId);

  const events = rows.map((row, index) => {
    const range = normalizeRange(row.raw_start_year, row.raw_end_year, person);
    const hasCoord =
      row.x_coord !== null &&
      row.y_coord !== null &&
      Number(row.x_coord) !== 0 &&
      Number(row.y_coord) !== 0;
    const hasTime = range.start !== null || range.end !== null;
    const title =
      row.dimension === '任官地点' || row.dimension === '入仕地点'
        ? `${label(row.extra_title, '事件')} @ ${label(row.c_name_chn || row.c_name)}`
        : label(row.c_name_chn || row.c_name);

    return {
      event_id: `${row.source_table}-${index + 1}`,
      source_table: row.source_table,
      dimension: row.dimension,
      category: row.category,
      c_addr_id: row.c_addr_id,
      addr_name_chn: label(row.c_name_chn || row.c_name),
      addr_name: label(row.c_name),
      admin_type: label(row.c_admin_type),
      x_coord: hasCoord ? Number(row.x_coord) : null,
      y_coord: hasCoord ? Number(row.y_coord) : null,
      raw_start_year: toYear(row.raw_start_year),
      raw_end_year: toYear(row.raw_end_year),
      start_year: range.start,
      end_year: range.end,
      year_label: hasTime ? `${range.start ?? '?'} - ${range.end ?? '?'}` : '时间未详',
      anomaly: range.anomaly,
      title,
      extra_title: label(row.extra_title, ''),
      extra_desc: label(row.extra_desc, ''),
      note: label(row.note, ''),
      source_title_chn: label(row.source_title_chn, ''),
      seq: row.seq ?? null,
      has_coord: hasCoord,
      has_time: hasTime
    };
  });

  const timedEvents = events.filter((event) => event.has_time);
  const mappedEvents = timedEvents.filter((event) => event.has_coord);

  if (!mappedEvents.length) {
    throw new Error(`c_personid = ${personId} 没有“明确时间 + 有效坐标”的地点记录`);
  }

  const years = mappedEvents.flatMap((event) => [event.start_year, event.end_year]).filter((year) => year !== null);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  const routePoints = mappedEvents
    .filter((event) => event.source_table === 'BIOG_ADDR_DATA')
    .sort((a, b) => {
      if (a.start_year !== b.start_year) return a.start_year - b.start_year;
      return (a.seq ?? 9999) - (b.seq ?? 9999);
    })
    .map((event) => ({
      event_id: event.event_id,
      c_addr_id: event.c_addr_id,
      addr_name_chn: event.addr_name_chn,
      start_year: event.start_year,
      end_year: event.end_year,
      seq: event.seq,
      x_coord: event.x_coord,
      y_coord: event.y_coord,
      category: event.category
    }));

  const timelineCounts = [];
  for (let year = minYear; year <= maxYear; year++) {
    timelineCounts.push({
      year,
      count: mappedEvents.filter((event) => event.start_year <= year && year <= event.end_year).length
    });
  }

  return {
    meta: {
      personId,
      generatedAt: new Date().toISOString(),
      html: path.basename(HTML_PATH),
      db: path.basename(DB_PATH)
    },
    person,
    summary: {
      displayedEvents: mappedEvents.length,
      filteredOutUntimed: events.filter((event) => !event.has_time).length,
      filteredOutNoCoord: timedEvents.filter((event) => !event.has_coord).length,
      minYear,
      maxYear,
      dimensions: [...new Set(mappedEvents.map((event) => event.dimension))],
      sourceTables: [...new Set(mappedEvents.map((event) => event.source_table))]
    },
    events: mappedEvents,
    routePoints,
    timelineCounts
  };
}

function buildHtml(dataset) {
  const dataJson = safeJson(dataset);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${dataset.person.c_name_chn} 时空 GIS 可视化</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
  <style>
    :root{--bg:#f5efe4;--panel:rgba(255,252,247,.96);--line:rgba(77,90,108,.18);--text:#1c2430;--muted:#5d6775;--accent:#9d3f22;--index:#c76a12;--biog:#1e6b8f;--entry:#2d8b57;--office:#7a52c7;--assoc:#b44b59;--shadow:0 16px 40px rgba(40,30,18,.10)}
    *{box-sizing:border-box}body{margin:0;font:14px/1.7 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--text);background:radial-gradient(circle at top left,rgba(157,63,34,.08),transparent 28%),linear-gradient(180deg,#f7f1e8,#f1eadf)}h1,h2,h3,h4,p{margin:0}
    .app{display:grid;grid-template-columns:340px minmax(0,1fr) 420px;min-height:100vh}.left,.right{padding:20px;background:rgba(248,242,233,.9);overflow:auto}.left{border-right:1px solid var(--line)}.right{border-left:1px solid var(--line)}.center{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;min-width:0}
    .card{margin:16px;background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);padding:18px}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);font-weight:700}.muted{color:var(--muted)}.small{font-size:12px}.mono{font-family:Consolas,"SFMono-Regular",monospace}
    .stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.stat{padding:12px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.68)}.stat strong{display:block;margin-top:6px;font-size:24px}
    .chips,.source-row,.event-meta{display:flex;flex-wrap:wrap;gap:8px}.chips{margin-top:12px}.chip,.badge{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.78);color:var(--muted);font-size:12px}.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
    .legend{margin-top:12px;padding:12px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.68)}.group{margin-top:14px;padding-top:14px;border-top:1px dashed var(--line)}.group:first-child{margin-top:0;padding-top:0;border-top:0}.list{display:grid;gap:8px}.list label{display:flex;gap:8px;align-items:center;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.6)}
    button{border:1px solid var(--line);background:rgba(255,255,255,.82);border-radius:12px;padding:8px 12px;cursor:pointer;font:inherit}input[type="range"]{width:100%;margin-top:14px}
    .timeline-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.timeline-actions{display:flex;gap:10px;flex-wrap:wrap}.year-wrap{display:flex;gap:12px;align-items:center;margin-top:8px;flex-wrap:wrap}
    .year-pill{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:999px;background:rgba(157,63,34,.12);color:var(--accent);font-size:20px;font-weight:700;min-width:90px;text-align:center;transition:transform .45s ease,box-shadow .45s ease,background-color .45s ease}.year-pill.changed{transform:translateY(-2px) scale(1.04);box-shadow:0 10px 24px rgba(157,63,34,.18);background:rgba(157,63,34,.18)}.transition-note{min-height:20px;color:var(--accent);font-size:12px;font-weight:600}
    .progress-track{position:relative;height:12px;margin-top:14px;border-radius:999px;background:rgba(30,107,143,.08);overflow:hidden;border:1px solid rgba(30,107,143,.10)}.progress-fill{position:absolute;inset:0 auto 0 0;width:0%;background:linear-gradient(90deg,rgba(30,107,143,.75),rgba(157,63,34,.72));transition:width .5s ease}.progress-pin{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid var(--accent);transform:translate(-50%,-50%);box-shadow:0 0 0 5px rgba(157,63,34,.10);transition:left .5s ease}
    .timeline-meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.meta-pill{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.72);border:1px solid var(--line);color:var(--muted);font-size:12px}
    .hist{display:grid;grid-template-columns:repeat(auto-fit,minmax(6px,1fr));gap:2px;align-items:end;height:88px;margin-top:14px;padding:10px 8px 0;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.62)}.bar{border-radius:8px 8px 0 0;background:linear-gradient(180deg,rgba(30,107,143,.8),rgba(157,63,34,.72));opacity:.35;cursor:pointer;transition:opacity .25s ease,transform .25s ease}.bar.active{opacity:1;transform:translateY(-2px);outline:1px solid rgba(157,63,34,.2)}.hist-years{display:flex;justify-content:space-between;margin-top:6px;color:var(--muted);font-size:12px}
    #map{margin:0 16px;border-radius:22px;border:1px solid var(--line);min-height:560px;overflow:hidden;box-shadow:var(--shadow)}.journey-card{margin-top:12px;padding:14px;border-radius:16px;background:linear-gradient(135deg,rgba(30,107,143,.08),rgba(157,63,34,.10)),rgba(255,255,255,.78);border:1px solid rgba(30,107,143,.12)}.journey-card strong{display:block;font-size:16px;margin-top:4px}
    .events,.details{display:grid;gap:10px;margin-top:14px}.event,.detail{padding:14px;border-radius:16px;border:1px solid var(--line);background:rgba(255,255,255,.72);animation:fadeIn .35s ease}.event.current-stop{border-color:rgba(157,63,34,.32);box-shadow:0 12px 24px rgba(157,63,34,.10);background:linear-gradient(135deg,rgba(157,63,34,.08),rgba(255,255,255,.82)),rgba(255,255,255,.82)}@keyframes fadeIn{from{opacity:.45;transform:translateY(4px)}to{opacity:1;transform:none}}.event h4,.detail h4{margin-bottom:6px}.kv{display:grid;grid-template-columns:86px minmax(0,1fr);gap:8px;padding:4px 0;font-size:13px}.kv b{color:var(--muted)}.empty{padding:8px 0;color:var(--muted)}
    .marker{position:relative;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--g);width:var(--s);height:var(--s);box-shadow:0 8px 18px rgba(0,0,0,.18);transition:transform .35s ease,filter .35s ease,opacity .35s ease}.marker::after{content:"";position:absolute;inset:5px;border-radius:50%;background:rgba(255,255,255,.92);border:1px solid rgba(28,36,48,.12)}.marker::before{content:"";position:absolute;inset:-4px;border-radius:50%;background:rgba(255,255,255,.2)}.marker.is-current{transform:scale(1.14);filter:drop-shadow(0 0 14px rgba(157,63,34,.28))}.marker.is-current::before{background:rgba(157,63,34,.14);animation:pulse 1.8s ease-out infinite}.core{position:relative;width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 0 2px rgba(255,255,255,.9);z-index:1}@keyframes pulse{0%{transform:scale(.88);opacity:.85}75%{transform:scale(1.28);opacity:.12}100%{transform:scale(1.32);opacity:0}}
    .leaflet-popup-content{margin:14px 16px}@media (max-width:1280px){.app{grid-template-columns:320px minmax(0,1fr)}.right{grid-column:1/-1;border-left:0;border-top:1px solid var(--line)}}@media (max-width:900px){.app{grid-template-columns:1fr}.left{border-right:0;border-bottom:1px solid var(--line)}.right{border-top:1px solid var(--line)}}
  </style>
</head>
<body>
  <div class="app">
    <aside class="left">
      <div class="card">
        <div class="eyebrow">GIS 时间地图</div>
        <h1 id="hero-name" style="margin-top:8px;font-size:32px"></h1>
        <p id="hero-sub" class="muted" style="margin-top:8px"></p>
        <div class="stats" id="stats"></div>
        <div class="chips">
          <span class="chip"><span class="dot" style="background:var(--index)"></span>索引地</span>
          <span class="chip"><span class="dot" style="background:var(--biog)"></span>生平地点</span>
          <span class="chip"><span class="dot" style="background:var(--entry)"></span>入仕地点</span>
          <span class="chip"><span class="dot" style="background:var(--office)"></span>任官地点</span>
          <span class="chip"><span class="dot" style="background:var(--assoc)"></span>关系发生地</span>
        </div>
        <div class="legend small muted">只显示“有明确时间且有坐标”的记录。地图点位使用彩色环形标记，当前年份停留地点会单独高亮，生平路径会按年份逐步亮起。</div>
      </div>

      <div class="card">
        <div class="group">
          <h3>时间模式</h3>
          <div class="list">
            <label><input type="radio" name="mode" value="active" checked> 只显示当前年份有效事件</label>
            <label><input type="radio" name="mode" value="cumulative"> 累积显示截至当前年份事件</label>
            <label><input type="radio" name="mode" value="all"> 忽略年份，显示全部有时间事件</label>
          </div>
        </div>
        <div class="group"><h3>维度筛选</h3><div id="dims" class="list"></div></div>
        <div class="group"><h3>来源表筛选</h3><div id="tables" class="list"></div></div>
        <div class="group">
          <h3>其他</h3>
          <div class="list">
            <label><input id="toggle-route" type="checkbox" checked> 显示生平路径线</label>
            <label><input id="toggle-anomaly" type="checkbox" checked> 显示时间修正提示</label>
          </div>
        </div>
      </div>
    </aside>

    <main class="center">
      <div class="card">
        <div class="timeline-head">
          <div>
            <div class="eyebrow">时间轴</div>
            <div class="year-wrap">
              <div id="year-pill" class="year-pill"></div>
              <div>
                <div id="year-summary" class="muted"></div>
                <div id="transition-note" class="transition-note"></div>
              </div>
            </div>
          </div>
          <div class="timeline-actions">
            <button id="prev">上一年</button>
            <button id="play">播放</button>
            <button id="next">下一年</button>
            <button id="fit">全局视野</button>
          </div>
        </div>

        <div class="progress-track"><div id="progress-fill" class="progress-fill"></div><div id="progress-pin" class="progress-pin"></div></div>
        <div class="timeline-meta">
          <span id="timeline-mode" class="meta-pill"></span>
          <span id="timeline-window" class="meta-pill"></span>
          <span id="timeline-route" class="meta-pill"></span>
        </div>
        <input id="range" type="range">
        <div id="hist" class="hist"></div>
        <div class="hist-years"><span id="hist-min"></span><span id="hist-max"></span></div>

        <div class="journey-card">
          <div class="eyebrow">当前停留</div>
          <strong id="journey-stop">正在识别</strong>
          <p id="journey-desc" class="muted" style="margin-top:6px"></p>
        </div>
      </div>

      <div id="map"></div>

      <div class="card">
        <div class="eyebrow">当前年份事件</div>
        <h2 style="margin-top:8px">地图点位与时序事件</h2>
        <p class="muted" style="margin-top:8px">点击地图点位后，右侧会同步展示该地点在当前筛选条件下的详细信息。</p>
        <div id="events" class="events"></div>
      </div>
    </main>

    <aside class="right">
      <div class="card">
        <div class="eyebrow">详情面板</div>
        <h2 id="detail-title" style="margin-top:8px">请选择地图点位</h2>
        <p id="detail-sub" class="muted" style="margin-top:8px">点击地图上的某个地点后，这里会展示该地点的事件明细。</p>
        <div id="detail-source" class="source-row" style="margin-top:12px"></div>
        <div id="details" class="details"></div>
      </div>
    </aside>
  </div>

  <script id="dataset" type="application/json">${dataJson}</script>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <script>
    const dataset = JSON.parse(document.getElementById('dataset').textContent);
    const COLORS = { BIOG_MAIN:'#c76a12', BIOG_ADDR_DATA:'#1e6b8f', ENTRY_DATA:'#2d8b57', POSTED_TO_OFFICE_DATA:'#7a52c7', ASSOC_DATA:'#b44b59' };
    const LABELS = { BIOG_MAIN:'BIOG_MAIN / 索引地', BIOG_ADDR_DATA:'BIOG_ADDR_DATA / 生平地点', ENTRY_DATA:'ENTRY_DATA / 入仕地点', POSTED_TO_OFFICE_DATA:'POSTED_TO_OFFICE_DATA / 任官地点', ASSOC_DATA:'ASSOC_DATA / 关系发生地' };
    const state = { year:dataset.summary.minYear, previousYear:dataset.summary.minYear, playing:false, mode:'active', dims:new Set(dataset.summary.dimensions), tables:new Set(dataset.summary.sourceTables), selected:null, timer:null };
    const $ = (id) => document.getElementById(id);
    const esc = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const txt = (value, fallback='未详') => String(value ?? '').trim() || fallback;
    const sourceLabel = (key) => LABELS[key] || key;
    const matches = (event) => state.dims.has(event.dimension) && state.tables.has(event.source_table);
    const inTime = (event) => state.mode === 'all' ? true : (state.mode === 'active' ? (event.start_year <= state.year && state.year <= event.end_year) : (event.start_year <= state.year));
    const eligibleEvents = () => dataset.events.filter(matches);
    const visibleEvents = () => eligibleEvents().filter(inTime);

    function sortEvents(rows) {
      return [...rows].sort((a, b) => (a.start_year - b.start_year) || (a.end_year - b.end_year) || ((a.seq ?? 9999) - (b.seq ?? 9999)) || String(a.addr_name_chn).localeCompare(String(b.addr_name_chn), 'zh-CN'));
    }

    function grouped(rows) {
      const map = new Map();
      for (const event of rows) {
        if (!map.has(event.c_addr_id)) {
          map.set(event.c_addr_id, { c_addr_id:event.c_addr_id, addr_name_chn:event.addr_name_chn, admin_type:event.admin_type, x_coord:event.x_coord, y_coord:event.y_coord, events:[] });
        }
        map.get(event.c_addr_id).events.push(event);
      }
      return [...map.values()].sort((a, b) => (b.events.length - a.events.length) || a.addr_name_chn.localeCompare(b.addr_name_chn, 'zh-CN'));
    }

    function activeEventsForYear() {
      return eligibleEvents().filter((event) => event.start_year <= state.year && state.year <= event.end_year);
    }

    function currentStopEvent() {
      const active = activeEventsForYear();
      const biog = sortEvents(active.filter((event) => event.source_table === 'BIOG_ADDR_DATA'));
      if (biog.length) return biog[biog.length - 1];
      const index = sortEvents(active.filter((event) => event.source_table === 'BIOG_MAIN'));
      if (index.length) return index[index.length - 1];
      const fallback = sortEvents(visibleEvents());
      return fallback.length ? fallback[fallback.length - 1] : null;
    }

    function currentStopAddrId() {
      const stop = currentStopEvent();
      return stop ? stop.c_addr_id : null;
    }

    function routeSeries() {
      if (!state.dims.has('生平地点') || !state.tables.has('BIOG_ADDR_DATA')) return [];
      return dataset.routePoints;
    }

    function routeState() {
      const points = routeSeries();
      if (!$('toggle-route').checked || !points.length) return { all:[], traveled:[], highlight:[], current:null };
      if (state.mode === 'all') return { all:points, traveled:points, highlight:points.slice(-2), current:points[points.length - 1] || null };
      const traveled = points.filter((point) => point.start_year <= state.year);
      const highlight = traveled.length >= 2 ? traveled.slice(-2) : traveled.slice();
      const activeCurrent = points.find((point) => point.start_year <= state.year && state.year <= point.end_year) || traveled[traveled.length - 1] || null;
      return { all:points, traveled, highlight, current:activeCurrent };
    }

    function gradient(group) {
      const counts = new Map();
      group.events.forEach((event) => counts.set(event.source_table, (counts.get(event.source_table) || 0) + 1));
      let degree = 0;
      const parts = [];
      for (const [sourceTable, count] of counts.entries()) {
        const next = degree + (count / group.events.length) * 360;
        parts.push((COLORS[sourceTable] || '#888') + ' ' + degree + 'deg ' + next + 'deg');
        degree = next;
      }
      return 'conic-gradient(' + parts.join(',') + ')';
    }

    function markerSize(group) {
      return Math.min(40, 22 + Math.max(0, group.events.length - 1) * 3);
    }

    function markerHtml(group, isCurrent) {
      const size = markerSize(group);
      const color = COLORS[group.events[0].source_table] || '#666';
      return '<div class="marker ' + (isCurrent ? 'is-current' : '') + '" style="--s:' + size + 'px;--c:' + color + ';--g:' + gradient(group) + '"><div class="core"></div></div>';
    }

    function popupHtml(group, isCurrent) {
      const bySource = [...group.events.reduce((map, event) => {
        map.set(event.source_table, (map.get(event.source_table) || 0) + 1);
        return map;
      }, new Map()).entries()];

      return [
        '<strong>' + esc(group.addr_name_chn) + (isCurrent ? ' · 当前停留点' : '') + '</strong>',
        '<div class="small" style="margin-top:6px;color:#5d6775">地点 ID：' + esc(group.c_addr_id) + ' · 行政类型：' + esc(group.admin_type) + '</div>',
        '<div style="margin-top:8px">当前筛选下共有 <strong>' + group.events.length + '</strong> 条事件</div>',
        '<div style="margin-top:8px">' +
          bySource.map(([key, count]) =>
            '<div class="small" style="margin-top:5px;color:#5d6775"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' +
            (COLORS[key] || '#888') + ';margin-right:6px"></span>' + esc(sourceLabel(key)) + '：' + count + ' 条</div>'
          ).join('') +
        '</div>'
      ].join('');
    }

    function setYear(nextYear) {
      state.previousYear = state.year;
      state.year = Math.max(dataset.summary.minYear, Math.min(dataset.summary.maxYear, nextYear));
    }

    function renderStats() {
      $('hero-name').textContent = dataset.person.c_name_chn + ' 时空 GIS 可视化';
      $('hero-sub').textContent = txt(dataset.person.c_name) + ' · ' + txt(dataset.person.c_dynasty_chn) + ' · 索引地：' + txt(dataset.person.index_addr_chn);
      $('stats').innerHTML = [
        ['展示事件', dataset.summary.displayedEvents],
        ['时间范围', dataset.summary.minYear + ' - ' + dataset.summary.maxYear],
        ['已过滤未定年', dataset.summary.filteredOutUntimed],
        ['已过滤无坐标', dataset.summary.filteredOutNoCoord]
      ].map(([key, value]) => '<div class="stat"><div class="muted">' + esc(key) + '</div><strong>' + esc(value) + '</strong></div>').join('');
    }

    function renderFilters() {
      $('dims').innerHTML = dataset.summary.dimensions.map((dimension) => '<label><input type="checkbox" data-d="' + esc(dimension) + '" checked> ' + esc(dimension) + '</label>').join('');
      $('tables').innerHTML = dataset.summary.sourceTables.map((table) => '<label><input type="checkbox" data-t="' + esc(table) + '" checked> ' + esc(sourceLabel(table)) + '</label>').join('');

      document.querySelectorAll('[data-d]').forEach((input) => {
        input.addEventListener('change', () => {
          if (input.checked) state.dims.add(input.dataset.d);
          else state.dims.delete(input.dataset.d);
          rerender(true);
        });
      });

      document.querySelectorAll('[data-t]').forEach((input) => {
        input.addEventListener('change', () => {
          if (input.checked) state.tables.add(input.dataset.t);
          else state.tables.delete(input.dataset.t);
          rerender(true);
        });
      });

      document.querySelectorAll('input[name="mode"]').forEach((input) => {
        input.addEventListener('change', () => {
          if (input.checked) {
            state.mode = input.value;
            rerender(false);
          }
        });
      });
    }

    function animateYearPill() {
      const pill = $('year-pill');
      pill.classList.remove('changed');
      void pill.offsetWidth;
      pill.classList.add('changed');
      setTimeout(() => pill.classList.remove('changed'), 460);
    }

    function renderTimeline() {
      const visible = visibleEvents();
      const route = routeState();
      const progress = ((state.year - dataset.summary.minYear) / Math.max(1, dataset.summary.maxYear - dataset.summary.minYear)) * 100;

      $('range').min = dataset.summary.minYear;
      $('range').max = dataset.summary.maxYear;
      $('range').step = 1;
      $('range').value = state.year;
      $('year-pill').textContent = state.year;
      $('year-summary').textContent = '当前筛选下可见 ' + visible.length + ' 条事件。';
      $('transition-note').textContent = state.previousYear !== state.year ? '年份过渡：' + state.previousYear + ' → ' + state.year : '拖动时间轴或点击播放，可观看迁徙演化过程。';

      $('progress-fill').style.width = progress + '%';
      $('progress-pin').style.left = progress + '%';
      $('timeline-mode').textContent = '时间模式：' + (state.mode === 'active' ? '当前年份有效' : state.mode === 'cumulative' ? '截至当前年份累计' : '显示全部有时间事件');
      $('timeline-window').textContent = '年份位置：' + state.year + ' / ' + dataset.summary.maxYear;
      $('timeline-route').textContent = '已亮起路径点：' + route.traveled.length + ' / ' + route.all.length;

      const maxCount = Math.max(...dataset.timelineCounts.map((item) => item.count), 1);
      $('hist').innerHTML = dataset.timelineCounts.map((item) => {
        const height = Math.max(6, Math.round(item.count / maxCount * 78));
        return '<div class="bar ' + (item.year === state.year ? 'active' : '') + '" style="height:' + height + 'px" title="' + item.year + '：' + item.count + ' 条事件" data-year="' + item.year + '"></div>';
      }).join('');

      document.querySelectorAll('[data-year]').forEach((bar) => {
        bar.addEventListener('click', () => {
          setYear(Number(bar.dataset.year));
          rerender(false);
        });
      });

      $('hist-min').textContent = dataset.summary.minYear;
      $('hist-max').textContent = dataset.summary.maxYear;
      $('play').textContent = state.playing ? '暂停' : '播放';
    }

    const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([34.5, 108], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    const markerLayer = L.layerGroup().addTo(map);
    let routeShadowLayer = null;
    let routeTraveledLayer = null;
    let routeHighlightLayer = null;
    let routeCurrentLayer = null;

    function fitGlobal() {
      const groups = grouped(eligibleEvents());
      if (!groups.length) return;
      if (groups.length === 1) {
        map.setView([groups[0].y_coord, groups[0].x_coord], 5, { animate: false });
        return;
      }
      map.fitBounds(L.latLngBounds(groups.map((group) => [group.y_coord, group.x_coord])).pad(0.35), { animate: false, maxZoom: 5 });
    }

    function clearRouteLayers() {
      [routeShadowLayer, routeTraveledLayer, routeHighlightLayer, routeCurrentLayer].forEach((layer) => {
        if (layer) map.removeLayer(layer);
      });
      routeShadowLayer = null;
      routeTraveledLayer = null;
      routeHighlightLayer = null;
      routeCurrentLayer = null;
    }

    function renderRoute() {
      clearRouteLayers();
      const route = routeState();
      if (!$('toggle-route').checked || !route.all.length) return;

      if (route.all.length >= 2) {
        routeShadowLayer = L.polyline(route.all.map((point) => [point.y_coord, point.x_coord]), { color:'#8ca7b3', weight:2, opacity:0.25, dashArray:'4 6' }).addTo(map);
      }
      if (route.traveled.length >= 2) {
        routeTraveledLayer = L.polyline(route.traveled.map((point) => [point.y_coord, point.x_coord]), { color:'#1e6b8f', weight:4, opacity:0.78 }).addTo(map);
      }
      if (route.highlight.length >= 2) {
        routeHighlightLayer = L.polyline(route.highlight.map((point) => [point.y_coord, point.x_coord]), { color:'#c76a12', weight:6, opacity:0.92, lineCap:'round' }).addTo(map);
      }
      if (route.current) {
        routeCurrentLayer = L.circleMarker([route.current.y_coord, route.current.x_coord], { radius:10, color:'#9d3f22', weight:3, fillColor:'#fff', fillOpacity:0.98, opacity:0.9 }).addTo(map);
      }
    }

    function renderMap(refit) {
      markerLayer.clearLayers();
      renderRoute();
      const currentAddrId = currentStopAddrId();
      const groups = grouped(visibleEvents());

      groups.forEach((group) => {
        const isCurrent = group.c_addr_id === currentAddrId;
        const size = markerSize(group);
        const marker = L.marker([group.y_coord, group.x_coord], {
          icon: L.divIcon({ className:'', html:markerHtml(group, isCurrent), iconSize:[size, size], iconAnchor:[size / 2, size / 2] }),
          title: group.addr_name_chn
        });
        marker.bindPopup(popupHtml(group, isCurrent));
        marker.on('click', () => {
          state.selected = group.c_addr_id;
          renderDetails();
        });
        markerLayer.addLayer(marker);
      });

      if (refit) fitGlobal();
    }

    function renderJourneyCard() {
      const stop = currentStopEvent();
      if (!stop) {
        $('journey-stop').textContent = '当前未识别到停留点';
        $('journey-desc').textContent = '请调整筛选条件或切换年份。';
        return;
      }
      const route = routeState();
      $('journey-stop').textContent = stop.addr_name_chn;
      $('journey-desc').textContent = stop.year_label + ' · ' + stop.dimension + ' · ' + stop.category + (route.traveled.length > 1 ? ' · 迁徙路径已推进至第 ' + route.traveled.length + ' 个地点节点' : '');
    }

    function renderEvents() {
      const currentAddrId = currentStopAddrId();
      const rows = sortEvents(visibleEvents()).slice(0, 36);
      $('events').innerHTML = rows.length ? rows.map((event) => {
        const isCurrent = event.c_addr_id === currentAddrId;
        return '<div class="event ' + (isCurrent ? 'current-stop' : '') + '">' +
          '<h4>' + esc(event.title) + (isCurrent ? ' · 当前停留相关' : '') + '</h4>' +
          '<div class="event-meta">' +
            '<span class="badge">' + esc(event.dimension) + '</span>' +
            '<span class="badge">' + esc(event.category) + '</span>' +
            '<span class="badge">' + esc(event.year_label) + '</span>' +
          '</div>' +
          '<div>地点：<strong>' + esc(event.addr_name_chn) + '</strong> · 行政类型：' + esc(event.admin_type) + '</div>' +
          (event.extra_desc ? '<p style="margin-top:6px" class="muted">补充说明：' + esc(event.extra_desc) + '</p>' : '') +
          (event.note ? '<p style="margin-top:6px" class="muted">备注：' + esc(event.note) + '</p>' : '') +
          (event.source_title_chn ? '<p style="margin-top:6px" class="muted">来源：' + esc(event.source_title_chn) + '</p>' : '') +
          (($('toggle-anomaly').checked && event.anomaly) ? '<p style="margin-top:6px;color:#9d3f22">时间提示：' + esc(event.anomaly) + '</p>' : '') +
        '</div>';
      }).join('') : '<div class="empty">当前年份和筛选条件下没有可映射事件。</div>';
    }

    function renderDetails() {
      const groups = grouped(visibleEvents());
      const currentAddrId = currentStopAddrId();
      const activeGroup = groups.find((group) => group.c_addr_id === state.selected) || groups[0];

      if (!activeGroup) {
        $('detail-title').textContent = '当前没有可用点位';
        $('detail-sub').textContent = '请调整时间或筛选条件。';
        $('detail-source').innerHTML = '';
        $('details').innerHTML = '';
        return;
      }

      state.selected = activeGroup.c_addr_id;
      $('detail-title').textContent = activeGroup.addr_name_chn + (activeGroup.c_addr_id === currentAddrId ? ' · 当前停留点' : '');
      $('detail-sub').textContent = '地点 ID ' + activeGroup.c_addr_id + ' · 行政类型 ' + txt(activeGroup.admin_type) + ' · 当前筛选下共有 ' + activeGroup.events.length + ' 条事件';

      const sourceStats = [...activeGroup.events.reduce((map, event) => {
        map.set(event.source_table, (map.get(event.source_table) || 0) + 1);
        return map;
      }, new Map()).entries()];

      $('detail-source').innerHTML = sourceStats.map(([key, count]) =>
        '<span class="chip"><span class="dot" style="background:' + (COLORS[key] || '#888') + '"></span>' +
        esc(sourceLabel(key)) + '：' + count + '</span>'
      ).join('');

      $('details').innerHTML = sortEvents(activeGroup.events).map((event) =>
        '<div class="detail">' +
          '<h4>' + esc(event.title) + '</h4>' +
          '<div class="kv"><b>维度</b><span>' + esc(event.dimension) + '</span></div>' +
          '<div class="kv"><b>类别</b><span>' + esc(event.category) + '</span></div>' +
          '<div class="kv"><b>来源表</b><span class="mono">' + esc(sourceLabel(event.source_table)) + '</span></div>' +
          '<div class="kv"><b>时间</b><span>' + esc(event.year_label) + '</span></div>' +
          '<div class="kv"><b>原始年份</b><span>' + esc(String(event.raw_start_year ?? '?') + ' / ' + String(event.raw_end_year ?? '?')) + '</span></div>' +
          '<div class="kv"><b>地点</b><span>' + esc(event.addr_name_chn) + '</span></div>' +
          '<div class="kv"><b>坐标</b><span class="mono">' + esc(event.x_coord + ', ' + event.y_coord) + '</span></div>' +
          (event.extra_title ? '<div class="kv"><b>补充标题</b><span>' + esc(event.extra_title) + '</span></div>' : '') +
          (event.extra_desc ? '<div class="kv"><b>补充说明</b><span>' + esc(event.extra_desc) + '</span></div>' : '') +
          (event.source_title_chn ? '<div class="kv"><b>来源</b><span>' + esc(event.source_title_chn) + '</span></div>' : '') +
          (event.note ? '<div class="kv"><b>备注</b><span>' + esc(event.note) + '</span></div>' : '') +
          (($('toggle-anomaly').checked && event.anomaly) ? '<div class="kv"><b>时间提示</b><span style="color:#9d3f22">' + esc(event.anomaly) + '</span></div>' : '') +
        '</div>'
      ).join('');
    }

    function rerender(refit) {
      renderTimeline();
      renderJourneyCard();
      renderMap(refit);
      renderEvents();
      renderDetails();
      animateYearPill();
    }

    function stopPlayback() {
      state.playing = false;
      if (state.timer) clearInterval(state.timer);
      state.timer = null;
      $('play').textContent = '播放';
    }

    function play() {
      stopPlayback();
      state.playing = true;
      $('play').textContent = '暂停';
      state.timer = setInterval(() => {
        setYear(state.year >= dataset.summary.maxYear ? dataset.summary.minYear : state.year + 1);
        rerender(false);
      }, 1300);
    }

    renderStats();
    renderFilters();
    rerender(true);

    $('range').addEventListener('input', () => {
      setYear(Number($('range').value));
      rerender(false);
    });

    $('prev').addEventListener('click', () => {
      setYear(state.year - 1);
      rerender(false);
    });

    $('next').addEventListener('click', () => {
      setYear(state.year + 1);
      rerender(false);
    });

    $('play').addEventListener('click', () => {
      if (state.playing) stopPlayback();
      else play();
    });

    $('fit').addEventListener('click', fitGlobal);
    $('toggle-route').addEventListener('change', () => renderMap(false));
    $('toggle-anomaly').addEventListener('change', () => {
      renderEvents();
      renderDetails();
    });
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
  displayedEvents: dataset.summary.displayedEvents,
  filteredOutUntimed: dataset.summary.filteredOutUntimed,
  filteredOutNoCoord: dataset.summary.filteredOutNoCoord,
  minYear: dataset.summary.minYear,
  maxYear: dataset.summary.maxYear
}, null, 2));
