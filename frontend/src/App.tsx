function App() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh gap-4 p-6">
      <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
        <span className="text-white text-2xl">🌿</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">대체뭐야</h1>
      <p className="text-sm text-gray-500 text-center">
        AI 기반 프로필 맞춤 제품 추천 및<br />성분 유사도 대체품 매칭 서비스
      </p>
      <span className="mt-4 px-4 py-1.5 rounded-full bg-primary-light text-primary text-xs font-medium">
        개발 환경 설정 완료 ✓
      </span>
    </div>
  )
}

export default App
