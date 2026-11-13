import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'
import { startUpdates } from './update'
import { applyTheme, loadTheme } from './theme'
import { startAnalytics } from './track'

applyTheme(loadTheme())  // before the first paint

createRoot(document.getElementById('root')!).render(<App />)
startUpdates()
startAnalytics()
