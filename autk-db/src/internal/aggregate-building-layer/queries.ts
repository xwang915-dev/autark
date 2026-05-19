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
