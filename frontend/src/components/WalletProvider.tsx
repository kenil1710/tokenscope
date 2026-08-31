"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  CHAIN_ID_HEX,
  ensureCorrectNetwork,
  getWalletChainId,
  hasInjectedWallet,
  requestAccount,
} from "@/lib/genlayer";

type WalletState = {
  account: `0x${string}` | null;
  chainOk: boolean;
  connecting: boolean;
  error: string | null;
  hasWallet: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

/** Stable no-op subscription. A new function identity here would resubscribe
 * on every render, which is the one way to make this hook expensive. */
function subscribeToWallet(): () => void {
  return () => {};
}

/**
 * Wallet connection state.
 *
 * Deliberately does NOT auto-connect on mount. A page that pops MetaMask before
 * anyone asked is hostile, and the landing page has no business touching a
 * wallet at all — only `/scan` needs one, and only when the scan button is
 * pressed.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [chainOk, setChainOk] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Whether an injected wallet exists.
   *
   * `useSyncExternalStore` rather than an effect that calls setState: the
   * browser's `window.ethereum` IS an external store, and this is the primitive
   * for reading one without a cascading render. The server snapshot is `false`
   * because there is no wallet during SSR, which is also what makes the first
   * client paint agree with the server's markup.
   *
   * The subscribe callback is a no-op: extensions inject before hydration and
   * do not announce arrival on any event this component could listen to.
   */
  const hasWallet = useSyncExternalStore(
    subscribeToWallet,
    hasInjectedWallet,
    () => false,
  );

  const refreshChain = useCallback(async () => {
    const id = await getWalletChainId();
    setChainOk(id === null || id === CHAIN_ID_HEX.toLowerCase());
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const next = await requestAccount();
      setAccount(next);
      await ensureCorrectNetwork();
      await refreshChain();
    } catch (cause) {
      const code = (cause as { code?: number })?.code;
      setError(
        code === 4001
          ? "Connection cancelled."
          : cause instanceof Error
            ? cause.message
            : "Could not connect the wallet.",
      );
    } finally {
      setConnecting(false);
    }
  }, [refreshChain]);

  const switchNetwork = useCallback(async () => {
    try {
      await ensureCorrectNetwork();
      await refreshChain();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not switch network.");
    }
  }, [refreshChain]);

  /** Local only — EIP-1193 has no way to revoke access from the page side. */
  const disconnect = useCallback(() => {
    setAccount(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!hasWallet) return;
    const provider = window.ethereum;
    if (!provider?.on) return;

    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      setAccount((accounts?.[0] as `0x${string}`) ?? null);
    };
    const onChain = () => {
      void refreshChain();
    };

    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [hasWallet, refreshChain]);

  const value = useMemo<WalletState>(
    () => ({
      account,
      chainOk,
      connecting,
      error,
      hasWallet,
      connect,
      disconnect,
      switchNetwork,
    }),
    [account, chainOk, connecting, error, hasWallet, connect, disconnect, switchNetwork],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside <WalletProvider>.");
  return value;
}
