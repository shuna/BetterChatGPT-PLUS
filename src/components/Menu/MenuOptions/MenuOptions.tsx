import React, { Suspense, useEffect, useState } from 'react';
import useStore from '@store/store';

import Api from './Api';
import CollapseOptions from './CollapseOptions';
import { TotalTokenCostDisplay } from '@components/SettingsMenu/TotalTokenCost';

const ImportExportChat = React.lazy(
  () => import('@components/ImportExportChat')
);
const GoogleSync = React.lazy(() => import('@components/GoogleSync'));
const SettingsMenu = React.lazy(() => import('@components/SettingsMenu'));

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

const MenuOptions = () => {
  const hideMenuOptions = useStore((state) => state.hideMenuOptions);
  const countTotalTokens = useStore((state) => state.countTotalTokens);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (hideMenuOptions) return;
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(() => setMounted(true), { timeout: 300 });
      return () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(() => setMounted(true), 50);
      return () => clearTimeout(id);
    }
  }, [hideMenuOptions]);

  return (
    <>
      <CollapseOptions />
      <div
        className={`${
          hideMenuOptions ? 'max-h-0' : 'max-h-full'
        } overflow-hidden transition-all`}
      >
        {countTotalTokens && <TotalTokenCostDisplay />}
        {mounted && (
          <Suspense fallback={null}>
            {googleClientId && <GoogleSync clientId={googleClientId} />}
            <ImportExportChat />
            <Api />
            <SettingsMenu />
          </Suspense>
        )}
      </div>
    </>
  );
};

export default MenuOptions;
