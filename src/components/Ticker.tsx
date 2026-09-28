import { linkTo } from '../lib/router';
import { TOKENS, fmtUsd, iconFor, platedIcon, priceOf, useIntentsTokens } from '../lib/tokens';

export function Ticker() {
  const list = useIntentsTokens();
  const rows = TOKENS.flatMap((t) => {
    const price = priceOf(list, t);
    return price ? [{ symbol: t.symbol, price, icon: iconFor(t.symbol) }] : [];
  });

  if (!rows.length) return <div className="ticker" aria-hidden />;

  // The second copy only exists for the seamless loop, so it stays out of the tab order.
  const items = (copy: boolean) =>
    rows.map((r) => (
      <a
        className="tick"
        key={r.symbol}
        href={`/token/${r.symbol}`}
        onClick={linkTo(`/token/${r.symbol}`)}
        tabIndex={copy ? -1 : undefined}
      >
        {r.icon ? <img src={r.icon} alt="" className={platedIcon(r.symbol) ? 'plated' : undefined} /> : <span className="mono">{r.symbol[0]}</span>}
        <b>{r.symbol}</b>
        <span className="price">${fmtUsd(r.price)}</span>
      </a>
    ));

  return (
    <div className="ticker" aria-label="Prices from NEAR Intents">
      <div className="ticker-track">
        <div className="ticker-set">{items(false)}</div>
        <div className="ticker-set" aria-hidden>
          {items(true)}
        </div>
      </div>
    </div>
  );
}
