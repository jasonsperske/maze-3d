import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LevelPage } from './pages/LevelPage.tsx'
import { MapPage } from './pages/MapPage.tsx'

const path = window.location.pathname
const levelMatch = path.match(/^\/level\/([^/?#]+)\/([^/?#]+)/)
const mapMatch = path.match(/^\/map\/([^/?#]+)/)

const root = createRoot(document.getElementById('root')!)
if (levelMatch) {
  root.render(<StrictMode><LevelPage level={levelMatch[1]} seed={levelMatch[2]} /></StrictMode>)
} else if (mapMatch) {
  root.render(<StrictMode><MapPage name={decodeURIComponent(mapMatch[1])} /></StrictMode>)
} else {
  root.render(<StrictMode><App /></StrictMode>)
}
