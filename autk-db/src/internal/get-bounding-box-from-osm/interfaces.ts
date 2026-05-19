export interface GetBoundingBoxFromOsmParams {
  osmTableName: string;
  workspace?: string;
  /** Target CRS. Defaults to EPSG:4326 (no transformation). */
  coordinateFormat?: string;
}
