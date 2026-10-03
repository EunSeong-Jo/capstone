import { useRef, useState } from 'react';

/**
 * 후기 작성 바텀시트 — 별점과 본문.
 *
 * 이게 없던 동안 주문내역의 '후기 작성'은 **별점 4점을 고정으로** 보냈다
 * (무엇을 보내든 거짓이라 만점은 피한 값이었다). 이제 사용자가 직접 고른다.
 *
 * 사진은 3장까지. 올리기 전에 긴 변 1080px JPEG로 줄인다 — 폰 원본(수 MB)을
 * 그대로 보내면 서버 한도(장당 2MB)를 넘고 목록도 무거워진다.
 *
 * 열 때마다 초기화해야 하는데 effect로 하지 않는다 — 부모가 `key`를 바꿔
 * 다시 마운트시키면 된다(react-hooks/set-state-in-effect).
 */
export interface ReviewDraft {
  rating: number;
  body: string;
  /** data URL(JPEG) */
  photos: string[];
}

const MAX_PHOTOS = 3;
const MAX_SIDE = 1080;

/** 이미지 파일 → 긴 변 MAX_SIDE 이하 JPEG data URL */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽지 못했어요'));
    };
    img.src = url;
  });
}

interface ReviewWriteSheetProps {
  onClose: () => void;
  onSubmit: (draft: ReviewDraft) => void;
  /** 상단에 보여줄 대상 제품 라벨 (예: "이니스프리 · 수분 밸런싱 토너 200ml") */
  productLabel?: string;
  /** 저장 중이면 닫기·제출을 막는다 */
  saving?: boolean;
}

/** 서버 제약(`schemas/personal.py: ReviewIn.body`)과 같은 값. */
const MAX_BODY = 1000;
const MIN_BODY = 5;

export function ReviewWriteSheet({
  onClose,
  onSubmit,
  productLabel,
  saving = false,
}: ReviewWriteSheetProps) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, MAX_PHOTOS - photos.length);
    const shrunk = await Promise.all(picked.map((f) => shrinkImage(f).catch(() => null)));
    setPhotos((prev) => [...prev, ...shrunk.filter((p): p is string => p !== null)].slice(0, MAX_PHOTOS));
  };

  const valid = body.trim().length >= MIN_BODY && !saving;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
      onClick={() => !saving && onClose()}
    >
      <div
        className="max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white px-5 pt-3.5"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 20px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-gray-20" />
        <h3 className="text-[15px] font-extrabold text-gray-100">후기 작성</h3>
        {productLabel && <p className="mt-1 text-xs text-gray-50">{productLabel}</p>}

        <div className="mt-4 flex items-center justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n}점`}
              aria-pressed={rating === n}
              disabled={saving}
              onClick={() => setRating(n)}
              className="text-[30px] leading-none transition-transform active:scale-90"
            >
              <span className={n <= rating ? 'opacity-100' : 'opacity-25'}>★</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-center text-xs font-semibold text-gray-70">{rating}점</p>

        <textarea
          value={body}
          disabled={saving}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
          placeholder={`어떤 점이 좋았는지 적어 주세요 (${MIN_BODY}자 이상)`}
          className="mt-4 h-32 w-full resize-none rounded-xl border border-gray-20 bg-white p-3.5 text-[14px] text-gray-100 outline-none focus:border-primary disabled:opacity-60"
        />
        <p className="mt-1 text-right text-[11px] text-gray-50">
          {body.length} / {MAX_BODY}
        </p>

        {/* 사진 첨부 */}
        <div className="mt-2 flex gap-2">
          {photos.map((src, i) => (
            <div key={i} className="relative h-[72px] w-[72px] shrink-0">
              <img src={src} alt={`첨부 사진 ${i + 1}`} className="h-full w-full rounded-xl object-cover" />
              <button
                type="button"
                disabled={saving}
                onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`사진 ${i + 1} 삭제`}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-oy-black text-[10px] text-white"
              >
                ✕
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              disabled={saving}
              onClick={() => fileRef.current?.click()}
              className="flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-gray-20 text-gray-50 active:scale-95"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8a2 2 0 012-2h1.5l1.2-1.8A1.5 1.5 0 0110 3.5h4a1.5 1.5 0 011.3.7L16.5 6H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
                <circle cx="12" cy="12.5" r="3.2" />
              </svg>
              <span className="mt-0.5 text-[10px] font-semibold">
                {photos.length}/{MAX_PHOTOS}
              </span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void addPhotos(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="h-[52px] flex-1 rounded-full border border-gray-20 text-[15px] font-bold text-gray-100 active:scale-[.98] disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSubmit({ rating, body: body.trim(), photos })}
            className="h-[52px] flex-[2] rounded-full bg-primary-dark text-[15px] font-bold text-white active:scale-[.98] disabled:opacity-50"
          >
            {saving ? '저장 중…' : '후기 등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
