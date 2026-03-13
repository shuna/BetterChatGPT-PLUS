import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PopupModal from '@components/PopupModal';
import HelpIcon from '@icon/HelpIcon';

const HelpMenu = () => {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <a
        className='flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-700 transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-500/10'
        onClick={() => setIsModalOpen(true)}
      >
        <div>
          <HelpIcon />
        </div>
        {t('help.title')}
      </a>
      {isModalOpen && (
        <PopupModal
          title={t('help.title') as string}
          setIsModalOpen={setIsModalOpen}
          cancelButton={false}
        >
          <div className='p-6 border-b border-gray-200 dark:border-gray-600'>
            <div className='text-gray-900 dark:text-gray-300 text-sm flex flex-col gap-5 leading-relaxed'>
              <section>
                <h4 className='font-semibold text-base mb-2'>
                  {t('help.basicOps')}
                </h4>
                <ul className='list-disc list-inside space-y-1'>
                  <li>{t('help.ops.newChat')}</li>
                  <li>{t('help.ops.selectModel')}</li>
                  <li>{t('help.ops.promptLibrary')}</li>
                  <li>{t('help.ops.branch')}</li>
                </ul>
              </section>

              <section>
                <h4 className='font-semibold text-base mb-2'>
                  {t('help.shortcuts.title')}
                </h4>
                <div className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1'>
                  <kbd className='px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono'>Enter</kbd>
                  <span>{t('help.shortcuts.submit')}</span>
                  <kbd className='px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono'>Shift+Enter</kbd>
                  <span>{t('help.shortcuts.newLine')}</span>
                  <kbd className='px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono'>/</kbd>
                  <span>{t('help.shortcuts.prompt')}</span>
                  <kbd className='px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono'>Esc</kbd>
                  <span>{t('help.shortcuts.close')}</span>
                </div>
              </section>

              <section>
                <h4 className='font-semibold text-base mb-2'>
                  {t('help.faq.title')}
                </h4>
                <div className='space-y-3'>
                  <div>
                    <p className='font-medium'>{t('help.faq.q1')}</p>
                    <p className='text-gray-600 dark:text-gray-400 mt-0.5'>{t('help.faq.a1')}</p>
                  </div>
                  <div>
                    <p className='font-medium'>{t('help.faq.q2')}</p>
                    <p className='text-gray-600 dark:text-gray-400 mt-0.5'>{t('help.faq.a2')}</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </PopupModal>
      )}
    </>
  );
};

export default HelpMenu;
