import { memo, useState } from 'react'
import { terminalTokenImage } from './terminalTokenVisuals'
import './TerminalTokenIcon.css'

const TerminalTokenIcon = memo(function TerminalTokenIcon({ address, symbol, image, tokenImages }) {
  const source = terminalTokenImage(address, image, tokenImages)
  const [failedSource, setFailedSource] = useState(null)
  const visible = source && failedSource !== source
  return <span className="term-token-icon" aria-hidden="true">
    {visible ? <img src={source} alt="" width="16" height="16" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSource(source)} /> : <span>{String(symbol || '?').slice(0, 1).toUpperCase()}</span>}
  </span>
})

export default TerminalTokenIcon
