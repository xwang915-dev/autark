# Plan: JSON WKT geometry support in `autk-db`

## Shared decisions / risks

1. **API parity with CSV**  
   `loadJson` should accept the same geometry modes as `loadCsv`:
   - `geometryColumns: true` → default `Latitude` / `Longitude`
   - `{ latColumnName, longColumnName, coordinateFormat? }`
   - `{ wktColumnName, coordinateFormat? }`

2. **Contract change**  
   Today `JsonTable.type` is effectively always `undefined`, even when JSON geometry is created.  
   To match CSV behavior, JSON imports that materialize geometry should return:
   - `'points'` for lat/lng imports
   - inferred `'points' | 'polylines' | 'polygons'` for WKT imports

   This is a visible compatibility change and should be called out in docs/changelog.

3. **Keep scope tight**  
   Reuse the same strategy as CSV, but avoid a broader CSV/JSON refactor unless duplication becomes clearly harmful during implementation.

## Task 1 — Align the JSON public API and metadata contract

**Goal**  
Make the JSON loader’s types and public exports support the same geometry options as CSV.

**Context**  
Relevant files:
- `autk-db/src/use-cases/load-json/interfaces.ts`
- `autk-db/src/use-cases/load-json/index.ts`
- `autk-db/src/index.ts`
- `autk-db/src/interfaces.ts`
- `autk-db/src/db.ts`

Right now `LoadJsonParams.geometryColumns` only supports explicit lat/lng columns, and `JsonTable` is documented as non-renderable.

**Proposed Approach**  
- Add JSON equivalents of the CSV geometry types:
  - `JsonDefaultLatLngGeometryColumns`
  - `JsonLatLngGeometryColumns`
  - `JsonWktGeometryColumns`
  - `JsonGeometryColumns`
  - `JsonGeometryLayerType`
- Update `LoadJsonParams.geometryColumns` to use that union.
- Re-export the new types from:
  - `autk-db/src/use-cases/load-json/index.ts`
  - `autk-db/src/index.ts`
- Update `JsonTable` so `type` can be set for geometry-bearing JSON imports.
- Update `db.ts` JSDoc for `loadJson` to describe the new modes and return behavior.

**Acceptance Criteria**
- Callers can express JSON geometry loading with the same shapes as CSV, including WKT.
- The package root exports the JSON geometry-related types.
- JSON tables that materialize geometry are allowed to expose a renderable `type`.
- Public docs/comments no longer claim that JSON imports are always non-renderable.

**Spec**  
short

**Verify**
- `cd autk-db && npm run build`
- `make typecheck`

**Out of Scope**
- Refactoring CSV and JSON geometry type definitions into a shared generic abstraction.

## Task 2 — Implement JSON geometry loading with CSV-parity behavior

**Goal**  
Make `loadJson` support WKT geometry columns and bring its runtime behavior in line with `loadCsv`.

**Context**  
Relevant files:
- `autk-db/src/use-cases/load-json/load-json-use-case.ts`
- `autk-db/src/use-cases/load-json/queries.ts`

Current JSON loading supports:
- plain `read_json_auto(...)`
- lat/lng geometry creation only

It does not currently do the CSV-style runtime work:
- geometry mode normalization
- default lat/lng shorthand
- WKT parsing
- geometry completeness validation
- WKT layer-type inference
- spatial index creation
- contextual error wrapping / cleanup

**Proposed Approach**  
- Add a `LOAD_JSON_ON_TABLE_WITH_WKT_QUERY`, mirroring the CSV WKT SQL but using `read_json_auto(...)`.
- In `LoadJsonUseCase.exec(...)`, normalize `geometryColumns` the same way as CSV:
  - `true` → default lat/lng
  - explicit lat/lng object
  - WKT object
- Validate required column names before generating SQL.
- After table creation, mirror the CSV post-processing:
  - ensure all rows received geometry
  - set `type = 'points'` for lat/lng imports
  - infer type for WKT imports from `ST_GeometryType(...)`
  - reject mixed or unsupported WKT geometry families
  - create an RTREE index on the default geometry column
- Mirror CSV cleanup behavior:
  - drop partially created tables on failure
  - always drop temp registered JSON files
  - wrap errors with JSON-specific context

**Acceptance Criteria**
- `loadJson({ geometryColumns: true })` creates point geometry from `Latitude` / `Longitude`.
- Existing explicit lat/lng JSON imports still work and now return `type: 'points'`.
- `loadJson({ geometryColumns: { wktColumnName: '...' } })` creates geometry and returns the inferred layer family.
- Mixed WKT geometry families fail with a clear error.
- Unsupported WKT geometry types fail with a clear error.
- Partial geometry creation fails instead of returning a silently broken table.
- Failed geometry loads do not leave behind a temp file or half-created table.
- Plain JSON imports without `geometryColumns` keep their current behavior.

**Spec**  
none

**Verify**
- `cd autk-db && npm run build`
- `make typecheck`

**Out of Scope**
- Supporting GeoJSON-like geometry objects embedded in arbitrary JSON columns.
- Supporting nested JSON-path geometry extraction beyond what `read_json_auto(...)` already exposes as columns.

## Task 3 — Add focused regression coverage and usage docs

**Goal**  
Leave behind a cheap, repeatable way to verify the new JSON geometry paths.

**Context**  
`autk-db` does not appear to have an existing focused automated test setup for these loaders, so this change needs at least lightweight regression coverage.

**Proposed Approach**  
- Add a small checked-in smoke/regression script for JSON loading scenarios, e.g. under `autk-db/scripts/`:
  - plain JSON import
  - default lat/lng import
  - WKT points success case
  - WKT polygons or polylines success case
  - mixed-family WKT failure case
- Update README / JSDoc examples so users can discover the JSON WKT API and understand that geometry-bearing JSON imports are renderable.
- Prefer minimal coverage infrastructure over adding a full new test framework.

**Acceptance Criteria**
- There is a repeatable command that exercises the new JSON geometry paths.
- The checked-in coverage includes at least one WKT success case and one WKT failure case.
- The `loadJson` docs show the new WKT option and the returned `type` behavior.
- The docs/build pipeline still passes after the new exports and comments.

**Spec**  
none

**Verify**
- `cd autk-db && npx tsx scripts/verify-load-json-geometry.ts`
- `cd autk-db && npm run doc`
- `make typecheck`

**Out of Scope**
- Introducing a full unit/integration test framework for all `autk-db` use cases.
