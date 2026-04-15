import React, { useId, useState, useRef, useEffect } from 'react';
import Select, { GroupBase, StylesConfig } from 'react-select';

type SelectOption<T extends string> = {
  value: T;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

const createSelectStyles = <T extends string>(): StylesConfig<
  SelectOption<T>,
  false,
  GroupBase<SelectOption<T>>
> => ({
  control: (provided) => ({
    ...provided,
    backgroundColor: '#2D3748',
    color: '#E2E8F0',
  }),
  menu: (provided) => ({
    ...provided,
    backgroundColor: '#2D3748',
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isSelected ? '#4A5568' : '#2D3748',
    color: '#E2E8F0',
    '&:hover': {
      backgroundColor: '#4A5568',
    },
  }),
  singleValue: (provided) => ({
    ...provided,
    color: '#E2E8F0',
  }),
  input: (provided) => ({
    ...provided,
    color: '#E2E8F0',
  }),
  placeholder: (provided) => ({
    ...provided,
    color: '#A0AEC0',
  }),
  menuPortal: (provided) => ({
    ...provided,
    zIndex: 10000,
  }),
});

export const ConfigSection = ({
  children,
  className = 'mt-3 pt-1',
}: {
  children: React.ReactNode;
  className?: string;
}) => <div className={className}>{children}</div>;

export const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className='block text-sm font-medium text-gray-900 dark:text-white'>
    {children}
  </label>
);

export const FieldDescription = ({ children }: { children: React.ReactNode }) => (
  <div className='min-w-fit text-gray-500 dark:text-gray-300 text-sm mt-2'>
    {children}
  </div>
);

export const InfoTooltip = ({ text }: { text: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  return (
    <div className='relative inline-flex ml-1' ref={ref}>
      <button
        type='button'
        className='inline-flex items-center justify-center w-4 h-4 rounded-full text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors'
        onClick={() => setOpen(!open)}
        aria-label='Info'
      >
        <svg width='14' height='14' viewBox='0 0 20 20' fill='currentColor'>
          <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' clipRule='evenodd' />
        </svg>
      </button>
      {open && (
        <div className='absolute z-50 left-6 top-0 w-64 p-2 text-xs text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg'>
          {text}
        </div>
      )}
    </div>
  );
};

export const ResetButton = ({ onClick, visible = true }: { onClick: () => void; visible?: boolean }) => (
  <button
    type='button'
    className={`inline-flex items-center justify-center w-4 h-4 rounded-full transition-colors ${
      visible
        ? 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
        : 'text-transparent pointer-events-none'
    }`}
    onClick={onClick}
    aria-label='Reset to default'
  >
    <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
      <path d='M3 12a9 9 0 1 1 3 6.7' />
      <path d='M3 7v5h5' />
    </svg>
  </button>
);

export const FieldLabelWithInfo = ({
  children,
  description,
  onReset,
  showReset,
}: {
  children: React.ReactNode;
  description?: React.ReactNode;
  onReset?: () => void;
  showReset?: boolean;
}) => (
  <label className='flex items-center flex-1 text-sm font-medium text-gray-900 dark:text-white'>
    <span className='flex items-center'>
      {children}
      {description && <InfoTooltip text={description} />}
    </span>
    {onReset && <span className='ml-auto'><ResetButton onClick={onReset} visible={showReset} /></span>}
  </label>
);

const rangeThumbClassName =
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-green-500 [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-pointer';

export const RangeField = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  description,
  defaultValue,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  description: React.ReactNode;
  defaultValue?: number;
}) => {
  const fieldId = useId();
  const numberInputId = `${fieldId}-number`;
  const rangeInputId = `${fieldId}-range`;
  const normalizedLabel = label.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  const fieldName = normalizedLabel || rangeInputId;
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const clampRatio = (v: number) => Math.min(1, Math.max(0, v));
  const roundToStep = (v: number) => {
    const rounded = Math.round(v / step) * step;
    // Fix floating point precision
    const decimals = step < 1 ? String(step).split('.')[1]?.length ?? 0 : 0;
    return Number(rounded.toFixed(decimals));
  };
  const applyRangeValue = (rawValue: string) => {
    onChange(roundToStep(clamp(Number(rawValue))));
  };
  const applyClientXValue = (clientX: number, rect: DOMRect) => {
    const ratio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
    const nextValue = min + clampRatio(ratio) * (max - min);
    onChange(roundToStep(clamp(nextValue)));
  };

  useEffect(() => {
    return () => dragCleanupRef.current?.();
  }, []);

  return (
    <ConfigSection>
      <div className='flex items-center'>
        <label
          htmlFor={rangeInputId}
          className='flex items-center text-sm font-medium text-gray-900 dark:text-white'
        >
          {label}
          {description && <InfoTooltip text={description} />}
        </label>
        <input
          id={numberInputId}
          name={`${fieldName}-number`}
          type='number'
          value={value}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!Number.isNaN(val)) onChange(roundToStep(clamp(val)));
          }}
          min={min}
          max={max}
          step={step}
          className='ml-auto w-20 text-sm text-right bg-transparent border-b border-gray-400 dark:border-gray-500 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
        />
        {defaultValue != null && (
          <span className='ml-2'>
            <ResetButton onClick={() => onChange(defaultValue)} visible={value !== defaultValue} />
          </span>
        )}
      </div>
      <div className='relative h-6 flex items-center'>
        {/* Track background */}
        <div className='absolute inset-x-0 h-2 rounded-full bg-gray-200 dark:bg-gray-600' />
        {/* Track fill */}
        <div
          className='absolute left-0 h-2 rounded-full bg-green-500/70'
          style={{ width: `${((value - min) / (max - min)) * 100}%` }}
        />
        <input
          id={rangeInputId}
          name={fieldName}
          type='range'
          value={value}
          onPointerDown={(event) => {
            event.preventDefault();
            dragCleanupRef.current?.();

            const rect = event.currentTarget.getBoundingClientRect();
            applyClientXValue(event.clientX, rect);
            const handlePointerMove = (moveEvent: PointerEvent) => {
              if (moveEvent.pointerId !== event.pointerId || moveEvent.buttons !== 1) return;
              applyClientXValue(moveEvent.clientX, rect);
            };
            const handlePointerEnd = (endEvent: PointerEvent) => {
              if (endEvent.pointerId !== event.pointerId) return;
              dragCleanupRef.current?.();
            };

            dragCleanupRef.current = () => {
              window.removeEventListener('pointermove', handlePointerMove);
              window.removeEventListener('pointerup', handlePointerEnd);
              window.removeEventListener('pointercancel', handlePointerEnd);
              dragCleanupRef.current = null;
            };

            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerEnd);
            window.addEventListener('pointercancel', handlePointerEnd);
          }}
          onInput={(event) => applyRangeValue(event.currentTarget.value)}
          onChange={(event) => applyRangeValue(event.target.value)}
          min={min}
          max={max}
          step={step}
          className={`absolute inset-x-0 w-full h-2 appearance-none bg-transparent cursor-pointer ${rangeThumbClassName}`}
        />
      </div>
    </ConfigSection>
  );
};

export const DarkSelectField = <T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  isClearable = false,
  isSearchable = true,
  className = 'mt-3 pt-1',
}: {
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T | null) => void;
  placeholder?: string;
  isClearable?: boolean;
  isSearchable?: boolean;
  className?: string;
}) => (
  <ConfigSection className={className}>
    {label && <FieldLabel>{label}</FieldLabel>}
    <Select<SelectOption<T>, false>
      value={options.find((option) => option.value === value) ?? null}
      onChange={(selectedOption) => onChange(selectedOption?.value ?? null)}
      options={options}
      placeholder={placeholder}
      isClearable={isClearable}
      isSearchable={isSearchable}
      className='basic-single'
      classNamePrefix='select'
      styles={createSelectStyles<T>()}
      menuPortalTarget={document.body}
      menuPosition='fixed'
      formatOptionLabel={(option, { context }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {option.icon && <span style={{ flexShrink: 0, display: 'flex' }}>{option.icon}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div>{option.label}</div>
            {option.sublabel && <div style={{ fontSize: '0.75rem', opacity: 0.55 }}>{option.sublabel}</div>}
          </div>
          {context === 'menu' && option.rightIcon && <span style={{ flexShrink: 0, display: 'flex', marginLeft: 'auto' }}>{option.rightIcon}</span>}
        </div>
      )}
    />
  </ConfigSection>
);

export const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) => (
  <div className='mt-2 inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden'>
    {options.map((opt) => (
      <button
        key={opt.value}
        type='button'
        className={`px-4 py-1.5 text-sm font-medium transition-colors ${
          value === opt.value
            ? 'bg-blue-600 text-white'
            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
        }`}
        onClick={() => onChange(opt.value)}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const BadgeIcon = ({ children, label, active }: { children: React.ReactNode; label: string; active: boolean }) => (
  <span
    className={`relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
      active
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
        : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
    }`}
    title={label}
  >
    <span className='relative inline-flex'>
      {children}
      {!active && (
        <svg className='absolute inset-0 w-full h-full' viewBox='0 0 14 14'>
          <line x1='2' y1='12' x2='12' y2='2' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
        </svg>
      )}
    </span>
    <span>{label}</span>
  </span>
);

export interface CapabilityBadgesProps {
  reasoning: boolean;
  vision: boolean;
  audio: boolean;
  labels: {
    reasoning: string;
    vision: string;
    audio: string;
  };
}

export const CapabilityBadges = ({ reasoning, vision, audio, labels }: CapabilityBadgesProps) => (
  <div className='flex flex-wrap gap-1.5 mt-2'>
    <BadgeIcon label={labels.reasoning} active={reasoning}>
      <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
        <path d='M12 2a5 5 0 0 0-4.8 3.6A4 4 0 0 0 4 9.5a4.5 4.5 0 0 0 1.6 3.4A5 5 0 0 0 8 18h1v3h6v-3h1a5 5 0 0 0 2.4-5.1A4.5 4.5 0 0 0 20 9.5a4 4 0 0 0-3.2-3.9A5 5 0 0 0 12 2z' />
        <path d='M12 2v7' />
        <path d='M8 9h8' />
      </svg>
    </BadgeIcon>
    <BadgeIcon label={labels.vision} active={vision}>
      <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
        <rect x='3' y='3' width='18' height='18' rx='2' />
        <circle cx='8.5' cy='8.5' r='1.5' />
        <path d='m21 15-5-5L5 21' />
      </svg>
    </BadgeIcon>
    <BadgeIcon label={labels.audio} active={audio}>
      <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
        <path d='M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z' />
        <path d='M19 10v2a7 7 0 0 1-14 0v-2' />
        <line x1='12' y1='19' x2='12' y2='22' />
      </svg>
    </BadgeIcon>
  </div>
);

const CapabilityIcon = ({ active, children }: { active: boolean; children: React.ReactNode }) => (
  <span className={`relative inline-flex ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
    {children}
    {!active && (
      <svg className='absolute inset-0 w-full h-full' viewBox='0 0 12 12'>
        <line x1='1' y1='11' x2='11' y2='1' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
      </svg>
    )}
  </span>
);

export const CapabilityIconsInline = ({ reasoning, vision, audio }: { reasoning: boolean; vision: boolean; audio: boolean }) => (
  <span className='inline-flex items-center gap-1 ml-1.5'>
    <CapabilityIcon active={reasoning}>
      <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
        <path d='M12 2a5 5 0 0 0-4.8 3.6A4 4 0 0 0 4 9.5a4.5 4.5 0 0 0 1.6 3.4A5 5 0 0 0 8 18h1v3h6v-3h1a5 5 0 0 0 2.4-5.1A4.5 4.5 0 0 0 20 9.5a4 4 0 0 0-3.2-3.9A5 5 0 0 0 12 2z' />
        <path d='M12 2v7' />
        <path d='M8 9h8' />
      </svg>
    </CapabilityIcon>
    <CapabilityIcon active={vision}>
      <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
        <rect x='3' y='3' width='18' height='18' rx='2' />
        <circle cx='8.5' cy='8.5' r='1.5' />
        <path d='m21 15-5-5L5 21' />
      </svg>
    </CapabilityIcon>
    <CapabilityIcon active={audio}>
      <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
        <path d='M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z' />
        <path d='M19 10v2a7 7 0 0 1-14 0v-2' />
        <line x1='12' y1='19' x2='12' y2='22' />
      </svg>
    </CapabilityIcon>
  </span>
);
