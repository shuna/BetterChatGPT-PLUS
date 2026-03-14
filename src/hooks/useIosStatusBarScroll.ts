import { useEffect } from 'react';

/**
 * iOS status bar tap-to-scroll-top workaround.
 *
 * iOS Safari scrolls the window when the status bar is tapped, but this app
 * uses overflow-hidden containers so the window is never scrollable.
 * This hook makes #root 1px taller than the viewport and pre-scrolls 1px,
 * then listens for window scroll=0 (status bar tap) to scroll the chat
 * container to top.
 */

export default function useIosStatusBarScroll() {
  useEffect(() => {
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isIos) return;

    const root = document.getElementById('root');
    if (!root) return;

    // Make root 1px taller so window becomes scrollable
    root.style.minHeight = 'calc(100% + 1px)';
    window.scrollTo(0, 1);

    // Track whether the visual viewport was recently resized (keyboard
    // show/hide).  We use a short-lived flag rather than checking the
    // viewport height at scroll-time because the viewport may have already
    // settled back to full height by the time the scroll event fires.
    let recentViewportResize = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    const onViewportResize = () => {
      recentViewportResize = true;
      clearTimeout(resizeTimer);
      // 500 ms covers the iOS keyboard animation; after that a scrollY===0
      // event is safe to treat as a genuine status-bar tap again.
      resizeTimer = setTimeout(() => {
        recentViewportResize = false;
      }, 500);
    };

    // VisualViewport resize fires when the soft keyboard appears/disappears.
    window.visualViewport?.addEventListener('resize', onViewportResize);

    const onScroll = () => {
      if (window.scrollY !== 0) return;

      const ignoreScrollTopUntil = Number(
        document.documentElement.dataset.sidebarSwipeIgnoreScrollTopUntil ?? '0'
      );

      if (
        document.body.classList.contains('sidebar-swiping') ||
        document.documentElement.classList.contains('sidebar-swiping') ||
        ignoreScrollTopUntil > Date.now()
      ) {
        requestAnimationFrame(() => {
          window.scrollTo(0, 1);
        });
        return;
      }

      // Suppress when the soft keyboard is (or was just) open.
      //
      // Two independent signals, either of which is sufficient:
      //
      // 1. The visual viewport is currently shrunk while an editable element
      //    is focused — the keyboard is on screen right now.
      // 2. A visualViewport resize happened in the last 500 ms — the
      //    keyboard was just shown or dismissed and iOS momentarily reset
      //    window.scrollY to 0.
      //
      // Signal 1 alone misses the "keyboard just dismissed" case (viewport
      // already restored).  Signal 2 alone could false-positive on
      // orientation changes, so we scope it to editable-focus too.
      const el = document.activeElement;
      const isEditable =
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLInputElement ||
        (el instanceof HTMLElement && el.isContentEditable);

      if (isEditable) {
        const viewportShrunk =
          window.visualViewport != null &&
          window.visualViewport.height / window.innerHeight < 0.85;

        if (viewportShrunk || recentViewportResize) {
          // Not a status-bar tap — re-prime the 1 px offset and bail out.
          requestAnimationFrame(() => {
            window.scrollTo(0, 1);
          });
          return;
        }
      }

      // Find the Virtuoso scroller element (it is the scrollable container)
      const scroller = document.querySelector('[data-virtuoso-scroller="true"]');

      if (scroller) {
        scroller.scrollTo({ top: 0, behavior: 'smooth' });
      }

      // Re-set 1px scroll for next tap
      requestAnimationFrame(() => {
        window.scrollTo(0, 1);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.visualViewport?.removeEventListener('resize', onViewportResize);
      clearTimeout(resizeTimer);
      root.style.minHeight = '';
    };
  }, []);
}
