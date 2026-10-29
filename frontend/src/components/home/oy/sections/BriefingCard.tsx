import { useNavigate } from 'react-router-dom';
import { useBriefing } from '../../../../hooks/usePersonalAi';

/**
 * 홈 > 오늘의 브리핑 — 오늘 날씨 × 내 약한 피부 항목 × 내 화장대로 "오늘 먼저 쓸 제품"을 알려 준다(로그인한 사용자만).
 * 케어 문구가 피부타입 8종 공용 한 줄이라면 이것은 나만의 한 장이다. 화장대에 필요한 제품이 없으면 없다고 말한다.
 */
export function BriefingCard() {
  const navigate = useNavigate();
  const { briefing: b, loading } = useBriefing();

  if (loading) return <div className="mx-4 mb-3 h-24 animate-pulse rounded-2xl bg-gray-10" aria-hidden />;
  if (!b) return null;

  return (
    <section className="mx-4 mb-3 rounded-2xl border border-[#DCEBE3] bg-ob-surface px-4 py-3.5" aria-label="오늘의 브리핑">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-extrabold text-ob-green-deep">오늘의 브리핑</span>
        {b.weather?.temperature != null && (
          <span className="text-[11px] text-gray-50">
            {b.weather.label} {b.weather.temperature}°{b.weather.humidity != null && ` · 습도 ${b.weather.humidity}%`}
          </span>
        )}
      </div>
      <p className="mt-1 text-[14px] font-extrabold leading-snug text-gray-100">{b.headline}</p>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {b.reasons.map((r) => (
          <li key={r} className="text-[12px] leading-snug text-gray-70">
            · {r}
          </li>
        ))}
      </ul>
      {b.pick && (
        <button
          type="button"
          onClick={() => navigate(`/analysis/${b.pick!.id}`)}
          className="mt-2.5 w-full rounded-xl bg-white px-3 py-2 text-left active:scale-[.99]"
        >
          <span className="block text-[11px] text-gray-50">{b.pick.brand}</span>
          <span className="line-clamp-1 block text-[12px] font-bold text-gray-100">{b.pick.name}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-primary-dark">{b.pick.why}</span>
        </button>
      )}
      {b.missing && <p className="mt-2 text-[12px] leading-snug text-gray-70">{b.missing}</p>}
      {b.tips.map((t) => (
        <p key={t} className="mt-1.5 text-[11px] leading-snug text-gray-50">
          {t}
        </p>
      ))}
    </section>
  );
}
