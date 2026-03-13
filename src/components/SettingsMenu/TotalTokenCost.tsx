import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import useStore from '@store/store';
import useLiveTotalTokenUsed from '@hooks/useLiveTotalTokenUsed';

import Toggle from '@components/Toggle/Toggle';

import CalculatorIcon from '@icon/CalculatorIcon';
import { ModelOptions } from '@type/chat';
import { calculateUsageCost, parseTokenKey } from '@utils/cost';

type CostMapping = {
  label: string;
  kind: 'known' | 'unknown';
  cost?: number;
  isFree?: boolean;
  reason?: 'model-not-registered' | 'no-pricing-data';
}[];

const TotalTokenCost = () => {
  const { t } = useTranslation(['main', 'model']);

  const totalTokenUsed = useLiveTotalTokenUsed();
  const setTotalTokenUsed = useStore((state) => state.setTotalTokenUsed);
  const countTotalTokens = useStore((state) => state.countTotalTokens);

  const [costMapping, setCostMapping] = useState<CostMapping>([]);

  const resetCost = () => {
    setTotalTokenUsed({});
  };

  useEffect(() => {
    const updatedCostMapping: CostMapping = [];
    Object.entries(totalTokenUsed).forEach(([key, tokenCost]) => {
      const { modelId, providerId } = parseTokenKey(key);
      const result = calculateUsageCost(
        tokenCost,
        modelId as ModelOptions,
        providerId
      );
      updatedCostMapping.push({ label: key, ...result });
    });

    setCostMapping(updatedCostMapping);
  }, [totalTokenUsed]);

  return countTotalTokens ? (
    <div className='flex flex-col items-center gap-2'>
      <div className='relative overflow-x-auto shadow-md sm:rounded-lg'>
        <table className='w-full text-sm text-left text-gray-500 dark:text-gray-400'>
          <thead className='text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400'>
            <tr>
              <th className='px-4 py-2'>{t('model', { ns: 'model' })}</th>
              <th className='px-4 py-2'>USD</th>
            </tr>
          </thead>
          <tbody>
            {costMapping.map((entry) => (
              <tr
                key={entry.label}
                className='bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              >
                <td className='px-4 py-2'>{entry.label.replace(':::', ' / ')}</td>
                <td className='px-4 py-2'>
                  {entry.kind === 'unknown'
                    ? entry.reason === 'model-not-registered'
                      ? t('tokenCostModelNotRegistered', { ns: 'main' })
                      : t('tokenCostNoPricingData', { ns: 'main' })
                    : entry.isFree
                      ? t('free', { ns: 'main', defaultValue: 'Free' })
                      : entry.cost?.toPrecision(3) ?? '0.00'}
                </td>
              </tr>
            ))}
            <tr className='bg-white border-b dark:bg-gray-800 dark:border-gray-700 font-bold'>
              <td className='px-4 py-2'>{t('total', { ns: 'main' })}</td>
              <td className='px-4 py-2'>
                {costMapping.some((entry) => entry.kind === 'unknown')
                  ? t('tokenCostNoPricingData', { ns: 'main' })
                  : (() => {
                      const total = costMapping.reduce(
                        (prev, curr) => prev + (curr.cost ?? 0),
                        0
                      );
                      const hasEntries = costMapping.length > 0;
                      const allFree =
                        hasEntries &&
                        costMapping.every((entry) => entry.kind === 'known' && entry.isFree);
                      return allFree
                        ? t('free', { ns: 'main', defaultValue: 'Free' })
                        : total.toPrecision(3);
                    })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className='btn btn-neutral cursor-pointer' onClick={resetCost}>
        {t('resetCost', { ns: 'main' })}
      </div>
    </div>
  ) : (
    <></>
  );
};

export const TotalTokenCostToggle = () => {
  const { t } = useTranslation('main');

  const setCountTotalTokens = useStore((state) => state.setCountTotalTokens);

  const [isChecked, setIsChecked] = useState<boolean>(
    useStore.getState().countTotalTokens
  );

  useEffect(() => {
    setCountTotalTokens(isChecked);
  }, [isChecked]);

  return (
    <Toggle
      label={t('countTotalTokens') as string}
      isChecked={isChecked}
      setIsChecked={setIsChecked}
    />
  );
};

export const TotalTokenCostDisplay = () => {
  const { t } = useTranslation();
  const totalTokenUsed = useLiveTotalTokenUsed();

  const [totalCost, setTotalCost] = useState<number>(0);
  const [allFree, setAllFree] = useState<boolean>(false);
  const [isDisplayRefreshing, setIsDisplayRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let updatedTotalCost = 0;
    let hasUnknownCost = false;
    let hasEntries = false;
    let hasOnlyFreeModels = true;
    Object.entries(totalTokenUsed).forEach(([key, tokenCost]) => {
      hasEntries = true;
      const { modelId, providerId } = parseTokenKey(key);
      const result = calculateUsageCost(
        tokenCost,
        modelId as ModelOptions,
        providerId
      );
      if (result.kind === 'unknown') {
        hasUnknownCost = true;
        return;
      }
      if (!result.isFree) {
        hasOnlyFreeModels = false;
      }
      updatedTotalCost += result.cost;
    });

    setTotalCost(hasUnknownCost ? Number.NaN : updatedTotalCost);
    setAllFree(hasEntries && hasOnlyFreeModels && !hasUnknownCost);
  }, [totalTokenUsed]);

  useEffect(() => {
    setIsDisplayRefreshing(true);
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      setIsDisplayRefreshing(false);
    }, 180);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [totalCost, allFree]);

  return (
    <a
      className={`flex items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-700 transition-all duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-500/10 ${
        isDisplayRefreshing ? 'opacity-80' : 'opacity-100'
      }`}
    >
      <CalculatorIcon />
      <span className='tabular-nums'>
        {Number.isNaN(totalCost)
          ? t('tokenCostNoPricingData', { ns: 'main' })
          : allFree
            ? t('free', { ns: 'main', defaultValue: 'Free' })
            : `USD ${totalCost.toPrecision(3)}`}
      </span>
    </a>
  );
};

export default TotalTokenCost;
