// Fees on swaps opened from a post on X, paid through NEAR Intents' appFees: the intent itself pays each
// recipient its share when it settles, so Lethea never holds the money. Values are basis points.

export type AppFee = { recipient: string; fee: number };

/** The share for the post's author, when their X name carries a .near account. */
export const CREATOR_FEE_BPS = 10;
/** Lethea's share. It applies only once an account to receive it is configured. */
export const LETHEA_FEE_BPS = 10;
const LETHEA_FEE_ACCOUNT = import.meta.env.VITE_FEE_ACCOUNT || undefined;

export function postFees(creator?: string): AppFee[] {
  return [
    ...(creator ? [{ recipient: creator, fee: CREATOR_FEE_BPS }] : []),
    ...(LETHEA_FEE_ACCOUNT ? [{ recipient: LETHEA_FEE_ACCOUNT, fee: LETHEA_FEE_BPS }] : []),
  ];
}

export const pct = (bps: number) => `${bps / 100}%`;
