import { useEffect, useRef, useState } from 'react';

export interface ReviewDraft {
  rating: number;
  text: string;
  photos: string[];
}

interface ReviewWriteSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: ReviewDraft) => void;
  /** 상단에 보여줄 대상 제품 라벨 (예: "이니스프리 · 수분 밸런싱 토너 200ml") */
  productLabel?: string;
  /** 이미 작성된 후기를 수정할 때 이전 내용을 그대로 채운다 */
  initial?: ReviewDraft;
  /** "스타일 후기 작성" — 사진 최소 1장을 안내한다 */
  styleMode?: boolean;
}

/** 후기 작성/수정 공용 바텀시트 — 별점·본문·사진 첨부(로컬 미리보기)를 다룬다 */
export function ReviewWriteSheet({
  open,
  onClose,
  onSubmit,
  productLabel,
  initial,
  styleMode,
}: ReviewWriteSheetProps) {
  const [rating, setRating] = useState(initial?.rating ?? 5);
  const [text, setText] = useState(initial?.text ?? '');
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 열릴 때마다(수정 대상이 바뀌었을 수 있으므로) 초기값으로 리셋
  useEffect(() => {
    if (open) {
      setRating(initial?.rating ?? 5);
      setText(initial?.text ?? '');
      setPhotos(initial?.photos ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const urls = Array.from(files)
      .slice(0, 5 - photos.length)
      .map((f) => URL.createObjectURL(f));
    setPhotos((prev) => [...prev, ...urls]);
  };

  const removePhoto = (url: string) => setPhotos((prev) => prev.filter((p) => p !== url));

  const valid = text.trim().length >= 5 && (!styleMode || photos.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        className="max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white px-5 pt-3.5"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 20px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-gray-20" />
        <h3 className="text-[15px] font-extrabold text-gray-100">
          {initial ? '후기 수정' : styleMode ? '스타일 후기 작성' : '후기 작성'}
        </h3>
        {productLabel && <p className="mt-1 text-xs text-gray-50">{productLabel}</p>}

        <div className="mt-4 flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n}점`} className="active:scale-90 transition-transform">
              <span className={`text-3xl ${n <= rating ? '' : 'opacity-25'}`}>⭐</span>
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="제품을 사용해 보신 솔직한 후기를 남겨주세요. (5자 이상)"
          className="mt-4 h-[110px] w-full resize-none rounded-xl border border-gray-20 bg-gray-5 p-3.5 text-sm text-gray-100 outline-none focus:border-primary"
        />

        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={photos.length >= 5}
            className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-[1.5px] border-dashed border-gray-20 text-gray-50 disabled:opacity-40"
          >
            <span className="text-lg">📷</span>
            <span className="text-[10px] font-semibold">{photos.length}/5</span>
          </button>
          {photos.map((p) => (
            <div key={p} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-10">
              <img src={p} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(p)}
                aria-label="사진 삭제"
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="mt-2 text-[11px] leading-relaxed text-gray-50">
          · 사진은 선명하게 잘 보이도록 올려주세요. 상품과 무관하거나 부적절한 사진을 올리면 적립금이 지급되지 않을 수 있어요.
        </p>

        <button
          type="button"
          disabled={!valid}
          onClick={() => onSubmit({ rating, text: text.trim(), photos })}
          className="mt-4 flex h-[52px] w-full items-center justify-center rounded-full bg-primary-dark text-[15px] font-bold text-white transition-transform active:scale-[.98] disabled:opacity-40"
        >
          {initial ? '수정 완료' : '등록하기'}
        </button>
      </div>
    </div>
  );
}
