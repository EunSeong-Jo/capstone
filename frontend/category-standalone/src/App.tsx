import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

const CategoryMainPage = lazy(() => import('./pages/Category/CategoryMainPage'))
const CategoryPage = lazy(() => import('./pages/Category/CategoryPage'))
const ProductDetailPage = lazy(() => import('./pages/ProductDetail'))

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-dvh bg-white">
      <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Navigate to="/category" replace />} />
          <Route path="/category" element={<CategoryMainPage />} />
          <Route path="/category/skincare" element={<CategoryPage />} />
          <Route path="/detail/:id" element={<ProductDetailPage />} />
          <Route path="*" element={<Navigate to="/category" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
