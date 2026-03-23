import React, { useEffect, useRef, useState } from 'react'

const TITLE = 'ForgeJunction'
const GLITCH_SET = '!@#$%^&*<>?/\\|[]{}~ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789░▒▓▄▀■□≡±'
const MATRIX_SET = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロ日月火水木0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*'

const LOADING_PHRASES = [
  'QUESTIONING YOUR LIFE CHOICES',
  'MONETIZING YOUR CREATIVITY',
  'DEFINITELY NOT MINING BITCOIN',
  'SUMMONING THE DARK ARTS',
  'OVERCLOCKING YOUR SOUL',
  'SUPPRESSING EXISTENTIAL DREAD',
  'PRETENDING TO BE PRODUCTIVE',
  'CALCULATING REGRET VECTORS',
  'LOADING ARTISTIC SELF-DOUBT',
  'CORRUPTING YOUR WORKFLOW',
  'RENDERING BAD DECISIONS',
  'INITIALIZING COPE.EXE',
  'OUTSOURCING YOUR CREATIVITY',
  'WARMING UP THE HYPE MACHINE',
  'DELETING YOUR BROWSER HISTORY',
  'MANIFESTING TECHNICAL DEBT',
  'TEACHING ROBOTS TO DREAM',
  'HARVESTING YOUR GPU CYCLES',
  'FABRICATING CONFIDENCE',
  'BURNING THROUGH YOUR RUNWAY',
  'BOOTING IMPOSTER SYNDROME',
  'CALIBRATING DISAPPOINTMENT',
  'ALIGNING YOUR CHAKRAS.EXE',
  'PREPARING MEDIOCRE OUTPUTS',
]

const GREETINGS = [
  'Oh. You\'re Back.',
  'You Again',
  'Still Here?',
  'Ah, You Returned',
  'Hello, Meatbag',
  'Resistance Is Futile',
  'Back Already',
  'Welcome, Prisoner',
  'It Gets Worse',
  'Don\'t Stop Now',
  'We Meet Again',
  'Ah, Finally',
]

const TAGLINES = [
  'where dreams go to render',
  'probably fine',
  'it\'s not a bug, it\'s a feature',
  'now with 40% more regret',
  'your GPU called. it\'s crying.',
  'one bad prompt at a time',
  'corrupting art since 2024',
  'please don\'t look at the logs',
  'making art is suffering',
  'at least it\'s not NFTs',
  'void stared back. void liked it.',
  'dream big, render slow',
]

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

type Phase = 'boot' | 'decrypt' | 'flood' | 'vhs' | 'reveal' | 'fade'

function rnd(set: string) { return set[Math.floor(Math.random() * set.length)] }

interface Props {
  onPreDone: () => void  // fires when fade starts → trigger layout slide-ins
  onDone:    () => void  // fires when fully transparent → unmount
}

export default function SplashScreen({ onPreDone, onDone }: Props): React.ReactElement {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const onPreRef    = useRef(onPreDone)
  const onDoneRef   = useRef(onDone)
  useEffect(() => { onPreRef.current = onPreDone; onDoneRef.current = onDone })

  // Picked once on mount — stable across re-renders
  const phrasesRef  = useRef(pickN(LOADING_PHRASES, 4))
  const greetingRef = useRef(pick(GREETINGS))
  const taglineRef  = useRef(pick(TAGLINES))

  const [phase,       setPhase      ] = useState<Phase>('boot')
  const [chars,       setChars      ] = useState<string[]>(() => Array(TITLE.length).fill(' '))
  const [lockedCount, setLockedCount] = useState(0)
  const [progress,    setProgress   ] = useState(0)
  const [showWelcome, setShowWelcome ] = useState(false)
  const [vhsOn,       setVhsOn      ] = useState(false)
  const [noiseLines,  setNoiseLines  ] = useState<string[]>([])

  // ── Phase timeline ──────────────────────────────────────────────────────────
  useEffect(() => {
    const T: ReturnType<typeof setTimeout>[] = []
    T.push(setTimeout(() => setPhase('decrypt'),                           250))
    T.push(setTimeout(() => setPhase('flood'),                            1100))
    T.push(setTimeout(() => { setPhase('vhs'); setVhsOn(true) },          1700))
    T.push(setTimeout(() => { setPhase('reveal'); setShowWelcome(true); setVhsOn(false) }, 2600))
    T.push(setTimeout(() => { setPhase('fade'); onPreRef.current() },     3500))
    T.push(setTimeout(() => onDoneRef.current(),                          4600))
    return () => T.forEach(clearTimeout)
  }, [])

  // ── Progress bar ────────────────────────────────────────────────────────────
  useEffect(() => {
    const start = Date.now()
    const total = 4600
    const id = setInterval(() => setProgress(Math.min((Date.now() - start) / total * 100, 100)), 50)
    return () => clearInterval(id)
  }, [])

  // ── Character decrypt ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'decrypt') return
    let locked = 0
    // Shuffle unlocked positions rapidly
    const shuffleId = setInterval(() => {
      setChars(prev => {
        const next = [...prev]
        for (let i = locked; i < TITLE.length; i++) next[i] = rnd(GLITCH_SET)
        return next
      })
    }, 55)
    // Lock one character per 95ms
    const lockId = setInterval(() => {
      if (locked >= TITLE.length) { clearInterval(shuffleId); clearInterval(lockId); return }
      const pos = locked++
      setLockedCount(locked)
      setChars(prev => { const n = [...prev]; n[pos] = TITLE[pos]; return n })
    }, 95)
    return () => { clearInterval(shuffleId); clearInterval(lockId) }
  }, [phase])

  // ── Background noise lines ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'reveal' || phase === 'fade') { setNoiseLines([]); return }
    const id = setInterval(() => {
      setNoiseLines(Array.from({ length: 10 }, () => {
        const len = 20 + Math.floor(Math.random() * 55)
        return Array.from({ length: len }, () => rnd(GLITCH_SET)).join('')
      }))
    }, 75)
    return () => clearInterval(id)
  }, [phase])

  // ── Matrix rain canvas ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const cols  = Math.floor(window.innerWidth / 18)
    const drops = Array.from({ length: cols }, () => Math.random() * -60)

    const id = setInterval(() => {
      ctx.fillStyle = 'rgba(0,0,0,0.04)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < cols; i++) {
        const y = drops[i] * 18
        // bright lead
        ctx.fillStyle = '#aaffcc'
        ctx.font = `${Math.random() > 0.94 ? 'bold ' : ''}13px monospace`
        ctx.fillText(rnd(MATRIX_SET), i * 18, y)
        // dim trail one row back
        ctx.fillStyle = '#00cc44'
        ctx.font = '12px monospace'
        ctx.fillText(rnd(MATRIX_SET), i * 18, y - 18)
        if (y > canvas.height && Math.random() > 0.97) drops[i] = 0
        drops[i] += 0.55
      }
    }, 40)

    return () => { clearInterval(id); window.removeEventListener('resize', resize) }
  }, [])

  // ── Derived styles ──────────────────────────────────────────────────────────
  const isTerminal = phase !== 'reveal' && phase !== 'fade'
  const bgColor    = isTerminal ? '#000000' : 'rgb(10,10,12)'
  const canvasOp   = phase === 'flood' || phase === 'vhs' ? 0.82
                   : phase === 'decrypt'                  ? 0.18
                   : phase === 'reveal'                   ? 0.08 : 0

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden select-none"
      style={{
        backgroundColor: bgColor,
        opacity:    phase === 'fade' ? 0 : 1,
        transition: phase === 'fade'
          ? 'opacity 1050ms cubic-bezier(0.4,0,0.6,1)'
          : 'background-color 700ms ease',
        pointerEvents: phase === 'fade' ? 'none' : 'all',
      }}
    >
      {/* CRT scanlines */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1,
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.13) 0px, rgba(0,0,0,0.13) 1px, transparent 1px, transparent 3px)'
      }} />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1,
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.88) 100%)'
      }} />

      {/* Matrix rain */}
      <canvas ref={canvasRef} className="absolute inset-0"
        style={{ opacity: canvasOp, transition: 'opacity 600ms ease', zIndex: 0 }} />

      {/* VHS color bands */}
      {vhsOn && (
        <div className="absolute inset-0 pointer-events-none animate-splash-vhs"
          style={{ zIndex: 2, mixBlendMode: 'screen' }} />
      )}
      {/* VHS chromatic fringe */}
      {vhsOn && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2,
          boxShadow: 'inset 4px 0 0 rgba(255,0,60,0.07), inset -4px 0 0 rgba(0,200,255,0.07)'
        }} />
      )}

      {/* ── Content ── */}
      <div className="relative flex flex-col items-center gap-5" style={{ zIndex: 10 }}>

        {/* Noise lines — scattered above the title */}
        {isTerminal && noiseLines.length > 0 && (
          <div className="absolute -top-36 left-1/2 -translate-x-1/2 w-[640px] flex flex-col gap-px pointer-events-none">
            {noiseLines.map((line, i) => (
              <div key={i} className="font-mono text-[9px] overflow-hidden whitespace-nowrap"
                style={{ color: `rgba(0,${140 + i * 8},${50 + i * 4},${0.08 + i * 0.04})`,
                         fontFamily: 'DM Mono, monospace' }}>
                {line}
              </div>
            ))}
          </div>
        )}

        {/* ForgeJunction decrypt title */}
        {isTerminal && (
          <div className="flex flex-col items-center gap-2">
            <div className="font-mono text-5xl font-bold tracking-[0.14em]"
              style={{
                fontFamily: 'DM Mono, monospace',
                textShadow: vhsOn
                  ? '4px 0 0 rgba(255,0,60,0.65), -4px 0 0 rgba(0,200,255,0.65), 0 0 24px rgba(0,255,65,0.35)'
                  : '0 0 10px rgba(0,255,65,0.7), 0 0 26px rgba(0,255,65,0.3)',
              }}
            >
              {chars.map((c, i) => (
                <span key={i} style={{
                  color: i < lockedCount ? '#00ff41' : '#2d7a45',
                  textShadow: i < lockedCount ? '0 0 12px rgba(0,255,65,0.9)' : 'none',
                }}>
                  {c}
                </span>
              ))}
              <span className="animate-splash-cursor inline-block w-[3px] h-[0.78em] bg-[#00ff41] ml-1 align-middle rounded-[1px]" />
            </div>
            <div className="font-mono text-[11px] tracking-[0.35em] uppercase"
              style={{ color: 'rgba(0,190,60,0.35)', fontFamily: 'DM Mono, monospace' }}>
              {phase === 'boot'    ? phrasesRef.current[0] :
               phase === 'decrypt' ? phrasesRef.current[1] :
               phase === 'flood'   ? phrasesRef.current[2] : phrasesRef.current[3]}
            </div>
          </div>
        )}

        {/* Welcome Back */}
        {showWelcome && (
          <div className="flex flex-col items-center gap-2" style={{ animation: 'splash-welcome-in 550ms ease-out both' }}>
            <div className="text-[4.5rem] font-bold tracking-wide leading-none"
              style={{ fontFamily: 'Syne, system-ui, sans-serif', color: 'rgba(255,255,255,0.88)' }}>
              {greetingRef.current}
            </div>
            <div className="text-[11px] font-mono tracking-[0.4em] lowercase"
              style={{ color: 'rgba(255,255,255,0.22)' }}>
              {taglineRef.current}
            </div>
          </div>
        )}
      </div>

      {/* ── Loading bar ── */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ zIndex: 20 }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: progress < 65
            ? 'linear-gradient(to right, #00cc33, #00ff41)'
            : 'linear-gradient(to right, #00ff41, rgb(var(--brand)))',
          boxShadow: '0 0 8px rgba(0,255,65,0.6)',
          transition: 'width 55ms linear',
        }} />
      </div>

      {/* Progress percentage */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center" style={{ zIndex: 20 }}>
        <span className="font-mono text-[9px] tracking-[0.3em]"
          style={{ color: 'rgba(0,200,65,0.2)', fontFamily: 'DM Mono, monospace' }}>
          {Math.floor(progress)}%
        </span>
      </div>
    </div>
  )
}
