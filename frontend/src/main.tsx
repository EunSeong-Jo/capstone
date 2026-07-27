import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LikedProductsProvider } from './context/LikedProductsContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LikedProductsProvider>
      <App />
    </LikedProductsProvider>
  </StrictMode>,
)
