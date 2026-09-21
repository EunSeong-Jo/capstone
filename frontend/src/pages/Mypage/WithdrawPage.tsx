import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Button } from '../../components/ui/Button';

const NOTICES = [
  '피부타입 진단 결과가 삭제돼요.',
  '내 화장대·찜·장바구니 내역이 모두 사라져요.',
  '삭제된 정보는 복구할 수 없어요.',
];

// TODO: 실제 탈퇴 API 연동 전까지 확인 → 스플래시로 이동만.
export default function WithdrawPage() {
  const navigate = useNavigate();
  const [agree, setAgree] = useState(false);

  return (
    <PageWrapper className="bg-white">
      <Header showBack title="회원 탈퇴" />

      <div className="flex flex-1 flex-col px-4 py-5">
        <div className="rounded-xl bg-surface-warm p-4">
          <p className="text-[15px] font-bold leading-snug text-gray-100">
            정말 탈퇴하시겠어요?
          </p>
          <ul className="mt-3 space-y-2">
            {NOTICES.map((n) => (
              <li key={n} className="text-[13px] leading-[1.6] text-gray-70">
                · {n}
              </li>
            ))}
          </ul>
        </div>

        <label className="mt-5 flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="h-[18px] w-[18px] accent-[var(--primary)]"
          />
          <span className="text-[13px] text-gray-100">안내 사항을 확인했으며 탈퇴에 동의합니다.</span>
        </label>

        {/* 하단 네비가 없는 페이지라 PageWrapper가 하단 인셋을 넣지 않는다. 홈 인디케이터에 가리지 않도록 직접 확보 */}
        <div className="mt-auto pt-8 pb-[var(--safe-bottom)]">
          <Button
            variant="next"
            disabled={!agree}
            className="!bg-[#FF5C7A]"
            onClick={() => {
              alert('탈퇴가 완료되었어요.');
              navigate('/');
            }}
          >
            탈퇴하기
          </Button>
        </div>
      </div>
    </PageWrapper>
  );
}
