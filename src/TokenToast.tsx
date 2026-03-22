import { useEffect, useState } from 'react'

interface TokenToastProps {
  provider: string
  tokens: number
  onDone: () => void
}

export default function TokenToast({ provider, tokens, onDone }: TokenToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const hide = setTimeout(() => setVisible(false), 3000)
    const remove = setTimeout(onDone, 3400)
    return () => { clearTimeout(hide); clearTimeout(remove) }
  }, [onDone])

  const label = provider === 'openai' ? 'OpenAI' : provider === 'gemini' ? 'Gemini' : 'Ollama'

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 9999,
      background: 'rgba(12,28,58,0.92)',
      border: '1px solid rgba(200,169,110,0.4)',
      borderRadius: 10,
      padding: '8px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: "'DM Mono', monospace",
      fontSize: 12,
      color: '#e8e4dc',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(8px)',
      transition: 'opacity 0.35s ease, transform 0.35s ease',
      pointerEvents: 'none',
    }}>
      <span style={{
        background: 'rgba(200,169,110,0.2)',
        color: '#c8a96e',
        borderRadius: 6,
        padding: '2px 7px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        fontSize: 11,
      }}>{label}</span>
      <span style={{ color: '#9bb0cc' }}>使用了</span>
      <span style={{ color: '#e8e4dc', fontWeight: 600 }}>{tokens.toLocaleString()} tokens</span>
    </div>
  )
}
