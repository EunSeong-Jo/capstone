import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { SKIN_TYPE_META, SkinType } from '../../types';

// TODO: Task 13 완료 후 실제 QnA 결과로 교체
const MOCK_RESULT: SkinType = 'ondalsam';
const MOCK_GOOD = ['히알루론산', '세라마이드', '나이아신아마이드'];
const MOCK_WARN = ['강한 계면활성제', '고농도 레티놀'];

export default function ResultPage() {
  const navigate = useNavigate();
  const meta = SKIN_TYPE_META[MOCK_RESULT];

  return (
    <PageWrapper>
      <div className="flex flex-col items-center px-6 pt-12 pb-8 text-center">
        {/* 캐릭터 */}
        <div className="text-8xl mb-4">{meta.emoji}</div>
        <p className="text-sm text-gray-70 mb-1">진단 결과</p>
        <h1 className="text-[28px] font-black text-gray-100 mb-2">{meta.label}</h1>
        <p className="text-base text-gray-70 mb-8">{meta.summary}</p>

        {/* 추천 성분 */}
        <div className="w-full mb-4">
          <p className="text-sm font-semibold text-gray-100 mb-2 text-left">추천 성분</p>
          <div className="flex flex-wrap gap-2">
            {MOCK_GOOD.map(s => <Chip key={s} label={s} variant="good" />)}
          </div>
        </div>

        {/* 주의 성분 */}
        <div className="w-full mb-10">
          <p className="text-sm font-semibold text-gray-100 mb-2 text-left">주의 성분</p>
          <div className="flex flex-wrap gap-2">
            {MOCK_WARN.map(s => <Chip key={s} label={s} variant="warn" />)}
          </div>
        </div>

        {/* 만족도 설문 (KPI) */}
        <div className="w-full p-4 rounded-xl bg-gray-5 border border-gray-20 mb-8">
          <p className="text-sm font-medium text-gray-100 mb-3">결과가 마음에 드셨나요?</p>
          <div className="flex justify-center gap-3">
            {['😞', '😕', '😐', '😊', '😄'].map((e, i) => (
              <button key={i} className="text-2xl active:scale-90 transition-transform">{e}</button>
            ))}
          </div>
        </div>

        <div className="w-full flex flex-col gap-3">
          <Button variant="next" onClick={() => navigate('/popup')}>
            내 타입 추천 세트 보기
          </Button>
          <button
            onClick={() => navigate('/home')}
            className="text-sm text-gray-70 active:opacity-60 transition-opacity"
          >
            홈으로 바로 가기
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
