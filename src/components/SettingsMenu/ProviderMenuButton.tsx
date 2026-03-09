import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ProviderMenu from '@components/ProviderMenu/ProviderMenu';
import useStore from '@store/store';

const ProviderMenuButton = () => {
  const { t } = useTranslation('model');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const showProviderMenu = useStore((state) => state.showProviderMenu);
  const setShowProviderMenu = useStore((state) => state.setShowProviderMenu);

  useEffect(() => {
    if (showProviderMenu) {
      setIsModalOpen(true);
      setShowProviderMenu(false);
    }
  }, [showProviderMenu, setShowProviderMenu]);

  return (
    <>
      <button
        id='provider-menu'
        className='btn btn-neutral'
        onClick={() => setIsModalOpen(true)}
      >
        {t('provider.title', 'AI Provider Settings')}
      </button>
      {isModalOpen && <ProviderMenu setIsModalOpen={setIsModalOpen} />}
    </>
  );
};

export default ProviderMenuButton;
