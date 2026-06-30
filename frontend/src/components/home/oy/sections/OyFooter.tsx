/** 25. 푸터 — 고객센터 메뉴 + 사업자 정보 (대체뭐야로 치환) */
export function OyFooter() {
  const menus = ['대표전화', '채팅 상담', '1:1문의', '고객센터'];
  const info: [string, string][] = [
    ['대표이사', '홍길동'],
    ['사업자 등록번호', '000-00-00000'],
    ['호스팅 사업자', '대체뭐야'],
    ['통신판매업신고번호', '2026-서울-0000'],
    ['이메일', 'help@daechemuya.app'],
  ];
  return (
    <footer className="mt-4 bg-oy-chip px-4 py-6">
      <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-2 text-sm text-oy-text">
        {menus.map((m, i) => (
          <span key={m} className="flex items-center gap-3">
            {i > 0 && <span className="text-oy-line">|</span>}
            <button className="active:opacity-60">{m}</button>
          </span>
        ))}
      </div>

      <p className="text-center text-sm font-bold text-oy-text mt-5">대체뭐야 (주)</p>

      <dl className="mt-3 space-y-1.5 text-xs text-oy-sub">
        {info.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-28 shrink-0">{k}</dt>
            <dd className="text-oy-text/70">{v}</dd>
          </div>
        ))}
      </dl>
    </footer>
  );
}
