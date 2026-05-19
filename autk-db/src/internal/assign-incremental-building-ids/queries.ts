export const ALTER_ADD_BUILDING_ID_QUERY = (qualifiedTableName: string) =>
  `ALTER TABLE ${qualifiedTableName} ADD COLUMN building_id BIGINT`;

export const UPDATE_BUILDING_IDS_FROM_ID_QUERY = (qualifiedTableName: string) =>
  `UPDATE ${qualifiedTableName} SET building_id = CAST(id AS BIGINT)`;

export const PRAGMA_TABLE_INFO_QUERY = (tableName: string) =>
  `PRAGMA table_info('${tableName}')`;

export const DESCRIBE_TABLE_QUERY = (tableName: string) => `DESCRIBE ${tableName}`;
