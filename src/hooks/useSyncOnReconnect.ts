import { useEffect, useRef } from 'react';
import { useNetworkStatus } from './useNetworkStatus';

/**
 * Triggers a sync callback when the device reconnects to the internet.
 * Will be connected to the sync engine in Phase 3.
 */
export function useSyncOnReconnect(onSync: () => Promise<void>) {
  const { isConnected } = useNetworkStatus();
  const wasDisconnected = useRef(false);

  useEffect(() => {
    if (isConnected === false) {
      wasDisconnected.current = true;
    }

    if (isConnected === true && wasDisconnected.current) {
      wasDisconnected.current = false;
      onSync().catch(console.error);
    }
  }, [isConnected, onSync]);

  return { isConnected };
}
