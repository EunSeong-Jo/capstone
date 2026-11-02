/**
 * 담기 버튼에서 상단 장바구니 아이콘으로 상품 사진이 곧장(직선으로) 날아가는 효과.
 *
 * 도착점은 `data-cart-target` 속성이 붙은 요소(CartButton)다. 화면에 없거나 "동작 줄이기" 설정이면 아무것도 하지 않는다.
 * 라이브러리 없이 Web Animations API만 쓰고, 끝나면 날아간 요소를 지우고 장바구니 아이콘이 톡 튄다.
 */
export function flyToCart(from: HTMLElement, imageUrl?: string | null): void {
  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const target = document.querySelector<HTMLElement>('[data-cart-target]');
  if (!target) return;

  const size = 44;
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const sx = a.left + a.width / 2 - size / 2;
  const sy = a.top + a.height / 2 - size / 2;
  const ex = b.left + b.width / 2 - size / 2;
  const ey = b.top + b.height / 2 - size / 2;

  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    overflow: 'hidden',
    background: '#fff',
    border: '2px solid #2B6B52',
    boxShadow: '0 6px 16px rgba(0,0,0,.25)',
    zIndex: '9999',
    pointerEvents: 'none',
    willChange: 'transform',
  } as Partial<CSSStyleDeclaration>);
  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '';
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover' } as Partial<CSSStyleDeclaration>);
    el.appendChild(img);
  } else {
    el.style.background = '#2B6B52';
  }
  document.body.appendChild(el);

  const flight = el.animate(
    [
      { transform: `translate(${sx}px, ${sy}px) scale(1)`, opacity: 1 },
      { transform: `translate(${ex}px, ${ey}px) scale(.3)`, opacity: 0.7 },
    ],
    { duration: 620, easing: 'cubic-bezier(.5,0,.75,.4)', fill: 'forwards' },
  );
  const done = () => {
    el.remove();
    target.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
      { duration: 340, easing: 'ease-out' },
    );
  };
  flight.onfinish = done;
  flight.oncancel = () => el.remove();
}
