import { Table } from '../../interfaces';

type InternalColumn = { table: Table; column: string; aggregateFn?: string; aggregateFnResultColumnName?: string; normalize?: boolean };

interface Params {
  workspace: string;
  tableRoot: Table;
  tableJoin: Table;
  geometricColumnRoot: string;
  geometricColumnJoin: string;
  joinType: string;
  spatialPredicate: string;
  nearDistance?: number;
  nearUseCentroid?: boolean;
  groupBy: { selectColumns: Array<InternalColumn> } | null;
  outputTableName: string;
}

const NEAR_CTE_ALIAS = 'csv_candidates';
const getQualifiedTableName = (workspace: string, tableName: string) => `${workspace}.${tableName}`;

export const SPATIAL_JOIN_QUERY = (params: Params) => {
  const isNear = params.spatialPredicate === 'NEAR';
  const qualifiedTableRootName = getQualifiedTableName(params.workspace, params.tableRoot.name);
  const qualifiedTableJoinName = getQualifiedTableName(params.workspace, params.tableJoin.name);

  const effectiveJoinTable: Table = isNear
    ? { ...params.tableJoin, name: NEAR_CTE_ALIAS }
    : params.tableJoin;

  const effectiveGroupBy = isNear && params.groupBy
    ? {
      selectColumns: params.groupBy.selectColumns.map((col) => ({
        ...col,
        aggregateFnResultColumnName: col.aggregateFnResultColumnName ?? (col.table.name === params.tableJoin.name ? col.table.name : undefined),
        table: col.table.name === params.tableJoin.name ? effectiveJoinTable : col.table,
      })),
    }
    : params.groupBy;

  const selectString = getSelectString({
    tableRoot: params.tableRoot,
    tableJoin: effectiveJoinTable,
    geometricColumnRoot: params.geometricColumnRoot,
    geometricColumnJoin: params.geometricColumnJoin,
    nearUseCentroid: params.nearUseCentroid,
    groupBy: effectiveGroupBy,
  });

  const joinString = getJoinString({
    spatialPredicate: params.spatialPredicate,
    joinType: params.joinType,
    qualifiedTableJoinName,
    tableJoin: effectiveJoinTable,
    tableRoot: params.tableRoot,
    geometricColumnRoot: params.geometricColumnRoot,
    geometricColumnJoin: params.geometricColumnJoin,
    nearDistance: params.nearDistance,
    nearUseCentroid: params.nearUseCentroid,
  });

  const groupByString = getGroupByString(params.tableRoot);

  const rootGeomExpr = (tableAlias: string, col: string) =>
    params.nearUseCentroid ? `ST_Centroid(${tableAlias}.${quoteIdentifier(col)})` : `${tableAlias}.${quoteIdentifier(col)}`;

  const nearCtePart = isNear
    ? `${NEAR_CTE_ALIAS} AS (
        SELECT * FROM ${qualifiedTableJoinName} AS ${params.tableJoin.name}
        WHERE ST_Intersects(
          (SELECT ST_Union_Agg(ST_Expand(${rootGeomExpr(params.tableRoot.name, params.geometricColumnRoot)}, ${params.nearDistance})) FROM ${qualifiedTableRootName} AS ${params.tableRoot.name}),
          ${params.tableJoin.name}.${quoteIdentifier(params.geometricColumnJoin)}
        )
      )`
    : null;

  const innerQuery = `
    ${selectString}
    FROM ${qualifiedTableRootName} AS ${params.tableRoot.name}
    ${joinString}
    ${params.groupBy ? groupByString : ''}
  `;

  const normalizedColumns = effectiveGroupBy?.selectColumns.filter((col) => col.normalize) ?? [];

  if (normalizedColumns.length > 0) {
    const cteParts = [...(nearCtePart ? [nearCtePart] : []), `sjoin_base AS (${innerQuery})`];
    const normPatch = buildNormalizationMergePatch(normalizedColumns);
    return `
      WITH ${cteParts.join(',\n')}
      SELECT * REPLACE (${normPatch} AS properties)
      FROM sjoin_base;
    `;
  }

  return `
    ${nearCtePart ? `WITH ${nearCtePart}` : ''}
    ${innerQuery};
  `;
};

function getSelectString(params: {
  tableRoot: Table;
  tableJoin: Table;
  geometricColumnRoot: string;
  geometricColumnJoin: string;
  nearUseCentroid?: boolean;
  groupBy: { selectColumns: Array<InternalColumn> } | null;
}) {
  if (params.groupBy) {
    const { aggregatesByFunction, nonAggregateColumns } = groupColumnsByAggregateFunction(params.groupBy.selectColumns);
    const sjoinObjectSql = buildSjoinObject(aggregatesByFunction, nonAggregateColumns, {
      tableRoot: params.tableRoot,
      tableJoin: params.tableJoin,
      geometricColumnRoot: params.geometricColumnRoot,
      geometricColumnJoin: params.geometricColumnJoin,
      nearUseCentroid: params.nearUseCentroid,
    });

    const additionalColumns = getAdditionalRootColumns(params.tableRoot);
    const additionalColumnsStr =
      additionalColumns.length > 0 ? `,\n        ${additionalColumns.join(',\n        ')}` : '';

    return `
      SELECT 
        ${params.tableRoot.name}.geometry,
        json_merge_patch(
          ${buildPropertiesObjectExpression(params.tableRoot)},
          json_object(
            'sjoin', json_object(
              ${sjoinObjectSql}
            )
          )
        ) AS properties${additionalColumnsStr}
    `;
  }

  return buildSimpleJoinSelect(params.tableRoot, params.tableJoin, params.geometricColumnJoin);
}

function groupColumnsByAggregateFunction(selectColumns: Array<InternalColumn>) {
  const aggregatesByFunction: Record<
    string,
    Array<{ table: Table; column: string; aggregateFnResultColumnName?: string }>
  > = {};
  const nonAggregateColumns: Array<{ table: Table; column: string; aggregateFnResultColumnName?: string }> = [];

  selectColumns.forEach((column) => {
    if (column.aggregateFn) {
      const funcName = column.aggregateFn.toLowerCase();
      if (!aggregatesByFunction[funcName]) {
        aggregatesByFunction[funcName] = [];
      }
      aggregatesByFunction[funcName].push({
        table: column.table,
        column: column.column,
        aggregateFnResultColumnName: column.aggregateFnResultColumnName,
      });
    } else {
      nonAggregateColumns.push({
        table: column.table,
        column: column.column,
        aggregateFnResultColumnName: column.aggregateFnResultColumnName,
      });
    }
  });

  return { aggregatesByFunction, nonAggregateColumns };
}

function buildSjoinObject(
  aggregatesByFunction: Record<string, Array<{ table: Table; column: string; aggregateFnResultColumnName?: string }>>,
  nonAggregateColumns: Array<{ table: Table; column: string; aggregateFnResultColumnName?: string }>,
  geomContext: { tableRoot: Table; tableJoin: Table; geometricColumnRoot: string; geometricColumnJoin: string; nearUseCentroid?: boolean },
): string {
  const sjoinParts: string[] = [];

  Object.entries(aggregatesByFunction).forEach(([funcName, columns]) => {
    if (funcName === 'count') {
      sjoinParts.push(buildCountExpression(columns[0]));
    } else if (funcName === 'weighted') {
      sjoinParts.push(buildWeightedExpression(columns[0], geomContext));
    } else if (funcName === 'collect') {
      sjoinParts.push(buildCollectExpression(columns[0]));
    } else {
      sjoinParts.push(buildNestedFunctionExpression(funcName, columns));
    }
  });

  if (nonAggregateColumns.length > 0) {
    sjoinParts.push(buildNonAggregateColumns(nonAggregateColumns));
  }

  return sjoinParts.join(', ');
}

function buildWeightedExpression(
  column: { table: Table; column: string; aggregateFnResultColumnName?: string },
  geomContext: { tableRoot: Table; tableJoin: Table; geometricColumnRoot: string; geometricColumnJoin: string; nearUseCentroid?: boolean },
): string {
  const { tableRoot, tableJoin, geometricColumnRoot, geometricColumnJoin, nearUseCentroid } = geomContext;
  const rootGeom = nearUseCentroid
    ? `ST_Centroid(${tableRoot.name}.${quoteIdentifier(geometricColumnRoot)})`
    : `${tableRoot.name}.${quoteIdentifier(geometricColumnRoot)}`;
  const joinGeom = nearUseCentroid
    ? `ST_Centroid(${tableJoin.name}.${quoteIdentifier(geometricColumnJoin)})`
    : `${tableJoin.name}.${quoteIdentifier(geometricColumnJoin)}`;
  const columnName = column.aggregateFnResultColumnName ?? column.table.name;
  return `'weighted', json_object('${escapeSqlString(columnName)}', SUM(1.0 / (ST_Distance(${rootGeom}, ${joinGeom}) + 1.0)))`;
}

function buildCollectExpression(column: { table: Table; column: string; aggregateFnResultColumnName?: string }): string {
  const columnName = column.aggregateFnResultColumnName ?? column.table.name;
  const valueExpression = generateValueExpression(column.table, column.column, 'COLLECT');
  return `'collect', json_object('${escapeSqlString(columnName)}', ${valueExpression})`;
}

function buildCountExpression(column: { table: Table; column: string; aggregateFnResultColumnName?: string }): string {
  const valueExpression = generateValueExpression(column.table, column.column, 'COUNT');
  const columnName = column.aggregateFnResultColumnName || column.table.name;
  return `'count', json_object('${escapeSqlString(columnName)}', ${valueExpression})`;
}

function buildNestedFunctionExpression(
  funcName: string,
  columns: Array<{ table: Table; column: string; aggregateFnResultColumnName?: string }>,
): string {
  const functionAttributes = columns
    .map((column) => {
      const valueExpression = generateValueExpression(column.table, column.column, funcName.toUpperCase());
      const columnName = column.aggregateFnResultColumnName || `${column.table.name}.${column.column}`;
      return `'${escapeSqlString(columnName)}', ${valueExpression}`;
    })
    .join(', ');

  return `'${escapeSqlString(funcName)}', json_object(${functionAttributes})`;
}

function buildNonAggregateColumns(
  nonAggregateColumns: Array<{ table: Table; column: string; aggregateFnResultColumnName?: string }>,
): string {
  return nonAggregateColumns
    .map((column) => {
      const valueExpression = buildColumnValueExpression(column.table, column.column);
      const columnName = column.aggregateFnResultColumnName || column.column;
      return `'${escapeSqlString(columnName)}', ${valueExpression}`;
    })
    .join(', ');
}

function generateValueExpression(table: Table, columnName: string, aggregateFunction: string): string {
  if (aggregateFunction === 'COLLECT') {
    if (columnName === '*') {
      return `json_group_array(${buildRowObjectExpression(table)})`;
    }
    const colExpr = buildColumnValueExpression(table, columnName);
    return `json_group_array(json_object('${escapeSqlString(columnName)}', ${colExpr}))`;
  }

  const valueExpression = buildColumnValueExpression(table, columnName);
  const castExpr = aggregateFunction === 'COUNT' ? valueExpression : `CAST(${valueExpression} AS DOUBLE)`;
  return `${aggregateFunction}(${castExpr})`;
}

function buildColumnValueExpression(table: Table, columnPath: string): string {
  if (hasPropertiesColumn(table)) {
    return buildJsonExtract(table.name, columnPath);
  }
  return buildDirectColumnReference(table.name, columnPath);
}

function buildPropertiesObjectExpression(table: Table): string {
  if (hasPropertiesColumn(table)) {
    return `COALESCE(CAST(${table.name}.properties AS JSON), '{}'::JSON)`;
  }
  return buildRowObjectExpression(table);
}

function buildRowObjectExpression(table: Table): string {
  const propertyColumns = table.columns.filter((column) => column.type !== 'GEOMETRY' && column.name !== 'properties');
  if (propertyColumns.length === 0) {
    return `'{}'::JSON`;
  }

  return `json_object(${propertyColumns
    .map((column) => `'${escapeSqlString(column.name)}', ${buildDirectColumnReference(table.name, column.name)}`)
    .join(', ')})`;
}

function buildJsonExtract(tableName: string, columnPath: string): string {
  const parts = columnPath.split('.');
  const last = parts.pop()!;
  const chain = parts.reduce((acc, p) => `${acc}->'${escapeSqlString(p)}'`, `${tableName}.properties`);
  return `${chain}->>'${escapeSqlString(last)}'`;
}

function buildNormalizationMergePatch(normalizedColumns: Array<InternalColumn>): string {
  const byAggFn: Record<string, Array<{ colKey: string; jsonPath: string }>> = {};

  for (const col of normalizedColumns) {
    const funcName = col.aggregateFn?.toLowerCase() ?? 'value';
    const colKey =
      funcName === 'count'
        ? (col.aggregateFnResultColumnName ?? col.table.name)
        : (col.aggregateFnResultColumnName ?? `${col.table.name}.${col.column}`);
    const jsonPath = `$.sjoin.${funcName}.${colKey}`;

    if (!byAggFn[funcName]) byAggFn[funcName] = [];
    byAggFn[funcName].push({ colKey, jsonPath });
  }

  const aggFnParts = Object.entries(byAggFn)
    .map(([funcName, cols]) => {
      const colParts = cols
        .map(({ colKey, jsonPath }) => {
          const rawVal = `COALESCE(json_extract(properties, '${escapeSqlString(jsonPath)}')::DOUBLE, 0)`;
          const normExpr =
            `(${rawVal} - MIN(${rawVal}) OVER ()) / ` +
            `NULLIF(MAX(${rawVal}) OVER () - MIN(${rawVal}) OVER (), 0)`;
          return `'${escapeSqlString(colKey)}_norm', ${normExpr}`;
        })
        .join(',\n          ');
      return `'${escapeSqlString(funcName)}', json_object(${colParts})`;
    })
    .join(',\n      ');

  return `json_merge_patch(
      properties,
      json_object('sjoin', json_object(
        ${aggFnParts}
      ))
    )`;
}

function buildSimpleJoinSelect(tableRoot: Table, tableJoin: Table, geometricColumnJoin: string): string {
  const additionalColumns = getAdditionalRootColumns(tableRoot);
  const additionalColumnsStr =
    additionalColumns.length > 0 ? `,\n        ${additionalColumns.join(',\n        ')}` : '';

  const joinPropertiesExpr = hasPropertiesColumn(tableJoin)
    ? `COALESCE(CAST(${tableJoin.name}.properties AS JSON), '{}'::JSON)`
    : `json_object(${tableJoin.columns
        .filter((column) => column.name !== geometricColumnJoin && column.type !== 'GEOMETRY')
        .map((column) => `'${escapeSqlString(column.name)}', ${buildDirectColumnReference(tableJoin.name, column.name)}`)
        .join(', ')})`;

  return `
      SELECT 
        ${tableRoot.name}.geometry,
        json_merge_patch(
          json_object('sjoin', ${joinPropertiesExpr}),
          ${buildPropertiesObjectExpression(tableRoot)}
        ) AS properties${additionalColumnsStr}
    `;
}

function getJoinString({
  spatialPredicate,
  joinType,
  qualifiedTableJoinName,
  tableJoin,
  tableRoot,
  geometricColumnRoot,
  geometricColumnJoin,
  nearDistance,
  nearUseCentroid,
}: {
  spatialPredicate: string;
  joinType: string;
  qualifiedTableJoinName: string;
  tableJoin: Table;
  tableRoot: Table;
  geometricColumnRoot: string;
  geometricColumnJoin: string;
  nearDistance?: number;
  nearUseCentroid?: boolean;
}) {
  if (spatialPredicate === 'NEAR') {
    const rootExpr = nearUseCentroid
      ? `ST_Centroid(${tableRoot.name}.${quoteIdentifier(geometricColumnRoot)})`
      : `${tableRoot.name}.${quoteIdentifier(geometricColumnRoot)}`;
    const joinExpr = nearUseCentroid
      ? `ST_Centroid(${tableJoin.name}.${quoteIdentifier(geometricColumnJoin)})`
      : `${tableJoin.name}.${quoteIdentifier(geometricColumnJoin)}`;
    return `${joinType || ''} JOIN ${tableJoin.name} ON ST_Distance(${rootExpr}, ${joinExpr}) <= ${nearDistance}`;
  }

  return `${joinType || ''} JOIN ${qualifiedTableJoinName} AS ${tableJoin.name} ON ST_Intersects(${tableRoot.name}.${quoteIdentifier(geometricColumnRoot)}, ${tableJoin.name}.${quoteIdentifier(geometricColumnJoin)})`;
}

function getGroupByString(tableRoot: Table) {
  const additionalColumns = getAdditionalRootColumns(tableRoot);
  const allGroupByColumns = [`${tableRoot.name}.geometry`, ...(hasPropertiesColumn(tableRoot) ? [`${tableRoot.name}.properties`] : []), ...additionalColumns];

  return `
    GROUP BY ${allGroupByColumns.join(', ')}
  `;
}

function getAdditionalRootColumns(tableRoot: Table): string[] {
  return tableRoot.columns
    .filter((col) => col.name !== 'geometry' && col.name !== 'properties')
    .map((col) => `${tableRoot.name}.${quoteIdentifier(col.name)}`);
}

function hasPropertiesColumn(table: Table): boolean {
  return table.columns.some((column) => column.name === 'properties');
}

function buildDirectColumnReference(tableName: string, columnName: string): string {
  return `${tableName}.${quoteIdentifier(columnName)}`;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}
