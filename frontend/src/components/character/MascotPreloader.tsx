import { useEffect } from 'react';
import { DECORATIONS, TYPE_FACE_SRC, UNKNOWN_FACE_SRC } from '../../data/mascotAssets';
import { useSkinType } from '../../hooks/useSkinType';
import { useCharacter } from '../../context/character';

/**
 * 미리 디코딩한 이미지. 참조를 붙잡아 두어야 브라우저가 지우지 않는다.
 * 사용자 한 명의 얼굴·장식 몇 장뿐이라(512px, 장당 약 1MB) 메모리 부담이 없다.
 */
const kept = new Map<string, HTMLImageElement>();

function preload(src: string) {
  if (kept.has(src)) return;
  const img = new Image();
  img.src = src;
  kept.set(src, img);
  // 디코딩까지 끝내 둔다. 실패해도 화면은 평소처럼 <img>로 다시 받는다.
  img.decode().catch(() => kept.delete(src));
}

/**
 * 내 캐릭터 이미지 미리 불러오기 — 화면에는 아무것도 그리지 않는다.
 *
 * 홈은 탭을 오갈 때마다 다시 그려지고, 그때 캐릭터 `<img>`도 새로 만들어진다.
 * 이미지가 아직 디코딩되지 않았으면 빈 원이 스쳤다가 캐릭터가 나타났다.
 * 피부타입·장식이 정해지는 순간 그 이미지를 앱 수준에서 디코딩해 두면,
 * 어느 화면이 그리든 바로 나온다.
 */
export function MascotPreloader() {
  const { skinType, loading } = useSkinType();
  const { decorationId } = useCharacter();

  useEffect(() => {
    if (loading) return;
    preload(skinType !== null ? TYPE_FACE_SRC[skinType] : UNKNOWN_FACE_SRC);
  }, [skinType, loading]);

  useEffect(() => {
    const deco = DECORATIONS.find((d) => d.id === decorationId);
    if (deco) preload(deco.src);
  }, [decorationId]);

  return null;
}
