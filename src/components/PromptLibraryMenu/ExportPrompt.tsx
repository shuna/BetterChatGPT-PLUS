import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { exportPrompts } from '@utils/prompt';

const ExportPrompt = ({ hideTitle }: { hideTitle?: boolean }) => {
  const { t } = useTranslation();
  const [useGzip, setUseGzip] = useState(false);

  const handleExport = async () => {
    const prompts = useStore.getState().prompts;
    if (useGzip) {
      const Papa = await import('papaparse');
      const csvString = Papa.default.unparse(
        prompts.map((p) => ({ name: p.name, prompt: p.prompt }))
      );
      if (typeof CompressionStream === 'undefined') {
        // Fallback: plain CSV
        exportPrompts(prompts);
        return;
      }
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const cs = new CompressionStream('gzip');
      const compressedStream = blob.stream().pipeThrough(cs);
      const compressedBlob = await new Response(compressedStream).blob();
      const url = URL.createObjectURL(compressedBlob);
      const link = document.createElement('a');
      link.href = url;
      const today = new Date().toISOString().slice(0, 10);
      link.download = `${today}.csv.gz`;
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } else {
      exportPrompts(prompts);
    }
  };

  return (
    <div>
      {!hideTitle && (
        <div className='block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'>
          {t('export')} (CSV)
        </div>
      )}
      <div className='flex items-center justify-between'>
        <label className='flex items-center gap-1.5 cursor-pointer text-xs text-gray-500 dark:text-gray-400'>
          <input
            type='checkbox'
            checked={useGzip}
            onChange={(e) => setUseGzip(e.target.checked)}
            className='rounded'
          />
          {t('gzCompression')}
        </label>
        <button
          className='btn btn-small btn-primary w-32 justify-center'
          onClick={handleExport}
          aria-label={t('export') as string}
        >
          {t('export')}
        </button>
      </div>
    </div>
  );
};

export default ExportPrompt;
