import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection, LineString, Polygon } from 'geojson';
import { polygonize } from '@turf/turf';

import { PolygonizeOsmSurfaceParams } from './interfaces';
import { OsmLayerTable } from '../../interfaces';
import { GetLayerUseCase } from '../../use-cases/get-layer';
import { LOAD_FEATURE_COLLECTION_QUERY } from '../../use-cases/load-geojson/queries';
import { LOAD_POLYGONIZED_LAYER_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import { DEFAULT_WORKSPACE_NAME } from '../../consts';

/**
 * Polygonizes a surface layer from line geometries into closed polygons.
 */
export class PolygonizeOsmSurfaceUseCase {
    private db: AsyncDuckDB;
    private conn: AsyncDuckDBConnection;
    private getLayerUseCase: GetLayerUseCase;

    constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
        this.db = db;
        this.conn = conn;
        this.getLayerUseCase = new GetLayerUseCase(conn);
    }

    async exec(params: PolygonizeOsmSurfaceParams, surfaceTable: OsmLayerTable): Promise<OsmLayerTable> {
        const { surfaceTableName, workspace = DEFAULT_WORKSPACE_NAME } = params;
        const qualifiedSurfaceTableName = `${workspace}.${surfaceTableName}`;
        const qualifiedFeatureCollectionTableName = `${workspace}.${surfaceTableName}_feature_collection`;

        const geojson = await this.getLayerUseCase.exec(surfaceTable, workspace) as FeatureCollection<LineString>;
        const polygonizedGeojson = polygonize(geojson) as FeatureCollection<Polygon>;

        await this.conn.query(`DROP TABLE IF EXISTS ${qualifiedSurfaceTableName};`);
        await this.conn.query(`DROP TABLE IF EXISTS ${qualifiedFeatureCollectionTableName};`);

        const fileName = `temp_polygonized_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;

        await this.db.registerFileText(fileName, JSON.stringify(polygonizedGeojson));

        const featureCollectionQuery = LOAD_FEATURE_COLLECTION_QUERY(fileName, `${surfaceTableName}_feature_collection`, workspace);
        await this.conn.query(featureCollectionQuery);

        const queryLayer = LOAD_POLYGONIZED_LAYER_QUERY(
            `${surfaceTableName}_feature_collection`,
            surfaceTableName,
            workspace,
        );

        const describeTableResponse = await this.conn.query(queryLayer);
        await this.db.dropFile(fileName);

        console.log('Loaded polygonized layer!');

        return {
            source: 'osm',
            type: 'surface',
            columns: getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray()),
            name: surfaceTableName,
        };
    }
}
