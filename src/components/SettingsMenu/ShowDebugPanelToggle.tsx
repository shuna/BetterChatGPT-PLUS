import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import useStore from '@store/store';

import Toggle from '@components/Toggle/Toggle';

const ShowDebugPanelToggle = () => {
  const { t } = useTranslation('main');

  const setShowDebugPanel = useStore((state) => state.setShowDebugPanel);

  const [isChecked, setIsChecked] = useState<boolean>(
    useStore.getState().showDebugPanel
  );

  useEffect(() => {
    setShowDebugPanel(isChecked);
  }, [isChecked]);

  return (
    <Toggle
      label={t('showDebugPanel') as string}
      isChecked={isChecked}
      setIsChecked={setIsChecked}
    />
  );
};

export default ShowDebugPanelToggle;
