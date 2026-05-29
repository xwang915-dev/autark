import { FeatureCollection } from 'geojson';

import { computeRoadSkyView, computeScore } from './analysis';
import { UrbaneData } from './data';
import { setLoadingState } from './ui';
import { UrbaneViews } from './views';

type UrbaneLevel = 'neighborhoods' | 'active_buildings';

export class UrbaneApp {
    protected data!: UrbaneData;
    protected views!: UrbaneViews;

    protected neighs!: FeatureCollection;
    protected activeBuildings!: FeatureCollection;
    protected roadsWithSky?: FeatureCollection;

    public currentLevel: UrbaneLevel = 'neighborhoods';
    public selectedNeighIds: number[] = [];
    public distance = 300;

    public datasets = ['arrest', 'new_building', 'noise', 'restaurants', 'school', 'subway', 'tree'];
    public weights = [0.3, 0.2, 0.0, 0.5, 0.0, 0.0, 0.0];
    public skyExposureWeight = 0.0;

    public async init(args: {
        canvas: HTMLCanvasElement,
        plotDivParallel: HTMLElement,
        plotDivTable: HTMLElement,
    }): Promise<void> {
        this.views = new UrbaneViews(args.plotDivParallel, args.plotDivTable);

        setLoadingState('Initializing spatial database...', 'Preparing the in-browser data environment.');
        this.data = new UrbaneData();
        await this.data.init();

        setLoadingState('Loading OpenStreetMap data...', 'Fetching Manhattan from Overpass API.');
        await this.data.loadBaseData(this.datasets);

        setLoadingState('Computing sky view factor...', 'Running render-based GPU analysis for road segments.');
        const buildings = await this.data.getLayer('table_osm_buildings');
        const roads = await this.data.getLayer('table_osm_roads');
        this.roadsWithSky = await computeRoadSkyView(buildings, roads);
        await this.data.updateLayer('table_osm_roads', this.roadsWithSky);

        setLoadingState('Joining sky exposure to neighborhoods...', 'Computing average sky exposure per neighborhood.');
        await this.data.joinNeighborhoodSkyExposure();

        setLoadingState('Computing score...', 'Applying weighted GPU function over neighborhood data.');
        this.neighs = await computeScore(
            await this.data.getLayer('neighborhoods'),
            this.datasets,
            this.weights,
            this.skyExposureWeight,
        );

        setLoadingState('Initializing map...', 'Preparing the WebGPU rendering context.');
        await this.views.initMap(args.canvas);

        setLoadingState('Rendering layers...', 'Uploading geometry to the GPU.');
        await this.views.initAllLayers(
            this.data.getLayersMetadata(),
            (name) => this.data.getLayer(name),
            this.neighs,
            this.roadsWithSky,
        );

        this.views.reloadPlots(this.currentLevel, this.datasets, this.neighs, this.activeBuildings);
        this.views.bindMapSelection(() => this.currentLevel, (selection) => this.updateNeighborhoodSelection(selection));
        this.bindPlotSelection();
    }


    public updateThematic(column: string): void {
        this.views.updateThematic(this.currentLevel, this.getCurrentCollection(), column);
    }

    public async updateWeights(newWeights: number[], thematicColumn: string): Promise<void> {
        this.weights = newWeights.slice(0, this.datasets.length);
        this.skyExposureWeight = newWeights[this.datasets.length] ?? 0;

        const rawLayer = await this.data.getLayer(this.currentLevel);
        const scoredLayer = await computeScore(rawLayer, this.datasets, this.weights, this.skyExposureWeight);

        if (this.currentLevel === 'neighborhoods') this.neighs = scoredLayer;
        else this.activeBuildings = scoredLayer;

        this.views.reloadPlots(this.currentLevel, this.datasets, this.neighs, this.activeBuildings);
        this.bindPlotSelection();
        this.updateThematic(thematicColumn);
    }

    public async drillDown(thematicColumn: string): Promise<void> {
        if (this.selectedNeighIds.length === 0) {
            alert('Please select at least one neighborhood to drill down into its buildings.');
            return;
        }

        const neighborhoodNames = [...new Set(
            this.selectedNeighIds
                .map((id) => this.neighs.features[id]?.properties?.ntaname)
                .filter((name): name is string => typeof name === 'string' && name.length > 0),
        )];

        this.currentLevel = 'active_buildings';
        this.activeBuildings = await this.data.loadActiveBuildings(this.datasets, neighborhoodNames, this.distance);
        this.activeBuildings = await computeScore(
            this.activeBuildings,
            this.datasets,
            this.weights,
            this.skyExposureWeight,
        );

        this.views.showBuildingsLevel(this.activeBuildings);
        this.views.reloadPlots(this.currentLevel, this.datasets, this.neighs, this.activeBuildings);
        this.bindPlotSelection();
        this.updateThematic(thematicColumn);
    }

    public async drillUp(thematicColumn: string): Promise<void> {
        this.currentLevel = 'neighborhoods';
        this.selectedNeighIds = [];

        await this.data.removeLayer('active_buildings');
        this.views.showNeighborhoodLevel();
        this.views.reloadPlots(this.currentLevel, this.datasets, this.neighs, this.activeBuildings);
        this.bindPlotSelection();
        this.updateThematic(thematicColumn);
    }

    protected bindPlotSelection(): void {
        this.views.bindPlotSelection(() => this.currentLevel, (selection) => this.updateNeighborhoodSelection(selection));
    }

    protected updateNeighborhoodSelection(selection: number[]): void {
        if (this.currentLevel === 'neighborhoods') this.selectedNeighIds = selection;
    }

    protected getCurrentCollection(): FeatureCollection {
        return this.currentLevel === 'neighborhoods' ? this.neighs : this.activeBuildings;
    }
}
