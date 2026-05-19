export interface GetOsmBboxParams {
  osmTableName: string;
  workspace?: string;
  /** Target CRS. Defaults to EPSG:4326 (no transformation). */
  coordinateFormat?: string;
}
