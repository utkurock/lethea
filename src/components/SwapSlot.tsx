import { Component, Fragment, lazy, Suspense, type ComponentProps, type ReactNode } from 'react';

// The widget and its chain adapters are most of the bundle, so they load after the page shell.
const SwapBox = lazy(() => import('./SwapBox'));

type Props = ComponentProps<typeof SwapBox>;

/** The swap widget, loaded on demand and fenced off so a crash inside it can't blank the whole page. */
export function SwapSlot(props: Props) {
  return (
    <WidgetBoundary>
      <Suspense
        fallback={
          <div className="swap-loading" aria-busy="true">
            <span />
            <span />
            <span />
          </div>
        }
      >
        <SwapBox {...props} />
      </Suspense>
    </WidgetBoundary>
  );
}

// The widget's own boundary rethrows whatever it catches, and with nothing above it React unmounts
// the root: the visitor is left with the bare background.
class WidgetBoundary extends Component<{ children: ReactNode }, { error: Error | null; n: number }> {
  state = { error: null as Error | null, n: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[swap] widget crashed', error);
  }

  render() {
    if (!this.state.error) return <Fragment key={this.state.n}>{this.props.children}</Fragment>;
    return (
      <div className="swap-crash" role="alert">
        <p>The swap box hit an error.</p>
        <button onClick={() => this.setState((s) => ({ error: null, n: s.n + 1 }))}>Try again</button>
      </div>
    );
  }
}
