import type { LayerType } from '../../types-core';

/**
 * Uses the default `Latitude` and `Longitude` CSV columns to build point geometry.
 *
 * This shorthand keeps the common latitude/longitude case concise while still creating a renderable point layer.
 */
export type CsvDefaultLatLngGeometryColumns = true;

/**
 * Configures CSV geometry creation from explicit latitude and longitude columns.
 *
 * Use this when the source file stores coordinates under custom column names or in a non-default CRS.
 */
export interface CsvLatLngGeometryColumns {
  /** Column containing latitude values. */
  latColumnName: string;
  /** Column containing longitude values. */
  longColumnName: string;
  /** CRS of the source coordinate columns before transformation into the workspace CRS. */
  coordinateFormat?: string;
}

/**
 * Configures CSV geometry creation from a single WKT geometry column.
 *
 * The layer family is inferred from the WKT geometry type after the table is loaded.
 */
export interface CsvWktGeometryColumns {
  /** Column containing WKT geometry text such as `POINT(...)` or `POLYGON(...)`. */
  wktColumnName: string;
  /** CRS of the source WKT geometry before transformation into the workspace CRS. */
  coordinateFormat?: string;
}

/**
 * Supported CSV geometry configuration modes.
 *
 * `true` uses the default `Latitude` and `Longitude` columns, while objects allow custom lat/lng or WKT-based geometry input.
 */
export type CsvGeometryColumns =
  | CsvDefaultLatLngGeometryColumns
  | CsvLatLngGeometryColumns
  | CsvWktGeometryColumns;

/**
 * Parameters for loading CSV data into DuckDB.
 *
 * Supports plain tabular CSV input or optional geometry creation from latitude/longitude or WKT columns.
 */
export interface LoadCsvParams {
  /** URL of the CSV file to fetch and load. */
  csvFileUrl?: string;
  /** In-memory CSV rows, including the header row as the first entry. */
  csvObject?: unknown[][];
  /** Name of the output table created inside the workspace. */
  outputTableName: string;
  /** Field delimiter used by the CSV source. Defaults to `,`. */
  delimiter?: string;
  /** Optional geometry configuration for point or WKT-based geometry creation. */
  geometryColumns?: CsvGeometryColumns;
  /** Optional workspace name override used by higher-level callers. */
  workspace?: string;
}

/**
 * Layer families that can be inferred from CSV geometry input.
 *
 * CSV-based geometry loading cannot produce raster layers.
 */
export type CsvGeometryLayerType = Extract<LayerType, 'points' | 'polylines' | 'polygons'>;
