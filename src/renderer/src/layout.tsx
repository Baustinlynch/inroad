import { useEffect, useState } from 'react'

export type Breakpoint = 'mobile' | 'narrow' | 'medium' | 'wide'

function current(): Breakpoint {
  const w = window.innerWidth
  return w < 768 ? 'mobile' : w < 1024 ? 'narrow' : w < 1280 ? 'medium' : 'wide'
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState(current)
  useEffect(() => {
    const onResize = () => setBp(current())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return bp
}
