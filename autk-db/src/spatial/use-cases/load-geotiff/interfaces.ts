import { BoundingBox } from '../../../shared/interfaces';

export interface LoadGeoTiffParams {
  /** URL of the GeoTIFF file to fetch and load. */
  geotiffFileUrl?: string;
  /** Raw ArrayBuffer of an already-fetched GeoTIFF file. */
  geotiffArrayBuffer?: ArrayBuffer;
  /** Name of the output DuckDB table. */
  outputTableName: string;
  /**
   * CRS of the input GeoTIFF file (source). Defaults to EPSG:4326.
   * The geometry will be transformed from this CRS to the workspace CRS.
   */
  coordinateFormat?: string;
  /**
   * Clip the raster to this bounding box (in the source CRS) before loading.
   * Strongly recommended for large tiles — without it the full raster is decoded,
   * which may be millions of pixels and exceed browser memory limits.
   */
  boundingBox?: BoundingBox;
  /**
   * Maximum number of pixels to load. Defaults to 500 000.
   * An error is thrown if the decoded region exceeds this limit,
   * prompting the caller to supply a `boundingBox` to reduce the area.
   */
  maxPixels?: number;
  workspace?: string;
}
