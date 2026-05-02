import { useMemo } from "react";
import { MazeGame } from "../components/MazeGame";
import { useMapConfig } from "../hooks/useMapConfig";
import { parseAsciiMap, type ParsedMap } from "../utils/asciiMapParser";

interface MapPageProps {
  name: string;
}

export function MapPage({ name }: MapPageProps) {
  const { config, map, status, error } = useMapConfig(name);

  const parsed = useMemo<{ data?: ParsedMap; error?: string }>(() => {
    if (!map) return {};
    try {
      return { data: parseAsciiMap(map) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [map]);

  if (status === "loading") {
    return (
      <div style={{ color: "white", background: "#000", width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
        Loading map {name}…
      </div>
    );
  }

  if (status === "error" || !config || !map) {
    return (
      <div style={{ color: "#ff4444", background: "#000", width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
        {error ?? "Unknown error"}
      </div>
    );
  }

  if (parsed.error || !parsed.data) {
    return (
      <div style={{ color: "#ff4444", background: "#000", width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", whiteSpace: "pre" }}>
        Map parse error: {parsed.error}
      </div>
    );
  }

  return <MazeGame config={config} mapName={name} mapData={parsed.data} />;
}
