// Fees on swaps, paid through NEAR Intents' appFees: the intent itself pays each recipient its share when it
// settles, so Lethea never holds the money. Values are basis points.

export type AppFee = { recipient: string; fee: number };

/** Lethea's share of every swap, on the site and from the extension alike. */
export const LETHEA_FEE_BPS = 10;
/** Where Lethea's share goes. VITE_FEE_ACCOUNT points it elsewhere, for a fork or a test account. */
const LETHEA_FEE_ACCOUNT = import.meta.env.VITE_FEE_ACCOUNT || 'lethea.near';
/** The share for the post's author, when their X name carries a .near account. */
export const CREATOR_FEE_BPS = 10;

/** Fees a swap opened from a post adds on top of Lethea's: the author's share. */
export function postFees(creator?: string): AppFee[] {
  return creator ? [{ recipient: creator, fee: CREATOR_FEE_BPS }] : [];
}

/** Every swap's fees: Lethea's, plus any the page adds. One entry per recipient, so an author who is Lethea is paid once. */
export function swapFees(extra: AppFee[] = []): AppFee[] {
  const byRecipient = new Map<string, number>();
  for (const f of [...extra, { recipient: LETHEA_FEE_ACCOUNT, fee: LETHEA_FEE_BPS }])
    byRecipient.set(f.recipient, (byRecipient.get(f.recipient) ?? 0) + f.fee);
  return [...byRecipient].map(([recipient, fee]) => ({ recipient, fee }));
}

export const pct = (bps: number) => `${bps / 100}%`;
