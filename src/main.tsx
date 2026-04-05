import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LevelPage } from './pages/LevelPage.tsx'

const levelMatch = window.location.pathname.match(/^\/level\/([^/?#]+)/)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {levelMatch ? <LevelPage level={levelMatch[1]} /> : <App />}
  </StrictMode>,
)
