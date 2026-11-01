import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { detectedNetwork, networkMatches } from './paths';
import type { NasConfig } from './types';

export class HomeNetworkError extends Error {}

export function isHomeNetwork(state: NetInfoState, config: Pick<NasConfig, 'homeNetwork'>) {
  return state.type === 'wifi' && state.isConnected === true && networkMatches(state.details?.ipAddress, config.homeNetwork);
}

export async function requireHomeNetwork(config: NasConfig) {
  const state = await NetInfo.fetch();
  if (!isHomeNetwork(state, config)) throw new HomeNetworkError('Das hinterlegte Heim-WLAN ist nicht verbunden. Deine Offline-Favoriten bleiben verfügbar.');
}

export async function currentHomeNetwork() {
  const state = await NetInfo.fetch();
  if (state.type !== 'wifi' || !state.isConnected || !state.details?.ipAddress) throw new Error('Verbinde dich mit deinem Heim-WLAN. Falls iOS keine IPv4-Adresse liefert, kannst du den Netzbereich manuell eintragen.');
  return detectedNetwork(state.details.ipAddress, state.details.subnet);
}
