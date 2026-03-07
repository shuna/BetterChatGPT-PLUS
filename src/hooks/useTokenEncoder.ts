import { useEffect, useState } from 'react';
import { isEncoderReady, loadEncoder, onEncoderReady } from '@utils/messageUtils';

const useTokenEncoder = (): boolean => {
  const [ready, setReady] = useState(isEncoderReady);

  useEffect(() => {
    if (ready) return;
    loadEncoder();
    return onEncoderReady(() => setReady(true));
  }, [ready]);

  return ready;
};

export default useTokenEncoder;
