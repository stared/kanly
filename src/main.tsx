import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'
import { startUpdates } from './update'

createRoot(document.getElementById('root')!).render(<App />)
startUpdates()
