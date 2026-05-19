import { OsmElement } from '../../use-cases/load-osm-overpass/interfaces';

export interface OverpassApiResponse {
  elements: OsmElement[];
}

export type FormattedElement = {
  kind: 'node' | 'way' | 'relation';
  id: number;
  tags: Array<{ k: string; v: string }>;
  refs: number[];
  lat: number | null;
  lon: number | null;
  ref_roles: string[];
  ref_types: string[];
};
