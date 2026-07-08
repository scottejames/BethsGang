import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './amplifyConfig'
import './index.css'
import App from './App.tsx'
import { DistractMeProvider } from './context/DistractMeContext'
import { EnergyProvider } from './context/EnergyContext'
import { RemindersProvider } from './context/RemindersContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EnergyProvider>
      <DistractMeProvider>
        <RemindersProvider>
          <App />
        </RemindersProvider>
      </DistractMeProvider>
    </EnergyProvider>
  </StrictMode>,
)
