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
    title: '서비스 이용약관',
    updated: '2026.03.01',
    sections: [
      {
        h: '제1조 (목적)',
        body: '본 약관은 스와피(이하 “회사”)가 제공하는 화장품 성분 분석·대체품 추천 서비스(이하 “서비스”)의 이용과 관련하여 회사와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.',
      },
      {
        h: '제2조 (서비스의 내용)',
        body: '회사는 성분 분석 결과, 피부타입 진단, 대체 제품 추천, 구매 가이드 등을 제공합니다. 이용자가 동의하면 얼굴 사진을 바탕으로 한 AI 피부 분석을 문답 진단에 더해 이용할 수 있습니다. 분석 결과는 참고용이며 의학적 진단이나 처방을 대체하지 않습니다.',
      },
      {
        h: '제3조 (이용자의 의무)',
        body: '이용자는 타인의 정보를 도용하거나 서비스 운영을 방해하는 행위를 해서는 안 되며, 관련 법령과 본 약관을 준수해야 합니다.',
      },
      {
        h: '제4조 (책임의 한계)',
        body: '회사는 이용자가 서비스를 통해 얻은 정보로 인한 결과에 대해 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.',
      },
      {
        h: '제5조 (약관의 변경)',
        body: '회사는 필요 시 약관을 개정할 수 있으며, 변경 시 서비스 내 공지합니다. 변경된 약관은 공지에 정한 시행일부터 효력이 발생합니다.',
      },
    ],
  },
  privacy: {
    title: '개인정보 처리방침',
    updated: '2026.10.20',
    sections: [
      {
        h: '1. 수집하는 개인정보',
        body: '회원가입 시 이메일, 닉네임을 수집하며, 서비스 이용 과정에서 피부타입 진단 응답, 화장품 스캔 기록, 관심 제품이 저장됩니다.',
      },
      {
        h: '2. 이용 목적',
        body: '수집한 정보는 맞춤 추천 제공, 서비스 개선, 문의 응대, 관련 법령에 따른 의무 이행을 위해 사용됩니다.',
      },
      {
        h: '3. 보유 및 이용 기간',
        body: '회원 탈퇴 시 지체 없이 파기합니다. 다만 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.',
      },
      {
        h: '4. 제3자 제공',
        body: '법령에 근거가 있거나 이용자가 동의한 경우를 제외하고 개인정보를 외부에 제공하지 않습니다. 얼굴 사진 분석은 이용자가 별도로 동의한 경우에만 아래 6항과 같이 처리됩니다.',
      },
      {
        h: '5. 이용자의 권리',
        body: '이용자는 언제든지 자신의 개인정보를 조회·수정·삭제하거나 처리 정지를 요청할 수 있으며, 설정 또는 고객센터를 통해 처리할 수 있습니다.',
      },
      {
        h: '6. 얼굴 사진 수집·이용 (선택 동의)',
        body: '이용자가 동의한 경우에만 AI 피부 분석을 위해 직접 촬영하거나 선택한 얼굴 사진 1장을 처리합니다. 사진 원본은 서버에 저장하지 않고 분석이 끝나는 즉시 폐기합니다. 분석 점수(유분·수분·홍조·잡티·트러블 등)와 항목별 분석 결과 이미지(얼굴 사진은 포함되지 않음)는 지난 결과를 다시 볼 수 있도록 계정에 보관하며, 동의를 철회하면 이미지를 즉시, 회원 탈퇴 시 점수까지 함께 삭제합니다. 분석을 위해 사진은 해외에 있는 분석 업체(Perfect Corp.)의 서버로 전송됩니다. 동의하지 않아도 회원가입과 문답 진단은 이용할 수 있고, 동의는 마이페이지 > AI 피부관리에서 언제든 철회할 수 있습니다.',
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
        <p className="text-[12px] text-gray-50">최종 개정일 {d.updated}</p>
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
