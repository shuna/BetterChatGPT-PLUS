import React from 'react';
import { useTranslation } from 'react-i18next';

const SearchBar = ({
  value,
  handleChange,
  className,
  disabled,
}: {
  value: string;
  handleChange: React.ChangeEventHandler<HTMLInputElement>;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  disabled?: boolean;
}) => {
  const { t } = useTranslation();

  return (
    <div className={className}>
      <input
        disabled={disabled}
        type='text'
        className='m-0 h-full w-full rounded border border-gray-300 bg-transparent p-3 text-sm text-gray-800 transition-opacity focus:outline-none focus:ring-1 focus:ring-gray-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:text-white dark:focus:ring-gray-600'
        placeholder={t('search') as string}
        value={value}
        onChange={(e) => {
          handleChange(e);
        }}
      />
    </div>
  );
};

export default SearchBar;
