import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';

const ProxySettings = () => {
  const { t } = useTranslation();

  const setProxyEndpoint = useStore((state) => state.setProxyEndpoint);
  const setProxyAuthToken = useStore((state) => state.setProxyAuthToken);

  const [endpoint, setEndpoint] = useState<string>(
    useStore.getState().proxyEndpoint
  );
  const [authToken, setAuthToken] = useState<string>(
    useStore.getState().proxyAuthToken
  );

  useEffect(() => {
    setProxyEndpoint(endpoint.trim());
  }, [endpoint, setProxyEndpoint]);

  useEffect(() => {
    setProxyAuthToken(authToken.trim());
  }, [authToken, setProxyAuthToken]);

  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className='flex flex-col gap-2 w-full'>
      <div className='text-sm font-medium text-gray-700 dark:text-gray-300'>
        {t('proxySettings') as string}
      </div>
      <input
        type='url'
        className={inputClass}
        placeholder={t('proxyEndpointPlaceholder') as string}
        value={endpoint}
        onChange={(e) => setEndpoint(e.target.value)}
        aria-label={t('proxyEndpoint') as string}
      />
      <input
        type='password'
        className={inputClass}
        placeholder={t('proxyAuthTokenPlaceholder') as string}
        value={authToken}
        onChange={(e) => setAuthToken(e.target.value)}
        aria-label={t('proxyAuthToken') as string}
      />
    </div>
  );
};

export default ProxySettings;
