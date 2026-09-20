import { useCallback, useEffect, useRef, useState } from 'react'

const CHAR_INTERVAL_MS = 35

/**
 * 한 글자씩 찍히는 타자 효과.
 *
 * 진행 상태를 `{ text, count }` 한 덩어리로 들고 있다. 문장이 바뀌면
 * `text`가 달라지므로 **렌더 중에** 0으로 되돌린다 — effect에서 초기화하면
 * 렌더 → effect → 렌더가 한 번 더 돌고(react-hooks/set-state-in-effect),
 * 그 한 프레임 동안 **이전 문장이 그대로 보인다.**
 */
export function useTypewriter(text: string) {
  const [progress, setProgress] = useState({ text, count: 0 })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  if (progress.text !== text) {
    setProgress({ text, count: 0 })
  }

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        // 문장이 바뀐 직후의 낡은 타이머가 새 진행을 건드리지 않게 한다.
        if (prev.text !== text) return prev
        if (prev.count >= text.length) return prev
        return { text, count: prev.count + 1 }
      })
    }, CHAR_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [text])

  const complete = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setProgress({ text, count: text.length })
  }, [text])

  const count = progress.text === text ? progress.count : 0
  const isComplete = count >= text.length

  // 다 찍은 뒤에도 타이머가 35ms마다 헛돈다. 끝나면 끊는다.
  useEffect(() => {
    if (isComplete && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [isComplete])

  return {
    displayed: text.slice(0, count),
    isComplete,
    complete,
  }
}
