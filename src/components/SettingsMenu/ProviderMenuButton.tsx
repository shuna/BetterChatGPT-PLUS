import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ProviderMenu from '@components/ProviderMenu/ProviderMenu';

const ProviderMenuButton = () => {
  const { t } = useTranslation('model');
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
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
