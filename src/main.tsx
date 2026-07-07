import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './amplifyConfig'
import './index.css'
import App from './App.tsx'
import { WhiteNoiseProvider } from './context/WhiteNoiseContext'
import { EnergyProvider } from './context/EnergyContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EnergyProvider>
      <WhiteNoiseProvider>
        <App />
      </WhiteNoiseProvider>
    </EnergyProvider>
  </StrictMode>,
)
