import { useState, useEffect } from "react";
import { type LevelConfig, DEFAULT_LEVEL_CONFIG } from "../types/LevelConfig";

type Status = "loading" | "ready" | "error";

export function useMapConfig(name: string): {
  config: LevelConfig | null;
  map: string | null;
  status: Status;
  error: string | null;
} {
  const [config, setConfig] = useState<LevelConfig | null>(null);
  const [map, setMap] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus("loading");
    setError(null);
    setConfig(null);
    setMap(null);

    const encoded = encodeURIComponent(name);
    const configReq = fetch(`/static/map/${encoded}.json`).then((res) => {
      if (!res.ok) throw new Error(`Map config "${name}.json" not found (${res.status})`);
      return res.json() as Promise<Partial<LevelConfig>>;
    });
    const mapReq = fetch(`/static/map/${encoded}.txt`).then((res) => {
      if (!res.ok) throw new Error(`Map file "${name}.txt" not found (${res.status})`);
      return res.text();
    });

    Promise.all([configReq, mapReq])
      .then(([cfg, txt]) => {
        setConfig({ ...DEFAULT_LEVEL_CONFIG, ...cfg });
        setMap(txt);
        setStatus("ready");
      })
      .catch((err: Error) => {
        setError(err.message);
        setStatus("error");
      });
  }, [name]);

  return { config, map, status, error };
}
