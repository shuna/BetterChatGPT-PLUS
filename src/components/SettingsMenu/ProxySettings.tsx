import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import PopupModal from '@components/PopupModal';

export const ProxySettingsInline = () => {
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
    const trimmed = endpoint.trim();
    if (trimmed !== useStore.getState().proxyEndpoint) {
      setProxyEndpoint(trimmed);
    }
  }, [endpoint]);

  useEffect(() => {
    const trimmed = authToken.trim();
    if (trimmed !== useStore.getState().proxyAuthToken) {
      setProxyAuthToken(trimmed);
    }
  }, [authToken]);

  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className='flex flex-col gap-4'>
      <div>
        <label className='block text-sm font-medium text-gray-900 dark:text-white mb-1'>
          {t('proxyEndpoint') as string}
        </label>
        <input
          type='url'
          className={inputClass}
          placeholder={t('proxyEndpointPlaceholder') as string}
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          aria-label={t('proxyEndpoint') as string}
        />
      </div>
      <div>
        <label className='block text-sm font-medium text-gray-900 dark:text-white mb-1'>
          {t('proxyAuthToken') as string}
        </label>
        <input
          type='password'
          className={inputClass}
          placeholder={t('proxyAuthTokenPlaceholder') as string}
          value={authToken}
          onChange={(e) => setAuthToken(e.target.value)}
          aria-label={t('proxyAuthToken') as string}
        />
      </div>
    </div>
  );
};

const ProxySettings = () => {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  return (
    <div>
      <button
        className='btn btn-neutral'
        onClick={() => setIsModalOpen(true)}
        aria-label={t('proxySettings') as string}
      >
        {t('proxySettings')}
      </button>
      {isModalOpen && (
        <ProxySettingsPopup setIsModalOpen={setIsModalOpen} />
      )}
    </div>
  );
};

const ProxySettingsPopup = ({
  setIsModalOpen,
}: {
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const { t } = useTranslation();

  const setProxyEndpoint = useStore((state) => state.setProxyEndpoint);
  const setProxyAuthToken = useStore((state) => state.setProxyAuthToken);

  const [endpoint, setEndpoint] = useState<string>(
    useStore.getState().proxyEndpoint
  );
  const [authToken, setAuthToken] = useState<string>(
    useStore.getState().proxyAuthToken
  );

  const handleSave = () => {
    setProxyEndpoint(endpoint.trim());
    setProxyAuthToken(authToken.trim());
    setIsModalOpen(false);
  };

  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <PopupModal
      title={t('proxySettings') as string}
      setIsModalOpen={setIsModalOpen}
      handleConfirm={handleSave}
    >
      <div className='p-6 border-b border-gray-200 dark:border-gray-600 flex flex-col gap-3 w-[90vw] max-w-full'>
        <div>
          <label className='block text-sm font-medium text-gray-900 dark:text-white mb-1'>
            {t('proxyEndpoint') as string}
          </label>
          <input
            type='url'
            className={inputClass}
            placeholder={t('proxyEndpointPlaceholder') as string}
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            aria-label={t('proxyEndpoint') as string}
          />
        </div>
        <div>
          <label className='block text-sm font-medium text-gray-900 dark:text-white mb-1'>
            {t('proxyAuthToken') as string}
          </label>
          <input
            type='password'
            className={inputClass}
            placeholder={t('proxyAuthTokenPlaceholder') as string}
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            aria-label={t('proxyAuthToken') as string}
          />
        </div>
      </div>
    </PopupModal>
  );
};

export default ProxySettings;
