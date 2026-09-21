import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';

const MIN_LEN = 8;

// TODO: 실제 비밀번호 변경 API 연동 전까지 성공 알림만 띄우고 이전 화면으로 복귀.
export default function PasswordChangePage() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const lengthOk = next.length >= MIN_LEN;
  const matchOk = next.length > 0 && next === confirm;
  const valid = current.length > 0 && lengthOk && matchOk;

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="비밀번호 변경" />

      <div className="flex flex-1 flex-col px-4 py-5">
        <div className="rounded-2xl bg-white border border-[#ECEEE8] px-4">
          <div className="py-4">
            <label className="block text-[13px] font-bold text-gray-100">현재 비밀번호</label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-gray-20 bg-white px-3.5 text-[14px] text-gray-100 outline-none focus:border-primary"
            />
          </div>
          <div className="border-t border-[#F1F2ED] py-4">
            <label className="block text-[13px] font-bold text-gray-100">새 비밀번호</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-gray-20 bg-white px-3.5 text-[14px] text-gray-100 outline-none focus:border-primary"
            />
          </div>
          <div className="border-t border-[#F1F2ED] py-4">
            <label className="block text-[13px] font-bold text-gray-100">새 비밀번호 확인</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-gray-20 bg-white px-3.5 text-[14px] text-gray-100 outline-none focus:border-primary"
            />
          </div>
        </div>

        <ul className="mt-3 space-y-1">
          <li className={`text-[12px] ${lengthOk ? 'text-primary-dark' : 'text-gray-50'}`}>· 8자 이상</li>
          <li className={`text-[12px] ${matchOk ? 'text-primary-dark' : 'text-gray-50'}`}>· 새 비밀번호 일치</li>
        </ul>

        <div className="mt-auto pt-8 pb-[var(--safe-bottom)]">
          <button
            type="button"
            disabled={!valid}
            onClick={() => {
              alert('비밀번호가 변경되었어요.');
              navigate(-1);
            }}
            className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary-dark text-[15px] font-bold text-white transition-transform active:scale-[.98] disabled:opacity-50"
          >
            변경하기
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
