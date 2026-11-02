import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNetworkStatus } from '../src/hooks/useNetworkStatus';
import {
  useGoogleAuth,
  exchangeCodeForTokens,
  fetchUserInfo,
  loadCachedUser,
  saveTokens,
  clearTokens,
  getAuthVersion,
  type GoogleUser,
} from '../src/auth/googleAuth';
import {
  useKanbanStore,
  type ThemeMode,
  type BoardLayout,
} from '../src/stores/useKanbanStore';
import { COLUMN_PALETTE, type TaskList } from '../src/db/taskListRepo';
import { ColorPickerModal } from '../src/components/ColorPickerModal';
import { DesignGallery } from '../src/components/DesignGallery';
import { CalendarPreferences } from '../src/components/CalendarPreferences';
import { WidgetPreferences } from '../src/components/WidgetPreferences';
import { PrivacyPreferences } from '../src/components/PrivacyPreferences';
import { CapturePreferences } from '../src/components/CapturePreferences';
import { useCalendarStore } from '../src/stores/useCalendarStore';
import { useTheme, type DesignPreset } from '../src/hooks/useTheme';
import { sendBriefingPreview } from '../src/services/briefingLifecycle';
import { useBriefingStatus } from '../src/stores/useBriefingStatus';

const DESIGN_PRESETS: { id: DesignPreset; name: string; desc: string }[] = [
  {
    id: 'apple',
    name: 'Apple iOS (Standard)',
    desc: 'Original Apple Erinnerungen Look mit runden Checkboxen',
  },
  {
    id: 'things',
    name: 'Things Warm',
    desc: 'Warmes Papier-Design & abgerundete Karten',
  },
  {
    id: 'linear',
    name: 'Linear Minimal',
    desc: 'Klare Kanten, feine 1px Rahmen & kompakte Abstände',
  },
  {
    id: 'oled',
    name: 'OLED Tiefschwarz',
    desc: '100% echtes Schwarz für iPhone Pro Displays',
  },
];

export default function SettingsScreen() {
  const briefingStatus = useBriefingStatus();
  const router = useRouter();
  const theme = useTheme();
  const { isConnected } = useNetworkStatus();
  const { request, response, promptAsync } = useGoogleAuth();
  const {
    taskLists,
    syncState,
    lastSyncedAt,
    showCompletedByDefault,
    dailyBriefingEnabled,
    themeMode,
    designPreset,
    boardLayout,
    columnWidth,
    autoSyncDelaySeconds,
    syncWithGoogle,
    toggleTaskListVisibility,
    setTaskListColor,
    removeTaskList,
    setShowCompletedByDefault,
    setDailyBriefingEnabled,
    setThemeMode,
    setDesignPreset,
    setBoardLayout,
    setColumnWidth,
    setAutoSyncDelaySeconds,
  } = useKanbanStore();

  const [user, setUser] = useState<GoogleUser | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [colorPickerList, setColorPickerList] = useState<TaskList | null>(null);

  useEffect(() => {
    loadCachedUser().then(setUser).catch(console.error);
  }, []);

  useEffect(() => {
    if (
      response?.type === 'success' &&
      response.params.code &&
      request?.codeVerifier
    ) {
      setAuthLoading(true);
      const version = getAuthVersion() + 1;
      exchangeCodeForTokens(
        response.params.code,
        request.codeVerifier,
        request.redirectUri
      )
        .then((tokens) => fetchUserInfo(tokens.accessToken))
        .then(async (u) => {
          if (version !== getAuthVersion()) return;
          setUser(u);
          await useCalendarStore.getState().connectAccount(u.email);
          return syncWithGoogle();
        })
        .catch(async (err) => {
          if (version !== getAuthVersion()) return;
          useCalendarStore.getState().disconnect();
          await clearTokens();
          setUser(null);
          Alert.alert('Login fehlgeschlagen', err.message);
        })
        .finally(() => setAuthLoading(false));
    }
  }, [response, request, syncWithGoogle]);

  const handleSignIn = () => {
    promptAsync();
  };

  const handleManualTokenLogin = async () => {
    const token = manualToken.trim();
    if (!token) return;
    setAuthLoading(true);
    const version = getAuthVersion() + 1;
    try {
      useCalendarStore.getState().disconnect();
      await saveTokens({
        accessToken: token,
        refreshToken: null,
        expiresAt: Date.now() + 3600 * 1000,
      });
      const u = await fetchUserInfo(token);
      setUser(u);
      await useCalendarStore.getState().connectAccount(u.email);
      setManualToken('');
      await syncWithGoogle();
      Alert.alert(
        'Erfolg!',
        'Deine Google Tasks-Listen wurden synchronisiert.'
      );
    } catch (err) {
      if (version !== getAuthVersion()) return;
      await clearTokens();
      setUser(null);
      Alert.alert('Fehler', (err as Error).message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Abmelden',
      'Möchtest du dein Google-Konto trennen? Lokale Tasks bleiben erhalten.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Abmelden',
          style: 'destructive',
          onPress: async () => {
            useCalendarStore.getState().disconnect();
            await clearTokens();
            setUser(null);
          },
        },
      ]
    );
  };

  const handleDeleteList = (id: string, title: string) => {
    Alert.alert(
      'Liste endgültig löschen?',
      `Möchtest du "${title}" inkl. aller Tasks auch in Google Tasks löschen? (Zum reinen Ausblenden einfach den Schalter rechts daneben nutzen!)`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Endgültig löschen',
          style: 'destructive',
          onPress: () => removeTaskList(id),
        },
      ]
    );
  };

  const handleTestNotification = async () => {
    const ok = await sendBriefingPreview().catch(() => false);
    if (ok) {
      Alert.alert(
        'Test-Mitteilung geplant',
        'In 2 Sekunden erscheint eine iPhone-Mitteilung oben auf deinem Bildschirm.'
      );
    } else {
      Alert.alert(
        'Berechtigung fehlt',
        'Bitte erlaube Mitteilungen für diese App unter iPhone-Einstellungen → Mitteilungen. Aktiviere dort auch „Sperrbildschirm“.'
      );
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Account & Sync Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>
          KONTO & SYNCHRONISIERUNG
        </Text>
        {user ? (
          <View
            style={[
              styles.row,
              { backgroundColor: theme.cardBg, borderColor: theme.border },
            ]}
          >
            <View style={styles.rowLeft}>
              <Ionicons
                name="person-circle-outline"
                size={28}
                color="#34C759"
              />
              <View>
                <Text style={[styles.rowTitle, { color: theme.text }]}>
                  {user.name}
                </Text>
                <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
                  {user.email}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleSignOut}>
              <Text style={styles.signOutText}>Trennen</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.row,
              { backgroundColor: theme.cardBg, borderColor: theme.border },
            ]}
            onPress={handleSignIn}
            disabled={!request || authLoading}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="logo-google" size={22} color="#4285F4" />
              <View>
                <Text style={[styles.rowTitle, { color: theme.text }]}>
                  Mit Google anmelden
                </Text>
                <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
                  Für automatischen Sync mit Google Tasks
                </Text>
              </View>
            </View>
            {authLoading ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={theme.subtext} />
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.row,
            { backgroundColor: theme.cardBg, borderColor: theme.border },
          ]}
          onPress={syncWithGoogle}
          disabled={!user || !isConnected || syncState === 'syncing'}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="sync-outline" size={22} color={theme.accent} />
            <View>
              <Text style={[styles.rowTitle, { color: theme.text }]}>
                Jetzt synchronisieren
              </Text>
              <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
                {lastSyncedAt
                  ? `Zuletzt: ${new Date(lastSyncedAt).toLocaleTimeString(
                      'de-DE'
                    )}`
                  : 'Noch nicht synchronisiert'}
              </Text>
            </View>
          </View>
          {syncState === 'syncing' ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Ionicons name="chevron-forward" size={20} color={theme.subtext} />
          )}
        </TouchableOpacity>
        {/* Auto-Sync Inactivity Delay */}
        <View
          style={[
            styles.row,
            styles.choiceRow,
            { backgroundColor: theme.cardBg, borderColor: theme.border },
          ]}
        >
          <View style={[styles.rowLeft, styles.choiceLabel]}>
            <Ionicons name="timer-outline" size={22} color="#34C759" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>
                Auto-Sync nach Ruhezeit
              </Text>
              <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
                Synct erst, wenn solange nichts geändert wurde
              </Text>
            </View>
          </View>
          <View style={styles.themeSegments}>
            {[
              { sec: 10, label: '10s' },
              { sec: 60, label: '1m' },
              { sec: 300, label: '5m' },
              { sec: 0, label: 'Aus' },
            ].map((opt) => {
              const active = autoSyncDelaySeconds === opt.sec;
              return (
                <TouchableOpacity
                  key={opt.sec}
                  style={[
                    styles.themeButton,
                    active && [
                      styles.themeButtonActive,
                      { backgroundColor: theme.accent },
                    ],
                  ]}
                  onPress={() => setAutoSyncDelaySeconds(opt.sec)}
                >
                  <Text
                    style={[
                      styles.themeButtonText,
                      { color: active ? (theme.onAccent ?? '#FFFFFF') : theme.subtext },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.calendarSection}>
        <CalendarPreferences onConnect={handleSignIn} connecting={authLoading || !request} />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>DOKUMENTE & NAS</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/nas-settings')} style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
          <View style={styles.rowLeft}><Ionicons name="server-outline" size={22} color={theme.accent} /><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: theme.text }]}>Synology NAS</Text><Text style={[styles.rowSubtitle, { color: theme.subtext }]}>WebDAV-Verbindung, Heimnetz und Offline-Dokumente</Text></View></View>
          <Ionicons name="chevron-forward" size={20} color={theme.subtext} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>SICHERN & SCANNEN</Text>
        {([{ title: 'Backups & Wiederherstellen', subtitle: 'Automatisch zu Hause aufs NAS sichern', route: '/backups', icon: 'save-outline' }, { title: 'Dokument scannen', subtitle: 'Mehrseitige PDF aufnehmen und hochladen', route: '/scan', icon: 'scan-outline' }] as const).map(item => <TouchableOpacity key={item.route} accessibilityRole="button" onPress={() => router.push(item.route)} style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.border }]}><View style={styles.rowLeft}><Ionicons name={item.icon} size={22} color={theme.accent} /><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: theme.text }]}>{item.title}</Text><Text style={[styles.rowSubtitle, { color: theme.subtext }]}>{item.subtitle}</Text></View></View><Ionicons name="chevron-forward" size={20} color={theme.subtext} /></TouchableOpacity>)}
      </View>
      {/* Board Layout & Appearance */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>
          BOARD
        </Text>

        {/* Layout Mode Picker */}
        <View
          style={[
            styles.row,
            styles.choiceRow,
            { backgroundColor: theme.cardBg, borderColor: theme.border },
          ]}
        >
          <View style={[styles.rowLeft, styles.choiceLabel]}>
            <Ionicons name="albums-outline" size={22} color={theme.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>
                Listen-Anordnung
              </Text>
              <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
                Nebeneinander oder untereinander
              </Text>
            </View>
          </View>
          <View style={styles.themeSegments}>
            {(['horizontal', 'vertical'] as BoardLayout[]).map((layout) => {
              const active = boardLayout === layout;
              return (
                <TouchableOpacity
                  key={layout}
                  style={[
                    styles.themeButton,
                    active && [
                      styles.themeButtonActive,
                      { backgroundColor: theme.accent },
                    ],
                  ]}
                  onPress={() => setBoardLayout(layout)}
                >
                  <Text
                    style={[
                      styles.themeButtonText,
                      { color: active ? (theme.onAccent ?? '#FFFFFF') : theme.subtext },
                    ]}
                  >
                    {layout === 'horizontal' ? 'Spalten' : 'Untereinander'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Completed Tasks Toggle */}
        <View
          style={[
            styles.row,
            { backgroundColor: theme.cardBg, borderColor: theme.border },
          ]}
        >
          <View style={styles.rowLeft}>
            <Ionicons
              name="checkmark-done-circle-outline"
              size={22}
              color="#34C759"
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>
                Erledigte Tasks standardmäßig aufklappen
              </Text>
              <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
                Wenn aus, sind erledigte Tasks eingeklappt
              </Text>
            </View>
          </View>
          <Switch
            value={showCompletedByDefault}
            onValueChange={setShowCompletedByDefault}
            trackColor={{ false: '#D1D1D6', true: '#34C759' }}
          />
        </View>

        {/* Spaltenbreite (Horizontales Board) */}
        <View
          style={[
            styles.columnWidthCard,
            { backgroundColor: theme.cardBg, borderColor: theme.border },
          ]}
        >
          <View style={styles.columnWidthHeaderRow}>
            <View style={styles.rowLeft}>
              <Ionicons name="resize-outline" size={22} color={theme.accent} />
              <View>
                <Text style={[styles.rowTitle, { color: theme.text }]}>
                  Spaltenbreite (Board)
                </Text>
                <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
                  Breite der horizontalen Spalten anpassen
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.widthValueBadge,
                { backgroundColor: theme.pillBg, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.widthValueText, { color: theme.accent }]}>
                {columnWidth} px
              </Text>
            </View>
          </View>

          {/* Preset Buttons */}
          <View style={styles.presetRow}>
            {[
              { label: 'Kompakt', width: 260 },
              { label: 'Standard', width: 320 },
              { label: 'Breit', width: 380 },
            ].map((p) => {
              const active = columnWidth === p.width;
              return (
                <TouchableOpacity
                  key={p.width}
                  style={[
                    styles.presetBtn,
                    {
                      backgroundColor: active ? theme.accent : theme.pillBg,
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}
                  onPress={() => setColumnWidth(p.width)}
                >
                  <Text
                    style={[
                      styles.presetBtnText,
                      { color: active ? (theme.onAccent ?? '#FFFFFF') : theme.text },
                    ]}
                  >
                    {p.label} ({p.width})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Stepper Fine-Tuning */}
          <View style={styles.stepperContainer}>
            <TouchableOpacity
              style={[
                styles.stepperBtn,
                { backgroundColor: theme.pillBg, borderColor: theme.border },
              ]}
              disabled={columnWidth <= 220}
              onPress={() => setColumnWidth(Math.max(220, columnWidth - 10))}
            >
              <Ionicons
                name="remove"
                size={18}
                color={columnWidth <= 220 ? theme.subtext : theme.text}
              />
              <Text
                style={[
                  styles.stepperBtnText,
                  { color: columnWidth <= 220 ? theme.subtext : theme.text },
                ]}
              >
                10px
              </Text>
            </TouchableOpacity>

            {/* Visual Indicator Bar */}
            <View style={styles.widthBarTrack}>
              <View
                style={[
                  styles.widthBarFill,
                  {
                    backgroundColor: theme.accent,
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        ((columnWidth - 220) / (380 - 220)) * 100
                      )
                    )}%`,
                  },
                ]}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.stepperBtn,
                { backgroundColor: theme.pillBg, borderColor: theme.border },
              ]}
              disabled={columnWidth >= 380}
              onPress={() => setColumnWidth(Math.min(380, columnWidth + 10))}
            >
              <Ionicons
                name="add"
                size={18}
                color={columnWidth >= 380 ? theme.subtext : theme.text}
              />
              <Text
                style={[
                  styles.stepperBtnText,
                  { color: columnWidth >= 380 ? theme.subtext : theme.text },
                ]}
              >
                10px
              </Text>
            </TouchableOpacity>
          </View>
        </View>




      </View>

      {/* Lists Visibility Selection */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>
          LISTEN IM BOARD
        </Text>
        {taskLists.length === 0 ? (
          <View
            style={[
              styles.row,
              { backgroundColor: theme.cardBg, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
              Noch keine Listen vorhanden.
            </Text>
          </View>
        ) : (
          taskLists.map((list) => {
            const dotColor =
              list.color ||
              COLUMN_PALETTE[list.position % COLUMN_PALETTE.length];
            return (
              <View
                key={list.id}
                style={[
                  styles.row,
                  { backgroundColor: theme.cardBg, borderColor: theme.border },
                ]}
              >
                <View style={styles.rowLeft}>
                  <TouchableOpacity
                    onPress={() => setColorPickerList(list)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={[
                      styles.listColorDotBtn,
                      { borderColor: dotColor + '66' },
                    ]}
                  >
                    <View
                      style={[
                        styles.listColorDot,
                        { backgroundColor: dotColor },
                      ]}
                    />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.rowTitle, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {list.title}
                    </Text>
                    <Text
                      style={[styles.rowSubtitle, { color: theme.subtext }]}
                    >
                      {list.isVisible ? 'Im Board sichtbar' : 'Ausgeblendet'} ·
                      Farbpunkt antippen zum Ändern
                    </Text>
                  </View>
                </View>

                <View style={styles.listRowActions}>
                  <TouchableOpacity
                    onPress={() => handleDeleteList(list.id, list.title)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ marginRight: 8 }}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={theme.subtext}
                    />
                  </TouchableOpacity>
                  <Switch
                    value={list.isVisible}
                    onValueChange={(val) =>
                      toggleTaskListVisibility(list.id, val)
                    }
                    trackColor={{ false: '#D1D1D6', true: '#34C759' }}
                  />
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Design Preset Selector */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>
          ERSCHEINUNGSBILD
        </Text>
        {/* Theme Mode Picker */}
        <View
          style={[
            styles.row,
            styles.choiceRow,
            { backgroundColor: theme.cardBg, borderColor: theme.border },
          ]}
        >
          <View style={[styles.rowLeft, styles.choiceLabel]}>
            <Ionicons name="contrast-outline" size={22} color="#FF9500" />
            <Text style={[styles.rowTitle, { color: theme.text }]}>
              Hell / Dunkel
            </Text>
          </View>
          <View style={styles.themeSegments}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => {
              const active = themeMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.themeButton,
                    active && [
                      styles.themeButtonActive,
                      { backgroundColor: theme.accent },
                    ],
                  ]}
                  onPress={() => setThemeMode(mode)}
                >
                  <Text
                    style={[
                      styles.themeButtonText,
                      { color: active ? (theme.onAccent ?? '#FFFFFF') : theme.subtext },
                    ]}
                  >
                    {mode === 'system'
                      ? 'Auto'
                      : mode === 'light'
                      ? 'Hell'
                      : 'Dunkel'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={styles.designGallery}><DesignGallery /></View>
        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>WEITERE STILE</Text>
        {DESIGN_PRESETS.map((p) => {
          const isSelected = designPreset === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => setDesignPreset(p.id)}
              style={[
                styles.row,
                { backgroundColor: theme.cardBg, borderColor: theme.border },
              ]}
            >
              <View style={styles.rowLeft}>
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={isSelected ? theme.accent : theme.subtext}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>
                    {p.name}
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
                    {p.desc}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* iPhone Push Notifications */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>
          MITTEILUNGEN
        </Text>
        <View
          style={[
            styles.row,
            { backgroundColor: theme.cardBg, borderColor: theme.border },
          ]}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="notifications-outline" size={22} color="#FF3B30" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>
                Täglicher Überblick (08:30 Uhr)
              </Text>
              <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
                Offene Aufgaben und Termine deiner ausgewählten Kalender. Für 14 Tage vorgeplant und bei App-Nutzung aktualisiert.
              </Text>
            </View>
          </View>
          <Switch
            value={dailyBriefingEnabled}
            onValueChange={setDailyBriefingEnabled}
            trackColor={{ false: '#D1D1D6', true: '#34C759' }}
          />
        </View>

        <Text accessibilityRole={briefingStatus.error ? 'alert' : undefined} style={{ color: theme.subtext, fontSize: 12, lineHeight: 19, marginBottom: 12 }}>{briefingStatus.message}</Text>

        <TouchableOpacity
          style={[
            styles.row,
            { backgroundColor: theme.cardBg, borderColor: theme.border },
          ]}
          onPress={handleTestNotification}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="paper-plane-outline" size={22} color={theme.accent} />
            <View>
              <Text style={[styles.rowTitle, { color: theme.text }]}>
                Tagesübersicht als Test senden
              </Text>
              <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
                Prüft, ob Banner & Ton sofort funktionieren
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.subtext} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>SCHNELLERFASSUNG & SIRI</Text>
        <CapturePreferences />
        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>DATENSCHUTZ & APP-SPERRE</Text>
        <PrivacyPreferences />
        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>WIDGETS</Text>
        <WidgetPreferences />

        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>BEDIENUNG</Text>
        {/* Task Completion Tip */}
        <View
          style={[
            styles.hintRow,
            { backgroundColor: theme.cardBg, borderColor: theme.border },
          ]}
        >
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={theme.accent}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.hintTitle, { color: theme.text }]}>
              Aufgaben schnell abhaken
            </Text>
            <Text style={[styles.hintText, { color: theme.subtext }]}>
              Doppeltippe auf eine Karte, um sie als erledigt/offen zu
              markieren. Ein einfacher Tipp öffnet die Details zum Bearbeiten.
            </Text>
          </View>
        </View>
      </View>

      <ColorPickerModal
        visible={Boolean(colorPickerList)}
        initialColor={
          colorPickerList
            ? colorPickerList.color ||
              COLUMN_PALETTE[colorPickerList.position % COLUMN_PALETTE.length]
            : '#007AFF'
        }
        listTitle={colorPickerList?.title || ''}
        onClose={() => setColorPickerList(null)}
        onSelectColor={(hex) => {
          if (colorPickerList) {
            setTaskListColor(colorPickerList.id, hex);
          }
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  calendarSection: {
    marginTop: 22,
    marginHorizontal: 20,
  },
  choiceRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  choiceLabel: {
    flex: 0,
    alignSelf: 'stretch',
  },
  designGallery: {
    marginHorizontal: 20,
    marginTop: 16,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    paddingHorizontal: 20,
    marginBottom: 7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  listColorDotBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  listRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  themeSegments: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
    backgroundColor: '#7676801F',
    borderRadius: 8,
    padding: 2,
  },
  themeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  themeButtonActive: {
    backgroundColor: '#007AFF',
  },
  themeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  signOutText: {
    fontSize: 15,
    color: '#FF3B30',
    fontWeight: '600',
  },
  columnWidthCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  columnWidthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  widthValueBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  widthValueText: {
    fontSize: 14,
    fontWeight: '700',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  stepperBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  stepperBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  widthBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#7676801F',
    overflow: 'hidden',
  },
  widthBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hintTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  hintText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
