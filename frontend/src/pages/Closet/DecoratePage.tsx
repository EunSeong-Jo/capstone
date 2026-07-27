import { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';

const FACE = '/mascot/base_face_neutral.png';
const DECORATIONS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  id: n,
  src: `/mascot/decoration_${n}.png`,
}));

/** 내 캐릭터 꾸미기 — 마스코트에 데코레이션 적용 (홈 캐릭터 탭 진입) */
export default function DecoratePage() {
  const [selected, setSelected] = useState<number | null>(null);
  const deco = selected ? DECORATIONS[selected - 1] : null;

  return (
    <PageWrapper>
      <Header showBack title="내 캐릭터 꾸미기" />

      {/* 미리보기 */}
      <div className="flex items-center justify-center bg-gray-5 py-10">
        <div className="relative h-52 w-52">
          <img src={FACE} alt="내 캐릭터" className="h-full w-full object-contain" />
          {deco && (
            <img
              src={deco.src}
              alt="데코레이션"
              className="absolute inset-0 h-full w-full object-contain"
            />
          )}
        </div>
      </div>

      {/* 데코레이션 선택 */}
      <div className="px-4 py-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-100">데코레이션</h2>
          {selected && (
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
                className={`aspect-square rounded-xl border-2 bg-white p-2 active:scale-95 transition-transform ${
                  on ? 'border-primary' : 'border-gray-20'
                }`}
              >
                <img src={d.src} alt={`데코 ${d.id}`} className="h-full w-full object-contain" />
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <Button variant="next">저장하기</Button>
          {/* TODO: 선택 데코 저장 (사용자 store/API 연동) */}
        </div>
      </div>
    </PageWrapper>
  );
}
