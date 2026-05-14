import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { CsvTable, CustomLayerTable, LayerTable, JsonTable, Table } from '../shared/interfaces';
import { loadDb } from '../config/duckdb';
import { LoadLayerUseCase, LoadLayerParams } from './use-cases/load-layer';
import { LoadCsvUseCase, LoadCsvParams } from './use-cases/load-csv';
import { LoadJsonUseCase, LoadJsonParams } from './use-cases/load-json';
import { GetLayerGeojsonUseCase } from './use-cases/get-layer-geojson';
import { FeatureCollection } from 'geojson';
import { isLayerType } from 'autk-core';
import { LoadCustomLayerParams, LoadCustomLayerUseCase } from './use-cases/load-custom-layer';
import { AssignBuildingIdsUseCase } from './use-cases/assign-building-ids/assign-building-ids-use-case';
import { SpatialQueryParams } from './use-cases/spatial-join/interfaces';
import { SpatialJoinUseCase } from './use-cases/spatial-join/spatial-join-use-case';
import { DropTableUseCase } from './shared/use-cases/drop-table/drop-table-use-case';
import { BoundingBox } from '../shared/interfaces';
import { TransformBoundingBoxCoordinatesUseCase } from './shared/use-cases/transform-bounding-box-coordinates/transform-bounding-box-coordinates-use-case';
import { GetBoundingBoxFromLayerUseCase } from './shared/use-cases/get-bounding-box-from-layer/get-bounding-box-from-layer-use-case';
import { LoadOsmParams, LoadOsmFromOverpassApiUseCase } from './use-cases/load-osm-from-overpass-api';
import { LoadOsmFromPbfUseCase } from './use-cases/load-osm-from-pbf';
import { OsmProcessingPipeline } from './use-cases/osm-processing-pipeline/osm-processing-pipeline';
import type { OsmLoadTimings } from './use-cases/load-osm-from-overpass-api/interfaces';
import { LoadGridLayerParams, LoadGridLayerUseCase } from './use-cases/load-grid-layer/load-grid-layer-use-case';
import { GridLayerTable, GeoTiffTable } from '../shared/interfaces';
import { LoadGeoTiffUseCase, LoadGeoTiffParams } from './use-cases/load-geotiff';
import { RawQueryOutput, RawQueryParams } from './use-cases/raw-query/interfaces';
import { RawQueryUseCase } from './use-cases/raw-query';
import { GetBoundingBoxFromOsmUseCase } from './shared/use-cases/get-bounding-box-from-osm/get-bounding-box-from-osm-use-case';
import { PolygonizeSurfaceLayerUseCase } from './use-cases/polygonize-surface-layer';
import { BuildHeatmapParams, BuildHeatmapUseCase } from './use-cases/build-heatmap';
import { GetTableDataParams, GetTableDataOutput, GetTableDataUseCase } from './use-cases/get-table-data';
import { UpdateTableUseCase, UpdateTableParams } from './use-cases/update-table';
import { toPlain } from './shared/utils';
import { DEFAULT_INPUT_COORDINATE_FORMAT, DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '../shared/consts';

interface WorkspaceData {
  tables: Array<Table>;
  /** Target CRS for all geometries stored in this workspace. */
  coordinateFormat: string;
  workspaceBoundingBox?: BoundingBox;
  osmBoundingBox?: BoundingBox;
  osmBoundingBoxWgs84?: BoundingBox;
}

/**
 * SpatialDb class provides methods to interact with a DuckDB database for spatial data operations.
 *
 * It allows loading OSM data, CSV, JSON, custom layers, and grid layers,
 * as well as performing spatial joins and raw queries.
 * DuckDB-backed spatial database for OSM, CSV, JSON, and raster data.
 *
 * Supports multiple isolated workspaces, each with its own schema and tables.
 *
 * @example
 * const db = new AutkSpatialDb();
 * await db.init();
 * const layer = await db.getLayer('osm_buildings');
 */
export class AutkSpatialDb {
  private db?: AsyncDuckDB;
  private conn?: AsyncDuckDBConnection;
  private currentWorkspace: string = 'main';
  private workspaces: Map<string, WorkspaceData> = new Map();

  public get tables(): Array<Table> {
    return this.getCurrentWorkspaceData().tables;
  }

  private osmProcessingPipeline?: OsmProcessingPipeline;
  private loadOsmFromOverpassApiUseCase?: LoadOsmFromOverpassApiUseCase;
  private loadOsmFromPbfUseCase?: LoadOsmFromPbfUseCase;
  private loadCsvUseCase?: LoadCsvUseCase;
  private loadLayerUseCase?: LoadLayerUseCase;
  private loadCustomLayerUseCase?: LoadCustomLayerUseCase;
  private assignBuildingIdsUseCase?: AssignBuildingIdsUseCase;
  private loadJsonUseCase?: LoadJsonUseCase;
  private getLayerGeojsonUseCase?: GetLayerGeojsonUseCase;
  private spatialJoinUseCase?: SpatialJoinUseCase;
  private getBoundingBoxFromLayerUseCase?: GetBoundingBoxFromLayerUseCase;
  private dropTableUseCase?: DropTableUseCase;
  private transformBoundingBoxCoordinatesUseCase?: TransformBoundingBoxCoordinatesUseCase;
  private loadGridLayerUseCase?: LoadGridLayerUseCase;
  private loadGeoTiffUseCase?: LoadGeoTiffUseCase;
  private rawQueryUseCase?: RawQueryUseCase;
  private getBoundingBoxFromOsmUseCase?: GetBoundingBoxFromOsmUseCase;
  private polygonizeSurfaceLayerUseCase?: PolygonizeSurfaceLayerUseCase;
  private buildHeatmapUseCase?: BuildHeatmapUseCase;
  private getTableDataUseCase?: GetTableDataUseCase;
  private updateTableUseCase?: UpdateTableUseCase;

  private getCurrentWorkspaceData(): WorkspaceData {
    const data = this.workspaces.get(this.currentWorkspace);
    if (!data) {
      throw new Error(`Workspace '${this.currentWorkspace}' not found. This should not happen.`);
    }
    return data;
  }

  async init() {
    this.db = await loadDb();
    this.conn = await this.db.connect();

    await this.conn.query('INSTALL spatial; LOAD spatial;');

    await this.conn.query('CREATE SCHEMA IF NOT EXISTS main');
    this.workspaces.set('main', {
      tables: [],
      coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT,
      workspaceBoundingBox: undefined,
      osmBoundingBox: undefined,
    });

    this.osmProcessingPipeline = new OsmProcessingPipeline(this.db, this.conn);
    this.loadOsmFromOverpassApiUseCase = new LoadOsmFromOverpassApiUseCase(this.conn, this.osmProcessingPipeline);
    this.loadOsmFromPbfUseCase = new LoadOsmFromPbfUseCase(this.conn, this.osmProcessingPipeline);
    this.loadCsvUseCase = new LoadCsvUseCase(this.db, this.conn);
    this.loadJsonUseCase = new LoadJsonUseCase(this.db, this.conn);
    this.loadLayerUseCase = new LoadLayerUseCase(this.db, this.conn);
    this.loadCustomLayerUseCase = new LoadCustomLayerUseCase(this.db, this.conn);
    this.assignBuildingIdsUseCase = new AssignBuildingIdsUseCase(this.db, this.conn);
    this.getLayerGeojsonUseCase = new GetLayerGeojsonUseCase(this.conn);
    this.spatialJoinUseCase = new SpatialJoinUseCase(this.conn);
    this.getBoundingBoxFromLayerUseCase = new GetBoundingBoxFromLayerUseCase(this.conn);
    this.dropTableUseCase = new DropTableUseCase(this.conn);
    this.transformBoundingBoxCoordinatesUseCase = new TransformBoundingBoxCoordinatesUseCase(this.conn);
    this.loadGridLayerUseCase = new LoadGridLayerUseCase(this.conn);
    this.loadGeoTiffUseCase = new LoadGeoTiffUseCase(this.db, this.conn);
    this.rawQueryUseCase = new RawQueryUseCase(this.conn);
    this.getBoundingBoxFromOsmUseCase = new GetBoundingBoxFromOsmUseCase(this.conn);
    this.polygonizeSurfaceLayerUseCase = new PolygonizeSurfaceLayerUseCase(this.db, this.conn);
    this.buildHeatmapUseCase = new BuildHeatmapUseCase(this.conn);
    this.getTableDataUseCase = new GetTableDataUseCase(this.conn);
    this.updateTableUseCase = new UpdateTableUseCase(this.db, this.conn);
  }

  async setWorkspace(name: string): Promise<void> {
    if (!this.conn) {
      throw new Error('Database not initialized. Please call init() first.');
    }

    if (!this.workspaces.has(name)) {
      await this.conn.query(`CREATE SCHEMA IF NOT EXISTS ${name}`);
      this.workspaces.set(name, {
        tables: [],
        coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT,
        workspaceBoundingBox: undefined,
        osmBoundingBox: undefined,
      });
    }

    this.currentWorkspace = name;
  }

  getWorkspaces(): string[] {
    return Array.from(this.workspaces.keys());
  }

  getCurrentWorkspace(): string {
    return this.currentWorkspace;
  }

  /** Gets the workspace target coordinate format (CRS for stored geometries). */
  getWorkspaceCoordinateFormat(): string {
    return this.getCurrentWorkspaceData().coordinateFormat;
  }

  /** Sets the workspace target coordinate format. Affects subsequently loaded datasets. */
  setWorkspaceCoordinateFormat(format: string): void {
    this.getCurrentWorkspaceData().coordinateFormat = format;
  }

  private _registerTable(table: Table): void {
    const workspaceData = this.getCurrentWorkspaceData();
    const existingIndex = workspaceData.tables.findIndex((t) => t.name === table.name);

    if (existingIndex !== -1) {
      console.warn(`Table '${table.name}' already exists in workspace '${this.currentWorkspace}'. Overwriting...`);
      workspaceData.tables[existingIndex] = table;
    } else {
      workspaceData.tables.push(table);
    }
  }

  // ---- LOAD's methods

  private async clipLayerToSurface(
    layerTableName: string,
    surfaceTableName: string,
    workspace: string,
    cropGeometry: boolean = true,
  ): Promise<void> {
    const qualifiedLayer = `${workspace}.${layerTableName}`;
    const qualifiedSurface = `${workspace}.${surfaceTableName}`;
    const geometrySelect = cropGeometry ? 'ST_Intersection(l.geometry, surf.geom)' : 'l.geometry';
    const emptyFilter = cropGeometry ? 'WHERE NOT ST_IsEmpty(geometry)' : '';

    await this.conn!.query(`
      CREATE OR REPLACE TABLE ${qualifiedLayer} AS
      WITH surf AS (
        SELECT ST_Union_Agg(geometry) AS geom FROM ${qualifiedSurface}
      ),
      clipped AS (
        SELECT l.* EXCLUDE (geometry),
          ${geometrySelect} AS geometry
        FROM ${qualifiedLayer} l, surf
        WHERE ST_Intersects(l.geometry, surf.geom)
      )
      SELECT * FROM clipped
      ${emptyFilter};
    `);
  }

  async loadOsm(params: LoadOsmParams): Promise<OsmLoadTimings> {
    if (
      !this.db ||
      !this.conn ||
      !this.loadOsmFromOverpassApiUseCase ||
      !this.loadOsmFromPbfUseCase ||
      !this.dropTableUseCase ||
      !this.getBoundingBoxFromOsmUseCase ||
      !this.transformBoundingBoxCoordinatesUseCase ||
      !this.polygonizeSurfaceLayerUseCase
    )
      throw new Error('Database not initialized. Please call init() first.');

    const workspaceData = this.getCurrentWorkspaceData();
    const targetCrs = workspaceData.coordinateFormat;
    const sourceCrs = params.autoLoadLayers?.coordinateFormat ?? DEFAULT_INPUT_COORDINATE_FORMAT;

    const execResult = params.pbfFileUrl
      ? await this.loadOsmFromPbfUseCase.exec({ ...params, workspace: this.currentWorkspace })
      : await this.loadOsmFromOverpassApiUseCase.exec({ ...params, workspace: this.currentWorkspace });
    for (const table of execResult.tables) {
      this._registerTable(table);
    }

    const timings: OsmLoadTimings = {
      osmElementCount: execResult.osmElementCount,
      boundaryElementCount: execResult.boundaryElementCount,
      osmDataProcessingMs: execResult.osmDataProcessingMs,
      boundariesProcessingMs: execResult.boundariesProcessingMs,
      layers: [],
    };

    if (params.autoLoadLayers) {
      const boundaryTableName = `${params.outputTableName}_boundaries`;
      const rawBoundingBox = await this.getBoundingBoxFromOsmUseCase.exec({
        osmTableName: boundaryTableName,
        workspace: this.currentWorkspace
      });

      workspaceData.osmBoundingBoxWgs84 = rawBoundingBox;
      workspaceData.osmBoundingBox = await this.transformBoundingBoxCoordinatesUseCase.exec({
        boundingBox: rawBoundingBox,
        coordinateFormat: targetCrs,
      });
      workspaceData.workspaceBoundingBox = workspaceData.osmBoundingBox;

      let surfaceLayerName: string | null = null;
      const clippableLayerNames: string[] = [];

      for (const layer of params.autoLoadLayers.layers) {
        const shouldCropToBbox = layer !== 'buildings';

        const layerParams: LoadLayerParams = {
          osmInputTableName: params.outputTableName,
          coordinateFormat: sourceCrs,
          layer,
        };

        layerParams.boundingBox = shouldCropToBbox ? workspaceData.osmBoundingBox : undefined;

        const t0 = performance.now();
        const layerTable = await this.loadLayer({ ...layerParams, workspaceCoordinateFormat: targetCrs });
        const loadMs = performance.now() - t0;

        const countResult = await this.conn.query(
          `SELECT COUNT(*) as cnt FROM ${this.currentWorkspace}.${layerTable.name}`
        );
        const featureCount = Number(countResult.toArray()[0].cnt);

        timings.layers.push({ layerName: layerTable.name, layerType: layer, loadMs, featureCount });

        if (layer === 'surface') {
          const updatedTable = await this.polygonizeSurfaceLayerUseCase.exec(
            { surfaceTableName: layerTable.name, workspace: this.currentWorkspace },
            layerTable
          );
          const tableIndex = workspaceData.tables.findIndex((t) => t.name === layerTable.name);
          if (tableIndex !== -1) workspaceData.tables[tableIndex] = updatedTable;
          surfaceLayerName = layerTable.name;
        } else {
          clippableLayerNames.push(layerTable.name);
        }
      }

      if (surfaceLayerName && clippableLayerNames.length > 0) {
        for (const layerName of clippableLayerNames) {
          const cropGeometry = !layerName.endsWith('_buildings');
          await this.clipLayerToSurface(layerName, surfaceLayerName, this.currentWorkspace, cropGeometry);
        }
      }

      if (params.autoLoadLayers.dropOsmTable) {
        for (const table of execResult.tables) {
          await this.dropTableUseCase.exec({ tableName: table.name, workspace: this.currentWorkspace });
          workspaceData.tables = workspaceData.tables.filter((t) => t.name !== table.name);
        }
      }

      console.log(`OSM data loaded and completed in workspace '${this.currentWorkspace}'!`);
    }

    return timings;
  }

  async loadCsv(params: LoadCsvParams): Promise<CsvTable> {
    if (!this.db || !this.conn || !this.loadCsvUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const workspaceData = this.getCurrentWorkspaceData();
    const table = await this.loadCsvUseCase.exec({
      ...params,
      workspace: this.currentWorkspace,
      workspaceCoordinateFormat: workspaceData.coordinateFormat,
    });
    this._registerTable(table);

    return table;
  }

  async loadJson(params: LoadJsonParams): Promise<JsonTable> {
    if (!this.db || !this.conn || !this.loadJsonUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const workspaceData = this.getCurrentWorkspaceData();
    const table = await this.loadJsonUseCase.exec({
      ...params,
      workspace: this.currentWorkspace,
      workspaceCoordinateFormat: workspaceData.coordinateFormat,
    });
    this._registerTable(table);

    return table;
  }

  async loadLayer(params: LoadLayerParams & { workspaceCoordinateFormat?: string }): Promise<LayerTable> {
    if (!this.db || !this.conn || !this.loadLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const osmTable = this.tables.find((t) => t.name === params.osmInputTableName);
    if (!osmTable) throw new Error(`Table ${params.osmInputTableName} not found.`);
    if (!(osmTable.source === 'osm' && osmTable.type === 'pointset'))
      throw new Error(`Table ${params.osmInputTableName} is not an OSM table.`);

    const workspaceData = this.getCurrentWorkspaceData();
    const table = await this.loadLayerUseCase.exec({
      ...params,
      workspace: this.currentWorkspace,
      workspaceCoordinateFormat: params.workspaceCoordinateFormat ?? workspaceData.coordinateFormat,
    });
    this._registerTable(table);

    return table;
  }

  async loadCustomLayer(params: LoadCustomLayerParams): Promise<CustomLayerTable> {
    if (
      !this.db ||
      !this.conn ||
      !this.loadCustomLayerUseCase ||
      !this.assignBuildingIdsUseCase ||
      !this.getBoundingBoxFromLayerUseCase
    )
      throw new Error('Database not initialized. Please call init() first.');

    const workspaceData = this.getCurrentWorkspaceData();
    const table = await this.loadCustomLayerUseCase.exec({
      ...params,
      boundingBox: workspaceData.osmBoundingBox,
      workspace: this.currentWorkspace,
      workspaceCoordinateFormat: workspaceData.coordinateFormat,
    });
    this._registerTable(table);

    if (!workspaceData.workspaceBoundingBox) {
      workspaceData.workspaceBoundingBox = await this.getBoundingBoxFromLayerUseCase.exec({
        layerTableName: table.name,
        workspace: this.currentWorkspace,
      });
    }

    if (params.layerType === 'buildings') {
      const columns = await this.assignBuildingIdsUseCase.exec({
        tableName: table.name,
        workspace: this.currentWorkspace,
      });
      table.columns = columns;
    }

    return table;
  }

  async loadGridLayer(params: LoadGridLayerParams): Promise<GridLayerTable> {
    if (!this.db || !this.conn || !this.loadGridLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const workspaceData = this.getCurrentWorkspaceData();
    const table = await this.loadGridLayerUseCase.exec({
      ...params,
      boundingBox: params.boundingBox || workspaceData.osmBoundingBox,
      workspace: this.currentWorkspace
    });
    this._registerTable(table);

    return table;
  }

  async loadGeoTiff(params: LoadGeoTiffParams): Promise<GeoTiffTable> {
    if (!this.db || !this.conn || !this.loadGeoTiffUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const workspaceData = this.getCurrentWorkspaceData();
    const table = await this.loadGeoTiffUseCase.exec({
      ...params,
      workspace: this.currentWorkspace,
      workspaceCoordinateFormat: workspaceData.coordinateFormat,
    });
    this._registerTable(table);

    return table;
  }

  async getGeoTiffLayer(tableName: string): Promise<FeatureCollection<null>> {
    if (!this.db || !this.conn)
      throw new Error('Database not initialized. Please call init() first.');

    const table = this.tables.find((t) => t.name === tableName);
    if (!table || table.source !== 'geotiff')
      throw new Error(`Table ${tableName} is not a GeoTiff table.`);

    const qualifiedName = `${this.currentWorkspace}.${tableName}`;

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
    if (!row) throw new Error(`No data found in GeoTiff table ${tableName}.`);

    const { res_x, res_y, min_lon, min_lat, max_lon, max_lat, raster } = row;

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

  // GETTER'S

  async getLayer(layerTableName: string): Promise<FeatureCollection> {
    if (!this.db || !this.conn || !this.getLayerGeojsonUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const layerTable = this.tables.find((t) => t.name === layerTableName);
    if (!layerTable) throw new Error(`Table ${layerTableName} not found.`);
    if (!isLayerType(layerTable.type)) throw new Error(`Table ${layerTableName} is not a Layer table.`);

    const featureCollection = await this.getLayerGeojsonUseCase.exec(layerTable as LayerTable | CustomLayerTable, this.currentWorkspace);

    const workspaceData = this.getCurrentWorkspaceData();
    const osmBoundingBox = this.getOsmBoundingBox();
    if (osmBoundingBox) {
      featureCollection.bbox = osmBoundingBox;
    } else if (workspaceData.workspaceBoundingBox) {
      featureCollection.bbox = [
        workspaceData.workspaceBoundingBox.minLon,
        workspaceData.workspaceBoundingBox.minLat,
        workspaceData.workspaceBoundingBox.maxLon,
        workspaceData.workspaceBoundingBox.maxLat,
      ];
    } else {
      const layerBoundingBox = await this.getBoundingBoxFromLayer(layerTableName);
      featureCollection.bbox = [
        layerBoundingBox.minLon,
        layerBoundingBox.minLat,
        layerBoundingBox.maxLon,
        layerBoundingBox.maxLat,
      ];
    }

    return featureCollection;
  }

  getOsmBoundingBox(): [number, number, number, number] | null {
    const workspaceData = this.getCurrentWorkspaceData();
    if (!workspaceData.osmBoundingBox) return null;

    return [
      workspaceData.osmBoundingBox.minLon,
      workspaceData.osmBoundingBox.minLat,
      workspaceData.osmBoundingBox.maxLon,
      workspaceData.osmBoundingBox.maxLat,
    ]
  }

  getOsmBoundingBoxWgs84(): BoundingBox | null {
    return this.getCurrentWorkspaceData().osmBoundingBoxWgs84 ?? null;
  }

  async getBoundingBoxFromLayer(layerName: string): Promise<BoundingBox> {
    if (!this.db || !this.conn || !this.getBoundingBoxFromLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const layerTable = this.tables.find((t) => t.name === layerName);
    if (!layerTable) throw new Error(`Table ${layerName} not found.`);

    const hasGeometry = layerTable.columns.find((column) => column.type === 'GEOMETRY');
    if (!hasGeometry) {
      throw new Error(
        `Table ${layerName} does not have a geometry column. This method only works with layer tables that contain geometries.`,
      );
    }

    return this.getBoundingBoxFromLayerUseCase.exec({
      layerTableName: layerName,
      workspace: this.currentWorkspace,
    });
  }

  getLayerTables(): Array<LayerTable | CustomLayerTable> {
    return this.tables.filter((table): table is LayerTable | CustomLayerTable => {
      return (
        (table.source === 'osm' && isLayerType(table.type)) ||
        (table.source === 'geojson' && isLayerType(table.type)) ||
        (table.source === 'user' && isLayerType(table.type))
      );
    });
  }

  async getTableData(params: GetTableDataParams): Promise<GetTableDataOutput> {
    if (!this.db || !this.conn || !this.getTableDataUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = this.tables.find((t) => t.name === params.tableName);
    if (!table) throw new Error(`Table ${params.tableName} not found.`);

    return this.getTableDataUseCase.exec({ ...params, workspace: this.currentWorkspace });
  }

  // ---- UPDATE methods

  async updateTable(params: Omit<UpdateTableParams, 'workspace'>): Promise<Table> {
    if (!this.db || !this.conn || !this.updateTableUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = this.tables.find((t) => t.name === params.tableName);
    if (!table) throw new Error(`Table ${params.tableName} not found.`);

    const result = await this.updateTableUseCase.exec(
      { ...params, workspace: this.currentWorkspace },
      table
    );

    const workspaceData = this.getCurrentWorkspaceData();
    const tableIndex = workspaceData.tables.findIndex((t) => t.name === params.tableName);
    if (tableIndex !== -1) {
      workspaceData.tables[tableIndex] = result.table;
    }

    return result.table;
  }

  // CUSTOM QUERIES

  async spatialQuery(params: SpatialQueryParams): Promise<Table> {
    if (!this.db || !this.conn || !this.spatialJoinUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const workspaceData = this.getCurrentWorkspaceData();
    const { created, table } = await this.spatialJoinUseCase.exec(params, workspaceData.tables);
    if (created) this._registerTable(table);
    else workspaceData.tables = workspaceData.tables.map((t) => (t.name === table.name ? table : t));

    return table;
  }

  async rawQuery<T = RawQueryOutput>(params: RawQueryParams): Promise<T | Table> {
    if (!this.db || !this.conn || !this.rawQueryUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const result = await this.rawQueryUseCase.exec(params);

    if (params.output.type === 'CREATE_TABLE') {
      this._registerTable(result as Table);
      return result as Table;
    }

    return result as unknown as T;
  }

  async removeLayer(tableName: string): Promise<void> {
    if (!this.conn || !this.dropTableUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    await this.dropTableUseCase.exec({ tableName, workspace: this.currentWorkspace });

    const workspaceData = this.getCurrentWorkspaceData();
    workspaceData.tables = workspaceData.tables.filter((t) => t.name !== tableName);
  }

  async buildHeatmap(params: BuildHeatmapParams): Promise<Table> {
    if (!this.db || !this.conn || !this.buildHeatmapUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const workspaceData = this.getCurrentWorkspaceData();
    const table = await this.buildHeatmapUseCase.exec(params, workspaceData.tables, workspaceData.workspaceBoundingBox);
    this._registerTable(table);

    return table;
  }
}
