import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LikedProductsProvider } from './context/LikedProductsContext.tsx'
import { UserProfileProvider } from './context/UserProfileContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LikedProductsProvider>
      <UserProfileProvider>
        <App />
      </UserProfileProvider>
    </LikedProductsProvider>
  </StrictMode>,
)
