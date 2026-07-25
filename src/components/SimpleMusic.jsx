import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Music, VolumeX, AlertCircle } from 'lucide-react'
import './SimpleMusic.css'

const SimpleMusic = () => {
  // status: 'loading' | 'playing' | 'paused' | 'blocked'
  const [status, setStatus] = useState('loading')
  const [isLoaded, setIsLoaded] = useState(false)
  const audioRef = useRef(null)

  const tryPlay = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return false
    try {
      await audio.play()
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.preload = 'auto'
    audio.volume = 0.3
    audio.pause()

    let retryTimer = null
    let retryCount = 0

    const syncLoaded = () => setIsLoaded(true)
    const syncPlaying = () => setStatus('playing')
    const syncPaused = () => setStatus('paused')
    const syncError = () => {
      if (retryCount < 2) {
        retryCount++
        retryTimer = setTimeout(() => audio.load(), 3000)
      } else {
        setStatus('blocked')
      }
    }

    audio.addEventListener('canplaythrough', syncLoaded)
    audio.addEventListener('play', syncPlaying)
    audio.addEventListener('pause', syncPaused)
    audio.addEventListener('error', syncError)

    setStatus('paused')

    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      audio.removeEventListener('canplaythrough', syncLoaded)
      audio.removeEventListener('play', syncPlaying)
      audio.removeEventListener('pause', syncPaused)
      audio.removeEventListener('error', syncError)
    }
  }, [])

  const toggleMusic = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    // If currently playing, fully stop music.
    if (!audio.paused) {
      audio.pause()
      setStatus('paused')
      return
    }

    // Otherwise try to start.
    audio.volume = 0.3
    const ok = await tryPlay()
    setStatus(ok ? 'playing' : 'blocked')
  }, [tryPlay])

  const title =
    status === 'playing'
      ? 'Turn Off Music'
      : status === 'blocked'
        ? 'Enable Music'
        : 'Turn On Music'
  const ariaLabel =
    status === 'playing'
      ? 'Music playing. Click to pause.'
      : status === 'blocked'
        ? 'Music blocked by browser. Click to enable.'
        : 'Music paused. Click to play.'

  const StatusIcon =
    status === 'playing' ? Music : status === 'blocked' ? AlertCircle : VolumeX

  return (
    <div className="simple-music" role="region" aria-label="Background music control">
      <audio
        ref={audioRef}
        src="/music/background-music.mp3"
        loop
        preload="auto"
        aria-hidden="true"
      />
      
      <button 
        className={`music-toggle ${status === 'playing' ? 'playing' : 'muted'}`}
        onClick={toggleMusic}
        title={title}
        aria-label={ariaLabel}
        aria-pressed={status === 'playing'}
        disabled={!isLoaded && status === 'loading'}
        type="button"
      >
        <StatusIcon className="music-toggle-icon" size={18} strokeWidth={2} aria-hidden />
      </button>
    </div>
  )
}

export default SimpleMusic 