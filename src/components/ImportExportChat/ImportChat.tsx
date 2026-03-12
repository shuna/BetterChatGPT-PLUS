import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { ImportMode, importChatFromFile } from './importService';

const ImportChat = () => {
  const { t } = useTranslation(['main', 'import']);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>('append');
  const [alert, setAlert] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  const handleFileUpload = () => {
    if (!inputRef || !inputRef.current) return;
    const file = inputRef.current.files?.[0];
    if (!file) return;
    const replaceConfirmation = t('confirmReplaceAll', {
      ns: 'import',
      defaultValue: 'Replace all existing chats with the imported file?',
    }) as string;

    if (
      mode === 'replace' &&
      !window.confirm(replaceConfirmation)
    ) {
      return;
    }

    importChatFromFile(file, t, mode).then((result) => {
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message, { autoClose: 15000 });
      }
      setAlert({ message: result.message, success: result.success });
    });
  };

  return (
    <>
      <label className='block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'>
        {t('import')} (JSON)
      </label>
      <input
        className='w-full text-sm file:p-2 text-gray-800 file:text-gray-700 dark:text-gray-300 dark:file:text-gray-200 rounded-md cursor-pointer focus:outline-none bg-gray-50 file:bg-gray-100 dark:bg-gray-800 dark:file:bg-gray-700 file:border-0 border border-gray-300 dark:border-gray-600 placeholder-gray-900 dark:placeholder-gray-300 file:cursor-pointer'
        type='file'
        accept='.json,.json.gz,.gz'
        ref={inputRef}
      />
      <div className='mt-3 flex flex-col gap-2 text-xs text-gray-500 dark:text-gray-400'>
        <label className='flex items-center gap-1.5 cursor-pointer'>
          <input
            type='radio'
            name='importMode'
            checked={mode === 'append'}
            onChange={() => setMode('append')}
            className='rounded'
          />
          {t('mode.append', { ns: 'import' })}
        </label>
        <label className='flex items-center gap-1.5 cursor-pointer'>
          <input
            type='radio'
            name='importMode'
            checked={mode === 'replace'}
            onChange={() => setMode('replace')}
            className='rounded'
          />
          {t('mode.replace', { ns: 'import' })}
        </label>
        {mode === 'replace' && (
          <div className='rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-200'>
            {t('replaceWarning', { ns: 'import' })}
          </div>
        )}
      </div>
      <button
        className='btn btn-small btn-primary mt-3'
        onClick={handleFileUpload}
        aria-label={t('import') as string}
      >
        {t('import')}
      </button>
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

export default ImportChat;
