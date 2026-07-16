import { useNavigate } from 'react-router-dom';

// TODO: Task 14 완료 후 실제 추천 세트로 교체
const MOCK_SET = [
  { id: 1, category: '토너', name: '수분 밸런싱 토너 200ml', price: 28000, matchRate: 94 },
  { id: 2, category: '에센스', name: '히알루론산 에센스 50ml', price: 35000, matchRate: 88 },
  { id: 3, category: '크림', name: '수분 장벽 크림 60ml', price: 42000, matchRate: 91 },
];

export default function PopupPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-dvh">
      {/* 오버레이 */}
      <div className="flex-1 bg-black/40" onClick={() => navigate('/home')} />

      {/* Bottom sheet */}
      <div className="bg-white rounded-t-[20px] px-6 pt-5 pb-8">
        {/* 핸들 */}
        <div className="w-9 h-1 rounded-full bg-gray-20 mx-auto mb-5" />

        <h2 className="text-lg font-bold text-gray-100 mb-1">수분팡팡 옹달샘 타입을 위한</h2>
        <p className="text-2xl font-black text-primary mb-6">추천 세트 💧</p>

        <div className="flex flex-col gap-3 mb-6">
          {MOCK_SET.map(item => (
            <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-5 border border-gray-20">
              <div>
                <span className="text-xs font-medium text-primary">{item.category}</span>
                <p className="text-sm font-semibold text-gray-100 mt-0.5">{item.name}</p>
                <p className="text-sm text-gray-100 font-bold mt-1">{item.price.toLocaleString()}원</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white bg-primary">
                매칭 {item.matchRate}%
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate('/home')}
          className="w-full h-[52px] rounded-xl bg-primary text-white font-semibold text-lg active:scale-[.97] transition-transform"
        >
          세트 전체 보기
        </button>
      </div>
    </div>
  );
}
