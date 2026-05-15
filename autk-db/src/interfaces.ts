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

export type TableSource = 'osm' | 'geojson' | 'csv' | 'json' | 'geotiff' | 'user';

export interface Column {
  name: string;
  type: string;
}

export interface RasterBandMetadata {
  id: string;
  label: string;
}

export interface BaseTable {
  source: TableSource;
  name: string;
  columns: Column[];
  bands?: RasterBandMetadata[];
}

export interface OsmTable extends BaseTable {
  source: 'osm';
  type?: undefined;
}

export interface OsmLayerTable extends BaseTable {
  source: 'osm';
  type: LayerType;
}

export interface GeojsonTable extends BaseTable {
  source: 'geojson';
  type: LayerType;
}

export interface CsvTable extends BaseTable {
  source: 'csv';
  type?: undefined;
}

export interface JsonTable extends BaseTable {
  source: 'json';
  type?: undefined;
}

export interface GeotiffTable extends BaseTable {
  source: 'geotiff';
  type: 'raster';
}

export interface UserTable extends BaseTable {
  source: 'user';
  type?: LayerType;
}

export type Table = OsmTable | OsmLayerTable | CsvTable | JsonTable | GeojsonTable | GeotiffTable | UserTable;

export function isRenderableTable(table: Table): table is Table & { type: LayerType } {
  return table.type !== undefined;
}

export function isVectorTable(
  table: Table,
): table is OsmLayerTable | GeojsonTable | (UserTable & { type: Exclude<LayerType, 'raster'> }) {
  return table.type !== undefined && table.type !== 'raster';
}

export function isRasterTable(
  table: Table,
): table is GeotiffTable | (UserTable & { type: 'raster' }) {
  return table.type === 'raster';
}

export function isOsmTable(table: Table): table is OsmTable {
  return table.source === 'osm' && table.type === undefined;
}

export function isGeotiffTable(table: Table): table is GeotiffTable {
  return table.source === 'geotiff';
}
