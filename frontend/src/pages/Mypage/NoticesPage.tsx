import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';

/**
 * 공지사항.
 *
 * 사용자 데이터가 아니라 **우리가 쓰는 글**이라 테이블을 두지 않았다.
 * 이용약관·개인정보 처리방침(`LegalPage`)을 파일로 둔 것과 같은 성격이다.
 *
 * **여기 적힌 것은 실제로 한 일만이다.** 옮겨 온 판에는 "정기 점검 안내
 * (6/8 02:00~04:00)"와 "swappy 오픈 안내"가 있었는데, 점검한 적도 오픈한
 * 적도 없다. 공지는 사실이 아니면 공지가 아니다.
 *
 * 날짜는 해당 작업이 dev에 머지된 날이다.
 */
interface Notice {
  id: number;
  title: string;
  date: string;
  body: string;
}

const NOTICES: Notice[] = [
  {
    id: 5,
    title: '주문·후기·포인트가 실제 기록으로 남아요',
    date: '2026.09.22',
    body:
      '지금까지 화면에 보이던 주문내역과 후기는 예시 데이터였어요. 이제 장바구니에서 주문하면 실제 기록이 남고, 후기와 포인트도 그 기록에서 나와요. 기기를 바꿔도 로그인하면 그대로 보여요.',
  },
  {
    id: 4,
    title: '회원가입과 로그인이 열렸어요',
    date: '2026.09.21',
    body:
      '이메일로 가입할 수 있어요. 화장대·장바구니·찜은 계정에 저장되고, 다른 기기에서 로그인해도 같은 내용을 볼 수 있어요.',
  },
  {
    id: 3,
    title: '대체품 추천이 실제 성분 분석 결과로 바뀌었어요',
    date: '2026.09.19',
    body:
      '제품 4,013개의 전성분 16만 건을 분석해 성분이 비슷한 제품을 찾아요. 화장대에 쓰는 제품을 등록하면 더 저렴한 대체품을 알려드려요.',
  },
  {
    id: 2,
    title: '피부타입 진단 결과에 2·3순위가 함께 나와요',
    date: '2026.09.21',
    body:
      '6개 문항으로 5축(수분·유분·민감도·색소·트러블)을 재고 8가지 타입 중 순위를 매겨요. 1·2순위 점수가 가까우면 경계 타입이라는 것도 알려드려요.',
  },
  {
    id: 1,
    title: '성분 사진 인식(OCR)은 준비 중이에요',
    date: '2026.09.16',
    body:
      '성분표를 찍어 인식하는 기능을 실험했는데, 가장 좋은 엔진도 완전히 실패하는 경우가 44%였어요. 정확도를 더 확보한 뒤에 붙일게요. 그동안은 제품명으로 찾아 주세요.',
  },
];

export default function NoticesPage() {
  const [openId, setOpenId] = useState<number | null>(NOTICES[0]?.id ?? null);

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="공지사항" />

      <div className="bg-white">
        {NOTICES.map((n, i) => {
          const open = openId === n.id;
          return (
            <div key={n.id} className={i < NOTICES.length - 1 ? 'border-b border-gray-10' : ''}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : n.id)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-4 py-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-gray-100">{n.title}</p>
                  <p className="mt-0.5 text-[11px] text-gray-50">{n.date}</p>
                </div>
                <span
                  className={`shrink-0 text-[13px] text-gray-50 transition-transform ${
                    open ? 'rotate-180' : ''
                  }`}
                >
                  ⌄
                </span>
              </button>
              {open && (
                <p className="px-4 pb-4 text-[13px] leading-relaxed text-gray-70">{n.body}</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="px-4 py-5 text-center text-[11px] leading-relaxed text-gray-50">
        swappy는 캡스톤디자인 과제로 만들고 있어요.
        <br />
        아직 실제 결제와 배송은 연결돼 있지 않아요.
      </p>
    </PageWrapper>
  );
}
