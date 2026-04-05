import React, { useEffect, useRef, useState } from 'react';
import useStore from '@store/store';
import { useTranslation } from 'react-i18next';

import PopupModal from '@components/PopupModal';
import { Prompt } from '@type/prompt';
import PlusIcon from '@icon/PlusIcon';
import CrossIcon from '@icon/CrossIcon';
import { v4 as uuidv4 } from 'uuid';
import ImportPrompt from './ImportPrompt';
import ExportPrompt from './ExportPrompt';

const PromptLibraryMenu = () => {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  return (
    <div>
      <button
        className='btn btn-neutral'
        onClick={() => setIsModalOpen(true)}
        aria-label={t('promptLibrary') as string}
      >
        {t('promptLibrary')}
      </button>
      {isModalOpen && (
        <PromptLibraryMenuPopUp setIsModalOpen={setIsModalOpen} />
      )}
    </div>
  );
};

const PromptLibraryMenuPopUp = ({
  setIsModalOpen,
}: {
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const { t } = useTranslation();

  const setPrompts = useStore((state) => state.setPrompts);
  const prompts = useStore((state) => state.prompts);

  const [_prompts, _setPrompts] = useState<Prompt[]>(
    prompts.map((p) => ({ ...p }))
  );
  const container = useRef<HTMLDivElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
    e.target.style.maxHeight = `${e.target.scrollHeight}px`;
  };

  const handleSave = () => {
    setPrompts(_prompts);
    setIsModalOpen(false);
  };

  const addPrompt = () => {
    _setPrompts((prev) => [...prev, { id: uuidv4(), name: '', prompt: '' }]);
  };

  const deletePrompt = (index: number) => {
    _setPrompts((prev) => prev.filter((_, i) => i !== index));
  };

  const clearPrompts = () => {
    _setPrompts([]);
  };

  const handleOnFocus = (e: React.FocusEvent<HTMLTextAreaElement, Element>) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
    e.target.style.maxHeight = `${e.target.scrollHeight}px`;
  };

  const handleOnBlur = (e: React.FocusEvent<HTMLTextAreaElement, Element>) => {
    e.target.style.height = 'auto';
    e.target.style.maxHeight = '2.5rem';
  };

  useEffect(() => {
    _setPrompts(prompts);
  }, [prompts]);

  return (
    <PopupModal
      title={t('promptLibrary') as string}
      setIsModalOpen={setIsModalOpen}
      handleConfirm={handleSave}
    >
      <div className='p-6 border-b border-gray-200 dark:border-gray-600 w-[90vw] max-w-full text-sm text-gray-900 dark:text-gray-300'>
        <div className='border px-4 py-2 rounded border-gray-200 dark:border-gray-600'>
          <ImportPrompt />
          <ExportPrompt />
        </div>
        <div className='flex flex-col p-2 max-w-full' ref={container}>
          <div className='flex font-bold border-b border-gray-500/50 mb-1 p-1'>
            <div className='sm:w-1/4 max-sm:flex-1'>{t('name')}</div>
            <div className='flex-1'>{t('prompt')}</div>
          </div>
          {_prompts.map((prompt, index) => (
            <div
              key={prompt.id}
              className='flex items-center border-b border-gray-500/50 mb-1 p-1'
            >
              <div className='sm:w-1/4 max-sm:flex-1'>
                <textarea
                  className='m-0 resize-none rounded-lg bg-transparent overflow-y-hidden leading-7 p-1 focus:ring-1 focus:ring-blue w-full max-h-10 transition-all'
                  onFocus={handleOnFocus}
                  onBlur={handleOnBlur}
                  onChange={(e) => {
                    const val = e.target.value;
                    _setPrompts((prev) =>
                      prev.map((p, i) => (i === index ? { ...p, name: val } : p))
                    );
                  }}
                  onInput={handleInput}
                  value={prompt.name}
                  rows={1}
                ></textarea>
                <select
                  className='text-xs mt-0.5 px-1 py-0.5 rounded bg-transparent border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                  value={prompt.label ?? ''}
                  onChange={(e) => {
                    const val = e.target.value as '' | 'system' | 'user';
                    _setPrompts((prev) =>
                      prev.map((p, i) => (i === index ? { ...p, label: val || undefined } : p))
                    );
                  }}
                >
                  <option value=''>{t('noLabel', '-')}</option>
                  <option value='system'>system</option>
                  <option value='user'>user</option>
                </select>
              </div>
              <div className='flex-1'>
                <textarea
                  className='m-0 resize-none rounded-lg bg-transparent overflow-y-hidden leading-7 p-1 focus:ring-1 focus:ring-blue w-full max-h-10 transition-all'
                  onFocus={handleOnFocus}
                  onBlur={handleOnBlur}
                  onChange={(e) => {
                    const val = e.target.value;
                    _setPrompts((prev) =>
                      prev.map((p, i) => (i === index ? { ...p, prompt: val } : p))
                    );
                  }}
                  onInput={handleInput}
                  value={prompt.prompt}
                  rows={1}
                ></textarea>
              </div>
              <div
                className='cursor-pointer'
                onClick={() => deletePrompt(index)}
              >
                <CrossIcon />
              </div>
            </div>
          ))}
        </div>
        <div className='flex justify-center cursor-pointer' onClick={addPrompt}>
          <PlusIcon />
        </div>
        <div className='flex justify-center mt-2'>
          <div
            className='btn btn-neutral cursor-pointer text-xs'
            onClick={clearPrompts}
          >
            {t('clearPrompts')}
          </div>
        </div>
        <div className='mt-6 px-2'>
          {t('morePrompts')}
          <a
            href='https://github.com/f/awesome-chatgpt-prompts'
            target='_blank'
            className='link'
          >
            awesome-chatgpt-prompts
          </a>
        </div>
      </div>
    </PopupModal>
  );
};

export { PromptLibraryInline };

const PromptLibraryInline = ({ onSettingsChanged }: { onSettingsChanged?: () => void }) => {
  const { t } = useTranslation();

  const setPrompts = useStore((state) => state.setPrompts);
  const prompts = useStore((state) => state.prompts);

  const [_prompts, _setPrompts] = useState<Prompt[]>(
    prompts.map((p) => ({ ...p }))
  );
  const container = useRef<HTMLDivElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
    e.target.style.maxHeight = `${e.target.scrollHeight}px`;
  };

  // Keep refs in sync for unmount save
  const promptsRef = useRef(_prompts);
  promptsRef.current = _prompts;
  const onSettingsChangedRef = useRef(onSettingsChanged);
  onSettingsChangedRef.current = onSettingsChanged;

  // Auto-save on unmount
  useEffect(() => {
    return () => {
      const current = promptsRef.current;
      const stored = useStore.getState().prompts;
      const isDifferent =
        current.length !== stored.length ||
        current.some((p, i) => p.id !== stored[i]?.id || p.name !== stored[i]?.name || p.prompt !== stored[i]?.prompt);
      if (isDifferent) {
        setPrompts(current);
        onSettingsChangedRef.current?.();
      }
    };
  }, []);

  const addPrompt = () => {
    _setPrompts((prev) => [...prev, { id: uuidv4(), name: '', prompt: '' }]);
  };

  const deletePrompt = (index: number) => {
    _setPrompts((prev) => prev.filter((_, i) => i !== index));
  };

  const clearPrompts = () => {
    _setPrompts([]);
  };

  const handleOnFocus = (e: React.FocusEvent<HTMLTextAreaElement, Element>) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
    e.target.style.maxHeight = `${e.target.scrollHeight}px`;
  };

  const handleOnBlur = (e: React.FocusEvent<HTMLTextAreaElement, Element>) => {
    e.target.style.height = 'auto';
    e.target.style.maxHeight = '2.5rem';
  };

  useEffect(() => {
    _setPrompts(prompts);
  }, [prompts]);

  return (
    <div className='text-sm text-gray-900 dark:text-gray-300'>
      <div className='border px-4 py-2 rounded border-gray-200 dark:border-gray-600'>
        <ImportPrompt />
        <ExportPrompt />
      </div>
      <div className='flex flex-col p-2 max-w-full' ref={container}>
        <div className='flex font-bold border-b border-gray-500/50 mb-1 p-1'>
          <div className='sm:w-1/4 max-sm:flex-1'>{t('name')}</div>
          <div className='flex-1'>{t('prompt')}</div>
        </div>
        {_prompts.map((prompt, index) => (
          <div
            key={prompt.id}
            className='flex items-center border-b border-gray-500/50 mb-1 p-1'
          >
            <div className='sm:w-1/4 max-sm:flex-1'>
              <textarea
                className='m-0 resize-none rounded-lg bg-transparent overflow-y-hidden leading-7 p-1 focus:ring-1 focus:ring-blue w-full max-h-10 transition-all'
                onFocus={handleOnFocus}
                onBlur={handleOnBlur}
                onChange={(e) => {
                  const val = e.target.value;
                  _setPrompts((prev) =>
                    prev.map((p, i) => (i === index ? { ...p, name: val } : p))
                  );
                }}
                onInput={handleInput}
                value={prompt.name}
                rows={1}
              ></textarea>
              <select
                className='text-xs mt-0.5 px-1 py-0.5 rounded bg-transparent border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                value={prompt.label ?? ''}
                onChange={(e) => {
                  const val = e.target.value as '' | 'system' | 'user';
                  _setPrompts((prev) =>
                    prev.map((p, i) => (i === index ? { ...p, label: val || undefined } : p))
                  );
                }}
              >
                <option value=''>{t('noLabel', '-')}</option>
                <option value='system'>system</option>
                <option value='user'>user</option>
              </select>
            </div>
            <div className='flex-1'>
              <textarea
                className='m-0 resize-none rounded-lg bg-transparent overflow-y-hidden leading-7 p-1 focus:ring-1 focus:ring-blue w-full max-h-10 transition-all'
                onFocus={handleOnFocus}
                onBlur={handleOnBlur}
                onChange={(e) => {
                  const val = e.target.value;
                  _setPrompts((prev) =>
                    prev.map((p, i) => (i === index ? { ...p, prompt: val } : p))
                  );
                }}
                onInput={handleInput}
                value={prompt.prompt}
                rows={1}
              ></textarea>
            </div>
            <div
              className='cursor-pointer'
              onClick={() => deletePrompt(index)}
            >
              <CrossIcon />
            </div>
          </div>
        ))}
      </div>
      <div className='flex justify-center cursor-pointer' onClick={addPrompt}>
        <PlusIcon />
      </div>
      <div className='flex justify-center gap-3 mt-2'>
        <button
          className='btn btn-neutral cursor-pointer text-xs'
          onClick={clearPrompts}
        >
          {t('clearPrompts')}
        </button>
      </div>
      <div className='mt-6 px-2'>
        {t('morePrompts')}
        <a
          href='https://github.com/f/awesome-chatgpt-prompts'
          target='_blank'
          className='link'
        >
          awesome-chatgpt-prompts
        </a>
      </div>
    </div>
  );
};

/**
 * Picker modal: shows prompt library in read-only mode.
 * User clicks a prompt to insert its text via `onInsert` callback.
 */
export const PromptLibraryPicker = ({
  setIsModalOpen,
  onInsert,
}: {
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onInsert: (text: string) => void;
}) => {
  const { t } = useTranslation();
  const prompts = useStore((state) => state.prompts);

  return (
    <PopupModal
      title={t('promptLibrary') as string}
      setIsModalOpen={setIsModalOpen}
      cancelButton={false}
    >
      <div className='p-4 w-[80vw] max-w-[600px] max-h-[60vh] overflow-y-auto text-sm text-gray-900 dark:text-gray-300'>
        {prompts.length === 0 ? (
          <div className='text-center text-gray-500 dark:text-gray-400 py-4'>
            {t('noPrompts', 'No prompts available')}
          </div>
        ) : (
          <div className='space-y-1'>
            {prompts.map((prompt) => (
              <button
                key={prompt.id}
                type='button'
                className='w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
                onClick={() => {
                  onInsert(prompt.prompt);
                  setIsModalOpen(false);
                }}
              >
                <div className='flex items-center gap-2'>
                  <span className='font-medium truncate'>{prompt.name}</span>
                  {prompt.label && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      prompt.label === 'system'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {prompt.label}
                    </span>
                  )}
                </div>
                <div className='text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5'>
                  {prompt.prompt.slice(0, 120)}{prompt.prompt.length > 120 ? '...' : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </PopupModal>
  );
};

export default PromptLibraryMenu;
