const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT_DIR, 'data', 'latest.db');
const JSON_PATH = path.join(ROOT_DIR, 'outputs', 'db', 'latest-db-analysis.json');
const HTML_PATH = path.join(ROOT_DIR, 'outputs', 'db', 'latest-db-report.html');

const db = new DatabaseSync(DB_PATH, { readonly: true });

const TABLE_SQL = `
  SELECT name, type, sql
  FROM sqlite_master
  WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
  ORDER BY type, name
`;

const CATEGORY_RULES = [
  { test: /^BIOG_|^ALTNAME_|^KIN_|^ASSOC_|^ENTRY_|^STATUS_|^MERGED_PERSON_/, category: '人物', description: '围绕人物主体的生平、亲属、别名、社会关系、入仕与状态信息。' },
  { test: /^ADDR_|_ADDR$|_ADDR_/, category: '地理', description: '地点、行政区、地址归属及地点挂接信息。' },
  { test: /^OFFICE_|^POSTING_|^POSTED_|^APPOINT_|^ASSUME_OFFICE_/, category: '职官', description: '官职目录、任命类型、任职记录与赴任地点。' },
  { test: /^TEXT_|^BIOG_TEXT_|^TEXT_INSTANCE_|^TEXT_ROLE_/, category: '文献', description: '书目、文本实例、人物在文本中的角色与文献来源。' },
  { test: /^SOCIAL_INSTITUTION_|^BIOG_INST_/, category: '机构', description: '社会机构、机构名称、机构地址和人物机构经历。' },
  { test: /^EVENT_|^EVENTS_/, category: '事件', description: '人物事件、事件代码以及事件发生地点。' },
  { test: /^ADMIN_|^COUNTRY_|^DYNASTIES$|^NIAN_HAO$|^GANZHI_|^YEAR_RANGE_|^INDEXYEAR_|^EXTANT_|^MEASURE_|^CHORONYM_|^ETHNICITY_/, category: '基础代码', description: '时间、朝代、民族、方位等基础字典或辅助编码。' },
];

const SPECIAL_SUMMARIES = {
  BIOG_MAIN: '人物主表，存储姓名、性别、索引年、籍贯、族属、出生卒年、活动年代与备注等核心生平字段，是整库的人物中心实体。',
  BIOG_ADDR_DATA: '人物与地点关系事实表，记录人物与地址之间的关系类型、时序、时间范围、来源与备注。',
  BIOG_INST_DATA: '人物与机构关系表，描述人物在某机构中的角色、时间范围和文献来源。',
  BIOG_SOURCE_DATA: '人物与文献来源的连接表，把人物记录关联到文献及其页码来源。',
  BIOG_TEXT_DATA: '人物与文本角色表，记录人物在具体文本中的角色、顺序、来源与备注。',
  ALTNAME_DATA: '人物别名事实表，保存人物的别名、中文写法、别名类型以及出处信息。',
  ALTNAME_CODES: '别名类型代码表，定义人物别名的分类名称。',
  KIN_DATA: '人物亲属关系事实表，以人物和亲属对象为中心记录亲属关系代码、来源与备注。',
  KINSHIP_CODES: '亲属关系代码表，定义父子、兄弟等关系类别及其属性。',
  ASSOC_DATA: '人物社会关系/交往事实表，记录人物之间的交往、社交、师承等关系及时间、文本题名与来源。',
  ASSOC_CODES: '社会关系代码表，定义关系项本身及其说明。',
  ASSOC_TYPES: '社会关系类型表，对关系代码做更高层级的归类。',
  ENTRY_DATA: '人物入仕与出身经历事实表，记录入仕方式、年份、机构及相关人物关系线索。',
  ENTRY_CODES: '入仕方式代码表，定义科举、荐举等条目代码。',
  STATUS_DATA: '人物状态事实表，记录身份、状态或资格类信息及其时间、来源。',
  STATUS_CODES: '状态代码表，定义身份/状态项目本身。',
  ADDR_CODES: '地点主代码表，保存地名、中文名、行政类别、年代与坐标，是地理体系的核心字典。',
  ADDR_BELONGS_DATA: '地点隶属关系表，描述一个地点在某一时间段归属到另一个地点或行政单元。',
  OFFICE_CODES: '官职代码表，保存职官名称、中英文转写、所属朝代和分类信息。',
  OFFICE_CODE_TYPE_REL: '官职与官职树节点的映射表，用于把具体官职归入官职类型树。',
  OFFICE_TYPE_TREE: '官职类型树表，提供官职分类层级结构。',
  POSTING_DATA: '任职记录主表，以 posting 为粒度标识一条任官经历。',
  POSTED_TO_OFFICE_DATA: '人物任某官职的事实表，记录人物、官职、任职时间、任命方式、机构和来源。',
  POSTED_TO_ADDR_DATA: '任职记录与地点的连接表，用于标注某次任职对应的赴任地点或辖地。',
  APPOINTMENT_CODES: '任命代码表，定义任命动作或任命条目。',
  APPOINTMENT_TYPES: '任命类型表，对任命代码做上层分类。',
  TEXT_CODES: '文献主表，保存文本题名、文本类型、年代、国家/朝代、存佚状态与外部链接。',
  TEXT_INSTANCE_DATA: '文献版本/实例表，区分同一文本的不同版本、卷次或实例记录。',
  TEXT_ROLE_CODES: '文本角色代码表，定义人物在文献中的角色类型，如作者、编者等。',
  TEXT_BIBLCAT_CODES: '文献分类代码表，定义书目分类项目。',
  TEXT_BIBLCAT_TYPES: '文献分类类型表，对书目分类进行更高层级整理。',
  SOCIAL_INSTITUTION_CODES: '社会机构主表，保存机构名称代码、机构实例代码、类型、起止年代和来源。',
  SOCIAL_INSTITUTION_NAME_CODES: '社会机构名称代码表，提供机构名称的基础字典。',
  SOCIAL_INSTITUTION_ADDR: '社会机构与地点连接表，记录机构的地址类型、地址代码与坐标。',
  SOCIAL_INSTITUTION_TYPES: '社会机构类型表，定义机构类别。',
  EVENTS_DATA: '人物事件事实表，记录人物在特定序号下的事件代码及相关时间和来源。',
  EVENTS_ADDR: '事件与地点的连接表，补充事件发生地。',
  EVENT_CODES: '事件代码表，定义事件类型及辅助说明。',
  MERGED_PERSON_DATA: '人物合并映射表，记录某人物记录由哪些历史 personid 合并而来。',
  DYNASTIES: '朝代表，提供朝代代码、名称和年代范围。',
  NIAN_HAO: '年号表，提供年号代码、名称、所属朝代与起止年份。',
};

const DOMAIN_LABELS = {
  BIOG: '人物',
  ALTNAME: '人物',
  KIN: '人物',
  ASSOC: '人物',
  ENTRY: '人物',
  STATUS: '人物',
  MERGED: '人物',
  ADDR: '地理',
  OFFICE: '职官',
  APPOINTMENT: '职官',
  ASSUME: '职官',
  POSTED: '职官',
  POSTING: '职官',
  TEXT: '文献',
  SOCIAL: '机构',
  EVENTS: '事件',
  EVENT: '事件',
  ADMIN: '基础代码',
  COUNTRY: '基础代码',
  DYNASTIES: '基础代码',
  NIAN: '基础代码',
};

const PREFERRED_TARGETS = {
  c_personid: ['BIOG_MAIN'],
  c_textid: ['TEXT_CODES'],
  c_addr_id: ['ADDR_CODES'],
  c_posting_id: ['POSTING_DATA'],
  c_office_id: ['OFFICE_CODES'],
  c_assoc_code: ['ASSOC_CODES'],
  c_assoc_type_code: ['ASSOC_TYPES'],
  c_appt_code: ['APPOINTMENT_CODES'],
  c_appt_type_code: ['APPOINTMENT_TYPES'],
  c_entry_code: ['ENTRY_CODES'],
  c_entry_type: ['ENTRY_TYPES'],
  c_status_code: ['STATUS_CODES'],
  c_status_type_code: ['STATUS_TYPES'],
  c_admin_cat_code: ['ADMIN_CAT_CODES'],
  c_admin_cat_type_code: ['ADMIN_CAT_TYPES'],
  c_text_cat_code: ['TEXT_BIBLCAT_CODES'],
  c_text_cat_type_id: ['TEXT_BIBLCAT_TYPES'],
  c_role_id: ['TEXT_ROLE_CODES'],
  c_inst_name_code: ['SOCIAL_INSTITUTION_NAME_CODES', 'SOCIAL_INSTITUTION_CODES'],
  c_inst_code: ['SOCIAL_INSTITUTION_CODES'],
  c_inst_type_code: ['SOCIAL_INSTITUTION_TYPES'],
  c_event_code: ['EVENT_CODES'],
  c_country_code: ['COUNTRY_CODES'],
  c_choronym_code: ['CHORONYM_CODES'],
  c_dy: ['DYNASTIES'],
  c_nianhao_id: ['NIAN_HAO'],
  c_range_code: ['YEAR_RANGE_CODES'],
  c_measure_code: ['MEASURE_CODES'],
  c_extant_code: ['EXTANT_CODES'],
};

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function getCategory(name) {
  for (const rule of CATEGORY_RULES) {
    if (rule.test.test(name)) {
      return rule;
    }
  }
  return { category: '其他', description: '暂未归入主要主题域的辅助表。' };
}

function getDomainKey(name) {
  const first = name.split('_')[0];
  if (DOMAIN_LABELS[first]) {
    return DOMAIN_LABELS[first];
  }
  for (const key of Object.keys(DOMAIN_LABELS)) {
    if (name.startsWith(key)) {
      return DOMAIN_LABELS[key];
    }
  }
  return getCategory(name).category;
}

function prettifyTableBase(name) {
  return name
    .replace(/_CODE_TYPE_REL$/, '代码-类型关系')
    .replace(/_TYPE_REL$/, '类型关系')
    .replace(/_CODES$/, '代码')
    .replace(/_TYPES$/, '类型')
    .replace(/_DATA$/, '数据')
    .replace(/_/g, ' ');
}

function describeGeneric(table) {
  const name = table.name;
  if (SPECIAL_SUMMARIES[name]) {
    return SPECIAL_SUMMARIES[name];
  }

  const base = prettifyTableBase(name);
  const displayCols = table.columns
    .filter((col) => /(name|title|year|type|code|id|pages|notes)/i.test(col.name))
    .slice(0, 6)
    .map((col) => col.name);

  let role;
  if (name.endsWith('_DATA')) {
    role = '事实/业务数据表';
  } else if (name.endsWith('_CODES')) {
    role = '代码字典表';
  } else if (name.endsWith('_TYPES')) {
    role = '类型字典表';
  } else if (name.endsWith('_TYPE_REL') || name.endsWith('_CODE_TYPE_REL')) {
    role = '桥接映射表';
  } else {
    role = table.type === 'view' ? '视图' : '主题数据表';
  }

  const colText = displayCols.length
    ? `重点字段包括 ${displayCols.join('、')}。`
    : '';

  return `${base}属于${table.category}主题域中的${role}，用于承载该主题的核心编码、事实记录或归类信息。${colText}`;
}

function inferRole(table) {
  const name = table.name;
  if (name === 'BIOG_MAIN') return '核心实体';
  if (name.endsWith('_DATA')) return '事实表';
  if (name.endsWith('_CODES')) return '代码表';
  if (name.endsWith('_TYPES')) return '类型表';
  if (name.endsWith('_TYPE_REL') || name.endsWith('_CODE_TYPE_REL')) return '桥接表';
  if (name.endsWith('_TREE')) return '层级表';
  return table.type === 'view' ? '视图' : '主题表';
}

function detectDisplayColumns(columns) {
  return columns
    .filter((col) => /(name|title|chn|trans|notes|year|type)/i.test(col.name))
    .slice(0, 8)
    .map((col) => col.name);
}

function normalizeColumnName(name) {
  return name
    .toLowerCase()
    .replace(/^c_/, '')
    .replace(/_code$/, '')
    .replace(/_id$/, '')
    .replace(/_type$/, '')
    .replace(/_type_code$/, '')
    .replace(/_code_type$/, '')
    .replace(/_codes$/, '')
    .replace(/_types$/, '')
    .replace(/_data$/, '');
}

function isRelationshipCandidate(name) {
  if (!name) return false;
  const generic = new Set([
    'c_sequence',
    'c_source',
    'c_pages',
    'c_notes',
    'c_created_by',
    'c_modified_by',
    'c_created_date',
    'c_modified_date',
    'c_firstyear',
    'c_lastyear',
    'c_year',
  ]);
  if (generic.has(name)) return false;
  return /(^c_.*_id$)|(^c_.*_code$)|(^c_personid$)|(^c_textid$)|(^c_dy$)/.test(name);
}

function getImportance(table) {
  let score = 0;
  if (table.name === 'BIOG_MAIN') score += 100;
  if (table.name.endsWith('_DATA')) score += 30;
  if (table.name.endsWith('_CODES')) score += 18;
  if (table.name.endsWith('_TYPES')) score += 12;
  if (table.name.endsWith('_TYPE_REL') || table.name.endsWith('_CODE_TYPE_REL')) score += 14;
  if (table.name.endsWith('_TREE')) score += 10;
  score += Math.min(25, Math.log10((table.rowCount || 1) + 1) * 8);
  score += Math.min(12, table.columns.length / 4);
  return Number(score.toFixed(2));
}

function readAllTables() {
  const rows = db.prepare(TABLE_SQL).all();
  return rows.map((row) => {
    const safeName = row.name.replace(/'/g, "''");
    const columns = db.prepare(`PRAGMA table_info('${safeName}')`).all();
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list('${safeName}')`).all();
    const indexes = db.prepare(`PRAGMA index_list('${safeName}')`).all().map((idx) => {
      const idxName = idx.name.replace(/'/g, "''");
      const cols = db.prepare(`PRAGMA index_info('${idxName}')`).all();
      return {
        name: idx.name,
        unique: Boolean(idx.unique),
        origin: idx.origin,
        partial: Boolean(idx.partial),
        columns: cols.map((item) => item.name),
      };
    });

    let rowCount = null;
    if (row.type === 'table') {
      rowCount = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(row.name)}`).get().count;
    }

    let sample = null;
    try {
      sample = db.prepare(`SELECT * FROM ${quoteIdent(row.name)} LIMIT 1`).get() || null;
    } catch {
      sample = null;
    }

    const categoryInfo = getCategory(row.name);
    const table = {
      name: row.name,
      type: row.type,
      sql: row.sql,
      columns: columns.map((col) => ({
        name: col.name,
        type: col.type,
        nullable: col.notnull === 0,
        defaultValue: col.dflt_value,
        pkPosition: col.pk,
      })),
      primaryKey: columns.filter((col) => col.pk > 0).sort((a, b) => a.pk - b.pk).map((col) => col.name),
      foreignKeys: foreignKeys.map((fk) => ({
        from: fk.from,
        toTable: fk.table,
        to: fk.to,
        onUpdate: fk.on_update,
        onDelete: fk.on_delete,
      })),
      indexes,
      rowCount,
      sample,
      category: categoryInfo.category,
      categoryDescription: categoryInfo.description,
    };

    table.role = inferRole(table);
    table.domain = getDomainKey(row.name);
    table.displayColumns = detectDisplayColumns(table.columns);
    table.summary = describeGeneric(table);
    table.importance = getImportance(table);
    return table;
  });
}

function buildKeyIndex(tables) {
  const exact = new Map();
  const normalized = new Map();

  for (const table of tables) {
    for (const col of table.columns) {
      const exactKey = col.name;
      if (!exact.has(exactKey)) exact.set(exactKey, []);
      exact.get(exactKey).push({
        table: table.name,
        column: col.name,
        isPrimaryKey: table.primaryKey.includes(col.name),
        role: table.role,
      });

      const normalizedKey = normalizeColumnName(col.name);
      if (!normalized.has(normalizedKey)) normalized.set(normalizedKey, []);
      normalized.get(normalizedKey).push({
        table: table.name,
        column: col.name,
        isPrimaryKey: table.primaryKey.includes(col.name),
        role: table.role,
      });
    }
  }

  return { exact, normalized };
}

function tableWeight(tableByName, name) {
  return tableByName.get(name)?.importance || 0;
}

function inferRelationships(tables) {
  const tableByName = new Map(tables.map((table) => [table.name, table]));
  const { exact, normalized } = buildKeyIndex(tables);
  const edges = [];
  const seen = new Set();

  function addEdge(edge) {
    const key = [
      edge.sourceTable,
      edge.sourceColumn,
      edge.targetTable,
      edge.targetColumn,
      edge.rule,
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(edge);
  }

  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      addEdge({
        sourceTable: table.name,
        sourceColumn: fk.from,
        targetTable: fk.toTable,
        targetColumn: fk.to,
        rule: '显式外键',
        confidence: 1,
        kind: 'foreign-key',
      });
    }
  }

  for (const table of tables) {
    for (const col of table.columns) {
      if (!isRelationshipCandidate(col.name)) continue;
      const preferredTargets = PREFERRED_TARGETS[col.name] || null;
      const candidates = exact.get(col.name) || [];
      for (const candidate of candidates) {
        if (candidate.table === table.name) continue;
        if (preferredTargets && !preferredTargets.includes(candidate.table)) continue;
        const targetTable = tableByName.get(candidate.table);
        if (!targetTable || !candidate.isPrimaryKey) continue;

        let confidence = 0.9;
        let rule = '同名字段匹配主键';
        if (table.name.endsWith('_DATA') && targetTable.name.endsWith('_CODES')) {
          confidence = 0.95;
          rule = '数据表字段匹配代码表主键';
        } else if (
          (table.name.endsWith('_TYPE_REL') || table.name.endsWith('_CODE_TYPE_REL')) &&
          (targetTable.name.endsWith('_CODES') || targetTable.name.endsWith('_TYPES'))
        ) {
          confidence = 0.97;
          rule = '桥接表连接代码/类型表';
        } else if (table.name.endsWith('_DATA') && targetTable.name === 'BIOG_MAIN' && col.name === 'c_personid') {
          confidence = 0.99;
          rule = '人物事实表连接人物主表';
        } else if (/^c_.*_id$/.test(col.name) || /^c_.*_code$/.test(col.name)) {
          confidence = 0.92;
          rule = '同名 ID/Code 字段匹配';
        }

        addEdge({
          sourceTable: table.name,
          sourceColumn: col.name,
          targetTable: candidate.table,
          targetColumn: candidate.column,
          rule,
          confidence,
          kind: 'inferred-exact',
        });
      }

      const normalizedKey = normalizeColumnName(col.name);
      const normCandidates = normalized.get(normalizedKey) || [];
      for (const candidate of normCandidates) {
        if (candidate.table === table.name) continue;
        if (preferredTargets && !preferredTargets.includes(candidate.table)) continue;
        if (!candidate.isPrimaryKey) continue;
        if (candidate.column === col.name) continue;
        const targetTable = tableByName.get(candidate.table);
        if (!targetTable) continue;

        let confidence = 0.72;
        let rule = '归一化字段名相近';
        if (table.name.endsWith('_DATA') && targetTable.name.endsWith('_CODES')) {
          confidence = 0.84;
          rule = '数据表字段归一化后匹配代码表';
        }

        addEdge({
          sourceTable: table.name,
          sourceColumn: col.name,
          targetTable: candidate.table,
          targetColumn: candidate.column,
          rule,
          confidence,
          kind: 'inferred-normalized',
        });
      }
    }
  }

  for (const table of tables) {
    const prefix = table.name.split('_')[0];
    if (!table.name.endsWith('_DATA')) continue;
    for (const target of tables) {
      if (target.name === table.name) continue;
      const samePrefix = target.name.startsWith(prefix + '_');
      const compatibleRole = ['代码表', '类型表', '桥接表', '层级表'].includes(target.role);
      if (!samePrefix || !compatibleRole) continue;
      const sharedColumns = table.columns
        .map((col) => col.name)
        .filter((name) => target.primaryKey.includes(name) && isRelationshipCandidate(name));
      for (const col of sharedColumns) {
        addEdge({
          sourceTable: table.name,
          sourceColumn: col,
          targetTable: target.name,
          targetColumn: col,
          rule: '同前缀主题表配对',
          confidence: 0.88,
          kind: 'inferred-prefix',
        });
      }
    }
  }

  const best = new Map();
  for (const edge of edges) {
    const pairKey = `${edge.sourceTable}|${edge.sourceColumn}|${edge.targetTable}|${edge.targetColumn}`;
    const prev = best.get(pairKey);
    if (!prev || edge.confidence > prev.confidence) best.set(pairKey, edge);
  }

  return [...best.values()].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const diff = tableWeight(tableByName, b.targetTable) - tableWeight(tableByName, a.targetTable);
    if (diff !== 0) return diff;
    return a.sourceTable.localeCompare(b.sourceTable);
  });
}

function buildOverview(tables, relationships) {
  const categoryStats = {};
  let totalRows = 0;
  let explicitFkCount = 0;
  let emptyTables = 0;

  for (const table of tables) {
    totalRows += typeof table.rowCount === 'number' ? table.rowCount : 0;
    explicitFkCount += table.foreignKeys.length;
    if (table.rowCount === 0) emptyTables += 1;
    if (!categoryStats[table.category]) categoryStats[table.category] = { tables: 0, rows: 0 };
    categoryStats[table.category].tables += 1;
    categoryStats[table.category].rows += typeof table.rowCount === 'number' ? table.rowCount : 0;
  }

  const largestTables = [...tables]
    .filter((table) => typeof table.rowCount === 'number')
    .sort((a, b) => b.rowCount - a.rowCount)
    .slice(0, 12)
    .map((table) => ({
      name: table.name,
      rowCount: table.rowCount,
      category: table.category,
      summary: table.summary,
    }));

  const centralTables = [...tables]
    .sort((a, b) => {
      const relA = relationships.filter((rel) => rel.sourceTable === a.name || rel.targetTable === a.name).length;
      const relB = relationships.filter((rel) => rel.sourceTable === b.name || rel.targetTable === b.name).length;
      if (relB !== relA) return relB - relA;
      return b.importance - a.importance;
    })
    .slice(0, 10)
    .map((table) => table.name);

  return {
    database: path.basename(DB_PATH),
    generatedAt: new Date().toISOString(),
    tableCount: tables.length,
    totalRows,
    explicitFkCount,
    inferredRelationshipCount: relationships.length,
    emptyTables,
    categoryStats,
    largestTables,
    centralTables,
    notes: [
      '该数据库几乎没有声明式外键，关系主要通过同名字段、代码表和桥接表模式推断。',
      '大部分主键字段以 c_*_id、c_*_code 或 c_personid、c_textid 形式出现。',
      '从命名看，CBDB 以人物 BIOG_MAIN 为中心，向地点、官职、文献、机构和关系事实扩散。',
    ],
  };
}

function buildNarrative(overview, tables, relationships) {
  const byName = new Map(tables.map((table) => [table.name, table]));

  function edgeCount(name) {
    return relationships.filter((rel) => rel.sourceTable === name || rel.targetTable === name).length;
  }

  const anchors = ['BIOG_MAIN', 'ADDR_CODES', 'OFFICE_CODES', 'TEXT_CODES', 'SOCIAL_INSTITUTION_CODES']
    .filter((name) => byName.has(name))
    .map((name) => ({
      name,
      summary: byName.get(name).summary,
      relations: edgeCount(name),
    }));

  return {
    headline: `${overview.database} 共包含 ${overview.tableCount} 张表，呈现出明显的“人物中心 + 代码字典 + 事实记录 + 桥接关系”结构。`,
    bullets: [
      '人物域最核心的是 BIOG_MAIN，围绕它分布着别名、亲属、社会关系、状态、入仕、机构经历、地点经历等多类事实表。',
      '地点域以 ADDR_CODES 为中心，再通过 ADDR_BELONGS_DATA、BIOG_ADDR_DATA、POSTED_TO_ADDR_DATA、SOCIAL_INSTITUTION_ADDR 等表向人物、任职和机构扩展。',
      '职官域由 OFFICE_CODES、POSTING_DATA、POSTED_TO_OFFICE_DATA、POSTED_TO_ADDR_DATA 组成一条任官链路，体现“任职记录 -> 官职 -> 地点”的组合关系。',
      '文献域由 TEXT_CODES 主导，通过 BIOG_SOURCE_DATA、BIOG_TEXT_DATA、TEXT_INSTANCE_DATA 和文本角色/分类代码表连接人物与书目。',
      '大量 *_CODES、*_TYPES、*_TYPE_REL 表是代码体系，承担解释枚举值、构建分类树和为事实表提供维表的职责。',
    ],
    anchors,
  };
}

function trimSample(sample) {
  if (!sample) return null;
  return Object.fromEntries(Object.entries(sample).slice(0, 12));
}

function enrichTables(tables, relationships) {
  const relMap = new Map();
  for (const table of tables) relMap.set(table.name, []);
  for (const rel of relationships) {
    if (relMap.has(rel.sourceTable)) relMap.get(rel.sourceTable).push(rel);
    if (relMap.has(rel.targetTable)) relMap.get(rel.targetTable).push({ ...rel, reverse: true });
  }

  return tables.map((table) => ({
    ...table,
    sample: trimSample(table.sample),
    relationshipCount: relMap.get(table.name)?.length || 0,
    topRelationships: (relMap.get(table.name) || []).sort((a, b) => b.confidence - a.confidence).slice(0, 8),
  }));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(data) {
  const templatePath = path.join(ROOT_DIR, 'templates', 'report-template.html');
  const template = fs.readFileSync(templatePath, 'utf8');
  const safeJson = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/<\/script/gi, '<\\/script');
  return template.replace('__REPORT_DATA__', safeJson);
}

function main() {
  const rawTables = readAllTables();
  const relationships = inferRelationships(rawTables);
  const tables = enrichTables(rawTables, relationships);
  const overview = buildOverview(tables, relationships);
  const narrative = buildNarrative(overview, tables, relationships);
  const report = { overview, narrative, tables, relationships };

fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
fs.mkdirSync(path.dirname(HTML_PATH), { recursive: true });
fs.writeFileSync(JSON_PATH, JSON.stringify(report, null, 2), 'utf8');
fs.writeFileSync(HTML_PATH, buildHtml(report), 'utf8');

  console.log(JSON.stringify({
    database: overview.database,
    tableCount: overview.tableCount,
    inferredRelationshipCount: overview.inferredRelationshipCount,
    totalRows: overview.totalRows,
    json: path.basename(JSON_PATH),
    html: path.basename(HTML_PATH),
  }, null, 2));
}

main();
