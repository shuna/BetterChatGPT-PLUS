import { useEffect, useState } from 'react';

const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

export default function useIsDesktop() {
  const getMatches = () =>
    typeof window !== 'undefined' &&
    window.matchMedia(DESKTOP_MEDIA_QUERY).matches;

  const [isDesktop, setIsDesktop] = useState<boolean>(getMatches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const update = (event?: MediaQueryListEvent) => {
      setIsDesktop(event?.matches ?? mediaQuery.matches);
    };

    update();
    mediaQuery.addEventListener('change', update);

    return () => {
      mediaQuery.removeEventListener('change', update);
    };
  }, []);

  return isDesktop;
}
