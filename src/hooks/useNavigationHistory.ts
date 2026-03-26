import { useEffect, useRef } from 'react';
import useStore from '@store/store';

function isPWA(): boolean {
  return (
    (navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export { isPWA };

export default function useNavigationHistory() {
  const initNavigationEntry = useStore((s) => s.initNavigationEntry);
  const initialized = useRef(false);
  const isRestoringRef = useRef(false);

  // Initialize first entry
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initNavigationEntry();
    }
  }, [initNavigationEntry]);

  // Browser History API integration (non-PWA only)
  useEffect(() => {
    if (isPWA()) return;

    let prevCurrentKey: string | null =
      useStore.getState().navHistoryCurrent?.key ?? null;

    const unsub = useStore.subscribe((state, prevState) => {
      const currentKey = state.navHistoryCurrent?.key ?? null;
      if (currentKey && currentKey !== prevCurrentKey && !isRestoringRef.current) {
        prevCurrentKey = currentKey;
        history.pushState({ navKey: currentKey }, '');
      } else {
        prevCurrentKey = currentKey;
      }
    });

    const handlePopState = (event: PopStateEvent) => {
      const navKey = event.state?.navKey;
      if (!navKey) return;

      isRestoringRef.current = true;

      const state = useStore.getState();
      const entry = state.navEntryMap.get(navKey);
      if (entry) {
        const pastKeys = state.navHistoryPast.map((e) => e.key);
        const futureKeys = state.navHistoryFuture.map((e) => e.key);

        if (pastKeys.includes(navKey)) {
          while (
            useStore.getState().navHistoryCurrent?.key !== navKey &&
            useStore.getState().canNavBack()
          ) {
            useStore.getState().navBack();
          }
        } else if (futureKeys.includes(navKey)) {
          while (
            useStore.getState().navHistoryCurrent?.key !== navKey &&
            useStore.getState().canNavForward()
          ) {
            useStore.getState().navForward();
          }
        }
      }

      isRestoringRef.current = false;
    };

    window.addEventListener('popstate', handlePopState);

    // Set initial history state
    const current = useStore.getState().navHistoryCurrent;
    if (current) {
      history.replaceState({ navKey: current.key }, '');
    }

    return () => {
      unsub();
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);
}
