import React from 'react';
import { useTranslation } from 'react-i18next';
import { ContentInterface, TextContentInterface } from '@type/chat';
import { useModelType } from '@utils/modelLookup';
import PopupModal from '@components/PopupModal';
import AttachmentIcon from '@icon/AttachmentIcon';
import EditViewButtons from './EditViewButtons';
import { useEditViewLogic } from './useEditViewLogic';

const EditView = ({
  role,
  content,
  setIsEdit,
  messageIndex,
  nodeId,
  sticky,
}: {
  role?: string;
  content: ContentInterface[];
  setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
  messageIndex: number;
  nodeId?: string;
  sticky?: boolean;
}) => {
  const { t } = useTranslation();
  const logic = useEditViewLogic({ content, setIsEdit, messageIndex, nodeId, sticky });
  const isImageModel = useModelType(logic.model, logic.providerId) === 'image';

  return (
    <div className='relative'>
      <div
        className={`w-full  ${
          sticky
            ? 'py-2 md:py-3 px-2 md:px-4 border border-black/10 bg-white dark:border-gray-900/50 dark:text-white dark:bg-gray-700 rounded-md shadow-[0_0_10px_rgba(0,0,0,0.10)] dark:shadow-[0_0_15px_rgba(0,0,0,0.10)]'
            : ''
        }`}
      >
        <div className='relative flex items-start'>
          {isImageModel && (
            <button
              className='absolute left-0 bottom-0 btn btn-secondary h-10 ml-[-1.2rem] mb-[-0.4rem]'
              onClick={logic.handleUploadButtonClick}
              aria-label='Upload Images'
            >
              <div className='flex items-center justify-center gap-2'>
                <AttachmentIcon />
              </div>
            </button>
          )}
          <textarea
            ref={logic.textareaRef}
            className={`m-0 resize-none rounded-lg bg-transparent overflow-y-hidden focus:ring-0 focus-visible:ring-0 leading-7 w-full placeholder:text-gray-500/40 pr-10 ${
              isImageModel ? 'pl-7' : ''
            }`}
            onChange={(e) => {
              logic._setContent((prev) => [
                { type: 'text', text: e.target.value },
                ...prev.slice(1),
              ]);
            }}
            value={(logic._content[0] as TextContentInterface).text}
            placeholder={t('submitPlaceholder') as string}
            onKeyDown={logic.handleKeyDown}
            onPaste={logic.handlePaste}
            rows={1}
          />
        </div>
      </div>
      <EditViewButtons
        sticky={sticky}
        handleFileChange={logic.handleFileChange}
        handleImageDetailChange={logic.handleImageDetailChange}
        handleRemoveImage={logic.handleRemoveImage}
        handleGenerate={logic.handleGenerate}
        handleGenerateNextOnly={logic.handleGenerateNextOnly}
        handleBranchOnly={logic.handleBranchOnly}
        handleBranchGenerate={logic.handleBranchGenerate}
        handleSave={logic.handleSave}
        setIsModalOpen={logic.setIsModalOpen}
        setIsEdit={setIsEdit}
        _setContent={logic._setContent}
        _content={logic._content}
        imageUrl={logic.imageUrl}
        setImageUrl={logic.setImageUrl}
        handleImageUrlChange={logic.handleImageUrlChange}
        fileInputRef={logic.fileInputRef}
        model={logic.model}
        providerId={logic.providerId}
        modelValid={logic.modelValid}
        messageIndex={messageIndex}
        isGeneratingMessage={logic.isGeneratingMessage}
        role={role}
      />
      {logic.isModalOpen && (
        <PopupModal
          setIsModalOpen={logic.setIsModalOpen}
          title={t('warning') as string}
          message={t('clearMessageWarning') as string}
          handleConfirm={logic.handleGenerate}
        />
      )}
    </div>
  );
};

export default EditView;
