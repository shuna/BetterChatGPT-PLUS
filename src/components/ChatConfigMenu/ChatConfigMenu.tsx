import React, { useEffect, useRef, useState } from 'react';
import useStore from '@store/store';
import { useTranslation } from 'react-i18next';

import PopupModal from '@components/PopupModal';
import {
  FrequencyPenaltySlider,
  MaxTokenSlider,
  ModelSelector,
  PresencePenaltySlider,
  SystemPromptField,
  TemperatureSlider,
  TopPSlider,
} from '@components/ConfigMenu/ConfigMenu';
import { SettingsGroup } from '@components/SettingsMenu/SettingsMenu';

import {
  _defaultChatConfig,
  _defaultImageDetail,
  _defaultSystemMessage,
} from '@constants/chat';
import { getModelConfigContextInfo } from '@utils/modelLookup';
import { isModelStreamSupported, normalizeConfigStream } from '@utils/streamSupport';
import { clampCompletionTokens } from '@utils/tokenBudget';
import { ModelOptions } from '@type/chat';
import { ImageDetail } from '@type/chat';
import type { ProviderId } from '@type/provider';

const isSameConfig = (left: typeof _defaultChatConfig, right: typeof _defaultChatConfig) =>
  left.model === right.model &&
  left.max_tokens === right.max_tokens &&
  left.temperature === right.temperature &&
  left.top_p === right.top_p &&
  left.presence_penalty === right.presence_penalty &&
  left.frequency_penalty === right.frequency_penalty &&
  (left.stream !== false) === (right.stream !== false) &&
  left.providerId === right.providerId &&
  (left.modelSource ?? undefined) === (right.modelSource ?? undefined) &&
  (left.systemPrompt ?? '') === (right.systemPrompt ?? '');

/** Wrapper that provides consistent cell padding inside SettingsGroup and neutralizes field-internal margins */
const FieldCell = ({ children }: { children: React.ReactNode }) => (
  <div className='px-4 py-3 [&>*:first-child]:mt-0 [&>*:first-child]:pt-0'>
    {children}
  </div>
);

/** Shared field layout used by both ChatConfigPopup and ChatConfigInline */
const ChatConfigFields = ({
  _systemMessage,
  _setSystemMessage,
  _model,
  _setModel,
  _providerId,
  _modelSource,
  _onModelChange,
  _maxToken,
  _setMaxToken,
  _temperature,
  _setTemperature,
  _topP,
  _setTopP,
  _presencePenalty,
  _setPresencePenalty,
  _frequencyPenalty,
  _setFrequencyPenalty,
}: {
  _systemMessage: string;
  _setSystemMessage: React.Dispatch<React.SetStateAction<string>>;
  _model: ModelOptions;
  _setModel: React.Dispatch<React.SetStateAction<ModelOptions>>;
  _providerId?: ProviderId;
  _modelSource?: 'remote' | 'local';
  _onModelChange: (modelId: ModelOptions, providerId: ProviderId | undefined, modelSource?: 'remote' | 'local') => void;
  _maxToken: number;
  _setMaxToken: React.Dispatch<React.SetStateAction<number>>;
  _temperature: number;
  _setTemperature: React.Dispatch<React.SetStateAction<number>>;
  _topP: number;
  _setTopP: React.Dispatch<React.SetStateAction<number>>;
  _presencePenalty: number;
  _setPresencePenalty: React.Dispatch<React.SetStateAction<number>>;
  _frequencyPenalty: number;
  _setFrequencyPenalty: React.Dispatch<React.SetStateAction<number>>;
}) => {
  const { t } = useTranslation('model');

  return (
    <div className='flex flex-col gap-5'>
      <ModelSelector
        _model={_model}
        _setModel={_setModel}
        _providerId={_providerId}
        _modelSource={_modelSource}
        _onModelChange={_onModelChange}
        _label=''
        className=''
      />

      <SystemPromptField
        systemPrompt={_systemMessage}
        setSystemPrompt={_setSystemMessage}
        label={t('section.systemMessage') as string}
      />

      <SettingsGroup label={t('section.defaultGeneration')}>
        <FieldCell>
          <MaxTokenSlider
            _maxToken={_maxToken}
            _setMaxToken={_setMaxToken}
            _model={_model}
            _providerId={_providerId}
            _modelSource={_modelSource}
          />
        </FieldCell>
        <FieldCell>
          <TemperatureSlider
            _temperature={_temperature}
            _setTemperature={_setTemperature}
          />
        </FieldCell>
        <FieldCell>
          <TopPSlider _topP={_topP} _setTopP={_setTopP} />
        </FieldCell>
        <FieldCell>
          <PresencePenaltySlider
            _presencePenalty={_presencePenalty}
            _setPresencePenalty={_setPresencePenalty}
          />
        </FieldCell>
        <FieldCell>
          <FrequencyPenaltySlider
            _frequencyPenalty={_frequencyPenalty}
            _setFrequencyPenalty={_setFrequencyPenalty}
          />
        </FieldCell>
      </SettingsGroup>
    </div>
  );
};

const ChatConfigMenu = () => {
  const { t } = useTranslation('model');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  return (
    <div>
      <button
        className='btn btn-neutral'
        onClick={() => setIsModalOpen(true)}
        aria-label={t('defaultChatConfig') as string}
      >
        {t('defaultChatConfig')}
      </button>
      {isModalOpen && <ChatConfigPopup setIsModalOpen={setIsModalOpen} />}
    </div>
  );
};

const ChatConfigPopup = ({
  setIsModalOpen,
}: {
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const config = useStore.getState().defaultChatConfig;
  const setDefaultChatConfig = useStore((state) => state.setDefaultChatConfig);
  const setDefaultSystemMessage = useStore(
    (state) => state.setDefaultSystemMessage
  );
  const setDefaultImageDetail = useStore(
    (state) => state.setDefaultImageDetail
  );

  const [_systemMessage, _setSystemMessage] = useState<string>(
    useStore.getState().defaultSystemMessage
  );
  const [_model, _setModel] = useState<ModelOptions>(config.model);
  const [_providerId, _setProviderId] = useState<ProviderId | undefined>(config.providerId);
  const [_modelSource, _setModelSource] = useState<'remote' | 'local' | undefined>(config.modelSource);
  const [_maxToken, _setMaxToken] = useState<number>(config.max_tokens);
  const [_temperature, _setTemperature] = useState<number>(config.temperature);
  const [_topP, _setTopP] = useState<number>(config.top_p);
  const [_presencePenalty, _setPresencePenalty] = useState<number>(
    config.presence_penalty
  );
  const [_frequencyPenalty, _setFrequencyPenalty] = useState<number>(
    config.frequency_penalty
  );
  const [_stream, _setStream] = useState<boolean>(config.stream !== false);
  const [_imageDetail, _setImageDetail] = useState<ImageDetail>(
    useStore.getState().defaultImageDetail
  );

  const { t } = useTranslation('model');
  const isStreamSupported = isModelStreamSupported(_model, _providerId, _modelSource);

  React.useEffect(() => {
    if (!isStreamSupported && _stream) {
      _setStream(false);
    }
  }, [isStreamSupported, _stream]);

  const handleSave = () => {
    const modelContextLength = getModelConfigContextInfo(_model, _providerId, _modelSource).contextLength;
    const nextConfig = normalizeConfigStream({
      model: _model,
      max_tokens: clampCompletionTokens(_maxToken, modelContextLength),
      temperature: _temperature,
      top_p: _topP,
      presence_penalty: _presencePenalty,
      frequency_penalty: _frequencyPenalty,
      stream: _stream,
      providerId: _providerId,
      modelSource: _modelSource,
    });

    if (!isSameConfig(config, nextConfig)) {
      setDefaultChatConfig(nextConfig);
    }
    if (useStore.getState().defaultSystemMessage !== _systemMessage) {
      setDefaultSystemMessage(_systemMessage);
    }
    if (useStore.getState().defaultImageDetail !== _imageDetail) {
      setDefaultImageDetail(_imageDetail);
    }
    setIsModalOpen(false);
  };

  const handleReset = () => {
    _setModel(_defaultChatConfig.model);
    _setProviderId(_defaultChatConfig.providerId);
    _setModelSource(undefined);
    _setMaxToken(_defaultChatConfig.max_tokens);
    _setTemperature(_defaultChatConfig.temperature);
    _setTopP(_defaultChatConfig.top_p);
    _setPresencePenalty(_defaultChatConfig.presence_penalty);
    _setFrequencyPenalty(_defaultChatConfig.frequency_penalty);
    _setStream(_defaultChatConfig.stream !== false);
    _setImageDetail(_defaultImageDetail);
    _setSystemMessage(_defaultSystemMessage);
    _setImageDetail(_defaultImageDetail);
  };

  return (
    <PopupModal
      title={t('defaultChatConfig') as string}
      setIsModalOpen={setIsModalOpen}
      handleConfirm={handleSave}
    >
      <div className='p-6 border-b border-gray-200 dark:border-gray-600 w-[90vw] max-w-full text-sm text-gray-900 dark:text-gray-300'>
        <ChatConfigFields
          _systemMessage={_systemMessage}
          _setSystemMessage={_setSystemMessage}
          _model={_model}
          _setModel={_setModel}
          _providerId={_providerId}
          _modelSource={_modelSource}
          _onModelChange={(modelId, providerId, modelSource) => {
            _setModel(modelId);
            _setProviderId(providerId);
            _setModelSource(modelSource);
          }}
          _maxToken={_maxToken}
          _setMaxToken={_setMaxToken}
          _temperature={_temperature}
          _setTemperature={_setTemperature}
          _topP={_topP}
          _setTopP={_setTopP}
          _presencePenalty={_presencePenalty}
          _setPresencePenalty={_setPresencePenalty}
          _frequencyPenalty={_frequencyPenalty}
          _setFrequencyPenalty={_setFrequencyPenalty}
        />
        <div className='flex gap-3 mt-5'>
          <button
            className='btn btn-neutral cursor-pointer'
            onClick={handleReset}
          >
            {t('resetToDefault')}
          </button>
        </div>
      </div>
    </PopupModal>
  );
};

export { ChatConfigInline };

const ChatConfigInline = ({ onSettingsChanged }: { onSettingsChanged?: () => void }) => {
  const config = useStore.getState().defaultChatConfig;
  const setDefaultChatConfig = useStore((state) => state.setDefaultChatConfig);
  const setDefaultSystemMessage = useStore(
    (state) => state.setDefaultSystemMessage
  );
  const setDefaultImageDetail = useStore(
    (state) => state.setDefaultImageDetail
  );

  const [_systemMessage, _setSystemMessage] = useState<string>(
    useStore.getState().defaultSystemMessage
  );
  const [_model, _setModel] = useState<ModelOptions>(config.model);
  const [_providerId, _setProviderId] = useState<ProviderId | undefined>(config.providerId);
  const [_modelSource, _setModelSource] = useState<'remote' | 'local' | undefined>(config.modelSource);
  const [_maxToken, _setMaxToken] = useState<number>(config.max_tokens);
  const [_temperature, _setTemperature] = useState<number>(config.temperature);
  const [_topP, _setTopP] = useState<number>(config.top_p);
  const [_presencePenalty, _setPresencePenalty] = useState<number>(
    config.presence_penalty
  );
  const [_frequencyPenalty, _setFrequencyPenalty] = useState<number>(
    config.frequency_penalty
  );
  const [_stream, _setStream] = useState<boolean>(config.stream !== false);
  const [_imageDetail, _setImageDetail] = useState<ImageDetail>(
    useStore.getState().defaultImageDetail
  );

  const { t } = useTranslation('model');
  const isStreamSupported = isModelStreamSupported(_model, _providerId, _modelSource);

  React.useEffect(() => {
    if (!isStreamSupported && _stream) {
      _setStream(false);
    }
  }, [isStreamSupported, _stream]);

  // Keep refs in sync for unmount save
  const stateRef = useRef({
    _model, _providerId, _modelSource, _maxToken, _temperature, _topP,
    _presencePenalty, _frequencyPenalty, _stream, _systemMessage, _imageDetail,
  });
  stateRef.current = {
    _model, _providerId, _modelSource, _maxToken, _temperature, _topP,
    _presencePenalty, _frequencyPenalty, _stream, _systemMessage, _imageDetail,
  };
  const onSettingsChangedRef = useRef(onSettingsChanged);
  onSettingsChangedRef.current = onSettingsChanged;

  // Auto-save on unmount
  useEffect(() => {
    return () => {
      const s = stateRef.current;
      const currentConfig = useStore.getState().defaultChatConfig;
      const modelContextLength = getModelConfigContextInfo(s._model, s._providerId, s._modelSource).contextLength;
      const nextConfig = normalizeConfigStream({
        model: s._model,
        max_tokens: clampCompletionTokens(s._maxToken, modelContextLength),
        temperature: s._temperature,
        top_p: s._topP,
        presence_penalty: s._presencePenalty,
        frequency_penalty: s._frequencyPenalty,
        stream: s._stream,
        providerId: s._providerId,
        modelSource: s._modelSource,
      });

      let changed = false;
      if (!isSameConfig(currentConfig, nextConfig)) {
        setDefaultChatConfig(nextConfig);
        changed = true;
      }
      if (useStore.getState().defaultSystemMessage !== s._systemMessage) {
        setDefaultSystemMessage(s._systemMessage);
        changed = true;
      }
      if (useStore.getState().defaultImageDetail !== s._imageDetail) {
        setDefaultImageDetail(s._imageDetail);
        changed = true;
      }
      if (changed) {
        onSettingsChangedRef.current?.();
      }
    };
  }, []);

  const handleReset = () => {
    _setModel(_defaultChatConfig.model);
    _setProviderId(_defaultChatConfig.providerId);
    _setModelSource(undefined);
    _setMaxToken(_defaultChatConfig.max_tokens);
    _setTemperature(_defaultChatConfig.temperature);
    _setTopP(_defaultChatConfig.top_p);
    _setPresencePenalty(_defaultChatConfig.presence_penalty);
    _setFrequencyPenalty(_defaultChatConfig.frequency_penalty);
    _setStream(_defaultChatConfig.stream !== false);
    _setImageDetail(_defaultImageDetail);
    _setSystemMessage(_defaultSystemMessage);
  };

  return (
    <div className='text-sm text-gray-900 dark:text-gray-300'>
      <ChatConfigFields
        _systemMessage={_systemMessage}
        _setSystemMessage={_setSystemMessage}
        _model={_model}
        _setModel={_setModel}
        _providerId={_providerId}
        _modelSource={_modelSource}
        _onModelChange={(modelId, providerId, modelSource) => {
          _setModel(modelId);
          _setProviderId(providerId);
          _setModelSource(modelSource);
        }}
        _maxToken={_maxToken}
        _setMaxToken={_setMaxToken}
        _temperature={_temperature}
        _setTemperature={_setTemperature}
        _topP={_topP}
        _setTopP={_setTopP}
        _presencePenalty={_presencePenalty}
        _setPresencePenalty={_setPresencePenalty}
        _frequencyPenalty={_frequencyPenalty}
        _setFrequencyPenalty={_setFrequencyPenalty}
      />
      <div className='flex gap-3 mt-5'>
        <button
          className='btn btn-neutral cursor-pointer'
          onClick={handleReset}
        >
          {t('resetToDefault')}
        </button>
      </div>
    </div>
  );
};

export default ChatConfigMenu;
