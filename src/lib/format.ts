export const short = (a?: string) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
