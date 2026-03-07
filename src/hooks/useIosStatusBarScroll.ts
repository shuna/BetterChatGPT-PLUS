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

    const findScrollableChild = (parent: Element): Element | null => {
      for (const child of Array.from(parent.children)) {
        const style = getComputedStyle(child);
        if (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          child.scrollHeight > child.clientHeight
        ) {
          return child;
        }
      }
      return null;
    };

    const onScroll = () => {
      if (window.scrollY !== 0) return;

      // Find the react-scroll-to-bottom wrapper (has emotion css class)
      const wrapper = document.querySelector(
        '[class*="css-"][class*="react-scroll-to-bottom"]'
      ) || document.querySelector('[class*="react-scroll-to-bottom"]');

      if (wrapper) {
        const scrollable = findScrollableChild(wrapper);
        if (scrollable) {
          scrollable.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }

      // Re-set 1px scroll for next tap
      requestAnimationFrame(() => {
        window.scrollTo(0, 1);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      root.style.minHeight = '';
    };
  }, []);
}
