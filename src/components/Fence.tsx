import { Component, Fragment, type ReactNode } from 'react';

type Props = { children: ReactNode; message: string; className?: string };

// Chrome, Safari and Firefox wordings for a split chunk that didn't arrive.
const LOAD_FAILED = /dynamically imported module|Importing a module script failed|error loading dynamically/i;

/**
 * Keeps a crash inside one part of the page. Whatever reaches the root unmounts it, and the visitor
 * is left with the bare background. "Try again" remounts the children, or reloads when their chunk
 * never loaded: the browser keeps a failed import for the life of the page and would fail it again.
 */
export class Fence extends Component<Props, { error: Error | null; n: number }> {
  state = { error: null as Error | null, n: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[fence] ${this.props.message}`, error);
  }

  render() {
    const { error } = this.state;
    if (!error) return <Fragment key={this.state.n}>{this.props.children}</Fragment>;
    const retry = () =>
      LOAD_FAILED.test(error.message) ? location.reload() : this.setState((s) => ({ error: null, n: s.n + 1 }));
    return (
      <div className={`crash ${this.props.className ?? ''}`} role="alert">
        <p>{this.props.message}</p>
        <button onClick={retry}>Try again</button>
      </div>
    );
  }
}
