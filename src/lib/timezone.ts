/**
 * Offline timezone-from-coordinates, mirroring the-eclipse-app-web: the same
 * async API shape as packages/eclipse/timezones.ts getTimeZoneIdForLocation,
 * implemented like apps/mobile/lib/timezone-local.ts — turf point-in-polygon
 * over the bundled 1.2MB lower-tolerance world tz polygons (borders can be
 * off by a small distance vs the web API's 0-01 set; acceptable here). The
 * polygon file is dynamically imported so it loads on first lookup instead
 * of inflating the studio bundle.
 */
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { bbox } from "@turf/bbox";
import { point } from "@turf/helpers";
import type { Feature, MultiPolygon, Polygon } from "geojson";

type TzFeature = Feature<Polygon | MultiPolygon, { tzid: string }>;

let featuresPromise: Promise<TzFeature[]> | null = null;

// booleanPointInPolygon short-circuits on a feature's precomputed `bbox`
// before the expensive ray-cast, so attach bboxes once at load.
function loadFeatures(): Promise<TzFeature[]> {
  featuresPromise ??= import("@/eclipse/geojson/timezones-world-0-1-tolerance.geo.json").then(
    (mod) => {
      const features = (mod.default as { features: TzFeature[] }).features;
      for (const f of features) if (!f.bbox) f.bbox = bbox(f);
      return features;
    },
  );
  return featuresPromise;
}

export async function getTimeZoneIdForLocation({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}): Promise<string | null> {
  const features = await loadFeatures();
  const location = point([longitude, latitude]);
  const feature = features.find((f) => booleanPointInPolygon(location, f));
  return feature ? feature.properties.tzid : null;
}
