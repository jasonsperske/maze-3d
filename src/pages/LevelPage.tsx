import { MazeGame } from "../components/MazeGame";
import { useLevelConfig } from "../hooks/useLevelConfig";

interface LevelPageProps {
  level: string;
  seed: string;
}

export function LevelPage({ level, seed }: LevelPageProps) {
  const { config, status, error } = useLevelConfig(level, seed);

  if (status === "loading") {
    return (
      <div style={{ color: "white", background: "#000", width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
        Loading level {level}…
      </div>
    );
  }

  if (status === "error" || !config) {
    return (
      <div style={{ color: "#ff4444", background: "#000", width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
        {error ?? "Unknown error"}
      </div>
    );
  }

  return <MazeGame config={config} level={level} seed={seed} />;
}
