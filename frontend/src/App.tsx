import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const SplashPage     = lazy(() => import('./pages/Splash'));
const OnboardingPage = lazy(() => import('./pages/Onboarding'));
const LoginPage      = lazy(() => import('./pages/Login'));
const PopupPage      = lazy(() => import('./pages/Popup'));
const HomePage       = lazy(() => import('./pages/Home'));
const ClosetPage     = lazy(() => import('./pages/Closet'));
const DecoratePage   = lazy(() => import('./pages/Closet/DecoratePage'));
const DetailPage     = lazy(() => import('./pages/ProductDetail'));
const AlternativesPage = lazy(() => import('./pages/Alternatives'));
const SearchPage     = lazy(() => import('./pages/Search'));
const ScanPage       = lazy(() => import('./pages/Scan'));
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
const SettingsPage    = lazy(() => import('./pages/Mypage/SettingsPage'));
const ProfileEditPage = lazy(() => import('./pages/Mypage/ProfileEditPage'));
const WithdrawPage    = lazy(() => import('./pages/Mypage/WithdrawPage'));
const LegalPage       = lazy(() => import('./pages/Mypage/LegalPage'));

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
          <Route path="/login"      element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          {/* 마이페이지 '피부타입 재진단'은 질문창부터 시작.
              replace로 /qna 엔트리를 소진해야 Q1에서 뒤로가기가 마이페이지로 간다.
              또 OnboardingPage를 렌더하는 <Route>가 하나로 유지돼 리마운트가 없다. */}
          <Route path="/qna"        element={<Navigate to="/onboarding?step=question&q=0" replace />} />
          <Route path="/result"     element={<Navigate to="/onboarding" replace />} />
          <Route path="/popup"      element={<PopupPage />} />
          <Route path="/home"       element={<HomePage />} />
          <Route path="/closet"     element={<ClosetPage />} />
          <Route path="/closet/decorate" element={<DecoratePage />} />
          <Route path="/detail/:id" element={<DetailPage />} />
          <Route path="/alternatives" element={<AlternativesPage />} />
          <Route path="/search"     element={<SearchPage />} />
          <Route path="/scan"       element={<ScanPage />} />
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
          <Route path="/mypage/settings"      element={<SettingsPage />} />
          <Route path="/mypage/settings/profile"  element={<ProfileEditPage />} />
          <Route path="/mypage/settings/withdraw" element={<WithdrawPage />} />
          <Route path="/mypage/settings/terms"    element={<LegalPage doc="terms" />} />
          <Route path="/mypage/settings/privacy"  element={<LegalPage doc="privacy" />} />
          <Route path="*"           element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
