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
