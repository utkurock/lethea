import type { Chains } from '@aurora-is-near/intents-swap-widget';
import { useQuery } from '@tanstack/react-query';
import { erc20Abi, type Address } from 'viem';
import { useConfig } from 'wagmi';
import { getBytecode, readContract } from 'wagmi/actions';

// Profiles often list their token's contract ("CA: 0x…") or mint next to, or instead of, a wallet. Money sent
// to a token contract is gone, so a pay link's address is looked up on chain before the swap box appears.

export type EvmChain = 'eth' | 'base' | 'arb' | 'op' | 'pol' | 'bsc' | 'avax';
// Base first: it is where a payment lands by default.
const CHAIN_IDS = { base: 8453, eth: 1, arb: 42161, op: 10, pol: 137, bsc: 56, avax: 43114 } as const;
export const EVM_CHAINS = Object.keys(CHAIN_IDS) as EvmChain[];

/**
 * `chains` is where the address can receive. A key-held account receives on every chain; a contract wallet
 * such as a Safe exists only where it was deployed, and the same address elsewhere belongs to no one.
 */
export type EvmPayee = { state: 'ok'; chains: Chains[] } | { state: 'token' | 'error' };
type Check = { chain: EvmChain; kind: 'account' | 'contract' | 'token' };

export function useEvmPayee(address?: string): EvmPayee | undefined {
  const config = useConfig();
  const { data } = useQuery({
    queryKey: ['evm-payee', address],
    enabled: !!address,
    staleTime: Infinity,
    queryFn: async (): Promise<EvmPayee> => {
      const at = address as Address;
      const checks = await Promise.allSettled(
        EVM_CHAINS.map(async (chain): Promise<Check> => {
          const chainId = CHAIN_IDS[chain];
          const code = await getBytecode(config, { address: at, chainId });
          // An EIP-7702 delegation (0xef0100…) is code on a key-held account, which still receives everywhere.
          if (!code || code === '0x' || code.startsWith('0xef0100')) return { chain, kind: 'account' };
          const token = await readContract(config, { address: at, chainId, abi: erc20Abi, functionName: 'totalSupply' }).then(
            () => true,
            () => false,
          );
          return { chain, kind: token ? 'token' : 'contract' };
        }),
      );
      const seen = checks.flatMap((c) => (c.status === 'fulfilled' ? [c.value] : []));
      if (seen.some((c) => c.kind === 'token')) return { state: 'token' };
      const contracts = seen.filter((c) => c.kind === 'contract');
      // Chains whose check failed are left out rather than guessed at.
      const chains = (contracts.length ? contracts : seen).map((c) => c.chain);
      return chains.length ? { state: 'ok', chains } : { state: 'error' };
    },
  });
  return address ? data : undefined;
}

const SOLANA_RPC = 'https://solana-rpc.publicnode.com';
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EHFLC1PHnBqCXEpPxuEb'];

/** A Solana address is a wallet unless the token programs own it (a mint or token account) or it is a program. */
export function useSolanaPayee(address?: string): 'ok' | 'token' | 'error' | undefined {
  const { data, isError } = useQuery({
    queryKey: ['sol-payee', address],
    enabled: !!address,
    staleTime: Infinity,
    queryFn: async () => {
      const r = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [address, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }],
        }),
      });
      const body = (await r.json()) as { result?: { value: { owner: string; executable: boolean } | null } };
      if (!body.result) throw new Error('getAccountInfo failed');
      const account = body.result.value;
      // No account yet is a fresh wallet; it is created when the payment lands.
      return account && (account.executable || TOKEN_PROGRAMS.includes(account.owner)) ? 'token' : 'ok';
    },
  });
  if (!address) return undefined;
  return isError ? 'error' : data;
}
