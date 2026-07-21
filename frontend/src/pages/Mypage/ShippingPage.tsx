import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';

type PageTab = '배송지' | '환불계좌';

interface Address {
  id: number;
  label: string;
  isDefault: boolean;
  isSameDay: boolean;
  zipCode: string;
  roadAddr: string;
  jibunAddr: string;
  phone: string;
  entrance: string;
  entranceDetail: string;
}

const initialAddresses: Address[] = [
  {
    id: 1, label: '집', isDefault: true, isSameDay: true,
    zipCode: '06292', roadAddr: '서울 강남구 언주로 508 (역삼동, 역삼하이츠) ****',
    jibunAddr: '서울 강남구 역삼동 823 ****', phone: '010-****-7742',
    entrance: '공동현관 출입방법', entranceDetail: '비밀번호 (열*2*7*열*)',
  },
  {
    id: 2, label: '회사', isDefault: false, isSameDay: false,
    zipCode: '06235', roadAddr: '서울 강남구 테헤란로 152 (역삼동, 강남파이낸스센터) ****',
    jibunAddr: '서울 강남구 역삼동 737 ****', phone: '010-****-1234',
    entrance: '공동현관 출입방법', entranceDetail: '카드키',
  },
];

const bankAccounts = [
  { id: 1, bank: '카카오뱅크', emoji: '🏦', accountNum: '333-****-****-31', holder: '김지연', isDefault: true },
];

export default function ShippingPage() {
  const [tab, setTab] = useState<PageTab>('배송지');
  const [addresses, setAddresses] = useState<Address[]>(initialAddresses);

  const setDefault = (id: number) => {
    setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
  };
  const deleteAddress = (id: number) => {
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <PageWrapper>
      <Header showBack title="배송지/환불계좌 관리" />

      <div className="flex border-b border-gray-20 bg-white">
        {(['배송지', '환불계좌'] as PageTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3.5 text-[15px] font-bold border-b-2 ${
              tab === t ? 'text-gray-100 border-gray-100' : 'text-gray-50 border-transparent'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 bg-surface">
        {tab === '배송지' && (
          <>
            <div className="flex flex-col gap-3">
              {addresses.map((addr) => (
                <div
                  key={addr.id}
                  className={`bg-white rounded-2xl p-4 ${addr.isDefault ? 'border-[1.5px] border-primary' : 'border-[1.5px] border-gray-20'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[17px] font-extrabold text-gray-100">{addr.label}</span>
                      {addr.isDefault && (
                        <span className="text-[11px] font-bold bg-primary text-white px-2.5 py-0.5 rounded-full">기본 배송지</span>
                      )}
                      {addr.isSameDay && (
                        <span className="text-[11px] font-bold text-accent">🏍 오늘드림</span>
                      )}
                    </div>
                    <button className="px-3 py-1 rounded-lg border border-gray-20 text-xs font-semibold text-gray-70">
                      ✏️ 수정
                    </button>
                  </div>

                  <p className="text-xs text-gray-50 mb-1">({addr.zipCode})</p>
                  <p className="text-[13px] text-gray-100 leading-relaxed mb-0.5">도로명 : {addr.roadAddr}</p>
                  <p className="text-xs text-gray-50 mb-2.5">지번 : {addr.jibunAddr}</p>
                  <p className="text-[13px] font-semibold text-gray-100 mb-3">{addr.phone}</p>

                  <div className="border-t border-dashed border-gray-20 mb-3" />

                  <p className="text-[13px] font-bold text-gray-100 mb-0.5">{addr.entrance}</p>
                  <p className="text-[13px] text-gray-70">{addr.entranceDetail}</p>

                  {!addr.isDefault && (
                    <div className="flex gap-2 mt-3.5 pt-3 border-t border-gray-10">
                      <button
                        onClick={() => setDefault(addr.id)}
                        className="flex-1 py-2 rounded-lg border-[1.5px] border-primary text-xs font-bold text-primary"
                      >
                        기본 배송지로 설정
                      </button>
                      <button
                        onClick={() => deleteAddress(addr.id)}
                        className="px-3.5 py-2 rounded-lg border border-gray-20 text-xs font-semibold text-gray-50"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button className="w-full mt-3 py-[18px] rounded-2xl border-[1.5px] border-gray-20 flex items-center justify-center gap-2 text-[15px] font-bold text-primary">
              + 배송지 추가
            </button>
            <p className="text-xs text-gray-50 mt-3.5 pl-1">· 배송지는 최대 20개까지 등록 가능합니다.</p>
          </>
        )}

        {tab === '환불계좌' && (
          <>
            <p className="text-[13px] text-gray-50 mb-3.5">환불 시 사용할 계좌를 등록해주세요.</p>
            {bankAccounts.map((acc) => (
              <div key={acc.id} className="bg-white rounded-2xl border-[1.5px] border-primary p-4 mb-3">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-[10px] bg-amber-100 flex items-center justify-center text-xl">{acc.emoji}</div>
                    <div>
                      <p className="text-sm font-bold text-gray-100">{acc.bank}</p>
                      <p className="text-xs text-gray-50">예금주: {acc.holder}</p>
                    </div>
                  </div>
                  {acc.isDefault && (
                    <span className="text-[11px] font-bold bg-primary text-white px-2.5 py-0.5 rounded-full">기본 계좌</span>
                  )}
                </div>
                <p className="text-[15px] font-bold text-gray-100 mb-2.5">{acc.accountNum}</p>
                <button className="w-full py-2 rounded-lg border border-gray-20 text-[13px] font-semibold text-gray-70">수정</button>
              </div>
            ))}
            <button className="w-full mt-1 py-[18px] rounded-2xl border-[1.5px] border-gray-20 flex items-center justify-center gap-2 text-[15px] font-bold text-primary">
              + 계좌 추가
            </button>
            <p className="text-xs text-gray-50 mt-3.5 pl-1">· 환불계좌는 최대 5개까지 등록 가능합니다.</p>
          </>
        )}
      </div>
    </PageWrapper>
  );
}
