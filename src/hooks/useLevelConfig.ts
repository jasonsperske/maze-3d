import { useState, useEffect } from "react";
import { type LevelConfig, DEFAULT_LEVEL_CONFIG } from "../types/LevelConfig";

type Status = "loading" | "ready" | "error";

/**
 * Load a level config and, for DoomMap levels, the per-map geometry.
 *
 * 3DMaze levels  (/level/0/12345):
 *   Fetches /static/level/0.json.  mapOrSeed is used as the maze seed by MazeGame.
 *
 * DoomMap levels  (/level/rage/e1m1):
 *   Fetches /static/level/rage.json (shared WAD config, no mapData).
 *   Then fetches /static/level/rage/e1m1.json and merges it in as config.mapData.
 *   If the level JSON already contains mapData (hand-authored single-file format),
 *   the second fetch is skipped.
 */
export function useLevelConfig(
  level: string,
  mapOrSeed: string,
): {
  config: LevelConfig | null;
  status: Status;
  error: string | null;
} {
  const [config, setConfig] = useState<LevelConfig | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);

    (async () => {
      try {
        // Step 1: fetch the level config
        const res = await fetch(`/static/level/${encodeURIComponent(level)}.json`);
        if (!res.ok) throw new Error(`Level "${level}" not found (${res.status})`);
        const data: Partial<LevelConfig> = await res.json();
        const merged: LevelConfig = { ...DEFAULT_LEVEL_CONFIG, ...data };

        // Step 2: for DoomMap levels without embedded mapData, fetch the map geometry
        if (merged.walldef === "DoomMap" && !merged.mapData && mapOrSeed) {
          const mapRes = await fetch(
            `/static/level/${encodeURIComponent(level)}/${encodeURIComponent(mapOrSeed)}.json`
          );
          if (!mapRes.ok) {
            throw new Error(
              `Map "${mapOrSeed}" not found in "${level}" (${mapRes.status})`
            );
          }
          merged.mapData = await mapRes.json();
        }

        if (!cancelled) {
          setConfig(merged);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setStatus("error");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [level, mapOrSeed]);

  return { config, status, error };
}
