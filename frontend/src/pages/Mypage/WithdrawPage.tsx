import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Button } from '../../components/ui/Button';

const NOTICES = [
  '피부타입 진단 결과, 성분 스캔 기록, 관심 제품이 모두 삭제되며 복구할 수 없어요.',
  '보유 중인 포인트와 쿠폰은 탈퇴 시 소멸돼요.',
  '진행 중인 주문·배송이 있으면 완료 후 탈퇴할 수 있어요.',
];

// TODO: 실제 탈퇴 API 연동 전까지 확인 → 스플래시로 이동만.
export default function WithdrawPage() {
  const navigate = useNavigate();
  const [agree, setAgree] = useState(false);

  return (
    <PageWrapper className="bg-white">
      <Header showBack title="회원 탈퇴" />

      <div className="flex flex-1 flex-col px-4 py-5">
        <p className="text-[15px] font-bold leading-snug text-gray-100">
          정말 탈퇴하시겠어요?
        </p>
        <p className="mt-1.5 text-[13px] text-gray-50">
          탈퇴하기 전에 아래 내용을 꼭 확인해 주세요.
        </p>

        <ul className="mt-4 space-y-2.5 rounded-xl bg-surface-warm p-4">
          {NOTICES.map((n) => (
            <li key={n} className="flex gap-2 text-[13px] leading-[1.6] text-gray-70">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gray-50" />
              {n}
            </li>
          ))}
        </ul>

        <label className="mt-5 flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="h-[18px] w-[18px] accent-[var(--primary)]"
          />
          <span className="text-[13px] text-gray-100">안내 사항을 모두 확인했으며 이에 동의합니다.</span>
        </label>

        {/* 하단 네비가 없는 페이지라 PageWrapper가 하단 인셋을 넣지 않는다. 홈 인디케이터에 가리지 않도록 직접 확보 */}
        <div className="mt-auto space-y-2.5 pt-8 pb-[var(--safe-bottom)]">
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
          <Button variant="outline" onClick={() => navigate(-1)}>
            돌아가기
          </Button>
        </div>
      </div>
    </PageWrapper>
  );
}
