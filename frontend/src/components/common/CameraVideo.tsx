import { useState, type MutableRefObject } from 'react';

/** 1×1 투명 GIF. `poster`가 없으면 안드로이드 웹뷰가 첫 프레임이 오기 전까지 기본 포스터(회색 바탕의 ▶ 재생 아이콘)를 그린다. */
const TRANSPARENT_POSTER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * 카메라 미리보기 `<video>`.
 *
 * 스트림을 붙인 뒤 **첫 프레임이 재생되기 전**(`playing` 이벤트 전)에는 숨겨 두었다가 부드럽게 나타낸다.
 * 이 구간에 웹뷰가 기본 재생 화면을 그려서, 카메라 화면이 뜨기 전에 동영상 플레이어처럼 보였다.
 * `poster`를 투명 이미지로 덮고, 재생이 시작될 때까지 불투명도 0으로 둔다(`index.css`의 재생 버튼 숨김과 함께).
 */
export function CameraVideo({
  videoRef,
  className = '',
}: {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      aria-hidden
      poster={TRANSPARENT_POSTER}
      onPlaying={() => setPlaying(true)}
      className={`${className} transition-opacity duration-200 ${playing ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}
