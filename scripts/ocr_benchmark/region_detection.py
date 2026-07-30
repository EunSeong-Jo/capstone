"""EasyOCR의 CRAFT 기반 텍스트 검출기를 재사용해 브랜드/제품명 후보 영역만 크롭한다.

BENCHMARK_REPORT.md 실패 원인 분석 1~3번(엉뚱한 영역 인식, 배경 노이즈를 텍스트로 오인식)은
공통적으로 "텍스트 영역 검출 없이 이미지 전체를 OCR에 넣기 때문"에 발생한다. 이 모듈은 검출된
박스를 이미지 상단 영역 + 글자 크기(박스 높이) 기준으로 좁혀 브랜드/제품명 후보만 남기고,
작은 텍스트는 업스케일해서 3개 엔진 모두에 동일한 크롭 후보 집합을 넣는다 (비교 공정성 유지).
면적만으로 고르면 성분표 문단처럼 크지만 브랜드/제품명이 아닌 블록이 섞여 들어온다.

검출기로 별도 EAST 모델을 새로 들이는 대신, 이미 의존성에 있는 EasyOCR의 CRAFT 검출기를
재사용한다(추가 다운로드/의존성 없음). detect()는 인식 없이 박스만 뽑아 recognize보다 빠르다.

(4방향 회전 보정을 시도했으나, 180도 회전은 박스 가로세로 비율이 그대로 유지돼 정방향과
구별이 안 되고 실제로 정상 사진을 뒤집는 역효과가 확인되어 제외했다.)
"""
import numpy as np
import cv2


def build_detector():
    """검출 전용 EasyOCR reader를 생성한다. run_easyocr()용 reader와는 별개 인스턴스."""
    import easyocr

    return easyocr.Reader(["ko", "en"], gpu=False)


def _boxes_from_detect_result(result) -> list[list[float]]:
    """easyocr.Reader.detect()의 (horizontal_list, free_list) 반환값을
    [x_min, x_max, y_min, y_max] 박스 리스트로 정규화한다.

    detect()는 입력 이미지 1장을 내부적으로 배치 크기 1로 취급하므로, 반환값은
    항상 한 겹 더 감싸져 있다 (horizontal_list == [실제 박스 리스트]). free_list는
    검출된 회전 박스(4점)가 없으면 [[]] 형태로 온다 - 빈 quad는 건너뛴다.
    """
    horizontal_list, free_list = result

    boxes = list(horizontal_list[0]) if horizontal_list else []

    quads = free_list[0] if free_list else []
    for quad in quads:
        if not quad:
            continue
        xs = [p[0] for p in quad]
        ys = [p[1] for p in quad]
        boxes.append([min(xs), max(xs), min(ys), max(ys)])

    return boxes


def _raw_boxes(image: np.ndarray, detector) -> list[list[float]]:
    try:
        raw_result = detector.detect(image)
        return _boxes_from_detect_result(raw_result)
    except Exception:
        return []


def select_candidate_boxes(
    image: np.ndarray,
    detector,
    top_k: int = 3,
    min_area_ratio: float = 0.0008,
    top_region_ratio: float = 0.4,
) -> list[tuple[int, int, int, int]]:
    """브랜드/제품명 후보 박스를 (x_min, y_min, x_max, y_max)로 반환한다.

    면적 기준 top-K는 성분표 문단처럼 "크지만 브랜드/제품명이 아닌" 블록까지 뽑아버리는
    문제가 있었다 (BENCHMARK_REPORT.md 실패 사례 참고). 브랜드/제품명은 보통 라벨 상단에
    가장 큰 글씨로 나온다는 관찰에 기반해, 이미지 상단 top_region_ratio 영역으로 먼저
    좁히고 그 안에서 글자 크기(박스 높이)가 큰 순으로 top_k개만 남긴다.

    상단 영역에 후보가 하나도 없으면(라벨이 하단에 배치된 사진 등) 위치 필터 없이 전체
    후보 중 박스 높이 기준으로 폴백한다.

    detect_candidate_regions()의 크롭 이전 단계 - 시각화 스크립트가 원본 이미지 위에
    박스를 그릴 때도 이 함수를 그대로 재사용한다.
    """
    h, w = image.shape[:2]
    image_area = h * w
    top_limit = h * top_region_ratio

    boxes = _raw_boxes(image, detector)

    candidates = []
    for box in boxes:
        try:
            x_min, x_max, y_min, y_max = [int(v) for v in box]
        except (TypeError, ValueError):
            continue
        x_min, y_min = max(0, x_min), max(0, y_min)
        x_max, y_max = min(w, x_max), min(h, y_max)
        box_w, box_h = x_max - x_min, y_max - y_min
        if box_w <= 0 or box_h <= 0:
            continue
        if (box_w * box_h) / image_area < min_area_ratio:
            continue
        candidates.append((box_h, x_min, y_min, x_max, y_max))

    if not candidates:
        return []

    in_top_region = [c for c in candidates if (c[2] + c[4]) / 2 < top_limit]
    pool = in_top_region if in_top_region else candidates

    pool.sort(key=lambda c: c[0], reverse=True)
    return [(x_min, y_min, x_max, y_max) for _, x_min, y_min, x_max, y_max in pool[:top_k]]


def detect_candidate_regions(
    image: np.ndarray,
    detector,
    top_k: int = 3,
    min_area_ratio: float = 0.0008,
    top_region_ratio: float = 0.4,
    upscale_if_smaller_than: int = 200,
    upscale_factor: float = 2.0,
    include_full_image: bool = True,
) -> list[np.ndarray]:
    """이미지에서 텍스트 후보 영역을 검출해 크롭·업스케일한 이미지 리스트를 반환한다.

    검출이 실패하거나 후보가 없으면 원본 이미지를 그대로 반환해 안전하게 폴백한다.
    include_full_image=True면 원본 전체 이미지도 후보 맨 뒤에 추가해, 검출기가 타깃
    텍스트를 놓쳤을 때도 기존(전체 이미지) 방식만큼은 동작하도록 보장한다.
    """
    boxes = select_candidate_boxes(
        image, detector, top_k=top_k, min_area_ratio=min_area_ratio, top_region_ratio=top_region_ratio
    )

    crops = []
    for x_min, y_min, x_max, y_max in boxes:
        crop = image[y_min:y_max, x_min:x_max]
        if crop.size == 0:
            continue
        if min(crop.shape[:2]) < upscale_if_smaller_than:
            crop = cv2.resize(
                crop, None, fx=upscale_factor, fy=upscale_factor, interpolation=cv2.INTER_CUBIC
            )
        crops.append(crop)

    if include_full_image or not crops:
        crops.append(image)

    return crops
