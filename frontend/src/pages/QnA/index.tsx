import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { PageWrapper } from '../../components/layout/PageWrapper';

// TODO: Task 13 완료 후 실제 문항으로 교체
const MOCK_QUESTIONS = [
  {
    id: 1,
    category: '수분',
    text: '세안 후 아무것도 바르지 않았을 때 피부 상태는?',
    options: ['많이 당기고 각질이 생겨요', '약간 당기는 느낌이 있어요', '특별한 느낌이 없어요', '조금 번들거려요', '많이 번들거리고 기름져요'],
  },
  {
    id: 2,
    category: '민감도',
    text: '새 화장품을 사용하면 피부 트러블이 생기나요?',
    options: ['자주 트러블이 생겨요', '가끔 자극을 느껴요', '보통이에요', '거의 없어요'],
  },
];

export default function QnAPage() {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const total = MOCK_QUESTIONS.length;
  const q = MOCK_QUESTIONS[currentIndex];
  const progress = ((currentIndex + 1) / total) * 100;

  const handleNext = () => {
    if (selected === null) return;
    if (currentIndex < total - 1) {
      setCurrentIndex(i => i + 1);
      setSelected(null);
    } else {
      navigate('/result');
    }
  };

  return (
    <PageWrapper>
      {/* 진행 바 */}
      <div className="h-1 bg-gray-10">
        <div
          className="h-full bg-primary transition-all duration-400 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 헤더 */}
      <div className="flex items-center h-14 px-4 border-b border-gray-20">
        <button onClick={() => currentIndex > 0 ? setCurrentIndex(i => i - 1) : navigate(-1)}
          className="p-1 -ml-1 active:scale-95 transition-transform">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="ml-2 text-sm text-gray-70">{currentIndex + 1} / {total}</span>
      </div>

      {/* 문항 */}
      <div className="flex-1 px-6 pt-8 pb-6">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-primary-light text-primary mb-4">
          {q.category}
        </span>
        <h2 className="text-xl font-bold text-gray-100 mb-6">{q.text}</h2>

        <div className="flex flex-col gap-3">
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-colors"
              style={{
                borderColor: selected === i ? 'var(--primary)' : 'var(--gray20)',
                background: selected === i ? 'var(--primary-light)' : 'white',
              }}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{
                  background: selected === i ? 'var(--primary)' : 'var(--gray10)',
                  color: selected === i ? 'white' : 'var(--gray50)',
                }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-base text-gray-100">{opt}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 다음 버튼 */}
      <div className="px-6 pb-8">
        <Button variant="next" disabled={selected === null} onClick={handleNext}>
          {currentIndex < total - 1 ? '다음' : '결과 보기'}
        </Button>
      </div>
    </PageWrapper>
  );
}
