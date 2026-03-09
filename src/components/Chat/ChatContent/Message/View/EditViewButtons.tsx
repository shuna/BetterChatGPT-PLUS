import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { ContentInterface, isImageContent } from '@type/chat';
import { ModelOptions } from '@type/chat';
import type { ProviderId } from '@type/provider';
import { useModelType } from '@utils/modelLookup';
import TokenCount from '@components/TokenCount';
import CommandPrompt from '../CommandPrompt';
import BranchIcon from '@icon/BranchIcon';

const EditViewButtons = memo(
  ({
    sticky = false,
    handleFileChange,
    handleImageDetailChange,
    handleRemoveImage,
    handleGenerate,
    handleGenerateNextOnly,
    handleBranchOnly,
    handleBranchGenerate,
    handleSave,
    setIsModalOpen,
    setIsEdit,
    _setContent,
    _content,
    imageUrl,
    setImageUrl,
    handleImageUrlChange,
    fileInputRef,
    model,
    providerId,
    modelValid,
    messageIndex,
    role,
  }: {
    sticky?: boolean;
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleImageDetailChange: (index: number, e: string) => void;
    handleRemoveImage: (index: number) => void;
    handleGenerate: () => void;
    handleGenerateNextOnly: () => void;
    handleBranchOnly: () => void;
    handleBranchGenerate: () => void;
    handleSave: () => void;
    setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
    _setContent: React.Dispatch<React.SetStateAction<ContentInterface[]>>;
    _content: ContentInterface[];
    imageUrl: string;
    setImageUrl: React.Dispatch<React.SetStateAction<string>>;
    handleImageUrlChange: () => void;
    fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
    model: ModelOptions;
    providerId?: ProviderId;
    modelValid: boolean;
    messageIndex: number;
    role?: string;
  }) => {
    const { t } = useTranslation();
    const generating = useStore((state) => {
      const chatId = state.chats?.[state.currentChatIndex]?.id ?? '';
      return Object.values(state.generatingSessions).some((s) => s.chatId === chatId);
    });
    const noModel = !modelValid;
    const advancedMode = useStore((state) => state.advancedMode);
    const lastMessageIndex = useStore((state) =>
      state.chats?.[state.currentChatIndex]?.messages.length
        ? state.chats[state.currentChatIndex].messages.length - 1
        : 0
    );
    const isImageModel = useModelType(model, providerId) === 'image';
    const isAssistant = role === 'assistant';
    const isNotLast = !sticky && messageIndex < lastMessageIndex;

    return (
      <div>
        {isImageModel && (
          <>
            <div className='flex justify-center'>
              <div className='flex gap-5'>
                {_content.slice(1).filter(isImageContent).map((image, index) => (
                  <div
                    key={index}
                    className='image-container flex flex-col gap-2'
                  >
                    <img
                      src={image.image_url.url}
                      alt={`uploaded-${index}`}
                      className='h-10'
                    />
                    <div className='flex flex-row gap-3'>
                      <select
                        onChange={(event) =>
                          handleImageDetailChange(index, event.target.value)
                        }
                        title='Select image resolution'
                        aria-label='Select image resolution'
                        defaultValue={image.image_url.detail}
                        style={{ color: 'black' }}
                      >
                        <option value='auto'>Auto</option>
                        <option value='high'>High</option>
                        <option value='low'>Low</option>
                      </select>
                      <button
                        className='close-button'
                        onClick={() => handleRemoveImage(index)}
                        aria-label='Remove Image'
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className='flex justify-center mt-4'>
              <input
                type='text'
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={t('enter_image_url_placeholder') as string}
                className='input input-bordered w-full max-w-xs text-gray-800 dark:text-white p-3  border-none bg-gray-200 dark:bg-gray-600 rounded-md m-0 w-full mr-0 h-10 focus:outline-none'
              />
              <button
                className='btn btn-neutral ml-2'
                onClick={handleImageUrlChange}
                aria-label={t('add_image_url') as string}
              >
                {t('add_image_url')}
              </button>
            </div>
            <input
              type='file'
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileChange}
              multiple
            />
          </>
        )}

        <div className='flex'>
          <div className='flex-1 text-center mt-2 flex justify-center'>
            {sticky && (
              <button
                className={`btn relative mr-2 btn-primary ${
                  generating || noModel ? 'cursor-not-allowed opacity-40' : ''
                }`}
                onClick={handleGenerate}
                disabled={noModel}
                aria-label={t('generate') as string}
              >
                <div className='flex items-center justify-center gap-2'>
                  {t('generate')}
                </div>
              </button>
            )}

            {!sticky && !isAssistant && (
              isNotLast ? (
                <>
                  <button
                    className={`btn relative mr-2 btn-primary ${
                      generating || noModel ? 'cursor-not-allowed opacity-40' : ''
                    }`}
                    onClick={handleGenerateNextOnly}
                    disabled={noModel}
                  >
                    <div className='flex items-center justify-center gap-2'>
                      {t('generate')}
                    </div>
                  </button>
                  <button
                    className={`btn relative mr-2 btn-neutral ${
                      noModel ? 'cursor-not-allowed opacity-40' : ''
                    }`}
                    onClick={() => {
                      !generating && !noModel && setIsModalOpen(true);
                    }}
                    disabled={noModel}
                  >
                    <div className='flex items-center justify-center gap-2'>
                      {t('generateBelow')}
                    </div>
                  </button>
                  <button
                    className={`btn relative mr-2 btn-neutral ${
                      generating || noModel ? 'cursor-not-allowed opacity-40' : ''
                    }`}
                    onClick={handleBranchGenerate}
                    disabled={noModel}
                    title={t('branchGenerate') as string}
                  >
                    <div className='flex items-center justify-center gap-2'>
                      <BranchIcon />
                      {t('branchGenerate')}
                    </div>
                  </button>
                  <button
                    className={`btn relative mr-2 btn-neutral ${
                      generating ? 'cursor-not-allowed opacity-40' : ''
                    }`}
                    onClick={handleBranchOnly}
                    title={t('branchOnly') as string}
                  >
                    <div className='flex items-center justify-center gap-2'>
                      <BranchIcon />
                      {t('branchOnly')}
                    </div>
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`btn relative mr-2 btn-primary ${
                      noModel ? 'cursor-not-allowed opacity-40' : ''
                    }`}
                    onClick={() => {
                      !generating && !noModel && setIsModalOpen(true);
                    }}
                    disabled={noModel}
                  >
                    <div className='flex items-center justify-center gap-2'>
                      {t('generate')}
                    </div>
                  </button>
                  <button
                    className={`btn relative mr-2 btn-neutral ${
                      generating || noModel ? 'cursor-not-allowed opacity-40' : ''
                    }`}
                    onClick={handleBranchGenerate}
                    disabled={noModel}
                    title={t('branchGenerate') as string}
                  >
                    <div className='flex items-center justify-center gap-2'>
                      <BranchIcon />
                      {t('branchGenerate')}
                    </div>
                  </button>
                  <button
                    className={`btn relative mr-2 btn-neutral ${
                      generating ? 'cursor-not-allowed opacity-40' : ''
                    }`}
                    onClick={handleBranchOnly}
                    title={t('branchOnly') as string}
                  >
                    <div className='flex items-center justify-center gap-2'>
                      <BranchIcon />
                      {t('branchOnly')}
                    </div>
                  </button>
                </>
              )
            )}

            <button
              className={`btn relative mr-2 ${
                sticky
                  ? `btn-neutral ${
                      generating ? 'cursor-not-allowed opacity-40' : ''
                    }`
                  : 'btn-neutral'
              }`}
              onClick={handleSave}
              aria-label={t('save') as string}
            >
              <div className='flex items-center justify-center gap-2'>
                {t('save')}
              </div>
            </button>

            {sticky || (
              <button
                className='btn relative btn-neutral'
                onClick={() => setIsEdit(false)}
                aria-label={t('cancel') as string}
              >
                <div className='flex items-center justify-center gap-2'>
                  {t('cancel')}
                </div>
              </button>
            )}
          </div>
          {sticky && advancedMode && <TokenCount />}
          <CommandPrompt _setContent={_setContent} />
        </div>
      </div>
    );
  }
);

export default EditViewButtons;
