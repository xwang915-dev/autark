import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection } from 'geojson';

import { DEFAULT_WORKSPACE_NAME } from '../../consts';
import { toPlain } from '../../utils';

/**
 * Exports a loaded raster table as a packed raster FeatureCollection for rendering.
 */
export class GetRasterUseCase {
  /** DuckDB connection used to execute raster queries. */
  private conn: AsyncDuckDBConnection;

  /**
   * Creates a new instance bound to the given DuckDB connection.
   *
   * @param conn - Open connection used to execute SQL queries.
   */
  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  /**
   * Exports a raster table into a single-feature collection containing packed raster payload.
   *
   * @param tableName - unqualified name of the raster table to read.
   * @param workspace - workspace namespace used to qualify the table name.
   * @returns A FeatureCollection with a single feature containing raster values and resolution metadata.
   */
  async exec(tableName: string, workspace: string = DEFAULT_WORKSPACE_NAME): Promise<FeatureCollection<null>> {
    const qualifiedName = `${workspace}.${tableName}`;

    const result = await this.conn.query(`
      WITH pixels AS (
        SELECT
          t.properties AS properties,
          ST_X(t.geometry) AS px,
          ST_Y(t.geometry) AS py
        FROM ${qualifiedName} t
      )
      SELECT
        COUNT(DISTINCT ROUND(px, 8))::INTEGER AS res_x,
        COUNT(DISTINCT ROUND(py, 8))::INTEGER AS res_y,
        MIN(px) AS min_lon,
        MIN(py) AS min_lat,
        MAX(px) AS max_lon,
        MAX(py) AS max_lat,
        list(properties ORDER BY py ASC, px ASC) AS raster
      FROM pixels
    `);

    const row = toPlain(result.toArray()[0]?.toJSON());
    if (!row) throw new Error(`No data found in raster table ${tableName}.`);

    const { res_x, res_y, min_lon, min_lat, max_lon, max_lat, raster } = row as Record<string, unknown>;

    const spacingX = Number(res_x) > 1 ? Math.abs((Number(max_lon) - Number(min_lon)) / (Number(res_x) - 1)) : null;
    const spacingY = Number(res_y) > 1 ? Math.abs((Number(max_lat) - Number(min_lat)) / (Number(res_y) - 1)) : null;
    const halfX = (spacingX ?? spacingY ?? 0) / 2;
    const halfY = (spacingY ?? spacingX ?? 0) / 2;

    return {
      type: 'FeatureCollection',
      bbox: [Number(min_lon) - halfX, Number(min_lat) - halfY, Number(max_lon) + halfX, Number(max_lat) + halfY],
      features: [
        {
          type: 'Feature',
          geometry: null,
          properties: {
            rasterResX: res_x,
            rasterResY: res_y,
            raster,
          },
        },
      ],
    };
  }
}
