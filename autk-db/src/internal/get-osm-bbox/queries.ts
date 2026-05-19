export const GET_OSM_BBOX_QUERY = (osmTableName: string, workspace: string) => {
  const qualifiedTableName = `${workspace}.${osmTableName}`;
  return `
    SELECT
      CAST(MIN(lon) AS DOUBLE) as minLon,
      CAST(MIN(lat) AS DOUBLE) as minLat,
      CAST(MAX(lon) AS DOUBLE) as maxLon,
      CAST(MAX(lat) AS DOUBLE) as maxLat
    FROM ${qualifiedTableName}
    WHERE lat IS NOT NULL AND lon IS NOT NULL;
  `;
};
