"""제품 구성 판정 — 단일제품인가, 무엇이 딸려 있는가.

유사도의 전제는 "전성분 한 줄 = 제품 하나"인데, 기획세트는 여러 제품의
전성분을 한 셀에 이어 붙여 이 전제를 깬다. 그러면 성분 집합이 여러 제품의
합집합이 되어 무엇과도 비슷해진다.

실측 (얼굴 4종 카테고리, 고유 성분 100개 초과 비율):

    순수 단일          0.9%
    증량·화장품증정     3.5%
    굿즈 동봉          1.0%
    묶음(N종 표기)     25.3%
    묶음(분리됨)       19.0%
    묶음(미분리)       29.1%

묶음만 20배 이상 튄다. 굿즈는 키링이 붙든 말든 전성분이 본품 것 하나라
계산에 영향이 없고, 증량(`+50ml`)도 대부분 같은 제품이다.

다만 `bonus`가 완전히 깨끗하지는 않다. 다른 제품을 얹었는데 이름만으로는
구별되지 않는 경우가 있다:

    헤브블루 살몬 PDRN 센텔라 토너 200ml 기획 (+연어 크림 20ml)
    → 성분 57개, 정제수 2회 — 두 제품의 전성분이 이어 붙었다

이런 건이 1,537건 중 39건(2.5%)이다. 이름으로는 판별할 수 없고 성분 반복을
봐야 하는데, 판매자가 본품 전성분만 적어둔 경우가 많아 신호가 일정하지 않다.
그래서 여기서는 **이름과 메타 컬럼으로 판정할 수 있는 것까지만** 다루고,
성분 기반 판정은 유사도 배치의 `is_bundle`(app/services/similarity.py)에
맡긴다. 두 층이 함께 걸러낸다.
"""
from __future__ import annotations

import re

# 오염이 심한 쪽부터. 한 제품이 여러 조건에 걸리면 앞쪽이 이긴다.
BUNDLE, GOODS, BONUS, SINGLE = "bundle", "goods", "bonus", "single"

VALUES = (SINGLE, BONUS, GOODS, BUNDLE)

# 'N종 택1', '골라담기' 류. 호수·종류별 전성분이 한 셀에 들어온다.
_BUNDLE_NAME = re.compile(r"\d+\s*종|택\s*?1|골라담기|모음|세트|키트|컬렉션")

# 본품에 딸려오는 비화장품. 전성분에는 영향이 없지만 '단일제품'은 아니다.
_GOODS = re.compile(
    r"키링|인형|파우치|텀블러|뱃지|배지|스티커|에코백|거울|브러쉬|브러시|퍼프"
    r"|헤어밴드|머리끈|우산|굿즈|포토카드|쇼핑백|보틀|엽서|필통|가방|모자"
    r"|양말|담요|피규어|키캡|스파츌러|스파츌라|주걱|타월|띠부씰|카드지갑"
)

# 굿즈 키워드는 '+' 또는 '증정' 뒤에서만 인정한다. 그렇게 하지 않으면
# 제품 자체가 도구인 것이 굿즈로 잡힌다:
#     필리밀리 메이크업 브러시 골라담기 9종 택1
#     SPUUN 피부스푼 스마트 스패츌러
# 이 문맥 제한으로 4종 카테고리 기준 139건 → 103건이 된다.
_GIFT_CONTEXT = re.compile(r"\+[^)\]/]{0,40}|증정[^)\]/]{0,40}")


def classify(
    name_raw: str,
    memo: str | None = None,
    gift_flag: str | None = None,
    volume_raw: str | None = None,
) -> str:
    """제품 구성을 single / bonus / goods / bundle 중 하나로 판정한다.

    name_raw    정제 전 상품명. v5의 `상품명_원본`, 구 CSV의 `상품명`.
                정제된 이름(v5 `상품명`)은 기획·증정 문구가 이미 지워져 있어
                쓰면 안 된다.
    memo        v5 `처리메모`. '묶음분리'·'묶음 미분리'가 가장 확실한 신호다.
    gift_flag   v5 `증정기획_정리`. 'Y'면 이름에서 기획·증정 문구를 걷어낸 건.
    volume_raw  v5 `내용량_원본`. '[본품] ... [증정] ...' 구조가 여기 남는다.

    memo·gift_flag·volume_raw가 없으면 이름만으로 판정한다. v5를 아직 적재하지
    않은 구 CSV 경로가 여기 해당한다.
    """
    name = name_raw or ""
    blob = f"{name} {volume_raw or ''}"

    # 크롤러가 직접 판정해 남긴 것이라 추측보다 우선한다.
    if memo and "묶음" in memo:
        return BUNDLE
    if _BUNDLE_NAME.search(name):
        return BUNDLE
    if any(_GOODS.search(seg) for seg in _GIFT_CONTEXT.findall(blob)):
        return GOODS
    if (gift_flag or "").strip() == "Y" or "증정" in blob or "기획" in name:
        return BONUS
    return SINGLE
