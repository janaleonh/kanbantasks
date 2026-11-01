# Kanban Tasks für iOS

Eine iOS-Kanban-App auf Basis von Expo und React Native. Die App speichert Aufgaben lokal und kann mit Google Tasks synchronisiert werden.

## IPA über GitHub Actions bauen

Der Workflow [`.github/workflows/build-ios-ipa.yml`](.github/workflows/build-ios-ipa.yml) erzeugt auf einem macOS-GitHub-Runner eine **unsignierte iOS-IPA**. Sideloadly signiert diese IPA anschließend mit deiner Apple-ID.

1. Erstelle auf GitHub ein neues, leeres Repository (ohne README oder `.gitignore`).
2. Initialisiere das Projekt und lade es hoch:

   ```powershell
   git init
   git add .
   git commit -m "Initial iOS Kanban app"
   git branch -M main
   git remote add origin https://github.com/DEIN-NAME/DEIN-REPOSITORY.git
   git push -u origin main
   ```

3. Öffne im GitHub-Repository **Actions** → **Build Unsigned iOS IPA (Sideloadly / AltStore)** → **Run workflow**.
4. Warte auf den erfolgreichen Lauf und lade unter **Artifacts** `KanbanTasks-unsigned-ipa` herunter. Entpacke das Artifact; darin liegt `KanbanTasks.ipa`.

## Mit Sideloadly installieren

1. Installiere und öffne [Sideloadly](https://sideloadly.io/).
2. Verbinde dein iPhone per Kabel (oder aktiviere nach der ersten Installation WLAN-Synchronisierung in iTunes/Finder).
3. Wähle dein iPhone in Sideloadly aus und ziehe `KanbanTasks.ipa` in das Fenster.
4. Melde dich mit deiner Apple-ID an und starte die Installation.
5. Öffne auf dem iPhone **Einstellungen** → **Allgemein** → **VPN & Geräteverwaltung** und vertraue dem Entwicklerzertifikat.

Mit einer kostenlosen Apple-ID muss die App normalerweise spätestens nach sieben Tagen erneut per Sideloadly signiert werden. Ein kostenpflichtiges Apple-Developer-Konto verlängert die Gültigkeit in der Regel auf ein Jahr.

## Lokal entwickeln

### Synology-Dokumente über WebDAV

Im Board führt **Dokumente** zum eigenen Mini-Explorer. Unter
**Einstellungen → Dokumente & NAS → Synology NAS** werden die Verbindung und das
Heimnetz eingerichtet. Die App lädt vom NAS auf das iPhone (PROPFIND/GET).
Unter **Dokumente → NAS-Ordner → Datei hochladen** lassen sich einzelne Dateien
aus der iPhone-Dateiauswahl in den geöffneten Ordner hochladen (PUT, maximal 50 MB).
Dateiname und Zielordner werden vor dem Upload bestätigt. Bestehende Dateien
werden durch `If-None-Match: *` vor Überschreiben geschützt; bei gleichem Namen
muss die lokale Datei umbenannt werden. Es gibt keine automatischen Uploads,
Wiederholungen, Verschiebungen oder Löschungen von NAS-Dateien. Nach einem
Verbindungsabbruch den Zielordner prüfen: Eine neue Datei kann bereits vollständig
oder teilweise auf dem NAS liegen. Die temporäre lokale Auswahlkopie wird nach
Abschluss oder Abbruch entfernt. Ein nativer Neubuild ist für den Dateiauswahldialog nötig.

Einrichtung auf dem NAS und iPhone:

1. In DSM das Paket **WebDAV Server** installieren und HTTPS aktivieren
   (Standardport 5006). Eine HTTPS-Adresse verwenden, deren Zertifikat auf dem
   iPhone vertrauenswürdig ist und genau zu diesem Hostnamen passt. Es gibt keinen
   Schalter zum Umgehen der Zertifikatsprüfung.
2. Einen NAS-Benutzer mit Lesezugriff (für Uploads zusätzlich Schreibzugriff) auf die gewünschten Freigaben und Zugriff auf
   den WebDAV-Dienst verwenden. Im Planner Serveradresse ohne Ordnerpfad,
   Startordner (z. B. `/home/Drive/Wichtig`), Benutzer und Passwort eintragen.
3. Mit dem Heim-WLAN verbinden und **Dieses WLAN als Heimnetz übernehmen** wählen.
   IPv4-Adresse und Netzmaske ergeben den Heimnetzbereich; falls keine Netzmaske
   vorliegt, wird `/24` vorgeschlagen und kann angepasst werden. Die Erkennung
   verwendet keinen WLAN-Namen und benötigt keine Standortabfrage. Sie basiert auf
   dem konfigurierten IPv4-Netzbereich, nicht auf einer eindeutigen WLAN-Identität.
   Bei nicht privaten Adressen sind nur eng eingegrenzte Bereiche mit /24 bis /32 erlaubt.
   Zusätzlich muss das konfigurierte NAS mit gültigem Zertifikat und Zugang
   erreichbar sein. IPv6-only-Heimnetze werden in dieser Version nicht erkannt.
4. **Speichern & Verbindung prüfen** wählen und die iOS-Freigabe für das lokale
   Netzwerk erlauben. Danach im Explorer Dateien oder Ordner mit dem Stern als
   Offline-Favoriten markieren. Ordner werden einschließlich Unterordnern geladen.

Automatischer Abgleich läuft beim Öffnen/Fortsetzen der App und während aktiver
Nutzung etwa alle fünf Minuten, sofern Heim-WLAN und automatische Synchronisierung
aktiv sind. Ein sofortiger Abgleich im Hintergrund beim Heimkommen wird nicht
zugesichert. Beim Wechsel auf Mobilfunk oder in ein anderes erkanntes Netz werden
laufende Übertragungen abgebrochen. Die Netzwerkbedingung wird vor jeder Anfrage
erneut geprüft. Änderungen am Server werden anhand von ETag bzw. Änderungsdatum und
Größe erkannt. Maximal 50 MB pro Datei, 500 MB an aktiven Offlinekopien und 200 Dateien
in höchstens 100 Ordnern pro Abgleich; bei einem Limit wird ein Hinweis angezeigt.
Größere Bestände auf kleinere Favoritenordner verteilen.

Zugangsdaten liegen ausschließlich in Expo SecureStore mit
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Dokumentkopien und Index liegen im lokalen
App-Speicher. Neue Versionen werden gestreamt und erst nach vollständigem Download
übernommen; eine alte Offlineversion bleibt bei einem Fehler erhalten. Auf dem NAS
verschwundene Dateien werden als fehlend markiert, die letzte Offlinekopie bleibt
erhalten. Das Entfernen einer Favoritenmarkierung gibt ausschließlich die davon
abhängigen lokalen Kopien frei; einzeln weiter markierte Dateien bleiben erhalten.
Geöffnete Vorschau-/Teilen-Dateien werden erst nach dem Schließen freigegeben.
**Verbindung und Offlinekopien entfernen** löscht alle gespeicherten NAS-Zugangsdaten
und NAS-Kopien dieser App vom Gerät, keine Originale auf dem NAS.

PDF-Vorschau auf iOS, Bildvorschau und kleine Textdateien werden direkt angezeigt.
Andere Formate lassen sich über **Öffnen / Teilen** an geeignete Apps übergeben.
Die Vorschau öffnet nur lokale Dateien; WebDAV-Zugangsdaten werden nicht an die
Vorschau übergeben. HTTPS-Weiterleitungen und Einträge außerhalb des Startordners
werden nicht verwendet.

Nach dem Hinzufügen der nativen Bibliotheken und der lokalen Netzwerkbeschreibung
einen neuen nativen iOS-Build erstellen. TypeScript, iOS-JavaScript-Export und
simulierte WebDAV-/Download-/Abbruchtests lassen sich lokal prüfen. NAS-Verbindung,
Geräteberechtigungen und native Vorschau müssen zusätzlich auf einem iPhone mit
einem echten Synology NAS geprüft werden.

Tests: `node --test tests/documents.test.cjs tests/calendar.test.cjs tests/widget-snapshot.test.cjs`.

### Google Kalender

Unter **Einstellungen → Google Kalender** anmelden bzw. **Kalenderzugriff erlauben**
wählen und die gewünschten Kalender einschalten. Die Auswahl wird pro Google-Konto
lokal gespeichert. Über **Kalender** im Board öffnet sich die Wochenansicht mit
Terminen direkt in den Tagesspalten (Montag bis Sonntag, seitlich scrollbar).
Mit **Tag / Woche / Monat** kann zwischen Tages-, Wochen- und Monatsansicht gewechselt werden.
Wochen über Monats- und Jahresgrenzen laden alle betroffenen Monate.
Es gibt eine gemeinsame Board-Ansicht; eine vorhandene Spalte namens **Heute**
zeigt zusätzlich zu den Aufgaben die heutigen Termine.
Termine sind eigene Einträge und werden nicht in Google Tasks kopiert.
Ohne passende Termine wird im Kanban gar kein Kalenderbereich angezeigt – auch
keine Überschrift, Ladeanzeige oder Leermeldung.

**Neuer Termin**, die Plus-Schaltfläche im Wochentag oder langes Drücken auf einen
Monatstag öffnen den Termineditor. Tippen auf einen Termin öffnet seine Details.
Unterstützt werden Anlegen, Bearbeiten, Löschen, Duplizieren und Verschieben
gewöhnlicher Termine zwischen beschreibbaren Kalendern. Kalender mit ausschließlich
Leserechten werden respektiert. Im Menü oben rechts befinden sich Duplizieren,
Löschen und der Link zu Google Kalender.

Der Editor umfasst Titel, Beschreibung, Ort, Beginn/Ende, Ganztag (inklusive
mehrtägiger Termine), IANA-Zeitzone, Kalender, Verfügbarkeit, Sichtbarkeit,
Terminfarbe und bis zu fünf Popup-/E-Mail-Erinnerungen. Wiederholungen können
täglich, werktäglich, wöchentlich mit gewählten Wochentagen, monatlich oder jährlich
erfolgen, mit Intervall sowie Enddatum oder Anzahl. Vorhandene komplexe
Wiederholungsregeln können unverändert beibehalten werden. Bei Serienterminen
wird explizit zwischen dem einzelnen Vorkommen und der gesamten Serie gewählt.
Eine Bearbeitung „dieser und aller folgenden Termine“ ist nicht implementiert.

Updates verwenden PATCH und ETags, damit nicht bearbeitete Google-Felder erhalten
bleiben und gleichzeitige Änderungen erkannt werden. Speichern ist online; erst
nach erfolgreicher Google-Antwort wird geschlossen. Bei vorhandenen Teilnehmern
werden Änderungen gemäß `sendUpdates=all` durch Google weitergegeben. Ein neu
angelegter Termin behält für Wiederholungsversuche dieselbe ID, um Duplikate nach
einem Verbindungsabbruch zu vermeiden. Bei einem Kalenderwechsel werden zuerst
die Änderungen gespeichert und dann der Termin verschoben; ein gescheiterter
zweiter Schritt wird ausdrücklich als teilweise erfolgreiche Aktion angezeigt.

Im zum vorhandenen OAuth-Client gehörenden Google-Cloud-Projekt muss die
**Google Calendar API** aktiviert sein. Auf dem OAuth-Zustimmungsbildschirm die
Scopes `calendar.calendarlist.readonly` und **`calendar.events`** freigeben
(mit vollständigem Präfix `https://www.googleapis.com/auth/`). Bereits angemeldete
Nutzer müssen die zusätzliche Kalender-Schreibberechtigung einmal erteilen; das Aktualisieren
eines alten Tasks-Tokens erweitert seine Berechtigungen nicht.

Serientermine werden als einzelne Vorkommen geladen; abgesagte und selbst abgelehnte
Einladungen werden ausgelassen. Ganztägige Enddaten sind exklusiv. Die Heute-Anzeige
folgt dem lokalen Tag des Geräts, aktualisiert sich um Mitternacht und beim Öffnen
der App. Vergangene Termine bleiben in der Kalenderansicht erhalten. Beim Abmelden
werden geladene Termine aus dem Arbeitsspeicher entfernt; bei einem Kontowechsel wird
die Auswahl des jeweiligen Kontos verwendet. Termine werden während der Nutzung
regelmäßig neu geladen und können durch Herunterziehen der Kalenderansicht aktualisiert
werden. Ein frischer App-Start benötigt zum Laden der Termine eine Internetverbindung.

Validierung: `node --test tests/calendar.test.cjs tests/widget-snapshot.test.cjs`.

### iPhone-Widgets

Die Widgets **Heute** (klein, mittel, groß sowie Sperrbildschirm) und
**Aufgabenübersicht** (klein, mittel, groß) verwenden die Aufgaben der sichtbaren
Listen. Tippen öffnet das gemeinsame Board. Daten werden nach dem
Laden und bei Änderungen in der App veröffentlicht; die Timeline berücksichtigt
die nächsten sieben Tageswechsel. Google-Synchronisierung im Hintergrund ist
dadurch nicht automatisch aktiviert.

Die Widgets verwenden einen nativen Materialhintergrund und adaptive Textfarben.
Im transparenten Homescreen-Stil übernimmt iOS die Glasdarstellung. In anderen
Darstellungen entscheidet iOS über Hintergrund und Tönung.

Widgets sind nicht in Expo Go verfügbar. Nach `npm install` muss ein neuer nativer
iOS-Build erstellt werden. Der `expo-widgets`-Config-Plugin erzeugt die Extension
und die gemeinsame App Group `group.com.janasue.kanbantasks`. App und Extension
müssen beim Installieren mit passenden App-Group-Entitlements signiert werden;
das bisherige unsignierte IPA allein prüft diese Berechtigungen nicht. Den nativen
Build und die Darstellung auf einem iPhone separat prüfen.

Nach der Installation die App einmal öffnen, anschließend auf dem Home-Bildschirm
lange drücken → Widget hinzufügen → Kanban Tasks. Für den Sperrbildschirm die
Widgetauswahl beim Anpassen des Sperrbildschirms öffnen.

Die reine Datenaufbereitung lässt sich mit
`node --test tests/widget-snapshot.test.cjs` prüfen.

Für die lokale Vorschau wird Node.js (LTS) benötigt:

```powershell
npm install
npm run start
```

Zum Erstellen der IPA ist kein Mac erforderlich: Der GitHub-Workflow übernimmt den iOS-Build auf macOS.
