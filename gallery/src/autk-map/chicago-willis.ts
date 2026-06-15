// import { AutkDb } from '@urban-toolkit/autk-db';
// import { AutkMap, MapEvent, MapStyle } from '@urban-toolkit/autk-map';

// const URL = (import.meta as any).env.BASE_URL;

// export class ChicagoWillis {
//     protected map!: AutkMap;
//     protected db!: AutkDb;

//     private currentReference: 'surface' | 'building' | 'facade' | 'roof' | 'floor' = 'building';
//     private currentManipulation: 'translation' | 'resize' | 'opacity' = 'translation';

//     private selectedBuildingIndex: number | null = null;

//     private floorHeightPosition: number = 10;
//     private floorThickness: number = 4;

//     public async run(canvas: HTMLCanvasElement): Promise<void> {
//         this.db = new AutkDb();
//         await this.db.init();

//         await this.db.loadOsm({
//             queryArea: {
//                 geocodeArea: 'Chicago',
//                 areas: ['Loop'],
//             },
//             outputTableName: 'table_osm',
//             autoLoadLayers: {
//                 layers: ['surface', 'buildings'] as Array<'surface' | 'buildings'>,
//             },
//         });

//         this.map = new AutkMap(canvas);
//         await this.map.init();
//         await this.loadLayers();

//         this.map.updateRenderInfo('table_osm_buildings', { isPick: true });

//         this.setupPickingListener();
//         this.map.draw();

//         (window as any).setReference = this.setReference.bind(this);
//         (window as any).setManipulation = this.setManipulation.bind(this);
//         (window as any).setFloorParams = this.setFloorParams.bind(this);
//     }

//     protected async loadLayers(): Promise<void> {
//         for (const layerData of this.db.getLayersMetadata()) {
//             console.log('layer name:', layerData.name, 'type:', layerData.type);
//             const geojson = await this.db.getLayer(layerData.name);
//             this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type });
//         }
//     }

//     private setupPickingListener(): void {
//         this.map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
//             if (selection.length === 0) {
//                 this.map.clearHighlightedIds('table_osm_buildings');
//                 this.map.clearHighlightedIds('table_osm_surface');
//                 return;
//             }

//             const picked = selection[selection.length - 1];

//             if (this.currentReference === 'building' && layerId === 'table_osm_buildings') {
//                 this.map.setHighlightedIds('table_osm_buildings', [picked]);
//                 console.log(`Building selected: ${picked}`);

//             } else if (this.currentReference === 'surface' && layerId === 'table_osm_surface') {
//                 this.map.setHighlightedIds('table_osm_surface', [picked]);
//                 console.log(`Surface selected: ${picked}`);

//             } else if (this.currentReference === 'floor' && layerId === 'table_osm_buildings') {
//                 this.selectedBuildingIndex = picked;
//                 this.map.setHighlightedIds('table_osm_buildings', [picked]);
//                 console.log(`Building selected for floor: ${picked}`);
//                 this.updateFloorSlice();
//             }
//         });
//     }

//     public setFloorParams(heightPosition: number, thickness: number): void {
//         this.floorHeightPosition = heightPosition;
//         this.floorThickness = thickness;
//         console.log(`Floor params updated: height=${heightPosition}, thickness=${thickness}`);
//         if (this.selectedBuildingIndex !== null) {
//             this.updateFloorSlice();
//         }
//     }

//     private async updateFloorSlice(): Promise<void> {
//         if (this.selectedBuildingIndex === null) return;

//         const buildingsGeojson = await this.db.getLayer('table_osm_buildings');
//         const building = buildingsGeojson.features[this.selectedBuildingIndex] as any;
//         if (!building) {
//             console.warn(`Feature index ${this.selectedBuildingIndex} not found`);
//             return;
//         }

//         const geometries: any[] = building.geometry?.geometries ?? [];
//         const parts: any[] = building.properties?.parts ?? [];
//         console.log('building geometry:', JSON.stringify(building.geometry, null, 2));

//         // Compute building's actual max height to clamp the floor range.
//         // Buildings without height data get a fallback matching triangulator's max random height.
//         const FALLBACK_MAX_HEIGHT = 24;
//         const FLOOR_HEIGHT = 3.4;
//         const partHeight = (p: any): number => {
//             if (p.height) return parseFloat(p.height) || 0;
//             if (p.levels) return (parseFloat(p.levels) || 0) * FLOOR_HEIGHT;
//             if (p['building:levels']) return (parseFloat(p['building:levels']) || 0) * FLOOR_HEIGHT;
//             return 0;
//         };
//         let buildingMaxHeight: number;
//         if (parts.length > 0) {
//             buildingMaxHeight = Math.max(...parts.map(partHeight));
//         } else {
//             buildingMaxHeight = partHeight(building.properties);
//         }
//         if (buildingMaxHeight === 0) buildingMaxHeight = FALLBACK_MAX_HEIGHT;

//         const floorMin = this.floorHeightPosition;
//         const floorMax = this.floorHeightPosition + this.floorThickness;

//         // Floor range is entirely above the building — nothing to show
//         if (buildingMaxHeight > 0 && floorMin >= buildingMaxHeight) {
//             try { this.map.removeLayer('floor_slice'); } catch (_) { }
//             console.warn(`Floor range [${floorMin}, ${floorMax}] exceeds building height ${buildingMaxHeight}`);
//             return;
//         }

//         // Clamp floorMax to building height when we know it
//         const clampedFloorMax = buildingMaxHeight > 0 ? Math.min(floorMax, buildingMaxHeight) : floorMax;

//         // If the building has OSM parts, filter to those overlapping the floor range.
//         // Otherwise fall back to a single extruded slice of the whole footprint.
//         let sliceGeometries: any[];
//         let sliceParts: any[];

//         if (parts.length > 0 && parts.length === geometries.length) {
//             const filtered: { geom: any; part: any }[] = [];
//             for (let i = 0; i < parts.length; i++) {
//                 const p = parts[i];
//                 const h = partHeight(p);
//                 const mh = parseFloat(p.min_height) || 0;
//                 const geomType = geometries[i]?.type;
//                 const isPolygon = geomType === 'Polygon' || geomType === 'MultiPolygon';
//                 if (isPolygon && h > floorMin && mh < clampedFloorMax) {
//                     filtered.push({
//                         geom: geometries[i],
//                         part: {
//                             ...p,
//                             min_height: Math.max(mh, floorMin),
//                             height: Math.min(h, clampedFloorMax),
//                         },
//                     });
//                 }
//             }
//             if (filtered.length === 0) {
//                 const fallbackGeom = geometries.find(g => g?.type === 'Polygon' || g?.type === 'MultiPolygon') ?? geometries[0];
//                 sliceGeometries = [fallbackGeom];
//                 sliceParts = [{ min_height: floorMin, height: clampedFloorMax }];
//             } else {
//                 sliceGeometries = filtered.map(f => f.geom);
//                 sliceParts = filtered.map(f => f.part);
//             }
//         } else {
//             sliceGeometries = [geometries[0]];
//             sliceParts = [{ min_height: floorMin, height: clampedFloorMax }];
//         }

//         const floorSlice = {
//             type: 'FeatureCollection',
//             features: [{
//                 type: 'Feature',
//                 geometry: { type: 'GeometryCollection', geometries: sliceGeometries },
//                 properties: {
//                     ...building.properties,
//                     parts: sliceParts,
//                 },
//             }],
//         };

//         const floorLayerName = 'floor_slice';
//         try { this.map.removeLayer(floorLayerName); } catch (_) { }

//         MapStyle.setCustomStyle({
//             background: '#b2c7cd', surface: '#e2eaed', parks: '#b8ccb0',
//             water: '#9ec0cb', roads: '#b98c0f', buildings: '#ff6600',
//             points: '#4a6570', polylines: '#d9b504', polygons: '#dce2e5',
//         });
//         this.map.loadCollection(floorLayerName, {
//             collection: floorSlice as any,
//             type: 'buildings',
//         });
//         MapStyle.setPredefinedStyle('default');

//         console.log(`Floor slice rendered: height=${floorMin}, thickness=${this.floorThickness}`);
//     }

//     private applyManipulation(pickedId: number): void {
//         console.log(`Applying manipulation: ${this.currentManipulation} to id: ${pickedId}`);
//     }

//     public setReference(type: 'surface' | 'building' | 'facade' | 'roof' | 'floor'): void {
//         this.currentReference = type;

//         this.map.updateRenderInfo('table_osm_buildings', { isPick: false });
//         this.map.updateRenderInfo('table_osm_surface', { isPick: false });
//         this.map.clearHighlightedIds('table_osm_buildings');
//         this.map.clearHighlightedIds('table_osm_surface');
//         this.selectedBuildingIndex = null;
//         try { this.map.removeLayer('floor_slice'); } catch (_) { }

//         if (type === 'building') {
//             this.map.updateRenderInfo('table_osm_buildings', { isPick: true });
//         } else if (type === 'surface') {
//             this.map.updateRenderInfo('table_osm_surface', { isPick: true });
//         } else if (type === 'floor') {
//             this.map.updateRenderInfo('table_osm_buildings', { isPick: true });
//         }

//         console.log(`Reference set to: ${type}`);
//     }

//     public setManipulation(type: 'translation' | 'resize' | 'opacity'): void {
//         this.currentManipulation = type;
//         console.log(`Manipulation set to: ${type}`);
//     }
// }

// async function main() {
//     const canvas = document.querySelector('canvas');
//     if (!canvas) throw new Error('No canvas found');
//     const example = new ChicagoWillis();
//     await example.run(canvas);
// }
// main();
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, MapEvent, MapStyle } from '@urban-toolkit/autk-map';

export class ChicagoWillis {
    protected map!: AutkMap;
    protected db!: AutkDb;

    private currentReference: 'surface' | 'building' | 'facade' | 'roof' | 'floor' = 'building';
    private selectedBuildingIndex: number | null = null;
    private originalBuildingsGeojson: any = null;

    private floorHeightPosition: number = 10;
    private floorThickness: number = 4;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'Chicago',
                areas: ['Loop'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                layers: ['surface', 'buildings'] as Array<'surface' | 'buildings'>,
            },
        });

        this.map = new AutkMap(canvas);
        await this.map.init();
        await this.loadLayers();

        this.map.updateRenderInfo('table_osm_buildings', { isPick: true });

        this.setupPickingListener();
        this.map.draw();

        (window as any).setReference = this.setReference.bind(this);
        (window as any).setManipulation = this.setManipulation.bind(this);
        (window as any).setFloorParams = this.setFloorParams.bind(this);
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayersMetadata()) {
            console.log('layer name:', layerData.name, 'type:', layerData.type);
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type });
        }
    }

    private setupPickingListener(): void {
        this.map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
            if (selection.length === 0) {
                this.map.clearHighlightedIds('table_osm_buildings');
                this.map.clearHighlightedIds('table_osm_surface');
                return;
            }

            const picked = selection[selection.length - 1];

            if (this.currentReference === 'building' && layerId === 'table_osm_buildings') {
                this.map.setHighlightedIds('table_osm_buildings', [picked]);
                console.log(`Building selected: ${picked}`);

            } else if (this.currentReference === 'surface' && layerId === 'table_osm_surface') {
                this.map.setHighlightedIds('table_osm_surface', [picked]);
                console.log(`Surface selected: ${picked}`);

            } else if (this.currentReference === 'floor' && layerId === 'table_osm_buildings') {
                this.selectedBuildingIndex = picked;
                this.map.setHighlightedIds('table_osm_buildings', [picked]);
                console.log(`Building selected for floor: ${picked}`);
                this.updateFloorSlice();

            } else if (this.currentReference === 'facade' && layerId === 'table_osm_buildings') {
                // In facadeMode every wall face is its own component — just highlight it directly.
                this.map.setHighlightedIds('table_osm_buildings', [picked]);
                console.log(`Facade face selected: component ${picked}`);
            }
        });
    }

    public setFloorParams(heightPosition: number, thickness: number): void {
        this.floorHeightPosition = heightPosition;
        this.floorThickness = thickness;
        console.log(`Floor params updated: height=${heightPosition}, thickness=${thickness}`);
        if (this.selectedBuildingIndex !== null) {
            this.updateFloorSlice();
        }
    }

    private async updateFloorSlice(): Promise<void> {
        if (this.selectedBuildingIndex === null) return;

        const buildingsGeojson = await this.db.getLayer('table_osm_buildings');
        const building = buildingsGeojson.features[this.selectedBuildingIndex] as any;
        if (!building) {
            console.warn(`Feature index ${this.selectedBuildingIndex} not found`);
            return;
        }

        const geometries: any[] = building.geometry?.geometries ?? [];
        const parts: any[] = building.properties?.parts ?? [];

        const FALLBACK_MAX_HEIGHT = 24;
        const FLOOR_HEIGHT = 3.4;
        const partHeight = (p: any): number => {
            if (p.height) return parseFloat(p.height) || 0;
            if (p.levels) return (parseFloat(p.levels) || 0) * FLOOR_HEIGHT;
            if (p['building:levels']) return (parseFloat(p['building:levels']) || 0) * FLOOR_HEIGHT;
            return 0;
        };

        let buildingMaxHeight: number;
        if (parts.length > 0) {
            buildingMaxHeight = Math.max(...parts.map(partHeight));
        } else {
            buildingMaxHeight = partHeight(building.properties);
        }
        if (buildingMaxHeight === 0) buildingMaxHeight = FALLBACK_MAX_HEIGHT;

        const floorMin = this.floorHeightPosition;
        const floorMax = this.floorHeightPosition + this.floorThickness;

        if (buildingMaxHeight > 0 && floorMin >= buildingMaxHeight) {
            try { this.map.removeLayer('floor_slice'); } catch (_) { }
            console.warn(`Floor range [${floorMin}, ${floorMax}] exceeds building height ${buildingMaxHeight}`);
            return;
        }

        const clampedFloorMax = buildingMaxHeight > 0 ? Math.min(floorMax, buildingMaxHeight) : floorMax;

        let sliceGeometries: any[];
        let sliceParts: any[];

        if (parts.length > 0 && parts.length === geometries.length) {
            const filtered: { geom: any; part: any }[] = [];
            for (let i = 0; i < parts.length; i++) {
                const p = parts[i];
                const h = partHeight(p);
                const mh = parseFloat(p.min_height) || 0;
                const geomType = geometries[i]?.type;
                const isPolygon = geomType === 'Polygon' || geomType === 'MultiPolygon';
                if (isPolygon && h > floorMin && mh < clampedFloorMax) {
                    filtered.push({
                        geom: geometries[i],
                        part: {
                            ...p,
                            min_height: Math.max(mh, floorMin),
                            height: Math.min(h, clampedFloorMax),
                        },
                    });
                }
            }
            if (filtered.length === 0) {
                const fallbackGeom = geometries.find(g => g?.type === 'Polygon' || g?.type === 'MultiPolygon') ?? geometries[0];
                sliceGeometries = [fallbackGeom];
                sliceParts = [{ min_height: floorMin, height: clampedFloorMax }];
            } else {
                sliceGeometries = filtered.map(f => f.geom);
                sliceParts = filtered.map(f => f.part);
            }
        } else {
            sliceGeometries = [geometries[0]];
            sliceParts = [{ min_height: floorMin, height: clampedFloorMax }];
        }

        const floorSlice = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'GeometryCollection', geometries: sliceGeometries },
                properties: {
                    ...building.properties,
                    parts: sliceParts,
                },
            }],
        };

        const floorLayerName = 'floor_slice';
        try { this.map.removeLayer(floorLayerName); } catch (_) { }

        MapStyle.setCustomStyle({
            background: '#b2c7cd', surface: '#e2eaed', parks: '#b8ccb0',
            water: '#9ec0cb', roads: '#b98c0f', buildings: '#ff6600',
            points: '#4a6570', polylines: '#d9b504', polygons: '#dce2e5',
        });
        this.map.loadCollection(floorLayerName, {
            collection: floorSlice as any,
            type: 'buildings',
        });
        MapStyle.setPredefinedStyle('default');

        console.log(`Floor slice rendered: height=${floorMin}, thickness=${this.floorThickness}`);
    }

    private async buildFacadeLayer(): Promise<void> {
        const buildingsGeojson = await this.db.getLayer('table_osm_buildings');

        this.originalBuildingsGeojson = buildingsGeojson;

        this.map.removeLayer('table_osm_buildings');
        this.map.loadCollection('table_osm_buildings', {
            collection: buildingsGeojson as any,
            type: 'buildings',
            facadeMode: true,
            allowZeroHeightBuildings: false, 
        });
        this.map.updateRenderInfo('table_osm_buildings', { isPick: true });

        console.log(`Facade mode active — per-face picking enabled`);
    }

    public setReference(type: 'surface' | 'building' | 'facade' | 'roof' | 'floor'): void {
        this.currentReference = type;

        this.map.updateRenderInfo('table_osm_surface', { isPick: false });
        this.map.clearHighlightedIds('table_osm_surface');

        // 如果有分段过的 facade，恢复原始 buildings 数据
        if (this.originalBuildingsGeojson !== null) {
            this.map.removeLayer('table_osm_buildings');
            this.map.loadCollection('table_osm_buildings', {
                collection: this.originalBuildingsGeojson,
                type: 'buildings',
            });
            this.originalBuildingsGeojson = null;
        } else if (type !== 'facade') {
            this.map.updateRenderInfo('table_osm_buildings', { isPick: false });
            this.map.clearHighlightedIds('table_osm_buildings');
        }

        this.selectedBuildingIndex = null;

        try { this.map.removeLayer('floor_slice'); } catch (_) { }

        if (type === 'building') {
            this.map.updateRenderInfo('table_osm_buildings', { isPick: true });
        } else if (type === 'surface') {
            this.map.updateRenderInfo('table_osm_surface', { isPick: true });
        } else if (type === 'floor') {
            this.map.updateRenderInfo('table_osm_buildings', { isPick: true });
        } else if (type === 'facade') {
            this.buildFacadeLayer();
        }

        console.log(`Reference set to: ${type}`);
    }

    public setManipulation(type: 'translation' | 'resize' | 'opacity'): void {
        console.log(`Manipulation set to: ${type}`);
    }
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas found');
    const example = new ChicagoWillis();
    await example.run(canvas);
}
main();