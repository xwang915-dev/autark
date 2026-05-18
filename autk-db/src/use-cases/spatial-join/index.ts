/**
 * Use case for performing spatial joins between two tables.
 *
 * Supports INTERSECT (default) and NEAR predicates, with optional aggregation of join-side data.
 * The root table is always modified in place using a LEFT join.
 *
 * @module spatial-join
 */
export { SpatialJoinUseCase } from './spatial-join-use-case';
export type { SpatialQueryParams, AggregateFunction } from './interfaces';
export * from './errors';
