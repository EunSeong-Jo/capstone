"""같은 제품의 용량·구성 변형을 한 묶음으로 접는다 (사진으로 찾기 후보).

올리브영은 같은 제품을 단품·더블 기획·리필 기획세트로 따로 올린다. 이름(`display_name`)은 같고
`name`만 다르다. 사진으로 찾은 후보에 이게 전부 나열되면 같은 제품이 여러 줄이라 어느 것인지 고르기 어렵다.
묶음의 대표는 **가장 용량이 작은 제품**(용량이 같으면 더 싼 것)이고, 나머지는 드롭다운으로 고른다.
"""
from __future__ import annotations

import re

from app.services.similarity import variant_body

_AMOUNT = re.compile(r"(\d+(?:\.\d+)?)\s*(ml|g|매|개입?|입|ea|정)", re.IGNORECASE)
_NO_AMOUNT = float("inf")


def volume_amount(name: str) -> float:
    """이름 속 첫 용량 숫자. 없으면 무한대(대표로 뽑히지 않게 뒤로 보낸다)."""
    m = _AMOUNT.search(name)
    return float(m.group(1)) if m else _NO_AMOUNT


def volume_text(name: str) -> str:
    m = _AMOUNT.search(name)
    return f"{m.group(1)}{m.group(2).lower() if m.group(2).isascii() else m.group(2)}" if m else ""


def variant_label(display: str, raw: str) -> str:
    """드롭다운 줄 이름. '350ml' 또는 '350ml · 더블기획 (+어성초 크림 20ml)'.

    표시명이 같은 변형들을 가르는 건 원본 이름 뒤에 붙은 기획 문구라서, 그 부분을 덧붙인다.
    """
    vol = volume_text(display) or volume_text(raw)
    extra = raw[len(display):].strip() if raw.startswith(display) else ""
    extra = re.sub(r"^\d+(?:\.\d+)?\s*(?:ml|g)\b", "", extra, flags=re.IGNORECASE).strip()
    label = vol or "용량 미표기"
    if extra:
        label += f" · {extra[:22]}{'…' if len(extra) > 22 else ''}"
    return label


def group_key(brand: str, display: str) -> tuple[str, str]:
    return brand, variant_body(display)


def sort_group(members: list[tuple[str, int, int]]) -> list[int]:
    """members: (이름, 가격, 인덱스) → 대표가 앞에 오는 인덱스 순서. 용량 오름차순 → 가격 오름차순."""
    return [i for _n, _p, i in sorted(members, key=lambda m: (volume_amount(m[0]), m[1], m[2]))]
