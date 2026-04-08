import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import PopupModal from '@components/PopupModal';
import Toggle from '@components/Toggle';
import { SettingsGroup } from './SettingsMenu';

const INPUT_CLASS =
  'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500';

/** Shared proxy form fields. */
const ProxySettingsForm = ({
  isChecked,
  setIsChecked,
  endpoint,
  setEndpoint,
  authToken,
  setAuthToken,
  layout,
}: {
  isChecked: boolean;
  setIsChecked: React.Dispatch<React.SetStateAction<boolean>>;
  endpoint: string;
  setEndpoint: (v: string) => void;
  authToken: string;
  setAuthToken: (v: string) => void;
  layout: 'inline' | 'popup';
}) => {
  const { t } = useTranslation();

  if (layout === 'inline') {
    return (
      <>
        <SettingsGroup label={t('settingsSection.proxyConnection')}>
          <Toggle
            label={t('proxyEnabled') as string}
            isChecked={isChecked}
            setIsChecked={setIsChecked}
          />
          <div className='px-4 py-3'>
            <label className='block text-sm font-medium text-gray-900 dark:text-gray-300 mb-1'>
              {t('proxyEndpoint') as string}
            </label>
            <input
              type='url'
              className={INPUT_CLASS}
              placeholder={t('proxyEndpointPlaceholder') as string}
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              aria-label={t('proxyEndpoint') as string}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup label={t('settingsSection.proxyAuth')}>
          <div className='px-4 py-3'>
            <label className='block text-sm font-medium text-gray-900 dark:text-gray-300 mb-1'>
              {t('proxyAuthToken') as string}
            </label>
            <input
              type='password'
              className={INPUT_CLASS}
              placeholder={t('proxyAuthTokenPlaceholder') as string}
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              aria-label={t('proxyAuthToken') as string}
            />
          </div>
        </SettingsGroup>
      </>
    );
  }

  return (
    <>
      <Toggle
        label={t('proxyEnabled') as string}
        isChecked={isChecked}
        setIsChecked={setIsChecked}
      />
      <div>
        <label className='block text-sm font-medium text-gray-900 dark:text-white mb-1'>
          {t('proxyEndpoint') as string}
        </label>
        <input
          type='url'
          className={INPUT_CLASS}
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
          className={INPUT_CLASS}
          placeholder={t('proxyAuthTokenPlaceholder') as string}
          value={authToken}
          onChange={(e) => setAuthToken(e.target.value)}
          aria-label={t('proxyAuthToken') as string}
        />
      </div>
    </>
  );
};

export const ProxySettingsInline = () => {
  const { t } = useTranslation();

  const setProxyEnabled = useStore((state) => state.setProxyEnabled);
  const setProxyEndpoint = useStore((state) => state.setProxyEndpoint);
  const setProxyAuthToken = useStore((state) => state.setProxyAuthToken);

  const [isChecked, setIsChecked] = useState<boolean>(useStore.getState().proxyEnabled);
  const [endpoint, setEndpoint] = useState<string>(useStore.getState().proxyEndpoint);
  const [authToken, setAuthToken] = useState<string>(useStore.getState().proxyAuthToken);

  useEffect(() => { setProxyEnabled(isChecked); }, [isChecked]);
  useEffect(() => {
    const trimmed = endpoint.trim();
    if (trimmed !== useStore.getState().proxyEndpoint) setProxyEndpoint(trimmed);
  }, [endpoint]);
  useEffect(() => {
    const trimmed = authToken.trim();
    if (trimmed !== useStore.getState().proxyAuthToken) setProxyAuthToken(trimmed);
  }, [authToken]);

  return (
    <div className='flex flex-col gap-5'>
      <p className='text-sm text-gray-500 dark:text-gray-400 px-4'>
        {t('proxyDescription') as string}
      </p>
      <ProxySettingsForm
        isChecked={isChecked}
        setIsChecked={setIsChecked}
        endpoint={endpoint}
        setEndpoint={setEndpoint}
        authToken={authToken}
        setAuthToken={setAuthToken}
        layout='inline'
      />
    </div>
  );
};

const ProxySettingsPopup = ({
  setIsModalOpen,
}: {
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const { t } = useTranslation();

  const [isChecked, setIsChecked] = useState<boolean>(useStore.getState().proxyEnabled);
  const [endpoint, setEndpoint] = useState<string>(useStore.getState().proxyEndpoint);
  const [authToken, setAuthToken] = useState<string>(useStore.getState().proxyAuthToken);

  const handleSave = () => {
    useStore.getState().setProxyEnabled(isChecked);
    useStore.getState().setProxyEndpoint(endpoint.trim());
    useStore.getState().setProxyAuthToken(authToken.trim());
    setIsModalOpen(false);
  };

  return (
    <PopupModal
      title={t('proxySettings') as string}
      setIsModalOpen={setIsModalOpen}
      handleConfirm={handleSave}
    >
      <div className='p-6 border-b border-gray-200 dark:border-gray-600 flex flex-col gap-3 w-[90vw] max-w-full'>
        <ProxySettingsForm
          isChecked={isChecked}
          setIsChecked={setIsChecked}
          endpoint={endpoint}
          setEndpoint={setEndpoint}
          authToken={authToken}
          setAuthToken={setAuthToken}
          layout='popup'
        />
      </div>
    </PopupModal>
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

export default ProxySettings;
