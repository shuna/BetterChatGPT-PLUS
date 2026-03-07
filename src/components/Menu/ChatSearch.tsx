import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { debounce } from 'lodash';

import SearchBar from '@components/SearchBar';

const ChatSearch = ({
  filter,
  setFilter,
}: {
  filter: string;
  setFilter: React.Dispatch<React.SetStateAction<string>>;
}) => {
  const { t } = useTranslation();
  const [_filter, _setFilter] = useState<string>(filter);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    _setFilter(e.target.value);
  };

  const debouncedUpdateFilter = useRef(
    debounce((f) => {
      setFilter(f);
    }, 500)
  ).current;

  useEffect(() => {
    debouncedUpdateFilter(_filter);
  }, [_filter]);

  return (
    <div className='relative'>
      <SearchBar
        value={_filter}
        handleChange={handleChange}
        className='h-8 mb-2'
      />
    </div>
  );
};

export default ChatSearch;
