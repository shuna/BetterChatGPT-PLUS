import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import Toggle from '@components/Toggle';

const AnimateBubbleNavigationToggle = () => {
  const { t } = useTranslation();
  const setAnimateBubbleNavigation = useStore((state) => state.setAnimateBubbleNavigation);
  const [isChecked, setIsChecked] = useState<boolean>(
    useStore.getState().animateBubbleNavigation
  );

  useEffect(() => {
    setAnimateBubbleNavigation(isChecked);
  }, [isChecked, setAnimateBubbleNavigation]);

  return (
    <Toggle
      label={t('animateBubbleNavigation') as string}
      isChecked={isChecked}
      setIsChecked={setIsChecked}
    />
  );
};

export default AnimateBubbleNavigationToggle;
