import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Header } from '../../components/layout/Header';
import { CharacterAvatar } from '../../components/character/CharacterAvatar';
import { DECORATIONS } from '../../data/mascotAssets';
import { useAuth } from '../../context/AuthContext';
import { useDiagnosis } from '../../context/DiagnosisContext';
import { useCharacter } from '../../context/CharacterContext';
import { useToast } from '../../components/ui/ToastContext';
import type { SkinType } from '../../types';

const DEFAULT_SKIN: SkinType = 'ondalsam';

/** 내 캐릭터 꾸미기 — 진단 결과 마스코트에 데코레이션 적용 (홈 캐릭터 탭 진입) */
export default function DecoratePage() {
  const navigate = useNavigate();
  const { user: persona } = useAuth();
  const { skinType: diagType } = useDiagnosis();
  const skinType: SkinType = diagType ?? persona?.skinType ?? DEFAULT_SKIN;
  const { decorationId, setDecoration } = useCharacter();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<number | null>(decorationId);

  return (
    <PageWrapper>
      <Header showBack title="내 캐릭터 꾸미기" />

      {/* 미리보기 */}
      <div className="flex items-center justify-center bg-gray-5 py-10">
        <CharacterAvatar skinType={skinType} decorationId={selected} className="h-52 w-52" />
      </div>

      {/* 데코레이션 선택 */}
      <div className="px-4 py-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-100">데코레이션</h2>
          {selected != null && (
            <button onClick={() => setSelected(null)} className="text-xs text-gray-50">
              초기화
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3">
          {DECORATIONS.map((d) => {
            const on = d.id === selected;
            return (
              <button
                key={d.id}
                onClick={() => setSelected(on ? null : d.id)}
                aria-label={d.label}
                className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 bg-white p-2 active:scale-95 transition-transform ${
                  on ? 'border-primary' : 'border-gray-20'
                }`}
              >
                <img src={d.src} alt={d.label} className="h-3/5 w-3/5 object-contain" />
                <span className="text-[10px] text-gray-50">{d.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => {
              setDecoration(selected);
              showToast('캐릭터 꾸미기를 저장했어요');
              navigate(-1);
            }}
            className="flex h-[52px] w-full items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-white transition-transform active:scale-[.98]"
          >
            저장하기
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
