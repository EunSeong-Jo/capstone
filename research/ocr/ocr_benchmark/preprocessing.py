"""PRD 7.5.1 스펙에 맞춘 공통 이미지 전처리.

모든 엔진에 동일한 전처리 결과를 넣어야 비교가 공정하므로,
이미지당 한 번만 실행해서 3개 엔진에 재사용한다.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps


def load_image_with_exif_correction(path: str | Path) -> np.ndarray:
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        rgb = np.array(img)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def resize_max_dimension(img: np.ndarray, max_dim: int = 1280) -> np.ndarray:
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest <= max_dim:
        return img
    scale = max_dim / longest
    new_size = (int(w * scale), int(h * scale))
    return cv2.resize(img, new_size, interpolation=cv2.INTER_AREA)


def normalize_brightness_contrast(img: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    lab = cv2.merge((l, a, b))
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def denoise(img: np.ndarray) -> np.ndarray:
    return cv2.GaussianBlur(img, (3, 3), 0)


def preprocess_image(path: str | Path, save_debug: bool = False, debug_dir: str | Path = "output/preprocessed") -> np.ndarray:
    img = load_image_with_exif_correction(path)
    img = resize_max_dimension(img)
    img = normalize_brightness_contrast(img)
    img = denoise(img)

    if save_debug:
        debug_dir = Path(debug_dir)
        debug_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(debug_dir / Path(path).name), img)

    return img
