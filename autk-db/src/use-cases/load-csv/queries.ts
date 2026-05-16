import { DEFAULT_GEO_COLUMN_NAME } from '../../consts';

export const LOAD_CSV_ON_TABLE_QUERY = (csvFileUrl: string, tableName: string, delimiter: string, workspace: string) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `
        CREATE OR REPLACE TABLE ${qualifiedTableName} AS
            SELECT * FROM READ_CSV(
                '${csvFileUrl}',
                delim='${delimiter}',
                HEADER=TRUE,
                AUTO_DETECT=TRUE
            );

        DESCRIBE ${qualifiedTableName};
  `;
};

interface LoadCsvOnTableWithCoordinatesParams {
  csvFileUrl: string;
  tableName: string;
  delimiter: string;
  latColumnName: string;
  longColumnName: string;
  sourceCrs: string;
  targetCrs: string;
  workspace: string;
}

interface LoadCsvOnTableWithWktParams {
  csvFileUrl: string;
  tableName: string;
  delimiter: string;
  wktColumnName: string;
  sourceCrs: string;
  targetCrs: string;
  workspace: string;
}

export const LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY = ({
  csvFileUrl,
  tableName,
  delimiter,
  latColumnName,
  longColumnName,
  sourceCrs,
  targetCrs,
  workspace,
}: LoadCsvOnTableWithCoordinatesParams) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `
    CREATE TABLE ${qualifiedTableName} AS
      SELECT
          *,
          ST_Transform(
              ST_Point(CAST(${longColumnName} AS DOUBLE), CAST(${latColumnName} AS DOUBLE)),
              '${sourceCrs}',
              '${targetCrs}',
              always_xy := true
          ) AS ${DEFAULT_GEO_COLUMN_NAME}
      FROM READ_CSV(
          '${csvFileUrl}',
          delim='${delimiter}',
          HEADER=TRUE,
          AUTO_DETECT=TRUE
      );

    DESCRIBE ${qualifiedTableName};
  `;
};

export const LOAD_CSV_ON_TABLE_WITH_WKT_QUERY = ({
  csvFileUrl,
  tableName,
  delimiter,
  wktColumnName,
  sourceCrs,
  targetCrs,
  workspace,
}: LoadCsvOnTableWithWktParams) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `
    CREATE TABLE ${qualifiedTableName} AS
      SELECT
          *,
          ST_Transform(
              ST_GeomFromText(CAST(${wktColumnName} AS VARCHAR)),
              '${sourceCrs}',
              '${targetCrs}',
              always_xy := true
          ) AS ${DEFAULT_GEO_COLUMN_NAME}
      FROM READ_CSV(
          '${csvFileUrl}',
          delim='${delimiter}',
          HEADER=TRUE,
          AUTO_DETECT=TRUE
      );

    DESCRIBE ${qualifiedTableName};
  `;
};
