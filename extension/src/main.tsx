import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as SDK from 'azure-devops-extension-sdk'
import './index.css'
import App from './App.tsx'

async function start() {
  await SDK.init({ loaded: false, applyTheme: true })

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  await SDK.notifyLoadSucceeded()
}

void start()
