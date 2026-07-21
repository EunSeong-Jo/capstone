import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const SplashPage     = lazy(() => import('./pages/Splash'));
const OnboardingPage = lazy(() => import('./pages/Onboarding'));
const QnAPage        = lazy(() => import('./pages/QnA'));
const ResultPage     = lazy(() => import('./pages/Result'));
const PopupPage      = lazy(() => import('./pages/Popup'));
const HomePage       = lazy(() => import('./pages/Home'));
const ClosetPage     = lazy(() => import('./pages/Closet'));
const DetailPage     = lazy(() => import('./pages/ProductDetail'));
const AlternativesPage = lazy(() => import('./pages/Alternatives'));
const SearchPage     = lazy(() => import('./pages/Search'));
const MypagePage     = lazy(() => import('./pages/Mypage'));
const CategoryMainPage = lazy(() => import('./pages/Category/CategoryMainPage'));
const CategoryPage   = lazy(() => import('./pages/Category/CategoryPage'));
const HistoryPage    = lazy(() => import('./pages/History'));
const OrderHistoryPage = lazy(() => import('./pages/Mypage/OrderHistoryPage'));
const ShippingPage    = lazy(() => import('./pages/Mypage/ShippingPage'));
const CancelReturnPage = lazy(() => import('./pages/Mypage/CancelReturnPage'));
const RestockPage     = lazy(() => import('./pages/Mypage/RestockPage'));
const PointsPage      = lazy(() => import('./pages/Mypage/PointsPage'));
const CouponPage      = lazy(() => import('./pages/Mypage/CouponPage'));
const MoneyPage       = lazy(() => import('./pages/Mypage/MoneyPage'));
const ReviewPage      = lazy(() => import('./pages/Mypage/ReviewPage'));
const GiftBoxPage     = lazy(() => import('./pages/Mypage/GiftBoxPage'));
const CustomerServicePage = lazy(() => import('./pages/Mypage/CustomerServicePage'));
const ChatSupportPage = lazy(() => import('./pages/Mypage/ChatSupportPage'));
const InquiryPage     = lazy(() => import('./pages/Mypage/InquiryPage'));

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
          <Route path="/"           element={<SplashPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/qna"        element={<QnAPage />} />
          <Route path="/result"     element={<ResultPage />} />
          <Route path="/popup"      element={<PopupPage />} />
          <Route path="/home"       element={<HomePage />} />
          <Route path="/closet"     element={<ClosetPage />} />
          <Route path="/detail/:id" element={<DetailPage />} />
          <Route path="/alternatives" element={<AlternativesPage />} />
          <Route path="/search"     element={<SearchPage />} />
          <Route path="/mypage"     element={<MypagePage />} />
          <Route path="/category"   element={<CategoryMainPage />} />
          <Route path="/category/skincare" element={<CategoryPage />} />
          <Route path="/history"    element={<HistoryPage />} />
          <Route path="/likes"      element={<Navigate to="/history?tab=liked" replace />} />
          <Route path="/mypage/frequent-purchases" element={<Navigate to="/history?tab=frequent" replace />} />
          <Route path="/mypage/order-history" element={<OrderHistoryPage />} />
          <Route path="/mypage/shipping"      element={<ShippingPage />} />
          <Route path="/mypage/cancel-return" element={<CancelReturnPage />} />
          <Route path="/mypage/restock"       element={<RestockPage />} />
          <Route path="/mypage/points"        element={<PointsPage />} />
          <Route path="/mypage/coupons"       element={<CouponPage />} />
          <Route path="/mypage/money"         element={<MoneyPage />} />
          <Route path="/mypage/reviews"       element={<ReviewPage />} />
          <Route path="/mypage/giftbox"       element={<GiftBoxPage />} />
          <Route path="/mypage/customer-service" element={<CustomerServicePage />} />
          <Route path="/mypage/chat-support"  element={<ChatSupportPage />} />
          <Route path="/mypage/inquiry"       element={<InquiryPage />} />
          <Route path="*"           element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
