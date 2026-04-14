import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import useStore from '@store/store';

import { importPromptCSV } from '@utils/prompt';
import { showToast } from '@utils/showToast';

type ImportMode = 'append' | 'replace';

const ImportPrompt = ({ hideTitle }: { hideTitle?: boolean }) => {
  const { t } = useTranslation(['main', 'import']);

  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>('append');
  const [fileSelected, setFileSelected] = useState(false);
  const [alert, setAlert] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  const handleFileUpload = () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const csvString = event.target?.result as string;
      try {
        const results = importPromptCSV(csvString);
        const newPrompts = results.map((data) => {
          const columns = Object.values(data);
          return { id: uuidv4(), name: columns[0], prompt: columns[1] };
        });

        const setPrompts = useStore.getState().setPrompts;
        if (mode === 'replace') {
          setPrompts(newPrompts);
        } else {
          const existing = useStore.getState().prompts;
          setPrompts(existing.concat(newPrompts));
        }
        setAlert({ message: String(t('importSuccess', { ns: 'import', defaultValue: 'Successfully imported!' })), success: true });
      } catch (error: unknown) {
        setAlert({ message: (error as Error).message, success: false });
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      {!hideTitle && (
        <div className='block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'>
          {t('import')} (CSV)
        </div>
      )}
      <p className='text-xs text-gray-500 dark:text-gray-400 mb-2 truncate'>
        {fileSelected && inputRef.current?.files?.[0]
          ? inputRef.current.files[0].name
          : t('selectFileDescription', { ns: 'import', defaultValue: 'インポートするファイルを選択してください' })}
      </p>
      <input
        className='hidden'
        type='file'
        accept='.csv'
        ref={inputRef}
        onChange={() => setFileSelected(!!inputRef.current?.files?.length)}
      />
      <div className='mt-3 flex flex-col gap-2 text-xs text-gray-500 dark:text-gray-400'>
        <label className='flex items-center gap-1.5 cursor-pointer'>
          <input
            type='radio'
            name='promptImportMode'
            checked={mode === 'append'}
            onChange={() => setMode('append')}
            className='rounded'
          />
          {t('mode.append', { ns: 'import' })}
        </label>
        <label className='flex items-center gap-1.5 cursor-pointer'>
          <input
            type='radio'
            name='promptImportMode'
            checked={mode === 'replace'}
            onChange={() => setMode('replace')}
            className='rounded'
          />
          {t('mode.replace', { ns: 'import' })}
        </label>
      </div>
      <div className='flex items-center justify-between mt-3'>
        <button
          className='btn btn-small btn-neutral flex items-center gap-2 whitespace-nowrap'
          onClick={() => inputRef.current?.click()}
          type='button'
        >
          {t('selectFile')}
        </button>
        <button
          className={`btn btn-small w-32 justify-center ${fileSelected ? 'btn-primary' : 'btn-neutral cursor-not-allowed opacity-50'}`}
          onClick={handleFileUpload}
          disabled={!fileSelected}
          aria-label={t('import') as string}
        >
          {t('import')}
        </button>
      </div>
      {alert && (
        <div
          className={`relative py-2 px-3 w-full mt-3 border rounded-md text-gray-600 dark:text-gray-100 text-sm whitespace-pre-wrap ${
            alert.success
              ? 'border-green-500 bg-green-500/10'
              : 'border-red-500 bg-red-500/10'
          }`}
        >
          {alert.message}
        </div>
      )}
    </>
  );
};

export default ImportPrompt;
