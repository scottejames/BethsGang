import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './amplifyConfig'
import './index.css'
import App from './App.tsx'
import { WhiteNoiseProvider } from './context/WhiteNoiseContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WhiteNoiseProvider>
      <App />
    </WhiteNoiseProvider>
  </StrictMode>,
)
