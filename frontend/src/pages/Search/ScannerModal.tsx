interface ScannerModalProps {
  onClose: () => void;
}

/** 스마트 성분 스캐너 — 실제 OCR/카메라 연동은 없음 (Task 4 이미지 인식 모듈 예정) */
export function ScannerModal({ onClose }: ScannerModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(26, 77, 78, 0.3)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
    >
      <div className="w-full max-w-[300px] bg-white rounded-2xl p-6 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-primary-light flex items-center justify-center text-3xl mb-4 animate-bounce">
          📸
        </div>
        <h3 className="text-base font-bold text-gray-100 mb-4">스마트 성분 스캐너</h3>

        <div className="w-full h-2 rounded-full bg-gray-10 mb-4 overflow-hidden">
          <div className="h-2 w-1/2 rounded-full bg-primary animate-pulse" />
        </div>

        <p className="text-sm text-gray-70 leading-relaxed mb-5">
          카메라로 화장품 전성분표를
          <br />
          <span className="text-primary font-bold">스캔 및 OCR 분석</span>하고 있습니다...
        </p>
        {/* TODO: Task 4 이미지 인식 모듈 연동 후 실제 스캔 결과(감지된 성분 목록) 표시 */}

        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-primary text-white text-sm font-semibold active:scale-[.98] transition-transform"
        >
          스캔 취소하기
        </button>
      </div>
    </div>
  );
}
