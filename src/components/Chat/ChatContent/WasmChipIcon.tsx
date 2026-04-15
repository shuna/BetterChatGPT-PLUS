import React from 'react';
import type { WasmCapabilities } from '@src/local-llm/runtime';
import { LocalChipIcon } from '@icon/ProviderIcons';

/**
 * Decorates the existing LocalChipIcon to visually encode WASM runtime capabilities:
 *
 * - **WebGPU**: icon colour changes from gray to green
 * - **Memory64**: "64" label at bottom-right
 * - **Multi-thread**: the icon is drawn twice with a slight offset (stacked)
 *
 * When caps is null (model not yet loaded), renders the plain LocalChipIcon.
 */
const WasmChipIcon = ({
  caps,
  className,
}: {
  caps: WasmCapabilities | null;
  className?: string;
}) => {
  // Before capabilities are known, render the plain icon
  if (!caps) {
    return <LocalChipIcon className={className} />;
  }

  const color = caps.webgpu
    ? 'text-green-500 dark:text-green-400'
    : 'text-gray-400 dark:text-gray-500';

  const icon = <LocalChipIcon className={`${className ?? ''} ${color}`} />;

  return (
    <span className='relative inline-flex items-center shrink-0' style={{ width: '1.125em', height: '1em' }}>
      {/* Back layer (visible only when multi-thread) */}
      {caps.multiThread && (
        <span className='absolute opacity-40' style={{ left: '0.2em', top: 0 }}>
          {icon}
        </span>
      )}
      {/* Front layer */}
      <span className={caps.multiThread ? 'absolute' : ''} style={caps.multiThread ? { left: 0, top: 0 } : undefined}>
        {icon}
      </span>
      {/* Memory64 indicator */}
      {caps.memory64 && (
        <span
          className={`absolute font-bold leading-none ${color}`}
          style={{
            fontSize: '0.45em',
            right: caps.multiThread ? '-0.15em' : '-0.35em',
            bottom: '-0.2em',
          }}
        >
          64
        </span>
      )}
    </span>
  );
};

export default React.memo(WasmChipIcon);
