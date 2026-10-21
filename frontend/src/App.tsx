import { lazy, ReactElement, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth } from './components/auth/RequireAuth';
import { MascotPreloader } from './components/character/MascotPreloader';

const SplashPage     = lazy(() => import('./pages/Splash'));
const OnboardingPage = lazy(() => import('./pages/Onboarding'));
const LoginPage      = lazy(() => import('./pages/Login'));
const SignupPage     = lazy(() => import('./pages/Signup'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPassword'));
const HomePage       = lazy(() => import('./pages/Home'));
const CheaperAlternativesPage = lazy(() => import('./pages/Home/CheaperAlternativesPage'));
const ClosetPage     = lazy(() => import('./pages/Closet'));
const ScanHistoryPage = lazy(() => import('./pages/Scan/ScanHistoryPage'));
const CancelReturnPage = lazy(() => import('./pages/Mypage/CancelReturnPage'));
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
const GiftComposePage  = lazy(() => import('./pages/Gift/GiftComposePage'));
const SentGiftsPage    = lazy(() => import('./pages/Mypage/SentGiftsPage'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const NoticesPage      = lazy(() => import('./pages/Mypage/NoticesPage'));
const OrderDetailPage  = lazy(() => import('./pages/Mypage/OrderDetailPage'));
const OrderTrackingPage = lazy(() => import('./pages/Mypage/OrderTrackingPage'));
const PointsPage      = lazy(() => import('./pages/Mypage/PointsPage'));
const SubscriptionPage = lazy(() => import('./pages/Mypage/SubscriptionPage'));
const FaceConsentPage = lazy(() => import('./pages/Mypage/FaceConsentPage'));
const ReviewPage      = lazy(() => import('./pages/Mypage/ReviewPage'));
const CustomerServicePage = lazy(() => import('./pages/Mypage/CustomerServicePage'));
const ChatSupportPage = lazy(() => import('./pages/Mypage/ChatSupportPage'));
const InquiryPage     = lazy(() => import('./pages/Mypage/InquiryPage'));
const SettingsPage    = lazy(() => import('./pages/Mypage/SettingsPage'));
const ProfileEditPage = lazy(() => import('./pages/Mypage/ProfileEditPage'));
const EmailChangePage = lazy(() => import('./pages/Mypage/EmailChangePage'));
const PasswordChangePage = lazy(() => import('./pages/Mypage/PasswordChangePage'));
const WithdrawPage    = lazy(() => import('./pages/Mypage/WithdrawPage'));
const LegalPage       = lazy(() => import('./pages/Mypage/LegalPage'));

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-dvh bg-surface">
      <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

/** 계정 데이터를 다루는 화면 — 게스트는 로그인으로 보낸다. */
const mine = (el: ReactElement) => <RequireAuth>{el}</RequireAuth>;

export default function App() {
  return (
    <BrowserRouter>
      {/* 내 캐릭터 이미지를 미리 디코딩해 둔다 — 탭 이동 때 캐릭터가 늦게 뜨지 않게 */}
      <MascotPreloader />
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/"           element={<SplashPage />} />
          <Route path="/login"      element={<LoginPage />} />
          <Route path="/signup"     element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          {/* 진단은 로그인 이후에만 한다. /qna·/result도 여기로 오므로 함께 막힌다. */}
          <Route path="/onboarding" element={mine(<OnboardingPage />)} />
          {/* 마이페이지 '피부타입 재진단'은 질문창부터 시작.
              replace로 /qna 엔트리를 소진해야 Q1에서 뒤로가기가 마이페이지로 간다.
              또 OnboardingPage를 렌더하는 <Route>가 하나로 유지돼 리마운트가 없다. */}
          <Route path="/qna"        element={<Navigate to="/onboarding?step=question&q=0" replace />} />
          <Route path="/result"     element={<Navigate to="/onboarding" replace />} />
          <Route path="/home"       element={<HomePage />} />
          <Route path="/home/cheaper-alternatives" element={<CheaperAlternativesPage />} />
          <Route path="/closet"     element={<ClosetPage />} />
          <Route path="/closet/decorate" element={mine(<DecoratePage />)} />
          <Route path="/detail/:id" element={<DetailPage />} />
          <Route path="/alternatives" element={<AlternativesPage />} />
          <Route path="/cart"       element={<CartPage />} />
          <Route path="/search"     element={<SearchPage />} />
          <Route path="/scan"       element={mine(<ScanPage />)} />
          <Route path="/scan/history" element={mine(<ScanHistoryPage />)} />
          <Route path="/mypage"     element={<MypagePage />} />
          <Route path="/category"   element={<CategoryMainPage />} />
          <Route path="/category/:code" element={<CategoryPage />} />
          <Route path="/history"    element={<HistoryPage />} />
          <Route path="/likes"      element={<Navigate to="/history?tab=liked" replace />} />
          <Route path="/mypage/frequent-purchases" element={<Navigate to="/history?tab=frequent" replace />} />
          <Route path="/mypage/order-history" element={mine(<OrderHistoryPage />)} />
          <Route path="/mypage/order-history/:orderId" element={mine(<OrderDetailPage />)} />
          <Route path="/mypage/order-history/:orderId/tracking" element={mine(<OrderTrackingPage />)} />
          <Route path="/gift/:productId"      element={mine(<GiftComposePage />)} />
          <Route path="/notifications"        element={mine(<NotificationsPage />)} />
          <Route path="/mypage/gifts"         element={mine(<SentGiftsPage />)} />
          <Route path="/mypage/points"        element={mine(<PointsPage />)} />
          <Route path="/mypage/subscription"  element={mine(<SubscriptionPage />)} />
          <Route path="/mypage/reviews"       element={mine(<ReviewPage />)} />
          <Route path="/mypage/customer-service" element={<CustomerServicePage />} />
          <Route path="/mypage/chat-support"  element={<ChatSupportPage />} />
          <Route path="/mypage/inquiry"       element={<InquiryPage />} />
          <Route path="/mypage/settings"      element={<SettingsPage />} />
          <Route path="/mypage/settings/profile"  element={mine(<ProfileEditPage />)} />
          <Route path="/mypage/settings/email"    element={mine(<EmailChangePage />)} />
          <Route path="/mypage/settings/password" element={mine(<PasswordChangePage />)} />
          <Route path="/mypage/settings/withdraw" element={mine(<WithdrawPage />)} />
          <Route path="/mypage/settings/face-consent" element={mine(<FaceConsentPage />)} />
          <Route path="/mypage/settings/notices"  element={<NoticesPage />} />
          <Route path="/mypage/settings/terms"    element={<LegalPage doc="terms" />} />
          <Route path="/mypage/settings/privacy"  element={<LegalPage doc="privacy" />} />
          {/* 실제 결제·배송이 없어 근거를 만들 수 없던 화면들. 라우트만
              남겨 마이페이지로 보낸다 — 북마크나 옛 링크로 들어와도
              빈 화면을 보지 않도록. */}
          <Route path="/mypage/coupons"       element={<Navigate to="/mypage" replace />} />
          <Route path="/mypage/money"         element={<Navigate to="/mypage" replace />} />
          <Route path="/mypage/giftbox"       element={<Navigate to="/mypage/gifts" replace />} />
          <Route path="/mypage/shipping"      element={<Navigate to="/mypage" replace />} />
          <Route path="/mypage/cancel-return" element={mine(<CancelReturnPage />)} />
          <Route path="/mypage/restock"       element={<Navigate to="/mypage" replace />} />
          {/* 모르는 주소는 홈으로. 예전에는 /onboarding이었는데 그 화면이
              로그인 전용이 되면서, 게스트가 주소를 잘못 입력할 때마다
              로그인으로 튕기게 된다. */}
          <Route path="*"           element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
