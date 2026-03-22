import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showToast } from '@utils/showToast';
import { ImportMode, importChatFromFile } from './importService';

const ImportChat = () => {
  const { t } = useTranslation(['main', 'import']);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>('append');
  const [fileSelected, setFileSelected] = useState(false);
  const [includeSettings, setIncludeSettings] = useState(false);
  const [alert, setAlert] = useState<{
    message: string;
    success: boolean;
  } | null>(null);
  const translate = (key: string, opts?: Record<string, unknown>) =>
    String(t(key, opts as any) ?? '');

  const handleFileUpload = () => {
    if (!inputRef || !inputRef.current) return;
    const file = inputRef.current.files?.[0];
    if (!file) return;
    const confirmKey = includeSettings ? 'confirmReplaceAllWithSettings' : 'confirmReplaceAll';
    const replaceConfirmation = translate(confirmKey, {
      ns: 'import',
      defaultValue: 'Replace all existing chats with the imported file?',
    });

    if (
      mode === 'replace' &&
      !window.confirm(replaceConfirmation)
    ) {
      return;
    }

    importChatFromFile(file, translate, mode, mode === 'replace' ? includeSettings : true).then((result) => {
      if (result.success) {
        showToast(result.message, 'success');
      } else {
        showToast(result.message, 'error', 15000);
      }
      setAlert({ message: result.message, success: result.success });
    });
  };

  return (
    <>
      <div className='block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'>
        {t('import')} (JSON)
      </div>
      <p className='text-xs text-gray-500 dark:text-gray-400 mb-2 truncate'>
        {fileSelected && inputRef.current?.files?.[0]
          ? inputRef.current.files[0].name
          : t('selectFileDescription', { ns: 'import', defaultValue: 'インポートするファイルを選択してください' })}
      </p>
      <input
        className='hidden'
        type='file'
        accept='.json,.json.gz,.gz'
        ref={inputRef}
        onChange={() => setFileSelected(!!inputRef.current?.files?.length)}
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
          <>
            <div className='rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-200'>
              {t(includeSettings ? 'replaceWarningWithSettings' : 'replaceWarning', { ns: 'import' })}
            </div>
            <label className='flex items-center gap-1.5 cursor-pointer mt-1'>
              <input
                type='checkbox'
                checked={includeSettings}
                onChange={() => setIncludeSettings((v) => !v)}
                className='rounded'
              />
              {t('includeSettings', { ns: 'import' })}
            </label>
          </>
        )}
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
          aria-label={translate('import')}
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

export default ImportChat;
