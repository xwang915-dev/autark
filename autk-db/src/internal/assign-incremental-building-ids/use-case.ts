import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Column } from '../../interfaces';
import { DEFAULT_WORKSPACE_NAME } from '../../consts';
import { AssignIncrementalBuildingIdsParams } from './interfaces';
import {
  ALTER_ADD_BUILDING_ID_QUERY,
  UPDATE_BUILDING_IDS_FROM_ID_QUERY,
  PRAGMA_TABLE_INFO_QUERY,
  DESCRIBE_TABLE_QUERY,
} from './queries';

/**
 * Assigns incremental `building_id` values from the existing row `id` column.
 */
export class AssignIncrementalBuildingIdsUseCase {
  constructor(private conn: AsyncDuckDBConnection) {}

  async exec(params: AssignIncrementalBuildingIdsParams): Promise<Column[]> {
    const { tableName, workspace = DEFAULT_WORKSPACE_NAME } = params;
    const qualifiedTableName = `${workspace}.${tableName}`;

    const hasBuildingId = await this.columnExists(qualifiedTableName, 'building_id');
    if (!hasBuildingId) {
      await this.conn.query(ALTER_ADD_BUILDING_ID_QUERY(qualifiedTableName));
    }

    await this.conn.query(UPDATE_BUILDING_IDS_FROM_ID_QUERY(qualifiedTableName));

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
