import { useState } from 'react';
import { useWalletActivity } from '../lib/activity';
import { short } from '../lib/format';
import { fmtUsd } from '../lib/tokens';

type Props = { stellar?: string; evm?: string };

const when = (t: number) =>
  new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const amount = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 6 });

/** The connected wallets' transfers read from the chains, collapsed until asked for. */
export function WalletActivity({ stellar, evm }: Props) {
  const [open, setOpen] = useState(false);
  const { rows, loading, error, evmCovered, refresh } = useWalletActivity({ stellar, evm }, open);
  if (!stellar && !evm) return null;

  return (
    <section className="activity">
      <button className="activity-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Wallet activity on chain
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <>
          {loading ? (
            <p className="activity-note">Reading the chain…</p>
          ) : error ? (
            <p className="activity-note">
              Couldn't read the chain. <button onClick={refresh}>Retry</button>
            </p>
          ) : rows.length === 0 ? (
            <p className="activity-note">No transfers yet.</p>
          ) : (
            <ul className="activity-list">
              {rows.map((r) => (
                <li key={r.id}>
                  <a href={r.link} target="_blank" rel="noreferrer">
                    <span className={`activity-dir ${r.dir}`} aria-hidden>
                      {r.dir === 'in' ? '↓' : '↑'}
                    </span>
                    <span className="activity-main">
                      <b>
                        {r.dir === 'in' ? 'Received' : 'Sent'} {amount(r.amount)} {r.symbol}
                      </b>
                      <small>
                        {r.chainLabel} · {r.dir === 'in' ? 'from' : 'to'} {short(r.counterparty)}
                      </small>
                    </span>
                    <span className="activity-side">
                      {r.usd !== undefined && <span>${fmtUsd(r.usd)}</span>}
                      <small>{when(r.time)}</small>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="activity-note">
            A confidential swap shows here as the deposit you sent and the payout you received.
            {evm && !evmCovered && ' Only Stellar transfers are listed for now.'}
          </p>
        </>
      )}
    </section>
  );
}
