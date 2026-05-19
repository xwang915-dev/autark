import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { computeIntersectingClusterIds } from '../../types-core';
import { Column } from '../../interfaces';
import { DEFAULT_WORKSPACE_NAME } from '../../consts';
import { AssignBuildingIdsParams } from './interfaces';
import {
  SELECT_BUILDING_GEOMETRY_QUERY,
  ALTER_ADD_BUILDING_ID_QUERY,
  CREATE_TEMP_JSON_TABLE_QUERY,
  CREATE_TEMP_IDS_TABLE_QUERY,
  UPDATE_BUILDING_IDS_QUERY,
  DROP_TEMP_IDS_TABLE_QUERY,
  DROP_TEMP_JSON_TABLE_QUERY,
  PRAGMA_TABLE_INFO_QUERY,
  DESCRIBE_TABLE_QUERY,
} from './queries';

/**
 * Assigns stable `building_id` values by clustering intersecting building geometries.
 */
export class AssignBuildingIdsUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  /**
   * Reads geometries from the provided building table, computes intersecting
   * clusters in JS, writes a stable building_id per row back to the table, and
   * returns the updated column list for the table.
   */
  async exec(params: AssignBuildingIdsParams): Promise<Column[]> {
    const { tableName, workspace = DEFAULT_WORKSPACE_NAME } = params;
    const qualifiedTableName = `${workspace}.${tableName}`;

    const res = await this.conn.query(SELECT_BUILDING_GEOMETRY_QUERY(qualifiedTableName));
    const rows = res.toArray();

    const items = rows.map((r: any) => ({ id: r.id as number, geometry: JSON.parse(r.geometry_json) as any }));

    const idToCluster = computeIntersectingClusterIds(items);

    if (idToCluster.size === 0) {
      return await this.describeColumns(qualifiedTableName);
    }

    const hasBuildingId = await this.columnExists(qualifiedTableName, 'building_id');
    if (!hasBuildingId) {
      await this.conn.query(ALTER_ADD_BUILDING_ID_QUERY(qualifiedTableName));
    }

    const jsonRows = Array.from(idToCluster.entries()).map(([id, building_id]) => ({ id: Number(id), building_id }));
    const vfsPath = `tmp_building_ids_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.json`;
    await this.db.registerFileText(vfsPath, JSON.stringify({ rows: jsonRows }));

    await this.conn.query(CREATE_TEMP_JSON_TABLE_QUERY(vfsPath));
    await this.conn.query(CREATE_TEMP_IDS_TABLE_QUERY());
    await this.conn.query(UPDATE_BUILDING_IDS_QUERY(qualifiedTableName));

    await this.conn.query(DROP_TEMP_IDS_TABLE_QUERY());
    await this.conn.query(DROP_TEMP_JSON_TABLE_QUERY());
    await this.db.dropFile(vfsPath);

    return await this.describeColumns(qualifiedTableName);
  }

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const pragma = await this.conn.query(PRAGMA_TABLE_INFO_QUERY(tableName));
    const arr = pragma?.toArray?.() ?? [];
    return arr.some((r: any) => String(r.name) === columnName);
  }

  private async describeColumns(tableName: string): Promise<Column[]> {
    const describe = await this.conn.query(DESCRIBE_TABLE_QUERY(tableName));
    const rows = describe?.toArray?.() ?? [];
    return rows.map((r: any) => ({ name: r[0] ?? r.column_name ?? r.name, type: r[1] ?? r.column_type ?? r.type }));
  }
}
