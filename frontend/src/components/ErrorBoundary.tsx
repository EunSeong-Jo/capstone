import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string | null;
}

// 화면이 하얗게 뜨는(흰 화면) 문제 디버깅용 — 렌더 중 에러를 화면에 그대로 보여준다.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ info: info.componentStack });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#fff5f5',
          color: '#7a1a1a',
          fontFamily: 'monospace',
          fontSize: 13,
          padding: 20,
          overflow: 'auto',
          zIndex: 99999,
          whiteSpace: 'pre-wrap',
        }}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>화면 렌더링 중 에러 발생</h2>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{error.name}: {error.message}</div>
        <div style={{ opacity: 0.8, marginBottom: 12 }}>{error.stack}</div>
        {info && <div style={{ opacity: 0.7 }}>{info}</div>}
      </div>
    );
  }
}
