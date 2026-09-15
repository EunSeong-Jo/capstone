import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { DiagnosisProvider } from './context/DiagnosisContext.tsx'
import { ClosetProvider } from './context/ClosetContext.tsx'
import { CartProvider } from './context/CartContext.tsx'
import { LikedProductsProvider } from './context/LikedProductsContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <DiagnosisProvider>
          <ClosetProvider>
            <CartProvider>
              <LikedProductsProvider>
                <App />
              </LikedProductsProvider>
            </CartProvider>
          </ClosetProvider>
        </DiagnosisProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
