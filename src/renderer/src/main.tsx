import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { loadSaved } from './persist'

// Lets CSS adapt to the native window chrome (e.g. room for macOS traffic lights).
if (window.api) document.documentElement.dataset.platform = window.api.platform

loadSaved().then((saved) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App saved={saved} />
    </StrictMode>,
  ),
)
