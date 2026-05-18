import type { LayerType } from '../../types-core';

/**
 * Enables point geometry creation from the default `Latitude` and `Longitude` JSON fields.
 *
 * This shorthand covers the common case where input objects already follow the expected field naming convention.
 */
export type JsonDefaultLatLngGeometryColumns = true;

/**
 * Describes how to build point geometry from explicit latitude and longitude JSON fields.
 */
export interface JsonLatLngGeometryColumns {
  /** Name of the field that stores latitude values used to create point geometries. */
  latColumnName: string;
  /** Name of the field that stores longitude values used to create point geometries. */
  longColumnName: string;
  /** CRS of the source coordinate fields before they are transformed into the workspace CRS. */
  coordinateFormat?: string;
}

/**
 * Describes how to build geometry from a single WKT JSON field.
 */
export interface JsonWktGeometryColumns {
  /** Name of the field that stores WKT geometry text such as `POINT(...)` or `POLYGON(...)`. */
  wktColumnName: string;
  /** CRS of the source WKT geometry before it is transformed into the workspace CRS. */
  coordinateFormat?: string;
}

/**
 * Lists the supported ways to derive geometry while loading a JSON file.
 */
export type JsonGeometryColumns =
  | JsonDefaultLatLngGeometryColumns
  | JsonLatLngGeometryColumns
  | JsonWktGeometryColumns;

/**
 * Restricts JSON-derived geometry to vector layer families supported by the database.
 */
export type JsonGeometryLayerType = Extract<LayerType, 'points' | 'polylines' | 'polygons'>;

/**
 * Describes the inputs required to load JSON data into DuckDB.
 */
export interface LoadJsonParams {
  /** URL of the JSON file to fetch and load into DuckDB. */
  jsonFileUrl?: string;
  /** In-memory JSON array to serialize and load. */
  jsonObject?: unknown[];
  /** Name of the output table created inside the target workspace. */
  outputTableName: string;
  /** Optional geometry strategy used to create a spatial column while loading. */
  geometryColumns?: JsonGeometryColumns;
  /** Optional workspace override used by higher-level callers when qualifying the table name. */
  workspace?: string;
}
