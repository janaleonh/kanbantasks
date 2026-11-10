import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { NasFolderPicker } from './NasFolderPicker';
import { getDatabase } from '../db/database';
import { enqueueScan, useScanRevision } from '../documents/scanOutbox';
import { scanDocument } from '../documents/scans';
import { nasWrite } from '../stores/useDocumentStore';
import { linkFolder, syncFolder, unlinkFolder, useFolderStatus } from '../documents/folderSync';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDocumentStore, isFavoritePath } from '../stores/useDocumentStore';
import { formatBytes, isWithin } from '../documents/paths';
import type { DavEntry } from '../documents/types';
import { useTheme } from '../hooks/useTheme';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { uploadPath, validateUpload } from '../documents/upload';

export default function DocumentsScreen({active=true}:{active?:boolean}) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { config, manifest, initialized, initialize, path, browse, loadingFolder, home, status, error, folderError, progress, syncFavorites, toggleFavorite, uploading, saving, uploadFile } = useDocumentStore();
  const [mode, setMode] = useState<'browse' | 'offline'>('browse');
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);
  const mounted = useRef(true);
  const recentScanId = useScanRevision(s=>s.recentScanId);
  const revision = useScanRevision(s=>s.revision);
  const [receipt,setReceipt]=useState<{id:string;message:string}|null>(null);
  useEffect(()=>{
    if (!active || !recentScanId) return;
    let current=true;
    const show=(message:string)=>{if(current)setReceipt({id:recentScanId,message});};
    void getDatabase().then(db=>db.getFirstAsync<{state:string}>('SELECT state FROM scan_uploads WHERE scanId=?',[recentScanId])).then(row=>{
      const labels:Record<string,string>={waiting:home?'NAS-Upload vorgemerkt':'Wartet auf Heim-WLAN', sending:'Wird aufs NAS hochgeladen', confirmed:'Auf dem NAS gespeichert', conflict:'NAS-Ziel prüfen'};
      show(row ? labels[row.state] ?? 'NAS-Status unbekannt' : 'Kein NAS-Upload eingeplant');
    }).catch(()=>show('NAS-Status nicht verfügbar'));
    return ()=>{current=false;};
  },[active,recentScanId,revision,home]);
  useEffect(()=>{
    if (!active || !recentScanId) return;
    const timer=setTimeout(()=>{if(useScanRevision.getState().recentScanId===recentScanId)useScanRevision.setState({recentScanId:null});},8000);
    return ()=>clearTimeout(timer);
  },[active,recentScanId]);
  const scanToNas = async () => {
    if (!config || pickingRef.current) return;
    const target = path, connectionId = config.id;
    pickingRef.current = true;
    setPicking(true);
    let captured = false;
    try {
      const scan = await scanDocument();
      if (!scan) return;
      captured = true;
      try { await enqueueScan(scan, target, connectionId); }
      finally { useScanRevision.setState({recentScanId:scan.id}); }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bitte erneut versuchen.';
      Alert.alert(captured ? 'Scan lokal gesichert' : 'Scan fehlgeschlagen', captured ? message + '\nDie PDF findest du unter „Lokale Scans“.' : message);
    } finally {
      pickingRef.current = false;
      if (mounted.current) setPicking(false);
    }
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const upload = async () => {
    if (!config || pickingRef.current || uploading || saving || status === 'syncing' || !home) return;
    const expectedId = config.id;
    const folder = path;
    const destination = `${config.root.replace(/\/$/, '')}/${folder}`.replace(/\/$/, '') || '/';
    pickingRef.current = true; setPicking(true);
    let file: File | null = null;
    try {
      const selected = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
      if (selected.canceled) return;
      const asset = selected.assets[0];
      // Only the picker-created cache copy may be read or removed here.
      if (!asset.uri.startsWith(`${Paths.cache.uri.replace(/\/$/, '')}/`) || /(?:^|\/)\.\.(?:\/|$)/.test(decodeURIComponent(asset.uri))) throw new Error('Die ausgewählte Datei konnte nicht sicher zwischengespeichert werden.');
      file = new File(asset.uri);
      if (!mounted.current) return;
      if (!file.exists) throw new Error('Die ausgewählte Datei ist nicht verfügbar.');
      const source = { name: asset.name, size: file.size, body: file };
      validateUpload(source);
      const confirmed = await new Promise<boolean>((resolve) => Alert.alert('Datei hochladen?', `${source.name} (${formatBytes(source.size)})\n\nZiel: ${destination}\n\nEine vorhandene Datei wird nicht überschrieben.`, [
        { text: 'Abbrechen', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Hochladen', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) }));
      if (!confirmed || !mounted.current) return;
      await uploadFile(folder, source, expectedId);
      if (mounted.current) Alert.alert('Datei hochgeladen', `${source.name} wurde auf deinem NAS gespeichert.`);
    } catch (err) {
      if (mounted.current) Alert.alert('Upload nicht abgeschlossen', err instanceof Error ? err.message : 'Die Datei konnte nicht hochgeladen werden.');
    } finally {
      try { if (file?.exists) file.delete(); } catch { /* The OS can reclaim the picker cache later. */ }
      pickingRef.current = false;
      if (mounted.current) setPicking(false);
    }
  };
  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => { if (config) void browse(''); }, [config?.id, browse]);
  const lookup = (target: string) => manifest.offline[target]?.entry || Object.values(manifest.folders).flatMap((folder) => folder.entries).find((entry) => entry.path === target);
  const entries = useMemo(() => {
    let values: DavEntry[];
    if (mode === 'browse') values = manifest.folders[path]?.entries || [];
    else {
      values = manifest.favorites.map((favorite) => lookup(favorite.path) || { ...favorite, size: null, modified: null, etag: null, mimeType: favorite.directory ? 'inode/directory' : 'application/octet-stream' });
      if (query.trim()) values = [...new Map([...values, ...Object.values(manifest.offline).map((record) => record.entry)].map((entry) => [entry.path, entry])).values()];
    }
    const q = query.trim().toLowerCase();
    return values.filter((entry) => !q || `${entry.name} ${entry.path}`.toLowerCase().includes(q)).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, 'de', { numeric: true }));
  }, [mode, manifest, path, query]);
  const open = (entry: DavEntry) => {
    if (entry.directory) { setMode('browse'); setQuery(''); void browse(entry.path); }
    else router.push({ pathname: '/document', params: { path: entry.path } });
  };
  const favorite = (entry: DavEntry) => { void toggleFavorite(entry).catch((err) => Alert.alert('Favorit konnte nicht gespeichert werden', err.message)); };
  const folderSync = useFolderStatus();
  const [copy, setCopy] = useState<{ entry: DavEntry; id: string; from: string } | null>(null);
  const fail = (err: unknown) => Alert.alert('Dokumente', err instanceof Error ? err.message : 'Vorgang fehlgeschlagen.');
  const refreshAfter = async (id: string, folder: string, work: Parameters<typeof nasWrite>[1]) => {
    await nasWrite(id, work);
    if (useDocumentStore.getState().config?.id === id) await browse(folder);
  };
  const createFolder = () => {
    if (!config) return;
    Alert.prompt('Ordner erstellen', 'Name im aktuellen NAS-Ordner', name => {
      if (!name?.trim()) return;
      void refreshAfter(config.id, path, ({ client, signal }) => client.ensureDirectory(uploadPath(path, name.trim()), signal)).catch(fail);
    });
  };
  const actions = (entry: DavEntry) => {
    if (!config) return;
    Alert.alert(entry.name, undefined, [
      { text: 'Kopieren nach …', onPress: () => setCopy({ entry, id: config.id, from: path }) },
      { text: 'Löschen', style: 'destructive', onPress: () => Alert.alert('Vom NAS löschen?', entry.path + (entry.directory ? '\nDer gesamte Ordnerinhalt wird gelöscht.' : ''), [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: () => { void refreshAfter(config.id, path, ({client, signal}) => client.modify(entry, null, signal)).catch(fail); } }
      ]) }, { text: 'Abbrechen', style: 'cancel' }
    ]);
  };
  const syncMenu = () => {
    if (!config) return;
    Alert.alert('iPhone-Ordner aufs NAS sichern', 'Der gewählte Ordner wird beim Öffnen und bei aktiver App im Heim-WLAN in diesen NAS-Ordner kopiert. Auf dem iPhone gelöschte Dateien bleiben auf dem NAS.', [
      { text: 'iPhone-Ordner wählen', onPress: () => { void linkFolder(config.id, path).then(syncFolder).catch(fail); } },
      { text: 'Jetzt abgleichen', onPress: () => { void syncFolder(); } },
      { text: 'Verknüpfung lösen', onPress: () => { void unlinkFolder(config.id).catch(fail); } },
      { text: 'Schließen', style: 'cancel' }
    ]);
  };
  const rootEntry: DavEntry = { path, name: path.split('/').at(-1) || 'Startordner', directory: true, size: null, modified: null, etag: null, mimeType: 'inode/directory' };
  const used = Object.values(manifest.offline).reduce((sum, record) => sum + (record.entry.size || 0), 0);
  const offlineCount = Object.keys(manifest.offline).length;
  const header = <View>
    <View style={[styles.status, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.columnRadius }]}>
      <View style={styles.statusHeading}><Ionicons name={status === 'syncing' ? 'sync-outline' : home ? 'home-outline' : 'cloud-offline-outline'} size={21} color={theme.accent} /><Text style={[styles.statusTitle, { color: theme.text }]}>{status === 'syncing' ? 'Dokumente werden abgeglichen' : home ? 'Heim-WLAN verbunden' : 'Offline-Favoriten für unterwegs'}</Text>{status === 'syncing' && <ActivityIndicator color={theme.accent} />}</View>
      <Text style={[styles.description, { color: theme.subtext }]}>{progress ? `${progress.done} von ${progress.total || '…'} · ${progress.name}` : `${offlineCount} ${offlineCount === 1 ? 'Datei' : 'Dateien'} offline · ${formatBytes(used)}`}</Text>
      {!home && <Text style={[styles.description, { color: theme.subtext }]}>Neue und geänderte Dateien werden wieder im Heim-WLAN geladen.</Text>}
      {manifest.lastSyncAt && <Text style={[styles.description, { color: theme.subtext }]}>Letzter erfolgreicher Abgleich: {new Date(manifest.lastSyncAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</Text>}
      {!!error && <Text accessibilityRole="alert" style={[styles.description, { color: theme.isDark ? '#FFA79E' : '#B42318' }]}>{error}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={!home || status === 'syncing' || !manifest.favorites.length} onPress={() => { void syncFavorites(); }} style={[styles.syncButton, { backgroundColor: theme.pillBg, opacity: !home || status === 'syncing' || !manifest.favorites.length ? 0.5 : 1 }]}><Ionicons name="sync-outline" size={16} color={theme.accent} /><Text style={{ color: theme.accent, fontWeight: '600' }}>Favoriten abgleichen</Text></TouchableOpacity>
    </View>
    <View style={[styles.tabs, { backgroundColor: theme.pillBg }]}>{([{ id: 'browse', title: 'NAS-Ordner' }, { id: 'offline', title: 'Offline-Favoriten' }] as const).map((tab) => <TouchableOpacity key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: mode === tab.id }} onPress={() => { setMode(tab.id); setQuery(''); }} style={[styles.tab, { backgroundColor: mode === tab.id ? theme.surface : 'transparent' }]}><Text style={{ color: mode === tab.id ? theme.text : theme.subtext, fontWeight: '600' }}>{tab.title}</Text></TouchableOpacity>)}</View>
    <View style={[styles.search, { backgroundColor: theme.inputBg, borderColor: theme.border }]}><Ionicons name="search" size={17} color={theme.subtext} /><TextInput accessibilityLabel="Dokumente suchen" placeholder={mode === 'browse' ? 'In diesem Ordner suchen' : 'In Offline-Favoriten suchen'} placeholderTextColor={theme.subtext} value={query} onChangeText={setQuery} style={{ flex: 1, color: theme.text, fontSize: 14 }} />{!!query && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Suche löschen" onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={theme.subtext} /></TouchableOpacity>}</View>
    {mode === 'browse' && <>
      <TouchableOpacity accessibilityRole="button" disabled={!config || picking || saving} onPress={() => void scanToNas()} style={[styles.syncButton, { backgroundColor: theme.pillBg, opacity: config ? 1 : 0.5 }]}>
        <Ionicons name="scan-outline" size={21} color={theme.accent} /><Text style={{ color: theme.accent, fontWeight: '700' }}>In diesen Ordner scannen</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Datei hochladen oder Ordner erstellen" disabled={!home || picking || uploading || saving || status === 'syncing' || loadingFolder || !!folderError} onPress={() => Alert.alert('Zum NAS hinzufügen', undefined, [{ text: 'Datei hochladen', onPress: () => { void upload(); } }, { text: 'Ordner erstellen', onPress: createFolder }, { text: 'Abbrechen', style: 'cancel' }])} style={[styles.syncButton, { backgroundColor: theme.pillBg, marginTop: 0, marginBottom: 12, opacity: !home || picking || uploading || saving || status === 'syncing' || loadingFolder || !!folderError ? 0.5 : 1 }]}>
        {picking || uploading ? <ActivityIndicator color={theme.accent} /> : <Ionicons name="cloud-upload-outline" size={19} color={theme.accent} />}
        <Text style={{ color: theme.accent, fontWeight: '600' }}>{uploading ? 'Datei wird hochgeladen …' : picking ? 'Dateiauswahl …' : '＋ Hinzufügen'}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={folderSync.busy} onPress={syncMenu} style={styles.folderFavorite}><Text style={{color:theme.accent}}>{folderSync.busy ? 'Ordner wird geprüft …' : 'iPhone-Ordner abgleichen …'}</Text></TouchableOpacity>
      {!!folderSync.message && <Text style={{color:theme.subtext}}>{folderSync.message}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breadcrumb}>
        <TouchableOpacity onPress={() => { setQuery(''); void browse(''); }} style={styles.crumb}><Ionicons name="folder-outline" size={15} color={theme.accent} /><Text style={{ color: theme.accent }}>Startordner</Text></TouchableOpacity>
        {path.split('/').filter(Boolean).map((part, index, parts) => <View key={parts.slice(0, index + 1).join('/')} style={styles.crumb}><Ionicons name="chevron-forward" size={13} color={theme.subtext} /><TouchableOpacity onPress={() => { setQuery(''); void browse(parts.slice(0, index + 1).join('/')); }}><Text style={{ color: theme.accent }}>{part}</Text></TouchableOpacity></View>)}
      </ScrollView>
      <TouchableOpacity accessibilityRole="button" onPress={() => favorite(rootEntry)} style={styles.folderFavorite}><Ionicons name={isFavoritePath(manifest, rootEntry) ? 'star' : 'star-outline'} size={18} color={theme.accent} /><Text style={{ color: theme.accent, fontSize: 13 }}>{isFavoritePath(manifest, rootEntry) ? 'Ordner nicht mehr offline halten' : 'Diesen Ordner offline halten'}</Text></TouchableOpacity>
      {!!folderError && <Text style={[styles.description, { color: theme.subtext, marginBottom: 12 }]}>{folderError}{manifest.folders[path] ? ' Angezeigt wird der zuletzt geladene Ordnerstand.' : ''}</Text>}
      {loadingFolder && <ActivityIndicator style={{ marginBottom: 12 }} color={theme.accent} />}
    </>}
  </View>;
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    {active && !!recentScanId && <TouchableOpacity accessibilityRole="button" accessibilityHint="Scan öffnen" onPress={()=>router.push({pathname:'/scan',params:{id:recentScanId}})}
      style={{marginHorizontal:14,marginVertical:6,padding:12,borderRadius:12,backgroundColor:theme.cardBg}}>
      <Text accessibilityLiveRegion="polite" style={{color:theme.text,fontWeight:'600'}}>Auf dem iPhone gespeichert</Text>
      <Text style={{color:theme.subtext}}>{receipt?.id===recentScanId ? receipt.message : 'NAS-Status wird geladen …'}</Text>
    </TouchableOpacity>}
    <NasFolderPicker visible={!!copy} onClose={() => setCopy(null)} onSelect={folder => {
      if (!copy) return;
      void refreshAfter(copy.id, copy.from, ({client, signal}) => client.modify(copy.entry, uploadPath(folder, copy.entry.name), signal)).catch(fail);
    }} />
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12 }}>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/scan')} style={styles.folderFavorite}>
        <Ionicons name="scan-outline" color={theme.accent} size={20} /><Text style={{ color: theme.accent }}>Lokale Scans</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/inbox')} style={styles.folderFavorite}><Text style={{color:theme.accent}}>Eingang</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={()=>router.push('/uploads')} style={styles.folderFavorite}><Text style={{color:theme.accent}}>Uploads</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="NAS-Einstellungen"   onPress={() => router.push('/nas-settings')} style={{ padding: 10 }}><Ionicons name="settings-outline" color={theme.accent} size={23} /></TouchableOpacity>
    </View>
    {!initialized ? <ActivityIndicator style={{ margin: 32 }} color={theme.accent} /> : !config ? <View style={styles.empty}>
      <Ionicons name="folder-open-outline" size={46} color={theme.accent} />
      <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: theme.headingFont }]}>Wichtige Dokumente immer dabei.</Text>
      <Text style={[styles.emptyText, { color: theme.subtext }]}>Verbinde dein Synology NAS und wähle Dateien oder Ordner als Offline-Favoriten aus.</Text>
      <TouchableOpacity onPress={() => router.push('/nas-settings')} style={[styles.connect, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent ?? '#FFFFFF', fontWeight: '700' }}>NAS verbinden</Text></TouchableOpacity>
      {!!error && <Text style={[styles.description, { color: theme.subtext }]}>{error}</Text>}
    </View> : <FlatList data={entries} keyExtractor={(entry) => entry.path} ListHeaderComponent={header} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} refreshing={mode === 'browse' ? loadingFolder : status === 'syncing'} onRefresh={() => { if (mode === 'browse') void browse(path); else void syncFavorites(); }} ListEmptyComponent={!loadingFolder ? <View style={styles.emptyList}><Text style={[styles.emptyText, { color: theme.subtext }]}>{query ? 'Keine passenden Dokumente.' : mode === 'offline' ? 'Markiere Dateien oder Ordner mit dem Stern, um sie offline bereitzuhalten.' : folderError ? 'Noch kein Ordnerstand auf diesem Gerät verfügbar.' : 'Dieser Ordner ist leer.'}</Text></View> : undefined} renderItem={({ item: entry }) => {
      const record = manifest.offline[entry.path];
      const pinned = isFavoritePath(manifest, entry);
      const childCount = entry.directory ? Object.keys(manifest.offline).filter((file) => isWithin(file, entry.path)).length : 0;
      const detail = entry.directory ? `${childCount ? `${childCount} Dateien offline` : 'Ordner'}${pinned && !childCount ? ' · Wird zu Hause geladen' : ''}` : record?.missing ? 'Auf NAS nicht mehr gefunden · Offlinekopie' : record ? `${formatBytes(record.entry.size)} · Offline verfügbar` : `${formatBytes(entry.size)}${pinned ? ' · Noch nicht offline' : ''}`;
      return <Swipeable overshootLeft={false} renderLeftActions={(_progress,_drag,swipeActions)=>
        <TouchableOpacity accessibilityRole="button" onPress={()=>{swipeActions.close();favorite(entry);}}
          style={{width:108,borderRadius:theme.cardRadius,alignItems:'center',justifyContent:'center',backgroundColor:theme.accent}}>
          <Ionicons name={pinned?'star':'star-outline'} size={22} color={theme.onAccent}/>
          <Text style={{color:theme.onAccent,fontWeight:'600'}}>{pinned?'Lösen':'Offline halten'}</Text>
        </TouchableOpacity>}>
        <View style={[styles.file, { backgroundColor: theme.cardBg, borderColor: theme.border, borderRadius: theme.cardRadius }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${entry.name}, ${detail}`} onLongPress={mode==='browse' && home && !uploading && !saving ? ()=>actions(entry) : undefined} onPress={() => open(entry)} style={styles.fileMain}>
          <View style={{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:theme.pillBg}}>
            <Ionicons name={entry.directory ? 'folder' : entry.mimeType.startsWith('image/') ? 'image-outline' : 'document-text-outline'} size={22} color={theme.accent} />
          </View>
          <View style={{ flex: 1 }}><Text style={[styles.fileTitle, { color: theme.text }]} numberOfLines={2}>{entry.name}</Text><Text style={[styles.fileDetail, { color: theme.subtext }]}>{detail}</Text>{mode === 'offline' && query && <Text numberOfLines={1} style={[styles.fileDetail, { color: theme.subtext }]}>{entry.path}</Text>}</View>
          {!!record && <Ionicons name="checkmark-circle-outline" size={17} color={theme.accent} />}
        </TouchableOpacity>
        {mode === 'browse' && <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Aktionen für ' + entry.name} disabled={!home || uploading || saving} onPress={() => actions(entry)} style={styles.star}><Ionicons name="ellipsis-horizontal" size={22} color={theme.accent} /></TouchableOpacity>}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${entry.name} ${pinned ? 'aus Offline-Favoriten entfernen' : 'offline halten'}`} accessibilityState={{ selected: pinned }} onPress={() => favorite(entry)} style={styles.star}><Ionicons name={pinned ? 'star' : 'star-outline'} size={22} color={pinned ? theme.accent : theme.subtext} /></TouchableOpacity>
      </View></Swipeable>;
    }} />}
  </View>;
}

const styles = StyleSheet.create({
  content: { padding: 16 }, status: { padding: 15, borderWidth: 1, marginBottom: 18 }, statusHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 6 },
  statusTitle: { fontSize: 15, fontWeight: '700', flex: 1 }, description: { fontSize: 12, lineHeight: 19, marginTop: 5 },
  syncButton: { flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', padding: 11, borderRadius: 10, marginTop: 13 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 14 }, tab: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 9 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, padding: 12, borderRadius: 12, marginBottom: 14 },
  breadcrumb: { alignItems: 'center', gap: 7, paddingBottom: 10 }, crumb: { flexDirection: 'row', gap: 6, alignItems: 'center' }, folderFavorite: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 12, marginBottom: 8 },
  file: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, marginBottom: 9 }, fileMain: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14 }, star: { padding: 14 },
  fileTitle: { fontSize: 15, fontWeight: '600', lineHeight: 21 }, fileDetail: { fontSize: 11, lineHeight: 17, marginTop: 4 },
  empty: { padding: 28, alignItems: 'center', gap: 16, marginTop: 34 }, emptyTitle: { fontSize: 25, fontWeight: '700', textAlign: 'center' }, emptyText: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  connect: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 13 }, emptyList: { paddingVertical: 30 },
});
