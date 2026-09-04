"""날씨 응답 스키마.

프론트엔드 `src/types/index.ts`의 `WeatherInfo`를 그대로 낸다.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class WeatherOut(_CamelModel):
    condition: str          # 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'windy'
    condition_label: str    # OpenWeatherMap 한국어 설명 (예: "맑음")
    temperature: int
    season: str             # 'spring' | 'summer' | 'autumn' | 'winter'
    season_label: str       # "봄" 등
    humidity: int | None = None
