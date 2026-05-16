import { Table } from '../../interfaces';
import type { LayerType } from '../../types-core';

export const GET_LAYER_AS_GEOJSON_QUERY = (layerTable: Table & { type: LayerType }, workspace: string) => {
  const hasBuildingIdColumn = !!layerTable.columns?.some((c) => c.name === 'building_id');
  const qualifiedTableName = `${workspace}.${layerTable.name}`;
  const propertiesExpression = buildPropertiesExpression(layerTable);

  if (layerTable.type === 'raster') {
    return `
      SELECT json_object(
           'type', 'FeatureCollection',
           'features', json_array(
             json_object(
               'type', 'Feature',
               'geometry', NULL,
               'properties', json_object(
                 'rasterResX', COUNT(DISTINCT ROUND(ST_X(geometry), 8))::INTEGER,
                 'rasterResY', COUNT(DISTINCT ROUND(ST_Y(geometry), 8))::INTEGER,
                 'raster', list(properties ORDER BY ST_Y(geometry) ASC, ST_X(geometry) ASC)
               )
             )
           )
         ) AS geojson
      FROM ${qualifiedTableName};
    `;
  }

  if (layerTable.type === 'buildings' && hasBuildingIdColumn) {
    return `
      SELECT json_object(
           'type', 'FeatureCollection',
           'features', json_group_array(feature)
         ) AS geojson
      FROM (
        SELECT json_object(
          'type', 'Feature',
          'geometry', json_object('type', 'GeometryCollection', 'geometries', geom_array),
          'properties', json_merge_patch(rep_props, json_object('building_id', building_id, 'parts', parts_array))
        ) AS feature
        FROM (
          SELECT
            building_id,
            json_group_array(CAST(ST_AsGeoJSON(geometry) AS JSON)) AS geom_array,
            any_value(COALESCE(CAST(properties AS JSON), '{}'::JSON)) AS rep_props,
            json_group_array(COALESCE(CAST(properties AS JSON), '{}'::JSON)) AS parts_array
          FROM ${qualifiedTableName}
          WHERE ST_IsValid(geometry)
          GROUP BY building_id
        ) agg
      ) sub;
    `;
  }

  if (layerTable.type === 'buildings') {
    return `
      SELECT json_object(
           'type', 'FeatureCollection',
           'features', json_group_array(feature)
         ) AS geojson
      FROM (
        SELECT json_object(
          'type', 'Feature',
          'geometry', json_object('type', 'GeometryCollection', 'geometries', json_array(CAST(ST_AsGeoJSON(geometry) AS JSON))),
          'properties', ${propertiesExpression}
        ) AS feature
        FROM ${qualifiedTableName}
      ) sub;
    `;
  }

  return `
    SELECT json_object(
         'type', 'FeatureCollection',
         'features', json_group_array(feature)
       ) AS geojson
    FROM (
    SELECT json_object(
            'type', 'Feature',
            'geometry', CAST(ST_AsGeoJSON(geometry) AS JSON),
            'properties', ${propertiesExpression}
          ) AS feature
    FROM ${qualifiedTableName}
    ) sub;
`;
};

function buildPropertiesExpression(layerTable: Table & { type: LayerType }): string {
  if (hasPropertiesColumn(layerTable)) {
    return `COALESCE(CAST(properties AS JSON), '{}'::JSON)`;
  }

  const propertyColumns = layerTable.columns.filter((column) => column.type !== 'GEOMETRY');
  if (propertyColumns.length === 0) {
    return `'{}'::JSON`;
  }

  return `json_object(${propertyColumns
    .map((column) => `'${column.name.replace(/'/g, "''")}', ${quoteIdentifier(column.name)}`)
    .join(', ')})`;
}

function hasPropertiesColumn(table: Table): boolean {
  return table.columns.some((column) => column.name === 'properties');
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
