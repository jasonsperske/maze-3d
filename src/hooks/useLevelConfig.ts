import { useState, useEffect } from "react";
import { type LevelConfig, DEFAULT_LEVEL_CONFIG } from "../types/LevelConfig";

type Status = "loading" | "ready" | "error";

export function useLevelConfig(level: string): {
  config: LevelConfig | null;
  status: Status;
  error: string | null;
} {
  const [config, setConfig] = useState<LevelConfig | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus("loading");
    setError(null);

    fetch(`/static/level/${encodeURIComponent(level)}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Level "${level}" not found (${res.status})`);
        return res.json();
      })
      .then((data: Partial<LevelConfig>) => {
        // Merge with defaults so partial configs work
        setConfig({ ...DEFAULT_LEVEL_CONFIG, ...data });
        setStatus("ready");
      })
      .catch((err: Error) => {
        setError(err.message);
        setStatus("error");
      });
  }, [level]);

  return { config, status, error };
}
