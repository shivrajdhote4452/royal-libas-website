import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-6 text-[#2B1B1E] selection:bg-[#B58A3C] selection:text-white">
          <div className="max-w-md w-full bg-white border border-[#E8DFD0] shadow-xl p-8 text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#5E1224] text-[#D4AF67] flex items-center justify-center shadow-md">
              <span className="font-serif text-2xl font-bold tracking-widest">RL</span>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#B58A3C] block">
                Royal Libas by Tanya
              </span>
              <h1 className="font-serif text-2xl font-bold text-[#2B1B1E]">
                Something Went Wrong
              </h1>
              <p className="text-xs text-gray-600 leading-relaxed">
                An unexpected display error occurred while rendering this page. Our team has been notified.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 bg-[#5E1224] hover:bg-[#3A080F] text-[#FCF8F0] text-xs font-semibold uppercase tracking-[0.16em] transition-all shadow"
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="flex-1 py-3 px-4 bg-[#FCF8F0] hover:bg-[#E8DFD0] border border-[#5E1224] text-[#5E1224] text-xs font-semibold uppercase tracking-[0.16em] transition-all"
              >
                Return Home
              </button>
            </div>

            {Boolean((import.meta as any).env?.DEV) && this.state.error && (
              <details className="text-left text-[11px] font-mono text-red-700 bg-red-50 p-3 rounded border border-red-200 overflow-auto max-h-40">
                <summary className="font-bold cursor-pointer mb-1">Developer Error Details</summary>
                {this.state.error.toString()}
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
