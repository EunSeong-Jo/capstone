"""CER / WER / 정확 일치율 / pg_trgm 근사 유사도 계산.

한글 자모 결합/분리 형태 차이로 인한 왜곡을 막기 위해
비교 전 항상 NFC 정규화를 적용한다.
"""
import unicodedata

import pandas as pd
from rapidfuzz.distance import Levenshtein


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "")
    text = text.strip()
    return " ".join(text.split())


def compute_cer(reference: str, hypothesis: str) -> float:
    ref = normalize_text(reference)
    hyp = normalize_text(hypothesis)
    if len(ref) == 0:
        return 0.0 if len(hyp) == 0 else 1.0
    return Levenshtein.distance(ref, hyp) / len(ref)


def compute_wer(reference: str, hypothesis: str) -> float:
    ref_words = normalize_text(reference).split(" ")
    hyp_words = normalize_text(hypothesis).split(" ")
    ref_words = [w for w in ref_words if w]
    hyp_words = [w for w in hyp_words if w]
    if len(ref_words) == 0:
        return 0.0 if len(hyp_words) == 0 else 1.0
    return Levenshtein.distance(ref_words, hyp_words) / len(ref_words)


def is_exact_match(reference: str, hypothesis: str) -> bool:
    return normalize_text(reference) == normalize_text(hypothesis)


def _trigrams(text: str) -> set[str]:
    padded = f"  {text} "
    if len(padded) < 3:
        return set()
    return {padded[i:i + 3] for i in range(len(padded) - 2)}


def trigram_similarity(a: str, b: str) -> float:
    """PostgreSQL pg_trgm similarity()에 대한 근사치 (trigram Jaccard 유사도)."""
    set_a = _trigrams(normalize_text(a).lower())
    set_b = _trigrams(normalize_text(b).lower())
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union else 0.0


def best_fragment_match(reference: str, fragments: list[str]) -> dict:
    """정답(브랜드명+제품명)과 가장 잘 맞는 후보 조각을 찾는다.

    엔진은 이미지 전체의 모든 텍스트(예: 전성분표)를 추출하지만, 실제로
    필요한 건 브랜드명/제품명 부분뿐이다. 전체 텍스트를 통째로 정답과
    비교하면 무관한 텍스트 분량에 따라 CER/WER이 무의미하게 커지므로,
    줄 단위 조각들(및 인접한 두 줄을 합친 후보) 중 정답과 가장 근접한
    것을 골라 그것으로 지표를 계산한다. 이는 pg_trgm이 후보 중 최적
    매치를 찾는 실제 운영 방식과 유사하다.
    """
    candidates = list(fragments)
    for i in range(len(fragments) - 1):
        candidates.append(f"{fragments[i]} {fragments[i + 1]}")

    if not candidates:
        return {
            "best_cer": 1.0,
            "best_wer": 1.0,
            "best_exact_match": False,
            "best_trigram_similarity": 0.0,
            "best_fragment": "",
        }

    best_frag = min(candidates, key=lambda frag: compute_cer(reference, frag))
    return {
        "best_cer": compute_cer(reference, best_frag),
        "best_wer": compute_wer(reference, best_frag),
        "best_exact_match": is_exact_match(reference, best_frag),
        "best_trigram_similarity": trigram_similarity(reference, best_frag),
        "best_fragment": best_frag,
    }


def compute_all_metrics(reference: str, hypothesis: str, fragments: list[str], latency_sec: float) -> dict:
    metrics = {
        "full_text_cer": compute_cer(reference, hypothesis),
        "full_text_wer": compute_wer(reference, hypothesis),
        "latency_sec": latency_sec,
    }
    metrics.update(best_fragment_match(reference, fragments))
    return metrics


def aggregate_by_engine(df: pd.DataFrame) -> pd.DataFrame:
    grouped = df.groupby("engine").agg(
        mean_cer=("best_cer", "mean"),
        mean_wer=("best_wer", "mean"),
        exact_match_rate_pct=("best_exact_match", lambda s: s.mean() * 100),
        mean_trigram_similarity=("best_trigram_similarity", "mean"),
        mean_full_text_cer=("full_text_cer", "mean"),
        mean_latency_sec=("latency_sec", "mean"),
        p95_latency_sec=("latency_sec", lambda s: s.quantile(0.95)),
        n_images=("filename", "count"),
    )
    return grouped.reset_index()
