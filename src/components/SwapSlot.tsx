import { Suspense, type ComponentProps } from 'react';
import { lazyChunk } from '../lib/lazy';
import { Fence } from './Fence';

// The widget and its chain adapters are most of the bundle, so they load after the page shell.
const SwapBox = lazyChunk(() => import('./SwapBox'));

type Props = ComponentProps<typeof SwapBox>;

/** The swap widget, loaded on demand and fenced off so a crash inside it can't blank the whole page. */
export function SwapSlot(props: Props) {
  return (
    <Fence message="The swap box hit an error.">
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
    </Fence>
  );
}
