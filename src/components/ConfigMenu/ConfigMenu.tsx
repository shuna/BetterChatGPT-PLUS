import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PopupModal from '@components/PopupModal';
import { PromptLibraryPicker } from '@components/PromptLibraryMenu/PromptLibraryMenu';
import { SettingsGroup } from '@components/SettingsMenu/SettingsMenu';
import { ConfigInterface, ImageDetail, ReasoningEffort, Verbosity } from '@type/chat';
import {
  getModelConfigContextInfo,
  useModelSupportsReasoning,
  useModelCapabilities,
} from '@utils/modelLookup';
import { ModelOptions } from '@type/chat';
import { isModelStreamSupported, normalizeConfigStream } from '@utils/streamSupport';
import { clampCompletionTokens, getMaxCompletionTokensForContext } from '@utils/tokenBudget';
import { _defaultChatConfig } from '@constants/chat';
import useStore from '@store/store';
import { CURATED_MODELS } from '@src/local-llm/catalog';
import { localModelRuntime } from '@src/local-llm/runtime';
import { OpfsFileProvider } from '@src/local-llm/storage';
import { ProviderId } from '@type/provider';
import { ProviderIcon, LocalChipIcon } from '@icon/ProviderIcons';
import {
  isOpenRouterAdaptiveReasoningModel,
  isOpenRouterClaudeVerbosityModel,
  supportsMaxVerbosity,
} from '@utils/reasoning';
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

const DEFAULT_REASONING_BUDGET = 0;
const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'medium';
const DEFAULT_VERBOSITY: Verbosity = 'medium';

export const SystemPromptField = ({
  systemPrompt,
  setSystemPrompt,
  label,
}: {
  systemPrompt: string;
  setSystemPrompt: React.Dispatch<React.SetStateAction<string>>;
  label?: string;
}) => {
  const { t } = useTranslation('model');
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  return (
    <div>
      <div className='flex items-center justify-between'>
        <FieldLabel>{label ?? t('chatSystemPrompt', 'System Prompt')}</FieldLabel>
        <button
          type='button'
          className='text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors'
          onClick={() => setIsPickerOpen(true)}
        >
          {t('insertFromLibrary', 'Insert from library')}
        </button>
      </div>
      <textarea
        className='w-full mt-1 px-2 py-1.5 text-sm rounded-lg bg-transparent border border-gray-400/50 focus:ring-1 focus:ring-blue resize-y min-h-[2.5rem] max-h-[12rem] leading-6 text-gray-900 dark:text-gray-100'
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        placeholder={t('systemPromptPlaceholder', 'Enter system prompt for this chat...') as string}
        rows={2}
      />
      {isPickerOpen && (
        <PromptLibraryPicker
          setIsModalOpen={setIsPickerOpen}
          onInsert={(text) => {
            setSystemPrompt((prev) => prev ? prev + '\n\n' + text : text);
          }}
        />
      )}
    </div>
  );
};

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
  const [_modelSource, _setModelSource] = useState<'remote' | 'local' | undefined>(config.modelSource);
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
  const [_verbosity, _setVerbosity] = useState<Verbosity | undefined>(config.verbosity ?? DEFAULT_VERBOSITY);
  const [_systemPrompt, _setSystemPrompt] = useState<string>(config.systemPrompt ?? '');
  const { t } = useTranslation('model');
  const isStreamSupported = isModelStreamSupported(_model, _providerId, _modelSource);
  const reasoningSupported = useModelSupportsReasoning(_model, _providerId);
  const capabilities = useModelCapabilities(_model, _providerId);
  const verbositySupported = isOpenRouterClaudeVerbosityModel(_model, _providerId);
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
    const modelContextLength = getModelConfigContextInfo(_model, _providerId, _modelSource).contextLength;
    setConfig(normalizeConfigStream({
      max_tokens: clampCompletionTokens(_maxToken, modelContextLength),
      model: _model,
      temperature: _temperature,
      presence_penalty: _presencePenalty,
      top_p: _topP,
      frequency_penalty: _frequencyPenalty,
      stream: _stream,
      providerId: _providerId,
      modelSource: _modelSource,
      reasoning_effort: reasoningSupported ? _reasoningEffort : undefined,
      reasoning_budget_tokens: reasoningSupported && _reasoningBudget >= 1024 ? _reasoningBudget : undefined,
      verbosity: verbositySupported ? _verbosity : undefined,
      systemPrompt: _systemPrompt || undefined,
    }));
    setImageDetail(_imageDetail);
  }, [_maxToken, _model, _providerId, _modelSource, _temperature, _presencePenalty, _topP, _frequencyPenalty, _imageDetail, _stream, _reasoningEffort, _reasoningBudget, _verbosity, _systemPrompt]);

  const FieldCell = ({ children }: { children: React.ReactNode }) => (
    <div className='px-4 py-3 [&>*:first-child]:mt-0 [&>*:first-child]:pt-0'>
      {children}
    </div>
  );

  return (
    <PopupModal
      title={t('configuration') as string}
      setIsModalOpen={setIsModalOpen}
      cancelButton={false}
      maxWidth='max-w-4xl'
    >
      <div className='p-6 flex flex-col gap-5 w-[90vw] max-w-4xl'>
        <div>
          <ModelSelector
            _model={_model}
            _setModel={_setModel}
            _providerId={_providerId}
            _modelSource={_modelSource}
            _onModelChange={(modelId, providerId, modelSource) => {
              _setModel(modelId);
              _setProviderId(providerId);
              _setModelSource(modelSource);
            }}
            _label={t('model')}
            className=''
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

        <SystemPromptField
          systemPrompt={_systemPrompt}
          setSystemPrompt={_setSystemPrompt}
        />

        <SettingsGroup label={t('section.generation')}>
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

        {reasoningSupported && (
          <SettingsGroup label={t('section.reasoning')}>
            <FieldCell>
              <ReasoningEffortSelector
                _reasoningEffort={_reasoningEffort}
                _setReasoningEffort={_setReasoningEffort}
                _model={_model}
                _providerId={_providerId}
              />
            </FieldCell>
            <FieldCell>
              <ReasoningBudgetInput
                _reasoningBudget={_reasoningBudget}
                _setReasoningBudget={_setReasoningBudget}
              />
            </FieldCell>
            {verbositySupported && (
              <FieldCell>
                <VerbositySelector
                  _verbosity={_verbosity}
                  _setVerbosity={_setVerbosity}
                  _model={_model}
                  _providerId={_providerId}
                />
              </FieldCell>
            )}
          </SettingsGroup>
        )}
      </div>
    </PopupModal>
  );
};

export const ModelSelector = ({
  _model,
  _setModel,
  _providerId,
  _modelSource,
  _onModelChange,
  _label,
  className,
}: {
  _model: ModelOptions;
  _setModel: React.Dispatch<React.SetStateAction<ModelOptions>>;
  _providerId?: ProviderId;
  _modelSource?: 'remote' | 'local';
  _onModelChange?: (modelId: ModelOptions, providerId: ProviderId | undefined, modelSource?: 'remote' | 'local') => void;
  _label: string;
  className?: string;
}) => {
  const { t } = useTranslation(['main', 'model']);
  const favoriteModels = useStore((state) => state.favoriteModels) || [];
  const providers = useStore((state) => state.providers) || {};
  const localModels = useStore((state) => state.localModels) || [];
  const favoriteLocalIds = useStore((state) => state.favoriteLocalModelIds) || [];
  const savedMeta = useStore((state) => state.savedModelMeta) || {};

  // Remote model options (composite key: "modelId:::providerId")
  const remoteOptions = favoriteModels.map((fav) => ({
    value: `${fav.modelId}:::${fav.providerId}`,
    label: fav.modelId,
    sublabel: providers[fav.providerId]?.name || fav.providerId,
    icon: <ProviderIcon providerId={fav.providerId} className='w-4 h-4' />,
  }));

  // Local model options (composite key: "local:::modelId")
  // Include both store-registered models and curated catalog models that are saved & favorited
  // When a lowbit-Q converted version exists, show it instead of the original
  const lowbitQByOrigin = new Map<string, typeof localModels[number]>();
  for (const m of localModels) {
    if ((m.displayMeta?.quantization === 'lowbit-q' || m.displayMeta?.quantization === 'onebit') && savedMeta[m.id]?.storageState === 'saved') {
      lowbitQByOrigin.set(m.origin, m);
    }
  }

  const localIcon = <LocalChipIcon className='w-4 h-4' />;
  const localOptionMap = new Map<string, { value: string; label: string; sublabel?: string; icon?: React.ReactNode }>();
  for (const m of localModels) {
    if (favoriteLocalIds.includes(m.id) && savedMeta[m.id]?.storageState === 'saved') {
      const ob = lowbitQByOrigin.get(m.id);
      if (ob && ob.id !== m.id) {
        localOptionMap.set(ob.id, {
          value: `local:::${ob.id}`,
          label: ob.label,
          sublabel: `Local${ob.displayMeta?.quantization ? ' · ' + ob.displayMeta.quantization : ''}`,
          icon: localIcon,
        });
      } else {
        localOptionMap.set(m.id, {
          value: `local:::${m.id}`,
          label: m.label,
          sublabel: `Local${m.displayMeta?.quantization ? ' · ' + m.displayMeta.quantization : ''}`,
          icon: localIcon,
        });
      }
    }
  }
  for (const cm of CURATED_MODELS) {
    if (!localOptionMap.has(cm.id) && favoriteLocalIds.includes(cm.id) && savedMeta[cm.id]?.storageState === 'saved') {
      const ob = lowbitQByOrigin.get(cm.id);
      if (ob && !localOptionMap.has(ob.id)) {
        localOptionMap.set(ob.id, {
          value: `local:::${ob.id}`,
          label: ob.label,
          sublabel: `Local${ob.displayMeta?.quantization ? ' · ' + ob.displayMeta.quantization : ''}`,
          icon: localIcon,
        });
      } else {
        localOptionMap.set(cm.id, {
          value: `local:::${cm.id}`,
          label: cm.label,
          sublabel: 'Local',
          icon: localIcon,
        });
      }
    }
  }
  const localOptions = Array.from(localOptionMap.values());

  const allOptions = [
    ...remoteOptions,
    ...localOptions,
  ];

  // Find the current composite value
  let currentComposite: string;
  if (_modelSource === 'local') {
    currentComposite = `local:::${_model}`;
  } else {
    const currentFav = _providerId
      ? favoriteModels.find((f) => f.modelId === _model && f.providerId === _providerId)
      : favoriteModels.find((f) => f.modelId === _model);
    currentComposite = currentFav
      ? `${currentFav.modelId}:::${currentFav.providerId}`
      : _model;
  }

  return (
    <DarkSelectField
      label={_label}
      value={currentComposite}
      options={allOptions}
      onChange={(value) => {
        if (!value) return;
        const raw = value as string;
        if (raw.startsWith('local:::')) {
          const localModelId = raw.slice('local:::'.length);
          if (_onModelChange) {
            _onModelChange(localModelId as ModelOptions, undefined, 'local');
          } else {
            _setModel(localModelId as ModelOptions);
          }
          // Auto-load if not already loaded
          if (!localModelRuntime.isLoaded(localModelId)) {
            const catalogModel = CURATED_MODELS.find((cm) => cm.id === localModelId);
            const storeDef = localModels.find((m) => m.id === localModelId);
            if (catalogModel) {
              const provider = new OpfsFileProvider(catalogModel.id, catalogModel.manifest);
              localModelRuntime.loadModel(
                {
                  id: catalogModel.id,
                  engine: catalogModel.engine,
                  tasks: catalogModel.tasks,
                  label: catalogModel.label,
                  origin: catalogModel.huggingFaceRepo,
                  source: 'opfs',
                  manifest: catalogModel.manifest,
                },
                provider,
              ).catch(() => {});
            } else if (storeDef?.source === 'opfs' && storeDef.manifest) {
              const provider = new OpfsFileProvider(storeDef.id, storeDef.manifest);
              localModelRuntime.loadModel(storeDef, provider).catch(() => {});
            }
          }
        } else {
          const [modelId, providerId] = raw.split(':::');
          if (_onModelChange) {
            _onModelChange(modelId as ModelOptions, providerId as ProviderId, undefined);
          } else {
            _setModel(modelId as ModelOptions);
          }
        }
      }}
      placeholder={t('model:provider.noModelSelected', 'No model selected') as string}
      isClearable
      className={className ?? 'mb-4'}
    />
  );
};

export const MaxTokenSlider = ({
  _maxToken,
  _setMaxToken,
  _model,
  _providerId,
  _modelSource,
}: {
  _maxToken: number;
  _setMaxToken: React.Dispatch<React.SetStateAction<number>>;
  _model: ModelOptions;
  _providerId?: ProviderId;
  _modelSource?: 'remote' | 'local';
}) => {
  const { t } = useTranslation('model');
  const favoriteModels = useStore((state) => state.favoriteModels) || [];

  const getMaxForModel = (): number => {
    const lookupMax = getModelConfigContextInfo(_model, _providerId, _modelSource).contextLength;
    if (lookupMax > 0) return lookupMax;
    const fav = _providerId
      ? favoriteModels.find((f) => f.modelId === _model && f.providerId === _providerId)
      : favoriteModels.find((f) => f.modelId === _model);
    if (fav?.contextLength) return fav.contextLength;
    return getModelConfigContextInfo(_model, _providerId, _modelSource).contextLength;
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
  _model,
  _providerId,
}: {
  _reasoningEffort: ReasoningEffort | undefined;
  _setReasoningEffort: React.Dispatch<React.SetStateAction<ReasoningEffort | undefined>>;
  _model: ModelOptions;
  _providerId?: ProviderId;
}) => {
  const { t } = useTranslation('model');

  const isOpenRouter = _providerId === 'openrouter';
  const usesAdaptiveReasoning = isOpenRouterAdaptiveReasoningModel(_model, _providerId);

  const options: { value: ReasoningEffort; label: string }[] = isOpenRouter
    ? [
        { value: 'none', label: t('reasoningEffort.none') },
        { value: 'minimal', label: t('reasoningEffort.minimal') },
        { value: 'low', label: t('reasoningEffort.low') },
        { value: 'medium', label: t('reasoningEffort.medium') },
        { value: 'high', label: t('reasoningEffort.high') },
        { value: 'xhigh', label: t('reasoningEffort.xhigh') },
      ]
    : [
        { value: 'low', label: t('reasoningEffort.low') },
        { value: 'medium', label: t('reasoningEffort.medium') },
        { value: 'high', label: t('reasoningEffort.high') },
      ];

  // Reset to medium if current value isn't available for this provider
  const validValues = new Set(options.map((o) => o.value));
  if (_reasoningEffort && !validValues.has(_reasoningEffort)) {
    _setReasoningEffort(DEFAULT_REASONING_EFFORT);
  }

  return (
    <div className='mt-3'>
      <FieldLabelWithInfo
        description={t(
          usesAdaptiveReasoning
            ? 'reasoningEffort.adaptiveDescription'
            : 'reasoningEffort.description'
        )}
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
      min={0}
      max={65536}
      step={1024}
      description={t('reasoningBudget.description')}
      defaultValue={DEFAULT_REASONING_BUDGET}
    />
  );
};

export const VerbositySelector = ({
  _verbosity,
  _setVerbosity,
  _model,
  _providerId,
}: {
  _verbosity: Verbosity | undefined;
  _setVerbosity: React.Dispatch<React.SetStateAction<Verbosity | undefined>>;
  _model: ModelOptions;
  _providerId?: ProviderId;
}) => {
  const { t } = useTranslation('model');
  const allowMax = supportsMaxVerbosity(_model, _providerId);

  const options: { value: Verbosity; label: string }[] = [
    { value: 'low', label: t('verbosity.low') },
    { value: 'medium', label: t('verbosity.medium') },
    { value: 'high', label: t('verbosity.high') },
    ...(allowMax ? [{ value: 'max' as const, label: t('verbosity.max') }] : []),
  ];

  const validValues = new Set(options.map((option) => option.value));
  if (_verbosity && !validValues.has(_verbosity)) {
    _setVerbosity(DEFAULT_VERBOSITY);
  }

  return (
    <div className='mt-3'>
      <FieldLabelWithInfo
        description={t(
          allowMax ? 'verbosity.adaptiveDescription' : 'verbosity.description'
        )}
        onReset={() => _setVerbosity(DEFAULT_VERBOSITY)}
        showReset={_verbosity !== DEFAULT_VERBOSITY}
      >
        {t('verbosity.label')}
      </FieldLabelWithInfo>
      <SegmentedControl
        options={options}
        value={_verbosity}
        onChange={(value) => _setVerbosity(value as Verbosity)}
      />
    </div>
  );
};

export default ConfigMenu;
