const CONTACTS = ['📞 대표전화', '💬 채팅 상담', '❓ 1:1문의', '🎧 고객센터'];

/** 고객지원 하단 문의 바 — GiftBox/CustomerService/Inquiry 공용 */
export function SupportContactBar() {
  return (
    <div className="flex items-center justify-center gap-3 py-3.5 border-t border-gray-20 bg-white">
      {CONTACTS.map((label, i, arr) => (
        <span key={label} className="flex items-center gap-3">
          <span className="text-xs text-gray-70">{label}</span>
          {i < arr.length - 1 && <span className="text-gray-20">|</span>}
        </span>
      ))}
    </div>
  );
}
