import { useOneClickExecutionStatus } from '@aurora-is-near/intents-swap-widget/hooks';
import { useEffect, useState } from 'react';

/** A swap the user has just signed: where they deposited and what the quote said to expect. */
export type Tracked = {
  depositAddress: string;
  depositMemo?: string;
  /** The quote's estimate, in seconds. */
  estimate: number;
  startedAt: number;
  amountOut?: string;
  symbol?: string;
  chainLabel?: string;
};

type Props = { swap: Tracked; onClose: () => void };

const DONE = new Set(['SUCCESS', 'REFUNDED', 'FAILED']);

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const roughly = (s: number) => (s < 90 ? `~${Math.max(1, Math.round(s))}s` : `~${Math.round(s / 60)} min`);

/**
 * What happens after the widget says "confirmed": the deposit is in, but the payout still has to be
 * filled and sent on the other chain. This card counts that time against the quote's estimate and polls
 * 1Click until the payout lands, the way relay.link shows a bridge in flight.
 */
export function SwapTracker({ swap, onClose }: Props) {
  const { data } = useOneClickExecutionStatus({ depositAddress: swap.depositAddress, depositMemo: swap.depositMemo });
  const status = data?.status;
  const done = !!status && DONE.has(status);

  const [now, setNow] = useState(() => Date.now());
  const [endedAt, setEndedAt] = useState<number>();
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [done]);
  useEffect(() => {
    if (done) setEndedAt((e) => e ?? Date.now());
  }, [done]);

  const elapsed = ((endedAt ?? now) - swap.startedAt) / 1000;
  const over = !done && elapsed > swap.estimate;
  // The bar reaches 90% at the estimate, then creeps toward 95%, so a slow fill never looks finished early.
  const estimate = Math.max(swap.estimate, 1);
  const progress = done ? 1 : over ? 0.9 + 0.05 * (1 - estimate / elapsed) : 0.05 + 0.85 * (elapsed / estimate);

  const details = data && 'swapDetails' in data ? data.swapDetails : undefined;
  const payout = details?.destinationChainTxHashes?.[0];
  const what = swap.amountOut && swap.symbol ? `${swap.amountOut} ${swap.symbol}` : 'Your payout';
  const on = swap.chainLabel ? ` on ${swap.chainLabel}` : '';
  const to = swap.chainLabel ? ` to ${swap.chainLabel}` : '';

  const steps = [
    { label: 'Deposit sent', state: 'done' },
    {
      label: 'Filled through NEAR Intents',
      state: status === 'SUCCESS' ? 'done' : done ? 'fail' : status === 'PROCESSING' ? 'active' : 'wait',
    },
    {
      label: `Delivered${on}`,
      state: status === 'SUCCESS' ? 'done' : done ? 'fail' : 'wait',
    },
  ] as const;

  const headline =
    status === 'SUCCESS'
      ? `${what} arrived${on}`
      : status === 'REFUNDED'
        ? 'Refunded to your wallet'
        : status === 'FAILED'
          ? 'The swap failed'
          : status === 'INCOMPLETE_DEPOSIT'
            ? 'The deposit came in short'
            : `${what} is on its way${to}`;

  return (
    <section className={`tracker ${status === 'SUCCESS' ? 'ok' : done ? 'bad' : ''}`} aria-live="polite">
      <div className="tracker-head">
        <div>
          <p className="tracker-title">{headline}</p>
          <p className="tracker-time">
            {status === 'SUCCESS'
              ? `Took ${clock(elapsed)}, estimate was ${roughly(swap.estimate)}`
              : done
                ? details?.refundReason ?? 'NEAR Intents sends the deposit back to the address it came from.'
                : over
                  ? `${clock(elapsed)}, taking longer than the ${roughly(swap.estimate)} estimate`
                  : `${clock(elapsed)} of ${roughly(swap.estimate)}`}
          </p>
        </div>
        <button className="tracker-close" onClick={onClose} aria-label="Hide">
          ×
        </button>
      </div>
      <div className="tracker-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
      <ol className="tracker-steps">
        {steps.map((s) => (
          <li key={s.label} className={s.state}>
            {s.label}
          </li>
        ))}
      </ol>
      {payout?.explorerUrl && (
        <a className="tracker-link" href={payout.explorerUrl} target="_blank" rel="noreferrer">
          View the payout transaction
        </a>
      )}
    </section>
  );
}
