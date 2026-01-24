import React, { Component } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// EMERGENCY FIX: Error Boundary to prevent white screen crashes
class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('AppErrorBoundary caught error:', error, errorInfo)
    this.setState({
      error: error,
      errorInfo: errorInfo
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          maxWidth: '800px',
          margin: '2rem auto',
          backgroundColor: 'rgba(132, 210, 246, 0.12)',
          border: '2px solid rgba(132, 210, 246, 0.4)',
          borderRadius: '8px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <h1 style={{ color: 'var(--text)', marginTop: 0 }}>⚠️ Application Error</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '1rem' }}>
            An error occurred in the application. The app has been protected from crashing.
          </p>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            <strong>Error:</strong> {this.state.error?.message || 'Unknown error'}
          </p>
          <details style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600' }}>
              Show error details
            </summary>
            <pre style={{
              marginTop: '0.5rem',
              padding: '1rem',
              backgroundColor: 'var(--panel)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              fontSize: '0.75rem',
              overflow: 'auto',
              maxHeight: '300px'
            }}>
              {this.state.error?.stack || 'No stack trace'}
              {this.state.errorInfo?.componentStack && (
                <>
                  {'\n\nComponent Stack:'}
                  {this.state.errorInfo.componentStack}
                </>
              )}
            </pre>
          </details>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'var(--accent)',
                color: 'var(--bg)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '600'
              }}
            >
              Reload Page
            </button>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'var(--panel)',
                color: 'var(--text)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
)

