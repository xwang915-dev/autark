/**
 * Array of plain objects representing rows from the queried table.
 *
 * Each object's keys correspond to the table column names.
 *
 * @example
 * const rows: GetTableOutput = [{ name: 'Park A', area: 500 }, { name: 'Park B', area: 1200 }];
 */
export type GetTableOutput = Record<string, unknown>[];
