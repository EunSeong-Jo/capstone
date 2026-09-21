import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';

interface LegalDoc {
  title: string;
  updated: string;
  sections: { h: string; body: string }[];
}

// 캡스톤 데모용 요약 문구. 실제 서비스 시 법무 검토 문안으로 교체.
const DOCS: Record<'terms' | 'privacy', LegalDoc> = {
  terms: {
    title: '이용약관',
    updated: '2026.07.01',
    sections: [
      {
        h: '제1조 (목적)',
        body: '본 약관은 swappy(이하 "회사")가 제공하는 화장품 성분 분석 및 대체품 매칭 서비스(이하 "서비스")의 이용과 관련하여 회사와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.',
      },
      {
        h: '제2조 (정의)',
        body: '"이용자"란 본 약관에 따라 회사가 제공하는 서비스를 이용하는 회원 및 비회원을 말합니다. "회원"이란 회사에 개인정보를 제공하여 회원등록을 한 자로서 서비스를 계속 이용할 수 있는 자를 말합니다.',
      },
      {
        h: '제3조 (서비스의 제공)',
        body: '회사는 성분 분석 결과, 대체품 추천, 피부타입 진단 등의 정보를 제공합니다. 제공되는 정보는 참고용이며, 의학적 진단이나 처방을 대체하지 않습니다.',
      },
      {
        h: '제4조 (이용자의 의무)',
        body: '이용자는 서비스 이용 시 관계 법령, 본 약관의 규정을 준수하여야 하며, 타인의 정보를 도용하거나 회사의 업무를 방해하는 행위를 하여서는 안 됩니다.',
      },
      {
        h: '제5조 (책임의 제한)',
        body: '회사는 천재지변, 이용자의 귀책사유로 인한 서비스 이용 장애에 대하여 책임을 지지 않으며, 무료로 제공되는 서비스 이용과 관련하여 발생한 손해에 대해 책임을 지지 않습니다.',
      },
    ],
  },
  privacy: {
    title: '개인정보 처리방침',
    updated: '2026.07.01',
    sections: [
      {
        h: '1. 수집하는 개인정보 항목',
        body: '회원가입 시: 이메일, 닉네임, 비밀번호. 서비스 이용 과정에서: 피부타입 진단 결과, 등록 제품 정보, 찜/장바구니 내역, 기기정보 및 접속 로그가 자동으로 수집될 수 있습니다.',
      },
      {
        h: '2. 개인정보의 이용 목적',
        body: '회원 식별 및 관리, 맞춤형 성분 분석·대체품 추천 제공, 서비스 개선 및 통계 분석, 공지사항 전달 목적으로 이용합니다.',
      },
      {
        h: '3. 개인정보의 보유 및 이용 기간',
        body: '회원 탈퇴 시 지체 없이 파기합니다. 다만 관계 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안 보관합니다.',
      },
      {
        h: '4. 개인정보의 제3자 제공',
        body: '회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 법령의 규정에 의하거나 이용자가 사전에 동의한 경우에 한하여 제공될 수 있습니다.',
      },
      {
        h: '5. 이용자의 권리',
        body: '이용자는 언제든지 자신의 개인정보를 조회·수정하거나 처리 정지, 삭제를 요청할 수 있습니다. 설정 화면 또는 고객센터를 통해 요청할 수 있습니다.',
      },
    ],
  },
};

export default function LegalPage({ doc }: { doc: 'terms' | 'privacy' }) {
  const d = DOCS[doc];
  return (
    <PageWrapper className="bg-white">
      <Header showBack title={d.title} />
      <div className="px-4 py-5">
        <p className="text-[12px] text-gray-50">시행일 {d.updated}</p>
        <div className="mt-4 space-y-5">
          {d.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-[14px] font-bold text-gray-100">{s.h}</h2>
              <p className="mt-1.5 text-[13px] leading-[1.7] text-gray-70">{s.body}</p>
            </section>
          ))}
        </div>
      </div>
    </PageWrapper>
  );
}
