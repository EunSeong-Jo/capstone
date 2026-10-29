import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ApiError } from '../../api/client';
import {
  addMemory,
  deleteAllMemories,
  deleteMemory,
  patchMemory,
  setAiMemoryEnabled,
  type MemoryItem,
} from '../../api/personalAi';
import { useAuth } from '../../context/auth';
import { useToast } from '../../context/toast';
import { invalidateAiMemory, useAiMemoryState, useMemories } from '../../hooks/usePersonalAi';

const SOURCE_LABEL: Record<MemoryItem['source'], string> = {
  explicit: '기억해 달라고 함',
  auto: '대화에서 알게 됨',
  user: '직접 적음',
};

/**
 * 설정 > AI 기억 — 챗봇이 대화에서 기억해 둔 내 정보를 **보고·고치고·끄고·지운다.**
 *
 * 기억은 켜야만 쌓인다(기본은 꺼짐). 사용자가 직접 한 말만 담고, 켜 둔 기억만 챗봇 답변에 쓰인다.
 * 끄면 새로 쌓이지도, 쓰이지도 않는다(이미 쌓인 것은 목록에 남아 있어 따로 지울 수 있다).
 */
export default function AiMemoryPage() {
  const { scope } = useAuth();
  const { showToast } = useToast();
  const { state, loading: stateLoading, reload: reloadState } = useAiMemoryState();
  const { memories, loading: listLoading, reload: reloadList } = useMemories();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    invalidateAiMemory(scope);
    reloadState();
    reloadList();
  };

  const run = async (job: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await job();
      refresh();
      if (done) showToast(done);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const enabled = state?.enabled === true;
  const list = memories ?? [];

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="AI 기억" />

      <div className="flex flex-col gap-4 px-4 pb-10 pt-4">
        <section className="rounded-2xl bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-extrabold text-gray-100">대화에서 알게 된 내 정보를 기억해요</p>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-50">
                "향료는 싫어요, 기억해"처럼 내가 챗봇에게 직접 말한 것만 담고, 다음 대화부터 답변에 써요. 언제든 끄고 지울 수 있어요.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="AI 기억 사용"
              disabled={busy || stateLoading}
              onClick={() => run(() => setAiMemoryEnabled(!enabled), enabled ? 'AI 기억을 껐어요' : 'AI 기억을 켰어요')}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-primary' : 'bg-gray-20'}`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`}
              />
            </button>
          </div>
          {state && (
            <p className="mt-3 text-[11px] text-gray-50">
              {enabled ? `켜져 있어요 · ${state.count}/${state.limit}개 저장` : '꺼져 있어요 · 새로 기억하지 않고, 답변에도 쓰지 않아요'}
            </p>
          )}
        </section>

        {enabled && (
          <section className="rounded-2xl bg-white px-5 py-4">
            <p className="text-[13px] font-extrabold text-gray-100">직접 적기</p>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const text = draft.trim();
                if (!text) return;
                run(() => addMemory(text), '기억했어요').then(() => setDraft(''));
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={80}
                placeholder="예: 향료가 들어간 제품은 싫어요"
                className="h-11 min-w-0 flex-1 rounded-xl border border-gray-20 px-3 text-[13px] outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="h-11 shrink-0 rounded-xl bg-primary px-4 text-[13px] font-bold text-white active:scale-95 disabled:bg-gray-20 disabled:text-gray-50"
              >
                추가
              </button>
            </form>
          </section>
        )}

        <section className="rounded-2xl bg-white px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-extrabold text-gray-100">기억하는 내 정보</p>
            {list.length > 0 && (
              <button type="button" onClick={() => setConfirmAll(true)} className="text-[12px] font-semibold text-gray-50 underline underline-offset-2">
                전부 지우기
              </button>
            )}
          </div>

          {listLoading ? (
            <div className="mt-3 h-12 animate-pulse rounded-xl bg-gray-10" />
          ) : list.length === 0 ? (
            <p className="mt-3 text-[12px] leading-relaxed text-gray-50">
              아직 기억한 게 없어요. 챗봇에게 "건조한 피부라 보습이 제일 고민이야, 기억해"처럼 말해 보세요.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-10">
              {list.map((m) => (
                <li key={m.id} className="py-3">
                  {editing?.id === m.id ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const text = editing.text.trim();
                        if (!text) return;
                        run(() => patchMemory(m.id, { text }), '고쳤어요').then(() => setEditing(null));
                      }}
                    >
                      <input
                        autoFocus
                        value={editing.text}
                        maxLength={80}
                        onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                        className="h-10 min-w-0 flex-1 rounded-xl border border-primary px-3 text-[13px] outline-none"
                      />
                      <button type="submit" disabled={busy} className="h-10 shrink-0 rounded-xl bg-primary px-3 text-[12px] font-bold text-white">
                        저장
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="h-10 shrink-0 px-1 text-[12px] text-gray-50">
                        취소
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] leading-snug ${m.enabled ? 'font-semibold text-gray-100' : 'text-gray-50 line-through'}`}>{m.text}</p>
                        <p className="mt-0.5 text-[11px] text-gray-50">
                          {SOURCE_LABEL[m.source]}
                          {!m.enabled && ' · 답변에 쓰지 않아요'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5 text-[12px] font-semibold">
                        <button type="button" disabled={busy} onClick={() => run(() => patchMemory(m.id, { enabled: !m.enabled }))} className="text-gray-70">
                          {m.enabled ? '끄기' : '켜기'}
                        </button>
                        <button type="button" onClick={() => setEditing({ id: m.id, text: m.text })} className="text-gray-70">
                          수정
                        </button>
                        <button type="button" disabled={busy} onClick={() => run(() => deleteMemory(m.id), '지웠어요')} className="text-red-500">
                          삭제
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {confirmAll && (
        <ConfirmDialog
          title="기억을 전부 지울까요?"
          description="지운 기억은 되돌릴 수 없어요."
          confirmLabel="지우기"
          cancelLabel="취소"
          danger
          onConfirm={() => {
            setConfirmAll(false);
            run(() => deleteAllMemories(), '전부 지웠어요');
          }}
          onCancel={() => setConfirmAll(false)}
        />
      )}
    </PageWrapper>
  );
}
