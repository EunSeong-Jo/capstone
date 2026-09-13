import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Icon } from '../../components/category/Icon';

type CouponTab = '보유 쿠폰' | '쿠폰 받기';
const categories = ['전체', '뷰티', '스킨케어', '만료임박', '장바구니 쿠폰', '등급 쿠폰팩', '브랜드'];

const coupons = [
  { id: 1, discount: '20%', name: '6월 뷰티 전월 구매 감사 20% 쿠폰', maxDiscount: '최대 1만5천원 할인', expiry: '만료 5일 전', category: '뷰티', shared: false },
  { id: 2, discount: '15%', name: '6월 럭셔리 뷰티 브랜드 15% 쿠폰', maxDiscount: '최대 1만원 할인', expiry: '만료 5일 전', category: '뷰티', shared: false },
  { id: 3, discount: '15%', name: '[뷰티] 6월 뷰티 전월 구매 감사 럭셔리 15% 쿠폰', maxDiscount: '최대 2만원 할인', expiry: '만료 5일 전', category: '뷰티', shared: false },
  { id: 4, discount: '15%', name: '뷰티 브랜드 15% 쿠폰', maxDiscount: '최대 7천원 할인', expiry: '만료 5일 전', category: '뷰티', shared: true },
  { id: 5, discount: '10%', name: '스킨케어 신규 브랜드 10% 쿠폰', maxDiscount: '최대 5천원 할인', expiry: '만료 12일 전', category: '스킨케어', shared: false },
  { id: 6, discount: '5%', name: '전 브랜드 5% 추가 할인 쿠폰', maxDiscount: '최대 3천원 할인', expiry: '만료 20일 전', category: '장바구니 쿠폰', shared: false },
];

export default function CouponPage() {
  const [activeTab, setActiveTab] = useState<CouponTab>('보유 쿠폰');
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [searchText, setSearchText] = useState('');

  const filtered = coupons.filter((c) => {
    const matchCat = selectedCategory === '전체' || c.category === selectedCategory;
    const matchSearch = c.name.includes(searchText) || searchText === '';
    return matchCat && matchSearch;
  });

  return (
    <PageWrapper>
      <Header showBack title="쿠폰" />

      <div className="bg-white">
        <div className="flex items-center px-4 pt-2.5">
          {(['보유 쿠폰', '쿠폰 받기'] as CouponTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`mr-4 pb-2 text-[15px] border-b-[2.5px] ${
                activeTab === t ? 'font-bold text-gray-100 border-gray-100' : 'text-gray-50 border-transparent'
              }`}
            >
              {t} <span className="text-[13px]">{t === '보유 쿠폰' ? '(5장)' : '(1,990장)'}</span>
            </button>
          ))}
          <div className="flex-1" />
          <button className="px-3 py-1.5 rounded-lg border-[1.5px] border-gray-100 text-xs font-bold text-gray-100 whitespace-nowrap">
            + 쿠폰등록
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 bg-gray-10 rounded-[10px] px-3.5 py-2.5">
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="브랜드, 쿠폰명으로 검색해보세요."
              className="flex-1 bg-transparent outline-none text-[13px] text-gray-100 placeholder:text-gray-50"
            />
            <Icon name="search" size={16} className="text-gray-50" />
          </div>
        </div>

        <div className="flex gap-1.5 px-4 py-3 overflow-x-auto scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full whitespace-nowrap text-[13px] shrink-0 ${
                selectedCategory === cat
                  ? 'font-bold bg-gray-100 text-white'
                  : 'text-gray-70 border border-gray-20 bg-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-10">
        <span className="text-[13px] font-semibold text-gray-70">{filtered.length}장</span>
        <button className="flex items-center gap-1 text-[13px] text-gray-70">
          할인순 <Icon name="arrow_drop_down" size={14} className="text-gray-70" />
        </button>
      </div>

      <div className="flex-1 p-4 bg-surface">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-50 text-sm">해당 쿠폰이 없습니다.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((coupon) => (
              <div key={coupon.id} className="relative bg-white rounded-2xl overflow-hidden shadow-sm py-[18px] pr-4 pl-6">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-2xl" />
                <div className="flex items-center gap-1.5 mb-2">
                  {coupon.shared && <span className="text-xs text-gray-50">🔗</span>}
                  <span className="text-[26px] font-extrabold text-gray-100 leading-none">{coupon.discount}</span>
                </div>
                <p className="text-sm font-semibold text-gray-100 mb-1 leading-relaxed">{coupon.name}</p>
                <p className="text-xs text-gray-50 mb-0.5">{coupon.maxDiscount}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-accent">{coupon.expiry}</span>
                  <button className="text-xs font-bold text-primary underline">적용상품</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
