import { useEffect, useState } from 'react'

/** The current time, refreshed on each minute boundary so overdue colours
 *  and the now-line flip right when an event ends. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = (): void => {
      const d = new Date()
      setNow(d)
      timer = setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()))
    }
    timer = setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()))
    return () => clearTimeout(timer)
    // Only the first render's time seeds the schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return now
}
