import { LayerType, BoundingBox } from 'autk-core';

export type { BoundingBox };

export {
  PARKS_LEISURE_VALUES,
  PARKS_LANDUSE_VALUES,
  PARKS_NATURAL_VALUES,
  WATER_NATURAL_VALUES,
  WATER_FEATURE_VALUES,
  EXCLUDED_ROADS_VALUES,
  EXCLUDED_BUILDING_VALUES,
} from './consts';

/** Supported origins for tables registered in the database workspace. */
export type TableSource = 'osm' | 'geojson' | 'csv' | 'json' | 'geotiff' | 'user';

/** Describes a single table column as reported by DuckDB. */
export interface Column {
  /** Stable column name used in queries and result objects. */
  name: string;
  /** Database type string returned for the column. */
  type: string;
}

/** Metadata for one raster band exposed by a GeoTIFF-backed table. */
export interface RasterBandMetadata {
  /** Internal band identifier used by raster operations. */
  id: string;
  /** Human-readable label shown in UI controls and outputs. */
  label: string;
}

/** Shared metadata stored for every table tracked by the workspace. */
export interface BaseTable {
  /** Declares how the table entered the database. */
  source: TableSource;
  /** Unique table name within the active workspace. */
  name: string;
  /** Flat schema information returned by DuckDB. */
  columns: Column[];
  /** Optional raster band metadata when the table stores raster data. */
  bands?: RasterBandMetadata[];
}

/** Raw OSM import that has not yet been materialized as a renderable layer. */
export interface OsmTable extends BaseTable {
  source: 'osm';
  type?: undefined;
}

/** OSM-derived layer with an explicit geometry type for rendering and queries. */
export interface OsmLayerTable extends BaseTable {
  source: 'osm';
  type: LayerType;
}

/** GeoJSON import with a known layer type inferred during loading. */
export interface GeojsonTable extends BaseTable {
  source: 'geojson';
  type: LayerType;
}

/** CSV table without geometry metadata. */
export interface CsvTable extends BaseTable {
  source: 'csv';
  type?: undefined;
}

/** JSON table without renderable geometry metadata. */
export interface JsonTable extends BaseTable {
  source: 'json';
  type?: undefined;
}

/** GeoTIFF-backed raster table. */
export interface GeotiffTable extends BaseTable {
  source: 'geotiff';
  type: 'raster';
}

/** User-provided table that may be plain tabular data or an explicit layer. */
export interface UserTable extends BaseTable {
  source: 'user';
  type?: LayerType;
}

/** All table metadata variants that can be stored in an `AutkDb` workspace. */
export type Table = OsmTable | OsmLayerTable | CsvTable | JsonTable | GeojsonTable | GeotiffTable | UserTable;

/**
 * Narrows a table to metadata that can be rendered on a map.
 *
 * Use this guard before accessing `table.type` in visualization code.
 *
 * @param table - Table metadata to inspect.
 * @returns `true` when the table has a defined renderable `type`.
 * @throws Never throws.
 * @example
 * const renderable = tables.filter(isRenderableTable);
 * console.log(renderable[0]?.type); // 'point', 'polygon', 'line', or 'raster'
 */
export function isRenderableTable(table: Table): table is Table & { type: LayerType } {
  return table.type !== undefined;
}

/**
 * Narrows a table to vector geometry layers.
 *
 * Excludes raw OSM tables, plain tabular imports, and raster tables.
 *
 * @param table - Table metadata to inspect.
 * @returns `true` when the table has a non-raster layer `type`.
 * @throws Never throws.
 * @example
 * const vectorTables = tables.filter(isVectorTable);
 * console.log(vectorTables.every((table) => table.type !== 'raster')); // true
 */
export function isVectorTable(
  table: Table,
): table is OsmLayerTable | GeojsonTable | (UserTable & { type: Exclude<LayerType, 'raster'> }) {
  return table.type !== undefined && table.type !== 'raster';
}

/**
 * Narrows a table to raster-backed layers.
 *
 * Use this guard before reading raster band metadata or raster-specific options.
 *
 * @param table - Table metadata to inspect.
 * @returns `true` when the table represents raster data.
 * @throws Never throws.
 * @example
 * const rasterTables = tables.filter(isRasterTable);
 * console.log(rasterTables[0]?.bands?.map((band) => band.label)); // ['Band 1']
 */
export function isRasterTable(
  table: Table,
): table is GeotiffTable | (UserTable & { type: 'raster' }) {
  return table.type === 'raster';
}
