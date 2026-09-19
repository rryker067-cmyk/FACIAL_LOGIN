import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean }

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error de renderizado en VerisID', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="app-error-screen" role="alert">
        <div className="app-error-card">
          <div className="app-error-icon"><AlertTriangle size={24} /></div>
          <span className="section-kicker">ESTADO DE LA APLICACIÓN</span>
          <h1>No se pudo cargar esta vista</h1>
          <p>Ha ocurrido un problema inesperado. Recarga la aplicación para continuar.</p>
          <button type="button" className="button button--primary" onClick={this.handleReload}>
            <RotateCcw size={16} /> Recargar aplicación
          </button>
        </div>
      </main>
    )
  }
}
