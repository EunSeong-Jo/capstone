"""test/ 폴더 이미지에 대해 모델이 어디를 '보고' 있는지 박스로 시각화한다.

두 종류의 박스를 그린다:
- 주황 박스(R1, R2, ...): --region-detection이 선정한 텍스트 후보 영역(면적 상위 K개)
- 청록 박스: EasyOCR이 이미지 전체에서 실제로 인식한 텍스트 조각 + 신뢰도

cv2.putText는 한글을 못 그리므로(Hershey 폰트가 한글 미지원) PIL + 한글 지원 시스템
폰트(AppleGothic)로 텍스트를 오버레이한다.
"""
import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from preprocessing import preprocess_image
from region_detection import select_candidate_boxes

KOREAN_FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
]


def load_font(size: int = 16) -> ImageFont.FreeTypeFont:
    for path in KOREAN_FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_boxes(
    image_bgr: np.ndarray,
    region_boxes: list[tuple[int, int, int, int]],
    easyocr_detections: list,
    font: ImageFont.FreeTypeFont,
) -> np.ndarray:
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb)
    draw = ImageDraw.Draw(pil_img)

    for rank, (x_min, y_min, x_max, y_max) in enumerate(region_boxes, start=1):
        draw.rectangle([x_min, y_min, x_max, y_max], outline=(255, 140, 0), width=3)
        label_y = y_min - 20 if y_min - 20 > 0 else y_min + 2
        draw.text((x_min + 2, label_y), f"R{rank}", fill=(255, 140, 0), font=font)

    for box, text, conf in easyocr_detections:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        x_min, y_min, x_max, y_max = min(xs), min(ys), max(xs), max(ys)
        draw.rectangle([x_min, y_min, x_max, y_max], outline=(0, 200, 200), width=2)
        label = f"{text[:24]} ({conf:.2f})"
        label_y = y_max + 2
        draw.text((x_min, label_y), label, fill=(0, 130, 130), font=font)

    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)


def main():
    parser = argparse.ArgumentParser(description="텍스트 영역 검출 후보 + EasyOCR 인식 결과 시각화")
    parser.add_argument("--images-dir", default="test")
    parser.add_argument("--output-dir", default="test/visualizations")
    args = parser.parse_args()

    images_dir = Path(args.images_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    image_paths = sorted(
        p for p in images_dir.iterdir()
        if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    )
    if not image_paths:
        print(f"[경고] {images_dir}에서 이미지를 찾지 못했습니다.")
        return

    print("EasyOCR 로딩 중...")
    import easyocr

    reader = easyocr.Reader(["ko", "en"], gpu=False)
    font = load_font(16)

    for path in image_paths:
        print(f"처리 중: {path.name}")
        image = preprocess_image(path)

        region_boxes = select_candidate_boxes(image, reader)
        detections = reader.readtext(image, detail=1)

        annotated = draw_boxes(image, region_boxes, detections, font)
        out_path = output_dir / f"{path.stem}_annotated.png"
        cv2.imwrite(str(out_path), annotated)
        print(f"  -> {out_path.name} (영역후보 {len(region_boxes)}개, EasyOCR 인식 {len(detections)}개)")

    print(f"\n완료: {len(image_paths)}장 -> {output_dir}/")


if __name__ == "__main__":
    main()
