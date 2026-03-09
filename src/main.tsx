import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initLogCollector, reportRenderError } from './debug/logCollector'

initLogCollector({ autoReport: false })

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportRenderError(error, info)
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, color: '#f85149', fontFamily: 'monospace' }}>
          <strong>Something went wrong.</strong>
          <p style={{ marginTop: 8, color: '#768390' }}>
            Open <kbd>Help → Export Debug Report</kbd> to save a report.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
)
