export const SELECT_BUILDING_GEOMETRY_QUERY = (qualifiedTableName: string) => `
  SELECT id, CAST(ST_AsGeoJSON(geometry) AS JSON) AS geometry_json
  FROM ${qualifiedTableName}
`;

export const ALTER_ADD_BUILDING_ID_QUERY = (qualifiedTableName: string) =>
  `ALTER TABLE ${qualifiedTableName} ADD COLUMN building_id BIGINT`;

export const CREATE_TEMP_JSON_TABLE_QUERY = (vfsPath: string) =>
  `CREATE TEMP TABLE __tmp_building_ids_json AS SELECT * FROM '${vfsPath}'`;

export const CREATE_TEMP_IDS_TABLE_QUERY = () => `
  CREATE TEMP TABLE __tmp_building_ids AS
  SELECT CAST(row.id AS BIGINT) AS id, CAST(row.building_id AS BIGINT) AS building_id
  FROM (SELECT UNNEST(rows) AS row FROM __tmp_building_ids_json);
`;

export const UPDATE_BUILDING_IDS_QUERY = (qualifiedTableName: string) =>
  `UPDATE ${qualifiedTableName} AS t SET building_id = b.building_id FROM __tmp_building_ids AS b WHERE t.id = b.id`;

export const DROP_TEMP_IDS_TABLE_QUERY = () => `DROP TABLE __tmp_building_ids`;

export const DROP_TEMP_JSON_TABLE_QUERY = () => `DROP TABLE __tmp_building_ids_json`;

export const PRAGMA_TABLE_INFO_QUERY = (tableName: string) =>
  `PRAGMA table_info('${tableName}')`;

export const DESCRIBE_TABLE_QUERY = (tableName: string) => `DESCRIBE ${tableName}`;

export const SELECT_BUILDING_IDS_QUERY = (qualifiedTableName: string) => `
  SELECT building_id
  FROM ${qualifiedTableName}
  WHERE building_id IS NOT NULL
  GROUP BY building_id
`;

export const CREATE_TEMP_AGG_TABLE_QUERY = (tempTableName: string) =>
  `CREATE OR REPLACE TEMP TABLE ${tempTableName} (building_id BIGINT, agg_geometry BLOB)`;

export const BATCH_INSERT_QUERY = (qualifiedTableName: string, tempTableName: string, ids: string) => `
  INSERT INTO ${tempTableName}
  SELECT
    building_id,
    ST_Union_Agg(ST_Buffer(geometry, 0.0)) AS agg_geometry
  FROM ${qualifiedTableName}
  WHERE building_id IN (${ids})
    AND ST_IsValid(geometry)
  GROUP BY building_id;
`;

export const SINGLE_INSERT_QUERY = (qualifiedTableName: string, tempTableName: string, buildingId: string) => `
  INSERT INTO ${tempTableName}
  SELECT
    ${buildingId} AS building_id,
    ST_Union_Agg(ST_Buffer(geometry, 0.0)) AS agg_geometry
  FROM ${qualifiedTableName}
  WHERE building_id = ${buildingId}
    AND ST_IsValid(geometry)
  GROUP BY building_id;
`;

export const NULL_INSERT_QUERY = (tempTableName: string, buildingId: string) =>
  `INSERT INTO ${tempTableName} (building_id, agg_geometry) VALUES (${buildingId}, NULL);`;

export const ADD_AGG_COLUMN_QUERY = (qualifiedTableName: string, tempTableName: string) => `
  CREATE OR REPLACE TABLE ${qualifiedTableName} AS
  SELECT
    b.*,
    agg.agg_geometry
  FROM ${qualifiedTableName} b
  LEFT JOIN ${tempTableName} agg ON b.building_id = agg.building_id;
`;

export const NULL_COUNT_QUERY = (qualifiedTableName: string) => `
  SELECT COUNT(*) AS cnt
  FROM ${qualifiedTableName}
  WHERE agg_geometry IS NULL
`;

export const DROP_TEMP_TABLE_QUERY = (tempTableName: string) =>
  `DROP TABLE IF EXISTS ${tempTableName};`;
