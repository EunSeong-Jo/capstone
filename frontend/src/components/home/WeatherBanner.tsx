import { SKIN_TYPE_META, SkinType, WeatherCondition, WeatherInfo } from '../../types';

interface WeatherBannerProps {
  weather: WeatherInfo;
  skinType: SkinType;
  /** 오늘의 맞춤 케어 메시지 */
  recommendation: string;
}

const WEATHER_ICON: Record<WeatherCondition, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  snowy: '🌨️',
  windy: '🌬️',
};

export function WeatherBanner({ weather, skinType, recommendation }: WeatherBannerProps) {
  const skin = SKIN_TYPE_META[skinType];

  return (
    <section className="relative overflow-hidden rounded-2xl p-5 shadow-soft bg-gradient-to-br from-atelier-secondary-light to-atelier-primary-light">
      {/* 상단: 피부타입 + 날씨 */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{skin.emoji}</span>
          <div>
            <p className="font-body uppercase tracking-[0.08em] text-xs text-atelier-primary">
              Today for you
            </p>
            <p className="font-headline text-base font-bold text-atelier-text leading-tight">
              {skin.label}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-2xl leading-none">{WEATHER_ICON[weather.condition]}</span>
          <div className="text-right">
            <p className="font-headline text-2xl font-bold text-atelier-text leading-none">
              {weather.temperature}°
            </p>
            <p className="font-body text-xs text-atelier-text-sub mt-0.5">
              {weather.conditionLabel} · {weather.seasonLabel}
            </p>
          </div>
        </div>
      </div>

      {/* 하단: 맞춤 케어 메시지 (글래스 카드) */}
      <div className="glass rounded-xl border border-white/50 px-4 py-3 mt-4">
        <p className="font-body text-sm text-atelier-text leading-relaxed">{recommendation}</p>
      </div>
    </section>
  );
}
