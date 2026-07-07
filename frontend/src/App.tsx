import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const OnboardingPage = lazy(() => import('./pages/Onboarding'));
const QnAPage        = lazy(() => import('./pages/QnA'));
const ResultPage     = lazy(() => import('./pages/Result'));
const PopupPage      = lazy(() => import('./pages/Popup'));
const HomePage       = lazy(() => import('./pages/Home'));
const DetailPage     = lazy(() => import('./pages/ProductDetail'));
const SearchPage     = lazy(() => import('./pages/Search'));
const MypagePage     = lazy(() => import('./pages/Mypage'));
const CategoryMainPage = lazy(() => import('./pages/Category/CategoryMainPage'));
const CategoryPage = lazy(() => import('./pages/Category/CategoryPage'));

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-dvh bg-surface">
      <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/"         element={<Navigate to="/onboarding" replace />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/qna"      element={<QnAPage />} />
          <Route path="/result"   element={<ResultPage />} />
          <Route path="/popup"    element={<PopupPage />} />
          <Route path="/home"     element={<HomePage />} />
          <Route path="/detail/:id" element={<DetailPage />} />
          <Route path="/search"   element={<SearchPage />} />
          <Route path="/mypage"   element={<MypagePage />} />
          <Route path="/category" element={<CategoryMainPage />} />
          <Route path="/category/skincare" element={<CategoryPage />} />
          <Route path="*"         element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
