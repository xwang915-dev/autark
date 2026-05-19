import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { DEFAULT_WORKSPACE_NAME } from '../../consts';
import { AggregateBuildingLayerParams } from './interfaces';
import {
  SELECT_BUILDING_IDS_QUERY,
  CREATE_TEMP_AGG_TABLE_QUERY,
  BATCH_INSERT_QUERY,
  SINGLE_INSERT_QUERY,
  NULL_INSERT_QUERY,
  ADD_AGG_COLUMN_QUERY,
  NULL_COUNT_QUERY,
  DROP_TEMP_TABLE_QUERY,
} from './queries';

const BATCH_SIZE = 100;

/**
 * Aggregates building geometries by `building_id` into union geometries.
 */
export class AggregateBuildingLayerUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(params: AggregateBuildingLayerParams): Promise<void> {
    const { inputTableName, workspace = DEFAULT_WORKSPACE_NAME } = params;
    const qualifiedTableName = `${workspace}.${inputTableName}`;
    const tempTableName = `${inputTableName}_temp_agg`;

    const result = await this.conn.query(SELECT_BUILDING_IDS_QUERY(qualifiedTableName));
    const buildingIds: bigint[] = result.toArray().map((r: any) => r.building_id as bigint);

    await this.conn.query(CREATE_TEMP_AGG_TABLE_QUERY(tempTableName));

    for (let i = 0; i < buildingIds.length; i += BATCH_SIZE) {
      const batch = buildingIds.slice(i, i + BATCH_SIZE);
      const ids = batch.map(id => String(id)).join(',');

      try {
        await this.conn.query(BATCH_INSERT_QUERY(qualifiedTableName, tempTableName, ids));
      } catch (_error) {
        for (const bid of batch) {
          try {
            await this.conn.query(SINGLE_INSERT_QUERY(qualifiedTableName, tempTableName, String(bid)));
          } catch (_e) {
            console.warn(
              `[AggregateBuildingLayer] failed for building_id=${String(bid)}:`,
              (_e as Error).message,
            );
            await this.conn.query(NULL_INSERT_QUERY(tempTableName, String(bid)));
          }
        }
      }
    }

    await this.conn.query(ADD_AGG_COLUMN_QUERY(qualifiedTableName, tempTableName));

    const nullCount = (
      await this.conn.query(NULL_COUNT_QUERY(qualifiedTableName))
    ).toArray()[0]?.cnt as number;

    if (nullCount > 0) {
      console.warn(`[AggregateBuildingLayer] ${nullCount} rows have no agg_geometry (union failed)`);
    }

    await this.conn.query(DROP_TEMP_TABLE_QUERY(tempTableName));
  }
}
