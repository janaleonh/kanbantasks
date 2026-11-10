
import { File, Paths } from 'expo-file-system';
import { captureTask } from '../db/taskRepo';
import { sharedDraft } from '../tasks/capture';
import { attachFiles, blankNote } from './library';

let queue: Promise<unknown> = Promise.resolve();
const deliveries = new Map<string, Promise<'task' | 'note' | 'inbox'>>();
function sharedFile(uri: string) {
  const root = Paths.appleSharedContainers['group.com.janasue.kanbantasks'];
  if (!root) throw new Error('Der gemeinsame Speicher der Teilen-Erweiterung ist nicht verfügbar.');
  const base = decodeURI(root.uri).replace('file:///private/','file:///').replace(/\/$/,'') + '/PlannerIncoming/';
  const path = decodeURI(uri).replace('file:///private/','file:///');
  if (!path.startsWith(base) || !/^[a-f0-9-]{36}\/[^/]+$/i.test(path.slice(base.length)) || /%2f|%5c/i.test(uri)) throw new Error('Ungültiger Dateipfad im Teilen-Eingang.');
  const name = decodeURIComponent(new URL(uri).pathname.split('/').pop()!);
  if (!name || name === '.' || name === '..' || /[\\/\x00-\x1f]/.test(name)) throw new Error('Ungültiger Dateiname.');
  return new File(uri);
}
export function pendingShares() {
  const root = Paths.appleSharedContainers['group.com.janasue.kanbantasks'];
  return root?.list().flatMap(file => {
    const match = /^PlannerShare-([a-f0-9-]{36})\.json$/i.exec(file.name);
    return match ? [match[1]] : [];
  }) ?? [];
}

async function readDelivery(id:string){
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Ungültige Übergabe.');
    const root = Paths.appleSharedContainers['group.com.janasue.kanbantasks'];
    if (!root) throw new Error('Die App-Gruppe ist beim Signieren nicht freigegeben.');
    const receipt = new File(root, 'PlannerShare-' + id + '.json');
    if (!receipt.exists || receipt.size > 2*1024*1024) throw new Error('Die Übergabe ist nicht mehr verfügbar oder zu groß.');
    const raw: unknown = JSON.parse(await receipt.text());
    if (!Array.isArray(raw) || raw.length > 10) throw new Error('Ungültige Übergabe.');
    const payloads = raw.map(item => {
      if (typeof item?.value !== 'string' || !['text','url','image','audio','video','file'].includes(item.type)) throw new Error('Unbekannter Inhalt.');
      return {shareType:String(item.type), value:String(item.value), mimeType:typeof item.mimeType === 'string' ? item.mimeType : undefined};
    });
    if (!payloads.length) throw new Error('Es sind keine geteilten Inhalte verfügbar.');
  return {receipt,payloads};
}
export async function deliveryHasFiles(id:string){
  const {payloads}=await readDelivery(id);
  return payloads.some(p=>p.shareType!=='text' && p.shareType!=='url');
}

export function receiveShare(id: string, destination: 'inbox'|'note' = 'note') {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Ungültige Übergabe.');
  const previous = deliveries.get(id);
  if (previous) return previous;
  const job = queue.then(async (): Promise<'task' | 'note' | 'inbox'> => {
    const {receipt,payloads}=await readDelivery(id);
    const draft = sharedDraft(payloads);
    const media = payloads.filter(p => p.shareType !== 'text' && p.shareType !== 'url');
    let stored = destination;
    if (media.length) {
      const sources = media.map(p => {
        const file = sharedFile(p.value);
        return {uri:file.uri,name:decodeURIComponent(new URL(p.value).pathname.split('/').pop()!),mime:p.mimeType ?? 'application/octet-stream'};
      });
      const note = blankNote(id);
      note.title = draft.title || sources[0].name;
      note.body = draft.notes;
      note.folder = 'Eingang';
      stored = await attachFiles(note, sources, true, destination === 'inbox') ?? destination;
    } else {
      if (!draft.title.trim()) throw new Error('Die Textauswahl ist leer.');
      await captureTask(draft.title, draft.notes, null, 'share:' + id);
    }
    receipt.delete();
    for (const item of media) { try { const file=sharedFile(item.value); if(file.exists) file.delete(); } catch { /* The saved copy remains usable. */ } }
    return media.length ? stored : 'task';
  });
  deliveries.set(id, job);
  queue = job.catch(() => { deliveries.delete(id); });
  if (deliveries.size > 64) deliveries.delete(deliveries.keys().next().value!);
  return job;
}
