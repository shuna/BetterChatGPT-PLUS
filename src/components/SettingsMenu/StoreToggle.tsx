import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import Toggle from '@components/Toggle';

/**
 * Generic toggle that syncs a boolean Zustand store field.
 * Replaces 6+ identical one-off toggle components.
 */
const StoreToggle = ({
  stateKey,
  setterKey,
  i18nKey,
  i18nNs,
}: {
  /** Store key to read initial value, e.g. 'enterToSubmit' */
  stateKey: string;
  /** Store setter name, e.g. 'setEnterToSubmit' */
  setterKey: string;
  /** Translation key for the label */
  i18nKey: string;
  /** Optional i18n namespace */
  i18nNs?: string;
}) => {
  const { t } = useTranslation(i18nNs);
  const setter = useStore((state) => (state as unknown as Record<string, unknown>)[setterKey] as (v: boolean) => void);
  const [isChecked, setIsChecked] = useState<boolean>(
    (useStore.getState() as unknown as Record<string, unknown>)[stateKey] as boolean
  );

  useEffect(() => {
    setter(isChecked);
  }, [isChecked, setter]);

  return (
    <Toggle
      label={t(i18nKey) as string}
      isChecked={isChecked}
      setIsChecked={setIsChecked}
    />
  );
};

export default StoreToggle;
