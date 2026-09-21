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

interface BankAccount {
  id: number;
  bank: string;
  emoji: string;
  accountNum: string;
  holder: string;
  isDefault: boolean;
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

const initialAccounts: BankAccount[] = [
  { id: 1, bank: '카카오뱅크', emoji: '🏦', accountNum: '333-****-****-31', holder: '김지연', isDefault: true },
];

function TextField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="mb-3">
      <label className="mb-1.5 block text-[13px] font-bold text-gray-100">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-gray-20 bg-white px-3.5 text-sm text-gray-100 outline-none focus:border-primary"
      />
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45" onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-white px-5 pt-4"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 20px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-gray-20" />
        <p className="mb-3 text-[15px] font-extrabold text-gray-100">{title}</p>
        {children}
      </div>
    </div>
  );
}

export default function ShippingPage() {
  const [tab, setTab] = useState<PageTab>('배송지');
  const [addresses, setAddresses] = useState<Address[]>(initialAddresses);
  const [accounts, setAccounts] = useState<BankAccount[]>(initialAccounts);

  const [addrForm, setAddrForm] = useState<Address | null>(null);
  const [acctForm, setAcctForm] = useState<BankAccount | null>(null);

  // 기본 배송지는 목록 맨 위에 오도록 정렬한다
  const setDefault = (id: number) => {
    setAddresses((prev) => {
      const next = prev.map((a) => ({ ...a, isDefault: a.id === id }));
      return [...next].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    });
  };
  const deleteAddress = (id: number) => setAddresses((prev) => prev.filter((a) => a.id !== id));

  const newAddress = (): Address => ({
    id: Date.now(), label: '새 배송지', isDefault: addresses.length === 0, isSameDay: false,
    zipCode: '', roadAddr: '', jibunAddr: '', phone: '', entrance: '', entranceDetail: '',
  });

  const saveAddress = (addr: Address) => {
    setAddresses((prev) => {
      const exists = prev.some((a) => a.id === addr.id);
      const next = exists ? prev.map((a) => (a.id === addr.id ? addr : a)) : [addr, ...prev];
      return addr.isDefault ? [...next].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)) : next;
    });
    setAddrForm(null);
  };

  const newAccount = (): BankAccount => ({
    id: Date.now(), bank: '', emoji: '🏦', accountNum: '', holder: '', isDefault: accounts.length === 0,
  });

  const saveAccount = (acc: BankAccount) => {
    setAccounts((prev) => {
      const exists = prev.some((a) => a.id === acc.id);
      return exists ? prev.map((a) => (a.id === acc.id ? acc : a)) : [acc, ...prev];
    });
    setAcctForm(null);
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
                    <button
                      onClick={() => setAddrForm(addr)}
                      className="px-3 py-1 rounded-lg border border-gray-20 text-xs font-semibold text-gray-70"
                    >
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

            <button
              onClick={() => setAddrForm(newAddress())}
              className="w-full mt-3 py-[18px] rounded-2xl border-[1.5px] border-gray-20 flex items-center justify-center gap-2 text-[15px] font-bold text-primary"
            >
              + 배송지 추가
            </button>
            <p className="text-xs text-gray-50 mt-3.5 pl-1">· 배송지는 최대 20개까지 등록 가능합니다.</p>
          </>
        )}

        {tab === '환불계좌' && (
          <>
            <p className="text-[13px] text-gray-50 mb-3.5">환불 시 사용할 계좌를 등록해주세요.</p>
            {accounts.map((acc) => (
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
                <button
                  onClick={() => setAcctForm(acc)}
                  className="w-full py-2 rounded-lg border border-gray-20 text-[13px] font-semibold text-gray-70"
                >
                  수정
                </button>
              </div>
            ))}
            <button
              onClick={() => setAcctForm(newAccount())}
              className="w-full mt-1 py-[18px] rounded-2xl border-[1.5px] border-gray-20 flex items-center justify-center gap-2 text-[15px] font-bold text-primary"
            >
              + 계좌 추가
            </button>
            <p className="text-xs text-gray-50 mt-3.5 pl-1">· 환불계좌는 최대 5개까지 등록 가능합니다.</p>
          </>
        )}
      </div>

      {addrForm && (
        <Sheet title={addresses.some((a) => a.id === addrForm.id) ? '배송지 수정' : '배송지 추가'} onClose={() => setAddrForm(null)}>
          <TextField label="배송지 이름" value={addrForm.label} onChange={(v) => setAddrForm({ ...addrForm, label: v })} placeholder="집 / 회사" />
          <TextField label="우편번호" value={addrForm.zipCode} onChange={(v) => setAddrForm({ ...addrForm, zipCode: v })} />
          <TextField label="도로명 주소" value={addrForm.roadAddr} onChange={(v) => setAddrForm({ ...addrForm, roadAddr: v })} />
          <TextField label="지번 주소" value={addrForm.jibunAddr} onChange={(v) => setAddrForm({ ...addrForm, jibunAddr: v })} />
          <TextField label="연락처" value={addrForm.phone} onChange={(v) => setAddrForm({ ...addrForm, phone: v })} placeholder="010-0000-0000" />
          <TextField label="공동현관 출입방법" value={addrForm.entranceDetail} onChange={(v) => setAddrForm({ ...addrForm, entranceDetail: v })} />
          <label className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={addrForm.isDefault}
              onChange={(e) => setAddrForm({ ...addrForm, isDefault: e.target.checked })}
              className="h-[18px] w-[18px] accent-[var(--primary)]"
            />
            <span className="text-sm text-gray-100">기본 배송지로 설정</span>
          </label>
          <button
            onClick={() => saveAddress(addrForm)}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-primary-dark text-sm font-bold text-white active:scale-[.98] transition-transform"
          >
            저장
          </button>
        </Sheet>
      )}

      {acctForm && (
        <Sheet title={accounts.some((a) => a.id === acctForm.id) ? '환불계좌 수정' : '환불계좌 추가'} onClose={() => setAcctForm(null)}>
          <TextField label="은행명" value={acctForm.bank} onChange={(v) => setAcctForm({ ...acctForm, bank: v })} placeholder="예: 국민은행" />
          <TextField label="계좌번호" value={acctForm.accountNum} onChange={(v) => setAcctForm({ ...acctForm, accountNum: v })} />
          <TextField label="예금주" value={acctForm.holder} onChange={(v) => setAcctForm({ ...acctForm, holder: v })} />
          <button
            onClick={() => saveAccount(acctForm)}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-primary-dark text-sm font-bold text-white active:scale-[.98] transition-transform"
          >
            저장
          </button>
        </Sheet>
      )}
    </PageWrapper>
  );
}
