import { getSetting, setSetting } from '../db/database';

const OWNER = 'googleTasksOwner';
let writes: Promise<void> = Promise.resolve();
const normalize = (email: string) => email.trim().toLowerCase();

export function rememberTaskAccount(email: string | null | undefined) {
  writes = writes.catch(() => {}).then(async () => {
    if (email && !await getSetting(OWNER, '')) await setSetting(OWNER, normalize(email));
  });
  return writes;
}

export async function requireTaskAccount(email: string | null | undefined) {
  if (!email) throw new Error('Bitte melde dich mit einem verifizierten Google-Konto an, bevor Aufgaben synchronisiert werden.');
  await rememberTaskAccount(email);
  if (await getSetting(OWNER, '') !== normalize(email)) {
    throw new Error('Die lokalen Aufgaben gehören zu einem anderen Google-Konto. Verbinde das ursprüngliche Konto erneut. Die Synchronisierung wurde zum Schutz deiner Daten gestoppt.');
  }
}
