import type { WidgetConfig } from '@aurora-is-near/intents-swap-widget';
import { useState } from 'react';
import { PriceChart } from '../components/PriceChart';
import { SwapBox } from '../components/SwapBox';
import { short } from '../lib/format';
import { RANGES, usePerpStats, useHistory, type Range } from '../lib/history';
import { linkTo } from '../lib/router';
import { fmtCompact, fmtUsd, iconFor, platedIcon, priceOf, useIntentsTokens, type TokenInfo } from '../lib/tokens';

const RANGE_LABEL: Record<Range, string> = {
  '1D': 'Past day',
  '1W': 'Past week',
  '1M': 'Past month',
  '3M': 'Past 3 months',
  '1Y': 'Past year',
};

type Props = { token: TokenInfo; config: Partial<WidgetConfig> };

export function TokenPage({ token, config }: Props) {
  const [range, setRange] = useState<Range>('1W');
  const list = useIntentsTokens();
  const { points, loading, error } = useHistory(token.hlCoin, range);
  const perp = usePerpStats(token.hlCoin);

  const price = priceOf(list, token);
  const listing = list.find((x) => x.symbol === token.symbol && x.blockchain === token.chain);
  const chainCount = new Set(list.filter((x) => x.symbol === token.symbol).map((x) => x.blockchain)).size;

  const first = points[0]?.p;
  const last = points[points.length - 1]?.p;
  const change = first && last ? last - first : null;
  const up = (change ?? 0) >= 0;
  const high = points.length ? Math.max(...points.map((p) => p.p)) : null;
  const low = points.length ? Math.min(...points.map((p) => p.p)) : null;

  const icon = iconFor(token.symbol);

  return (
    <main className="token-page">
      <section className="token-main">
        <a className="back" href="/" onClick={linkTo('/')}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
            <path d="M13 8H3.5M7.5 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.4" fill="none" />
          </svg>
          Swap
        </a>

        <div className="token-head">
          {icon ? <img src={icon} alt="" className={platedIcon(token.symbol) ? 'plated' : undefined} /> : <span className="mono">{token.symbol[0]}</span>}
          <div>
            <h1>{token.name}</h1>
            <span>
              {token.symbol} · {token.chainLabel}
            </span>
          </div>
        </div>

        <div className="token-price">{price ? `$${fmtUsd(price)}` : '–'}</div>
        {change !== null && first ? (
          <p className={`token-change ${up ? 'up' : 'down'}`}>
            {up ? '+' : '−'}${fmtUsd(Math.abs(change))} ({up ? '+' : '−'}
            {Math.abs((change / first) * 100).toFixed(2)}%) <span>{RANGE_LABEL[range]}</span>
          </p>
        ) : (
          <p className="token-change">&nbsp;</p>
        )}

        {token.hlCoin ? (
          <>
            <div className="chart-box">
              {error ? (
                <p className="chart-empty">Price history is unavailable right now.</p>
              ) : loading || points.length < 2 ? (
                <p className="chart-empty">Loading…</p>
              ) : (
                <PriceChart points={points} range={range} color={up ? '#22c55e' : '#ef4444'} />
              )}
            </div>
            <div className="ranges" role="tablist">
              {RANGES.map((r) => (
                <button
                  key={r}
                  role="tab"
                  aria-selected={r === range}
                  className={r === range ? 'on' : ''}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="chart-box">
            <p className="chart-empty">Stablecoin pegged to USD. There is no price chart to show.</p>
          </div>
        )}

        <section className="about">
          <h2>About {token.symbol}</h2>
          <p>{token.about}</p>
          <dl className="stats">
            <div>
              <dt>{range} high</dt>
              <dd>{high ? `$${fmtUsd(high)}` : '–'}</dd>
            </div>
            <div>
              <dt>{range} low</dt>
              <dd>{low ? `$${fmtUsd(low)}` : '–'}</dd>
            </div>
            <div>
              <dt>24h perp volume</dt>
              <dd>{perp ? `$${fmtCompact(perp.dayVolume)}` : '–'}</dd>
            </div>
            <div>
              <dt>Chains on Intents</dt>
              <dd>{chainCount || '–'}</dd>
            </div>
          </dl>
          <p className="asset-id" title={listing?.assetId}>
            Price from NEAR Intents{token.hlCoin && ', chart from Hyperliquid perps'}
            {listing && (
              <>
                {' · '}
                {listing.contractAddress
                  ? `${token.chainLabel} contract ${short(listing.contractAddress)}`
                  : `Native on ${token.chainLabel}`}
              </>
            )}
          </p>
        </section>
      </section>

      <aside className="token-buy">
        <h2>Buy {token.symbol}</h2>
        <div id="swap-root">
          <SwapBox key={token.symbol} config={config} target={{ symbol: token.symbol, blockchain: token.chain }} />
        </div>
      </aside>
    </main>
  );
}
