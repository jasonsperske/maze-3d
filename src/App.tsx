import { MazeGame } from "./components/MazeGame";
import { DEFAULT_LEVEL_CONFIG } from "./types/LevelConfig";

function App() {
  return <MazeGame config={DEFAULT_LEVEL_CONFIG} />;
}

export default App;
