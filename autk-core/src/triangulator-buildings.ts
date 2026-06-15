/**
 * @module triangulator-buildings
 * Triangulates OSM-style building features into extruded mesh geometry.
 *
 * This module converts building `GeometryCollection` features into local-space
 * mesh chunks that can be consumed by the WebGPU layer pipeline. It aligns
 * part geometries with `feature.properties.parts`, resolves wall base and top
 * heights from common OSM tags, and delegates roof generation to
 * `triangulator-roofs`.
 */

import {
    FeatureCollection,
    Feature,
    LineString,
    MultiLineString,
    MultiPolygon,
    Polygon,
    GeometryCollection,
    GeoJsonProperties
} from "geojson";

import { LayerComponent, LayerGeometry } from "./types-mesh";

import { buildBuildingPartMesh, buildWallsGrouped, MeshData } from "./triangulator-roofs";

/**
 * Builds extruded mesh geometry for OSM-style buildings.
 *
 * Each feature is expected to contain a `GeometryCollection` whose entries are
 * matched by index against `feature.properties.parts`. For every supported part
 * geometry, the triangulator converts world coordinates into local XY space,
 * resolves wall heights from part metadata, and emits mesh chunks with feature
 * component counts. Roof geometry is delegated to `triangulator-roofs`.
 *
 * @example
 * const [mesh, components] = TriangulatorBuildings.buildMesh(buildings, origin);
 */
export class TriangulatorBuildings {
    /**
     * Builds extruded building geometry for an OSM-style building collection.
     *
     * @param geojson Source building feature collection.
     * @param origin World-space origin used to convert coordinates into local XY space.
     * @param allowZeroHeightBuildings When `true`, parts with no height metadata get a random fallback height.
     * @returns A tuple of mesh chunks and per-feature component metadata.
     * @throws Never throws. Parts without height metadata are skipped (or given fallback height).
     * @example
     * const [meshes, comps] = TriangulatorBuildings.buildMesh(buildingsFC, origin);
     */
    static buildMesh(geojson: FeatureCollection, origin: number[], allowZeroHeightBuildings: boolean = false): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];
        let skippedNoHeight = 0;

        for (let fId = 0; fId < geojson.features.length; fId++) {
            const feature = geojson.features[fId];

            // Normalize top-level geometry into a GeometryCollection-like array
            let geometries: GeometryCollection['geometries'];
            let parts: GeoJsonProperties[];

            if (feature.geometry?.type === 'GeometryCollection') {
                geometries = (feature.geometry as GeometryCollection).geometries;
                parts = (feature.properties?.parts ?? []) as GeoJsonProperties[];
            } else if (
                feature.geometry?.type === 'Polygon' ||
                feature.geometry?.type === 'MultiPolygon' ||
                feature.geometry?.type === 'LineString' ||
                feature.geometry?.type === 'MultiLineString'
            ) {
                geometries = [feature.geometry as Polygon | MultiPolygon | LineString | MultiLineString];
                parts = [feature.properties ?? {}] as GeoJsonProperties[];
            } else {
                console.warn('Unexpected building geometry, got:', feature.geometry?.type);
                continue;
            }

            let nPoints = 0;
            let nTriangles = 0;

            for (let i = 0; i < geometries.length; i++) {
                const partGeom = geometries[i];
                const partProps = parts[i] ?? {};

                let heightInfo = TriangulatorBuildings.computeBuildingHeights(partProps);
                if (!heightInfo.length) {
                    skippedNoHeight++;
                    if (!allowZeroHeightBuildings) continue; // Skip parts with no valid height when allowZeroHeightBuildings is false
                    heightInfo = [0, (3 + 4 * Math.random()) * 3.4]; // Fallback to a default height when no valid metadata is found
                }

                const partFeature: Feature = { type: 'Feature', geometry: partGeom, properties: partProps };
                let chunks: MeshData[] = [];

                if (partGeom.type === 'LineString') {
                    const { coordinates } = <LineString>partFeature.geometry;
                    const ring: [number, number][] = coordinates.map(c => TriangulatorBuildings.toLocal(c, origin));
                    chunks = buildBuildingPartMesh([ring], heightInfo[0], heightInfo[1], partFeature.properties);
                } else if (partGeom.type === 'MultiLineString') {
                    const { coordinates } = <MultiLineString>partFeature.geometry;
                    for (const lineString of coordinates) {
                        const ring: [number, number][] = lineString.map(c => TriangulatorBuildings.toLocal(c, origin));
                        chunks.push(...buildBuildingPartMesh([ring], heightInfo[0], heightInfo[1], partFeature.properties));
                    }
                } else if (partGeom.type === 'Polygon') {
                    const { coordinates } = <Polygon>partFeature.geometry;
                    const rings: [number, number][][] = coordinates.map(ring =>
                        ring.map(c => TriangulatorBuildings.toLocal(c, origin))
                    );
                    chunks = buildBuildingPartMesh(rings, heightInfo[0], heightInfo[1], partFeature.properties);
                } else if (partGeom.type === 'MultiPolygon') {
                    const { coordinates } = <MultiPolygon>partFeature.geometry;
                    for (const polygon of coordinates) {
                        const rings: [number, number][][] = polygon.map(ring =>
                            ring.map(c => TriangulatorBuildings.toLocal(c, origin))
                        );
                        chunks.push(...buildBuildingPartMesh(rings, heightInfo[0], heightInfo[1], partFeature.properties));
                    }
                } else {
                    console.warn('Unsupported geometry type in building part:', partGeom.type);
                    continue;
                }

                for (const chunk of chunks) {
                    mesh.push({
                        position: new Float32Array(chunk.flatCoords),
                        indices: new Uint32Array(chunk.flatIds),
                        featureIndex: fId,
                    });
                    nPoints += chunk.flatCoords.length / 3;
                    nTriangles += chunk.flatIds.length / 3;
                }
            }

            comps.push({ nPoints, nTriangles, featureIndex: fId, featureId: feature.id });
        }

        if (skippedNoHeight > 0) {
            console.warn(`[TriangulatorBuildings] ${skippedNoHeight} parts: no valid height metadata`);
        }

        return [mesh, comps];
    }

    /**
     * Facade-aware variant of `buildMesh`.
     *
     * Like `buildMesh` but wall edges are grouped by outward normal direction so
     * that each distinct facade plane gets its own `LayerComponent` (and therefore
     * its own pickable component ID). Roof and floor chunks are bundled into the
     * last component of each building feature.
     *
     * @param geojson Source building feature collection.
     * @param origin World-space origin for local-XY conversion.
     * @param allowZeroHeightBuildings When `true`, parts with no height get a random fallback.
     * @param angleThresholdDeg Max normal-angle difference to merge edges into one facade group.
     * @returns Tuple of mesh chunks and per-facade-group component metadata.
     */
    static buildMeshFacade(
        geojson: FeatureCollection,
        origin: number[],
        allowZeroHeightBuildings: boolean = false,
        angleThresholdDeg = 30,
    ): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];
        let skippedNoHeight = 0;
        let compId = 0;

        for (let fId = 0; fId < geojson.features.length; fId++) {
            const feature = geojson.features[fId];

            let geometries: GeometryCollection['geometries'];
            let parts: GeoJsonProperties[];

            if (feature.geometry?.type === 'GeometryCollection') {
                geometries = (feature.geometry as GeometryCollection).geometries;
                parts = (feature.properties?.parts ?? []) as GeoJsonProperties[];
            } else if (
                feature.geometry?.type === 'Polygon' ||
                feature.geometry?.type === 'MultiPolygon' ||
                feature.geometry?.type === 'LineString' ||
                feature.geometry?.type === 'MultiLineString'
            ) {
                geometries = [feature.geometry as Polygon | MultiPolygon | LineString | MultiLineString];
                parts = [feature.properties ?? {}] as GeoJsonProperties[];
            } else {
                console.warn('Unexpected building geometry, got:', feature.geometry?.type);
                continue;
            }

            const nonWallChunks: MeshData[] = [];

            for (let i = 0; i < geometries.length; i++) {
                const partGeom = geometries[i];
                const partProps = parts[i] ?? {};

                let heightInfo = TriangulatorBuildings.computeBuildingHeights(partProps);
                if (!heightInfo.length) {
                    skippedNoHeight++;
                    if (!allowZeroHeightBuildings) continue;
                    heightInfo = [0, (3 + 4 * Math.random()) * 3.4];
                }
                const [minH, maxH] = heightInfo;

                // LineString/MultiLineString：不做 facade 分组，直接整体处理
                if (partGeom.type === 'LineString') {
                    const ring = (partGeom as LineString).coordinates.map(c => TriangulatorBuildings.toLocal(c, origin));
                    const chunks = buildBuildingPartMesh([ring], minH, maxH, partProps);
                    for (const chunk of chunks) {
                        if (chunk.flatCoords.length === 0) continue;
                        mesh.push({ position: new Float32Array(chunk.flatCoords), indices: new Uint32Array(chunk.flatIds), featureIndex: compId });
                        comps.push({ nPoints: chunk.flatCoords.length / 3, nTriangles: chunk.flatIds.length / 3, featureIndex: compId, featureId: feature.id });
                        compId++;
                    }
                    continue;
                }

                if (partGeom.type === 'MultiLineString') {
                    for (const ls of (partGeom as MultiLineString).coordinates) {
                        const ring = ls.map(c => TriangulatorBuildings.toLocal(c, origin));
                        const chunks = buildBuildingPartMesh([ring], minH, maxH, partProps);
                        for (const chunk of chunks) {
                            if (chunk.flatCoords.length === 0) continue;
                            mesh.push({ position: new Float32Array(chunk.flatCoords), indices: new Uint32Array(chunk.flatIds), featureIndex: compId });
                            comps.push({ nPoints: chunk.flatCoords.length / 3, nTriangles: chunk.flatIds.length / 3, featureIndex: compId, featureId: feature.id });
                            compId++;
                        }
                    }
                    continue;
                }

                // Polygon/MultiPolygon：在同一 part 内按相邻边法向量分组（不跨 part 合并）
                const processRings = (rings: [number, number][][]) => {
                    const wallGroups = buildWallsGrouped(rings, minH, maxH, angleThresholdDeg);
                    for (const chunk of wallGroups) {
                        if (chunk.flatCoords.length === 0) continue;
                        mesh.push({ position: new Float32Array(chunk.flatCoords), indices: new Uint32Array(chunk.flatIds), featureIndex: compId });
                        comps.push({ nPoints: chunk.flatCoords.length / 3, nTriangles: chunk.flatIds.length / 3, featureIndex: compId, featureId: feature.id });
                        compId++;
                    }
                    // roof/floor（buildBuildingPartMesh 返回 [walls, floor, roof?]，取 index>=1）
                    const allChunks = buildBuildingPartMesh(rings, minH, maxH, partProps);
                    for (let r = 1; r < allChunks.length; r++) {
                        if (allChunks[r].flatCoords.length === 0) continue;
                        nonWallChunks.push(allChunks[r]);
                    }
                };

                if (partGeom.type === 'Polygon') {
                    processRings((partGeom as Polygon).coordinates.map(r => r.map(c => TriangulatorBuildings.toLocal(c, origin))));
                } else if (partGeom.type === 'MultiPolygon') {
                    for (const poly of (partGeom as MultiPolygon).coordinates) {
                        processRings(poly.map(r => r.map(c => TriangulatorBuildings.toLocal(c, origin))));
                    }
                }
            }

            // roof/floor：整个 building 合并成一个 component
            if (nonWallChunks.length > 0) {
                let nPoints = 0;
                let nTriangles = 0;
                for (const chunk of nonWallChunks) {
                    if (chunk.flatCoords.length === 0) continue;
                    mesh.push({ position: new Float32Array(chunk.flatCoords), indices: new Uint32Array(chunk.flatIds), featureIndex: compId });
                    nPoints += chunk.flatCoords.length / 3;
                    nTriangles += chunk.flatIds.length / 3;
                }
                if (nPoints > 0) {
                    comps.push({ nPoints, nTriangles, featureIndex: compId, featureId: feature.id });
                    compId++;
                }
            }
        }

        if (skippedNoHeight > 0) {
            console.warn(`[TriangulatorBuildings] ${skippedNoHeight} parts: no valid height metadata`);
        }

        return [mesh, comps];
    }
    /**
     * Resolves wall base and top heights from OSM-style building properties.
     *
     * @param props Building-part properties to inspect (`height`, `min_height`, `levels`, etc.).
     * @returns A two-element array `[minHeight, height]`, or an empty array when
     * no valid height range can be derived.
     * @throws Never throws. Degenerate ranges return an empty array.
     */
    private static computeBuildingHeights(props: GeoJsonProperties): number[] {
        const FLOOR_HEIGHT = 3.4;

        if (props === null) return [];

        const num = (v: unknown): number => parseFloat(String(v)) || 0;

        let height = 0;
        if ('height' in props) height = num(props['height']);
        else if ('levels' in props) height = FLOOR_HEIGHT * num(props['levels']);
        else if ('building:levels' in props) height = FLOOR_HEIGHT * num(props['building:levels']);

        let min_height = 0;
        if ('min_height' in props) min_height = num(props['min_height']);
        else if ('min_level' in props && num(props['min_level']) >= 0) min_height = FLOOR_HEIGHT * num(props['min_level']);
        else if ('building:min_level' in props) min_height = FLOOR_HEIGHT * num(props['building:min_level']);

        if (height <= min_height) return [];
        return [min_height, height];
    }

    /**
     * Converts a world-space coordinate into local planar coordinates.
     *
     * @param coord World-space coordinate with at least XY components.
     * @param origin World-space origin used as the local offset basis.
     * @returns Local planar coordinate `[x, y]` relative to `origin`.
     * @throws Never throws.
     */
    private static toLocal(coord: number[], origin: number[]): [number, number] {
        return [coord[0] - origin[0], coord[1] - origin[1]];
    }
}
