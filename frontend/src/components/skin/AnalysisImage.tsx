import { useEffect, useState } from 'react';
import { fetchAnalysisImage } from '../../api/skinPhoto';

/**
 * 사진 분석 이미지 한 장 — 항목별 분석 결과 PNG.
 *
 * 얼굴 사진이 없는 **투명 PNG**(표시할 부위에만 색)라서, 중립 배경 위에 얹어 보여 준다.
 * 얼굴이 없으므로 모양을 알아보기 어려울 수 있다 — 분석 업체가 주는 그대로다.
 *
 * 본인 인증이 필요한 API라 `<img src>`로 바로 못 쓰고, blob으로 받아 object URL로 보여 준다.
 * 보이는 동안에만 받고(펼칠 때 마운트), 사라지면 URL을 해제한다.
 */
interface AnalysisImageProps {
  analysisId: string;
  imageKey: string;
  label: string;
}

type State = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'failed' };

export default function AnalysisImage({ analysisId, imageKey, label }: AnalysisImageProps) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const ctrl = new AbortController();
    let objectUrl: string | null = null;
    fetchAnalysisImage(analysisId, imageKey, ctrl.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'ready', url: objectUrl });
      })
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setState({ status: 'failed' });
      });
    return () => {
      ctrl.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [analysisId, imageKey]);

  if (state.status === 'ready') {
    return (
      <img
        src={state.url}
        alt={`${label} 분석 이미지`}
        className="max-h-[360px] w-full rounded-xl bg-gray-20 object-contain"
      />
    );
  }
  return (
    <div className="flex h-32 items-center justify-center rounded-xl bg-gray-5 text-[11px] text-gray-50">
      {state.status === 'loading' ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-ob-green border-t-transparent" />
      ) : (
        '이미지를 불러오지 못했어요'
      )}
    </div>
  );
}
