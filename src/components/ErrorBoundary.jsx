import React from 'react'
import { reportError } from '../utils/monitoring'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    reportError(error, {
      componentStack: errorInfo?.componentStack?.slice?.(0, 2000) || null,
      boundary: 'ErrorBoundary',
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0a0a0f',
          color: '#e5e7eb',
          fontFamily: 'Inter, sans-serif',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <img
            src="/monad_logo.png"
            alt="Purple Rain"
            style={{ width: 64, height: 64, marginBottom: 24, opacity: 0.7 }}
          />
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            marginBottom: 8,
            background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Something went wrong
          </h2>
          <p style={{ color: '#a0a0a0', marginBottom: 24, maxWidth: 400 }}>
            An unexpected error occurred. Please try refreshing the page.
          </p>
          {this.state.error?.message && (
            <p style={{
              color: '#c4b5fd',
              marginBottom: 20,
              maxWidth: 520,
              fontSize: '0.85rem',
              opacity: 0.9,
              wordBreak: 'break-word',
            }}>
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleReset}
            style={{
              padding: '12px 24px',
              borderRadius: 12,
              border: '1px solid rgba(139, 92, 246, 0.4)',
              background: 'rgba(139, 92, 246, 0.15)',
              color: '#e5e7eb',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s ease'
            }}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
