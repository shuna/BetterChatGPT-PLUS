import { useRef, useCallback, useEffect } from 'react';
import useStore from '@store/store';

const SWIPE_THRESHOLD = 0.3;
const DIRECTION_LOCK_THRESHOLD = 10;
const SCROLL_TOP_SUPPRESSION_MS = 400;

export default function useSwipeGesture(
  menuRef: React.RefObject<HTMLDivElement | null>,
  backdropRef: React.RefObject<HTMLDivElement | null>
) {
  const hideSideMenu = useStore((state) => state.hideSideMenu);
  const setHideSideMenu = useStore((state) => state.setHideSideMenu);
  const menuWidth = useStore((state) => state.menuWidth);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);
  const lockedRef = useRef(false);
  const horizontalRef = useRef(false);
  const modeRef = useRef<'open' | 'close'>('open');
  const preventScrollListenerRef = useRef<((event: Event) => void) | null>(
    null
  );
  const scrollTopSuppressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const getEffectiveWidth = useCallback(() => {
    return Math.min(menuWidth, window.innerWidth * 0.75);
  }, [menuWidth]);

  const applyTransform = useCallback(
    (progress: number) => {
      const width = getEffectiveWidth();
      const translateX = (progress - 1) * width;

      if (menuRef.current) {
        menuRef.current.style.transition = 'none';
        menuRef.current.style.transform = `translateX(${translateX}px)`;
      }
      if (backdropRef.current) {
        backdropRef.current.style.display = 'block';
        backdropRef.current.style.transition = 'none';
        backdropRef.current.style.opacity = String(progress);
      }
    },
    [menuRef, backdropRef, getEffectiveWidth]
  );

  const setBodySwiping = useCallback((active: boolean) => {
    const body = document.body;
    const html = document.documentElement;

    body.classList.toggle('sidebar-swiping', active);
    html.classList.toggle('sidebar-swiping', active);

    if (active) {
      html.dataset.sidebarSwipeIgnoreScrollTopUntil = String(
        Date.now() + SCROLL_TOP_SUPPRESSION_MS
      );
      if (scrollTopSuppressionTimerRef.current) {
        clearTimeout(scrollTopSuppressionTimerRef.current);
        scrollTopSuppressionTimerRef.current = null;
      }
      if (!preventScrollListenerRef.current) {
        preventScrollListenerRef.current = (event: Event) => {
          if (event.cancelable) {
            event.preventDefault();
          }
        };
        document.addEventListener('touchmove', preventScrollListenerRef.current, {
          passive: false,
          capture: true,
        });
        window.addEventListener('wheel', preventScrollListenerRef.current, {
          passive: false,
          capture: true,
        });
      }
      return;
    }

    html.dataset.sidebarSwipeIgnoreScrollTopUntil = String(
      Date.now() + SCROLL_TOP_SUPPRESSION_MS
    );
    if (scrollTopSuppressionTimerRef.current) {
      clearTimeout(scrollTopSuppressionTimerRef.current);
    }
    scrollTopSuppressionTimerRef.current = setTimeout(() => {
      delete html.dataset.sidebarSwipeIgnoreScrollTopUntil;
      scrollTopSuppressionTimerRef.current = null;
    }, SCROLL_TOP_SUPPRESSION_MS);

    if (preventScrollListenerRef.current) {
      document.removeEventListener(
        'touchmove',
        preventScrollListenerRef.current,
        true
      );
      window.removeEventListener('wheel', preventScrollListenerRef.current, true);
      preventScrollListenerRef.current = null;
    }
  }, []);

  const finishSwipe = useCallback(
    (shouldOpen: boolean) => {
      setBodySwiping(false);
      const menu = menuRef.current;
      const backdrop = backdropRef.current;

      if (menu) {
        menu.style.transition = '';
        menu.style.transform = shouldOpen
          ? 'translateX(0%)'
          : 'translateX(-100%)';
      }
      if (backdrop) {
        backdrop.style.transition = '';
        backdrop.style.opacity = shouldOpen ? '' : '0';
      }

      setHideSideMenu(!shouldOpen);

      const cleanup = () => {
        if (menu) menu.style.transform = '';
        if (backdrop) {
          backdrop.style.display = '';
          backdrop.style.opacity = '';
        }
        menu?.removeEventListener('transitionend', cleanup);
      };
      menu?.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, 350);
    },
    [menuRef, backdropRef, setHideSideMenu, setBodySwiping]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!trackingRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startXRef.current;
      const dy = touch.clientY - startYRef.current;

      if (!lockedRef.current) {
        if (
          Math.abs(dx) > DIRECTION_LOCK_THRESHOLD ||
          Math.abs(dy) > DIRECTION_LOCK_THRESHOLD
        ) {
          lockedRef.current = true;
          horizontalRef.current = Math.abs(dx) > Math.abs(dy);
          if (horizontalRef.current) setBodySwiping(true);
        }
        return;
      }
      if (!horizontalRef.current) return;

      e.preventDefault();

      const width = getEffectiveWidth();
      if (modeRef.current === 'open') {
        if (dx <= 0) return;
        applyTransform(Math.min(dx / width, 1));
      } else {
        if (dx >= 0) return;
        applyTransform(Math.max(1 + dx / width, 0));
      }
    },
    [getEffectiveWidth, applyTransform, setBodySwiping]
  );

  const cancelSwipe = useCallback(() => {
    if (!trackingRef.current) return;
    trackingRef.current = false;
    setBodySwiping(false);
    // Restore menu/backdrop to current state without animation
    const menu = menuRef.current;
    const backdrop = backdropRef.current;
    if (menu) {
      menu.style.transition = '';
      menu.style.transform = '';
    }
    if (backdrop) {
      backdrop.style.transition = '';
      backdrop.style.display = '';
      backdrop.style.opacity = '';
    }
  }, [menuRef, backdropRef, setBodySwiping]);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      if (!lockedRef.current || !horizontalRef.current) {
        setBodySwiping(false);
        return;
      }

      const touch = e.changedTouches[0];
      const dx = touch.clientX - startXRef.current;
      const width = getEffectiveWidth();

      if (modeRef.current === 'open') {
        finishSwipe(dx / width > SWIPE_THRESHOLD);
      } else {
        finishSwipe(Math.abs(dx) / width <= SWIPE_THRESHOLD);
      }
    },
    [getEffectiveWidth, finishSwipe, setBodySwiping]
  );

  const onTouchCancel = useCallback(() => {
    cancelSwipe();
  }, [cancelSwipe]);

  const onEdgeTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!hideSideMenu) return;
      const touch = e.touches[0];
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      trackingRef.current = true;
      lockedRef.current = false;
      horizontalRef.current = false;
      modeRef.current = 'open';
    },
    [hideSideMenu]
  );

  const onMenuTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (hideSideMenu) return;
      const touch = e.touches[0];
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      trackingRef.current = true;
      lockedRef.current = false;
      horizontalRef.current = false;
      modeRef.current = 'close';
    },
    [hideSideMenu]
  );

  // Cleanup: ensure sidebar-swiping class is removed on unmount
  useEffect(() => {
    return () => {
      document.body.classList.remove('sidebar-swiping');
      document.documentElement.classList.remove('sidebar-swiping');
      if (scrollTopSuppressionTimerRef.current) {
        clearTimeout(scrollTopSuppressionTimerRef.current);
      }
      delete document.documentElement.dataset.sidebarSwipeIgnoreScrollTopUntil;
      if (preventScrollListenerRef.current) {
        document.removeEventListener(
          'touchmove',
          preventScrollListenerRef.current,
          true
        );
        window.removeEventListener('wheel', preventScrollListenerRef.current, true);
        preventScrollListenerRef.current = null;
      }
    };
  }, []);

  return {
    edgeHandlers: {
      onTouchStart: onEdgeTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
    },
    menuHandlers: {
      onTouchStart: onMenuTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
    },
  };
}
