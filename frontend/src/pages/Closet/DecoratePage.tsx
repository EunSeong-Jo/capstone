import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CharacterAvatar } from '../../components/character/CharacterAvatar';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Button } from '../../components/ui/Button';
import { DECORATIONS } from '../../data/mascotAssets';
import { useCharacter } from '../../context/character';
import { useToast } from '../../context/toast';
import { useSkinType } from '../../hooks/useSkinType';

/**
 * 내 캐릭터 꾸미기.
 *
 * 예전에는 '저장하기'가 아무 일도 하지 않았고(파일에 TODO가 적혀 있었다),
 * 미리보기도 피부타입과 무관한 범용 얼굴(`base_face_neutral.png`)이었다.
 * 지금은 진단 결과의 마스코트를 쓰고, 저장하면 서버에 남아 홈·마이의
 * 캐릭터에도 같이 반영된다.
 */
export default function DecoratePage() {
  const navigate = useNavigate();
  const { decorationId, setDecoration } = useCharacter();
  const { showToast } = useToast();
  const { skinType } = useSkinType();

  // 저장 전까지는 화면 안에서만 고른다 — 뒤로 나가면 원래대로다.
  const [selected, setSelected] = useState<number | null>(decorationId);
  const changed = selected !== decorationId;

  const save = () => {
    setDecoration(selected);
    showToast('캐릭터를 저장했어요');
    navigate(-1);
  };

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
          {selected !== null && (
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
                aria-pressed={on}
                className={`aspect-square rounded-xl border-2 bg-white p-2 transition-transform active:scale-95 ${
                  on ? 'border-primary' : 'border-gray-20'
                }`}
              >
                <img src={d.src} alt={d.label} className="h-full w-full object-contain" />
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <Button variant="next" disabled={!changed} onClick={save}>
            저장하기
          </Button>
        </div>
      </div>
    </PageWrapper>
  );
}
