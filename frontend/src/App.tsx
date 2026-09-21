import { lazy, Suspense, ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth } from './components/auth/RequireAuth';

const SplashPage     = lazy(() => import('./pages/Splash'));
const OnboardingPage = lazy(() => import('./pages/Onboarding'));
const LoginPage      = lazy(() => import('./pages/Login'));
const SignupPage     = lazy(() => import('./pages/Signup'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPassword'));
const PopupPage      = lazy(() => import('./pages/Popup'));
const HomePage       = lazy(() => import('./pages/Home'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const ClosetAlternativesPage = lazy(() => import('./pages/Home/ClosetAlternativesPage'));
const CheaperAlternativesPage = lazy(() => import('./pages/Home/CheaperAlternativesPage'));
const ComingSoonPage = lazy(() => import('./pages/ComingSoon'));
const GiftComposePage = lazy(() => import('./pages/Gift/GiftComposePage'));
const ClosetPage     = lazy(() => import('./pages/Closet'));
const DecoratePage   = lazy(() => import('./pages/Closet/DecoratePage'));
const DetailPage     = lazy(() => import('./pages/ProductDetail'));
const AlternativesPage = lazy(() => import('./pages/Alternatives'));
const CartPage       = lazy(() => import('./pages/Cart'));
const SearchPage     = lazy(() => import('./pages/Search'));
const ScanPage       = lazy(() => import('./pages/Scan'));
const MypagePage     = lazy(() => import('./pages/Mypage'));
const CategoryMainPage = lazy(() => import('./pages/Category/CategoryMainPage'));
const CategoryPage   = lazy(() => import('./pages/Category/CategoryPage'));
const HistoryPage    = lazy(() => import('./pages/History'));
const OrderHistoryPage = lazy(() => import('./pages/Mypage/OrderHistoryPage'));
const OrderDetailPage = lazy(() => import('./pages/Mypage/OrderDetailPage'));
const OrderTrackingPage = lazy(() => import('./pages/Mypage/OrderTrackingPage'));
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
const EmailChangePage = lazy(() => import('./pages/Mypage/EmailChangePage'));
const PasswordChangePage = lazy(() => import('./pages/Mypage/PasswordChangePage'));
const NoticesPage     = lazy(() => import('./pages/Mypage/NoticesPage'));
const WithdrawPage    = lazy(() => import('./pages/Mypage/WithdrawPage'));
const LegalPage       = lazy(() => import('./pages/Mypage/LegalPage'));

/** 마이페이지 하위 라우트를 한 줄로 감싸는 헬퍼 — 게스트는 전부 로그인으로 튕긴다 */
const mp = (el: ReactElement) => <RequireAuth>{el}</RequireAuth>;

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
          <Route path="/signup"     element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          {/* 마이페이지 '피부타입 재진단'은 질문창부터 시작.
              replace로 /qna 엔트리를 소진해야 Q1에서 뒤로가기가 마이페이지로 간다.
              또 OnboardingPage를 렌더하는 <Route>가 하나로 유지돼 리마운트가 없다. */}
          <Route path="/qna"        element={<Navigate to="/onboarding?step=question&q=0" replace />} />
          <Route path="/result"     element={<Navigate to="/onboarding" replace />} />
          <Route path="/popup"      element={<PopupPage />} />
          <Route path="/home"       element={<HomePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/home/closet-alternatives" element={<ClosetAlternativesPage />} />
          <Route path="/home/cheaper-alternatives" element={<CheaperAlternativesPage />} />
          <Route path="/coming-soon" element={<ComingSoonPage />} />
          <Route path="/gift/:productId" element={<GiftComposePage />} />
          <Route path="/closet"     element={<ClosetPage />} />
          <Route path="/closet/decorate" element={<DecoratePage />} />
          <Route path="/detail/:id" element={<DetailPage />} />
          <Route path="/alternatives" element={<AlternativesPage />} />
          <Route path="/cart"       element={<CartPage />} />
          <Route path="/search"     element={<SearchPage />} />
          <Route path="/scan"       element={<ScanPage />} />
          <Route path="/mypage"     element={mp(<MypagePage />)} />
          <Route path="/category"   element={<CategoryMainPage />} />
          <Route path="/category/skincare" element={<CategoryPage />} />
          <Route path="/history"    element={<HistoryPage />} />
          <Route path="/likes"      element={<Navigate to="/history?tab=liked" replace />} />
          <Route path="/mypage/frequent-purchases" element={<Navigate to="/history?tab=frequent" replace />} />
          <Route path="/mypage/order-history" element={mp(<OrderHistoryPage />)} />
          <Route path="/mypage/order-history/:orderId" element={mp(<OrderDetailPage />)} />
          <Route path="/mypage/order-history/:orderId/tracking" element={mp(<OrderTrackingPage />)} />
          <Route path="/mypage/shipping"      element={mp(<ShippingPage />)} />
          <Route path="/mypage/cancel-return" element={mp(<CancelReturnPage />)} />
          <Route path="/mypage/restock"       element={mp(<RestockPage />)} />
          <Route path="/mypage/points"        element={mp(<PointsPage />)} />
          <Route path="/mypage/coupons"       element={mp(<CouponPage />)} />
          <Route path="/mypage/money"         element={mp(<MoneyPage />)} />
          <Route path="/mypage/reviews"       element={mp(<ReviewPage />)} />
          <Route path="/mypage/giftbox"       element={mp(<GiftBoxPage />)} />
          <Route path="/mypage/customer-service" element={mp(<CustomerServicePage />)} />
          <Route path="/mypage/chat-support"  element={mp(<ChatSupportPage />)} />
          <Route path="/mypage/inquiry"       element={mp(<InquiryPage />)} />
          <Route path="/mypage/settings"      element={mp(<SettingsPage />)} />
          <Route path="/mypage/settings/profile"  element={mp(<ProfileEditPage />)} />
          <Route path="/mypage/settings/email"    element={mp(<EmailChangePage />)} />
          <Route path="/mypage/settings/password" element={mp(<PasswordChangePage />)} />
          <Route path="/mypage/settings/notices"  element={mp(<NoticesPage />)} />
          <Route path="/mypage/settings/withdraw" element={mp(<WithdrawPage />)} />
          <Route path="/mypage/settings/terms"    element={mp(<LegalPage doc="terms" />)} />
          <Route path="/mypage/settings/privacy"  element={mp(<LegalPage doc="privacy" />)} />
          <Route path="*"           element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
