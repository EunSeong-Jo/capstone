import { useNavigate } from 'react-router-dom';
import { usePreferences } from '../../hooks/usePersonalAi';

const SOURCE_LABEL: Record<string, string> = { review: '후기', repeat: '재구매', like: '찜', closet: '화장대' };

/**
 * 마이페이지 "내 취향 성분" — 후기·찜·재구매·화장대에서 서버가 배운 내 성분 취향.
 *
 * 신호가 모자라면(`active=false`) 취향이 있는 척하지 않고 어떻게 쌓는지만 안내한다. 켜지면 좋아하는 성분과 그 근거 제품을 보여 준다
 * ("왜 이 제품이 나에게 맞아 보이는지"를 성분 이름으로 설명할 수 있는 개인 모델).
 */
export function TasteCard() {
  const navigate = useNavigate();
  const { preferences: p, loading } = usePreferences();

  if (loading) return <div className="mt-3 h-24 animate-pulse rounded-[20px] bg-gray-10" aria-hidden />;
  if (!p) return null;

  const sources = Object.entries(p.sources)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${SOURCE_LABEL[k] ?? k} ${n}`)
    .join(' · ');

  return (
    <section className="mt-3 rounded-[20px] border border-[#ECEEE8] bg-white p-4" aria-label="내 취향 성분">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-extrabold text-gray-100">내 취향 성분</p>
        <span className="text-[11px] text-gray-50">{p.active ? 'AI가 배운 취향' : `신호 ${p.signalCount}/${p.minSignals}`}</span>
      </div>

      {!p.active ? (
        <p className="mt-2 text-[12px] leading-relaxed text-gray-50">{p.message}</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {p.liked.slice(0, 4).map((i) => (
              <li key={i.ingredientId}>
                <div className="flex items-center gap-2">
                  <span className="w-[112px] shrink-0 truncate text-[12px] font-bold text-gray-100">{i.name}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-10">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${i.weight}%` }} />
                  </span>
                </div>
                {i.products.length > 0 && (
                  <p className="ml-[120px] mt-0.5 truncate text-[11px] text-gray-50">{i.products.map((x) => x.name).join(', ')}</p>
                )}
              </li>
            ))}
          </ul>
          {p.disliked.length > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-gray-50">
              별로였던 제품에 많던 성분: <span className="font-semibold text-gray-70">{p.disliked.slice(0, 3).map((i) => i.name).join(', ')}</span>
            </p>
          )}
          <p className="mt-2 text-[11px] text-gray-50">{sources}에서 배웠어요</p>
        </>
      )}

      <button
        type="button"
        onClick={() => navigate('/mypage/settings/ai-memory')}
        className="mt-3 text-[12px] font-bold text-primary-dark underline underline-offset-2"
      >
        챗봇이 기억하는 내 정보 보기
      </button>
    </section>
  );
}
