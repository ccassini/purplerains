import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function NotFoundPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '80vh',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <motion.img
        src="/monad_logo.png"
        alt="Purple Rain"
        style={{ width: 72, height: 72, marginBottom: 24, opacity: 0.5 }}
        animate={{ rotate: [0, 10, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <h2 style={{
        fontSize: '3rem',
        fontWeight: 800,
        marginBottom: 8,
        background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      }}>
        404
      </h2>
      <p style={{ color: '#a0a0a0', marginBottom: 32, fontSize: '1.1rem' }}>
        Page not found
      </p>
      <Link
        to="/"
        style={{
          padding: '12px 28px',
          borderRadius: 12,
          border: '1px solid rgba(139, 92, 246, 0.4)',
          background: 'rgba(139, 92, 246, 0.15)',
          color: '#e5e7eb',
          fontSize: '0.95rem',
          fontWeight: 600,
          textDecoration: 'none',
          transition: 'background 0.2s ease'
        }}
      >
        Back to Home
      </Link>
    </div>
  )
}
