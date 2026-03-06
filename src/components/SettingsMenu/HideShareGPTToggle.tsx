import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import Toggle from '@components/Toggle';

const HideShareGPTToggle = () => {
  const { t } = useTranslation();

  const setHideShareGPT = useStore((state) => state.setHideShareGPT);

  const [isChecked, setIsChecked] = useState<boolean>(
    !useStore.getState().hideShareGPT
  );

  useEffect(() => {
    setHideShareGPT(!isChecked);
  }, [isChecked]);

  return (
    <Toggle
      label={t('showShareGPT') as string}
      isChecked={isChecked}
      setIsChecked={setIsChecked}
    />
  );
};

export default HideShareGPTToggle;
