import { useEffect, useRef, useState } from 'react'

const CHAR_INTERVAL_MS = 35

export function useTypewriter(text: string) {
  const [displayed, setDisplayed] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setDisplayed('')
    setIsComplete(false)

    let index = 0
    intervalRef.current = setInterval(() => {
      index += 1
      setDisplayed(text.slice(0, index))
      if (index >= text.length) {
        setIsComplete(true)
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }, CHAR_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [text])

  function complete() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setDisplayed(text)
    setIsComplete(true)
  }

  return { displayed, isComplete, complete }
}
