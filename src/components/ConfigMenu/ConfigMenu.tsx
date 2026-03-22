import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PopupModal from '@components/PopupModal';
import { ConfigInterface, ImageDetail, ReasoningEffort } from '@type/chat';
import { getModelContextInfo, useModelSupportsReasoning, useModelCapabilities } from '@utils/modelLookup';
import { ModelOptions } from '@type/chat';
import { isModelStreamSupported, normalizeConfigStream } from '@utils/streamSupport';
import { clampCompletionTokens, getMaxCompletionTokensForContext } from '@utils/tokenBudget';
import { _defaultChatConfig } from '@constants/chat';
import useStore from '@store/store';
import { ProviderId } from '@type/provider';
import {
  CapabilityBadges,
  DarkSelectField,
  FieldLabel,
  FieldLabelWithInfo,
  InfoTooltip,
  RangeField,
  ResetButton,
  SegmentedControl,
} from './fields';

const DEFAULT_REASONING_BUDGET = 8192;
const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'medium';

const ConfigMenu = ({
  setIsModalOpen,
  config,
  setConfig,
  imageDetail,
  setImageDetail,
}: {
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  config: ConfigInterface;
  setConfig: (config: ConfigInterface) => void;
  imageDetail: ImageDetail;
  setImageDetail: (imageDetail: ImageDetail) => void;
}) => {
  const [_maxToken, _setMaxToken] = useState<number>(config.max_tokens);
  const [_model, _setModel] = useState<ModelOptions>(config.model);
  const [_providerId, _setProviderId] = useState<ProviderId | undefined>(config.providerId);
  const [_temperature, _setTemperature] = useState<number>(config.temperature);
  const [_presencePenalty, _setPresencePenalty] = useState<number>(
    config.presence_penalty
  );
  const [_topP, _setTopP] = useState<number>(config.top_p);
  const [_frequencyPenalty, _setFrequencyPenalty] = useState<number>(
    config.frequency_penalty
  );
  const [_imageDetail, _setImageDetail] = useState<ImageDetail>(imageDetail);
  const [_stream, _setStream] = useState<boolean>(config.stream !== false);
  const [_reasoningEffort, _setReasoningEffort] = useState<ReasoningEffort | undefined>(config.reasoning_effort ?? DEFAULT_REASONING_EFFORT);
  const [_reasoningBudget, _setReasoningBudget] = useState<number>(config.reasoning_budget_tokens ?? DEFAULT_REASONING_BUDGET);
  const { t } = useTranslation('model');
  const isStreamSupported = isModelStreamSupported(_model, _providerId);
  const reasoningSupported = useModelSupportsReasoning(_model, _providerId);
  const capabilities = useModelCapabilities(_model, _providerId);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!isStreamSupported && _stream) {
      _setStream(false);
    }
  }, [isStreamSupported, _stream]);

  // Auto-save on every change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const modelContextLength = getModelContextInfo(_model, _providerId).contextLength;
    setConfig(normalizeConfigStream({
      max_tokens: clampCompletionTokens(_maxToken, modelContextLength),
      model: _model,
      temperature: _temperature,
      presence_penalty: _presencePenalty,
      top_p: _topP,
      frequency_penalty: _frequencyPenalty,
      stream: _stream,
      providerId: _providerId,
      reasoning_effort: reasoningSupported ? _reasoningEffort : undefined,
      reasoning_budget_tokens: reasoningSupported && _reasoningBudget >= 1024 ? _reasoningBudget : undefined,
    }));
    setImageDetail(_imageDetail);
  }, [_maxToken, _model, _providerId, _temperature, _presencePenalty, _topP, _frequencyPenalty, _imageDetail, _stream, _reasoningEffort, _reasoningBudget]);

  return (
    <PopupModal
      title={t('configuration') as string}
      setIsModalOpen={setIsModalOpen}
      cancelButton={false}
    >
      <div className='flex flex-col'>
      <div className='px-6 pt-4 pb-3 border-b border-gray-200 dark:border-gray-600 sticky top-0 bg-gray-50 dark:bg-gray-700 z-10'>
        <ModelSelector
          _model={_model}
          _setModel={_setModel}
          _providerId={_providerId}
          _onModelChange={(modelId, providerId) => {
            _setModel(modelId);
            _setProviderId(providerId);
          }}
          _label={t('model')}
        />
        <CapabilityBadges
          reasoning={capabilities.reasoning}
          vision={capabilities.vision}
          audio={capabilities.audio}
          labels={{
            reasoning: t('capabilities.reasoning'),
            vision: t('capabilities.vision'),
            audio: t('capabilities.audio'),
          }}
        />
      </div>
      <div className='px-6 py-4'>
        <MaxTokenSlider
          _maxToken={_maxToken}
          _setMaxToken={_setMaxToken}
          _model={_model}
          _providerId={_providerId}
        />
        <TemperatureSlider
          _temperature={_temperature}
          _setTemperature={_setTemperature}
        />
        <TopPSlider _topP={_topP} _setTopP={_setTopP} />
        <PresencePenaltySlider
          _presencePenalty={_presencePenalty}
          _setPresencePenalty={_setPresencePenalty}
        />
        <FrequencyPenaltySlider
          _frequencyPenalty={_frequencyPenalty}
          _setFrequencyPenalty={_setFrequencyPenalty}
        />
        {reasoningSupported && (
          <div className='mt-3 pt-3 border-t border-gray-200 dark:border-gray-600'>
            <ReasoningEffortSelector
              _reasoningEffort={_reasoningEffort}
              _setReasoningEffort={_setReasoningEffort}
            />
            <ReasoningBudgetInput
              _reasoningBudget={_reasoningBudget}
              _setReasoningBudget={_setReasoningBudget}
            />
          </div>
        )}
        <div className='mt-3 pt-3 border-t border-gray-200 dark:border-gray-600'>
          <ImageDetailSelector
            _imageDetail={_imageDetail}
            _setImageDetail={_setImageDetail}
          />
          <StreamToggle
            _stream={_stream}
            _setStream={_setStream}
            disabled={!isStreamSupported}
          />
        </div>
      </div>
      </div>
    </PopupModal>
  );
};

export const ModelSelector = ({
  _model,
  _setModel,
  _providerId,
  _onModelChange,
  _label,
}: {
  _model: ModelOptions;
  _setModel: React.Dispatch<React.SetStateAction<ModelOptions>>;
  _providerId?: ProviderId;
  _onModelChange?: (modelId: ModelOptions, providerId: ProviderId | undefined) => void;
  _label: string;
}) => {
  const { t } = useTranslation(['main', 'model']);
  const favoriteModels = useStore((state) => state.favoriteModels) || [];
  const providers = useStore((state) => state.providers) || {};

  // Use composite key "modelId:::providerId" to disambiguate same modelId across providers
  const modelOptionsFormatted = favoriteModels.map((fav) => ({
    value: `${fav.modelId}:::${fav.providerId}`,
    label: `${fav.modelId} (${providers[fav.providerId]?.name || fav.providerId})`,
  }));

  // Find the current composite value using providerId for exact match
  const currentFav = _providerId
    ? favoriteModels.find((f) => f.modelId === _model && f.providerId === _providerId)
    : favoriteModels.find((f) => f.modelId === _model);
  const currentComposite = currentFav
    ? `${currentFav.modelId}:::${currentFav.providerId}`
    : _model;

  return (
    <DarkSelectField
      label={_label}
      value={currentComposite}
      options={modelOptionsFormatted}
      onChange={(value) => {
        if (!value) return;
        const [modelId, providerId] = (value as string).split(':::');
        if (_onModelChange) {
          _onModelChange(modelId as ModelOptions, providerId as ProviderId);
        } else {
          _setModel(modelId as ModelOptions);
        }
      }}
      placeholder={t('model:provider.noModelSelected', 'No model selected') as string}
      isClearable
      className='mb-4'
    />
  );
};

export const MaxTokenSlider = ({
  _maxToken,
  _setMaxToken,
  _model,
  _providerId,
}: {
  _maxToken: number;
  _setMaxToken: React.Dispatch<React.SetStateAction<number>>;
  _model: ModelOptions;
  _providerId?: ProviderId;
}) => {
  const { t } = useTranslation('model');
  const favoriteModels = useStore((state) => state.favoriteModels) || [];

  const getMaxForModel = (): number => {
    const lookupMax = getModelContextInfo(_model, _providerId).contextLength;
    if (lookupMax > 0) return lookupMax;
    const fav = _providerId
      ? favoriteModels.find((f) => f.modelId === _model && f.providerId === _providerId)
      : favoriteModels.find((f) => f.modelId === _model);
    if (fav?.contextLength) return fav.contextLength;
    return getModelContextInfo(_model, _providerId).contextLength;
  };

  const maxForModel = getMaxForModel();
  const maxCompletionForModel = getMaxCompletionTokensForContext(maxForModel);

  useEffect(() => {
    if (_maxToken > maxCompletionForModel) {
      _setMaxToken(maxCompletionForModel);
    }
  }, [_maxToken, _setMaxToken, maxCompletionForModel]);

  return (
    <RangeField
      label={t('token.label') as string}
      value={_maxToken}
      onChange={_setMaxToken}
      min={0}
      max={maxCompletionForModel}
      step={1}
      description={t('token.description')}
      defaultValue={_defaultChatConfig.max_tokens}
    />
  );
};

export const TemperatureSlider = ({
  _temperature,
  _setTemperature,
}: {
  _temperature: number;
  _setTemperature: React.Dispatch<React.SetStateAction<number>>;
}) => {
  const { t } = useTranslation('model');

  return (
    <RangeField
      label={t('temperature.label') as string}
      value={_temperature}
      onChange={_setTemperature}
      min={0}
      max={2}
      step={0.1}
      description={t('temperature.description')}
      defaultValue={_defaultChatConfig.temperature}
    />
  );
};

export const TopPSlider = ({
  _topP,
  _setTopP,
}: {
  _topP: number;
  _setTopP: React.Dispatch<React.SetStateAction<number>>;
}) => {
  const { t } = useTranslation('model');

  return (
    <RangeField
      label={t('topP.label') as string}
      value={_topP}
      onChange={_setTopP}
      min={0}
      max={1}
      step={0.05}
      description={t('topP.description')}
      defaultValue={_defaultChatConfig.top_p}
    />
  );
};

export const PresencePenaltySlider = ({
  _presencePenalty,
  _setPresencePenalty,
}: {
  _presencePenalty: number;
  _setPresencePenalty: React.Dispatch<React.SetStateAction<number>>;
}) => {
  const { t } = useTranslation('model');

  return (
    <RangeField
      label={t('presencePenalty.label') as string}
      value={_presencePenalty}
      onChange={_setPresencePenalty}
      min={-2}
      max={2}
      step={0.1}
      description={t('presencePenalty.description')}
      defaultValue={_defaultChatConfig.presence_penalty}
    />
  );
};

export const FrequencyPenaltySlider = ({
  _frequencyPenalty,
  _setFrequencyPenalty,
}: {
  _frequencyPenalty: number;
  _setFrequencyPenalty: React.Dispatch<React.SetStateAction<number>>;
}) => {
  const { t } = useTranslation('model');

  return (
    <RangeField
      label={t('frequencyPenalty.label') as string}
      value={_frequencyPenalty}
      onChange={_setFrequencyPenalty}
      min={-2}
      max={2}
      step={0.1}
      description={t('frequencyPenalty.description')}
      defaultValue={_defaultChatConfig.frequency_penalty}
    />
  );
};

export const StreamToggle = ({
  _stream,
  _setStream,
  disabled = false,
}: {
  _stream: boolean;
  _setStream: React.Dispatch<React.SetStateAction<boolean>>;
  disabled?: boolean;
}) => {
  const { t } = useTranslation('model');

  return (
    <div className='mt-3 flex items-center justify-between'>
      <div className='flex items-center'>
        <span
          className={`text-sm font-medium ${
            disabled
              ? 'text-gray-400 dark:text-gray-500'
              : 'text-gray-900 dark:text-white'
          }`}
        >
          {t('stream.label')}
        </span>
        <InfoTooltip
          text={
            disabled
              ? t('stream.unsupportedDescription', 'This model does not support streaming.')
              : t('stream.description')
          }
        />
      </div>
      <button
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          disabled
            ? 'cursor-not-allowed bg-gray-300 dark:bg-gray-700 opacity-60'
            : _stream
              ? 'bg-blue-600'
              : 'bg-gray-400 dark:bg-gray-600'
        }`}
        onClick={() => {
          if (!disabled) {
            _setStream(!_stream);
          }
        }}
        type='button'
        role='switch'
        aria-checked={!disabled && _stream}
        aria-disabled={disabled}
        disabled={disabled}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            !disabled && _stream ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

export const ImageDetailSelector = ({
  _imageDetail,
  _setImageDetail,
}: {
  _imageDetail: ImageDetail;
  _setImageDetail: React.Dispatch<React.SetStateAction<ImageDetail>>;
}) => {
  const { t } = useTranslation('model');
  const defaultImageDetail: ImageDetail = 'auto';

  const options: { value: ImageDetail; label: string }[] = [
    { value: 'low', label: t('imageDetail.low') },
    { value: 'high', label: t('imageDetail.high') },
    { value: 'auto', label: t('imageDetail.auto') },
  ];

  return (
    <div className='mt-3'>
      <FieldLabelWithInfo
        onReset={() => _setImageDetail(defaultImageDetail)}
        showReset={_imageDetail !== defaultImageDetail}
      >
        {t('imageDetail.label')}
      </FieldLabelWithInfo>
      <SegmentedControl
        options={options}
        value={_imageDetail}
        onChange={(value) => _setImageDetail(value as ImageDetail)}
      />
    </div>
  );
};

export const ReasoningEffortSelector = ({
  _reasoningEffort,
  _setReasoningEffort,
}: {
  _reasoningEffort: ReasoningEffort | undefined;
  _setReasoningEffort: React.Dispatch<React.SetStateAction<ReasoningEffort | undefined>>;
}) => {
  const { t } = useTranslation('model');

  const options: { value: ReasoningEffort; label: string }[] = [
    { value: 'low', label: t('reasoningEffort.low') },
    { value: 'medium', label: t('reasoningEffort.medium') },
    { value: 'high', label: t('reasoningEffort.high') },
  ];

  return (
    <div className='mt-3'>
      <FieldLabelWithInfo
        description={t('reasoningEffort.description')}
        onReset={() => _setReasoningEffort(DEFAULT_REASONING_EFFORT)}
        showReset={_reasoningEffort !== DEFAULT_REASONING_EFFORT}
      >
        {t('reasoningEffort.label')}
      </FieldLabelWithInfo>
      <SegmentedControl
        options={options}
        value={_reasoningEffort}
        onChange={(value) => _setReasoningEffort(value as ReasoningEffort)}
      />
    </div>
  );
};

export const ReasoningBudgetInput = ({
  _reasoningBudget,
  _setReasoningBudget,
}: {
  _reasoningBudget: number;
  _setReasoningBudget: React.Dispatch<React.SetStateAction<number>>;
}) => {
  const { t } = useTranslation('model');

  return (
    <RangeField
      label={t('reasoningBudget.label') as string}
      value={_reasoningBudget}
      onChange={_setReasoningBudget}
      min={1024}
      max={65536}
      step={1024}
      description={t('reasoningBudget.description')}
      defaultValue={DEFAULT_REASONING_BUDGET}
    />
  );
};

export default ConfigMenu;
