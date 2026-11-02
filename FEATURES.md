# Neue Planner-Funktionen

## Wiederkehrende Aufgaben

Aufgabe öffnen → Wiederholung: täglich, Mo–Fr, wöchentlich, monatlich oder
jährlich. Außer Mo–Fr kann ein Intervall von 1 bis 99 gewählt werden. Das erste
Fälligkeitsdatum lässt sich über „Datum wählen“ einstellen.

Beim Erledigen entsteht genau eine offene Folgeaufgabe. Verpasste Tage erzeugen
keinen Stapel rückwirkender Aufgaben. Monatsenden und der 29. Februar behalten
ihren ursprünglichen Tagesanker. Ohne Datum beginnt die Reihe am Erledigungstag.
Checklisten werden für die Folgeaufgabe zurückgesetzt, Dokumentverknüpfungen
übernommen. Eine gelöschte Folgeaufgabe wird nicht erneut erzeugt. Zum Beenden
einer Reihe die Wiederholung der nächsten offenen Aufgabe auf „Keine“ stellen.
Eine bereits erledigte Aufgabe erneut zu öffnen löscht ihre Folgeaufgabe nicht.

Erledigungen aus Google Tasks werden beim nächsten Laden nach der Synchronisierung
erkannt. Wiederholungsregeln bleiben auf diesem Gerät; generierte Aufgaben werden
als normale neue Aufgaben zu Google synchronisiert.

## Checklisten und NAS-Dokumente

In der Aufgabenansicht Schritte hinzufügen, abhaken, bearbeiten und entfernen.
Bis zu 100 Schritte pro Aufgabe. Die Karten zeigen den Fortschritt.

Unter „Dokumente vom NAS“ eine Datei aus dem konfigurierten NAS-Startordner
auswählen. Bis zu 30 Verknüpfungen pro Aufgabe. Es werden NAS-Verbindungs-ID,
relativer Pfad und Name gespeichert, keine Passwörter oder öffentlichen Links.
Öffnen speichert die Aufgabe und startet die vorhandene Dokumentvorschau.
Ein Verbindungswechsel kann die Verknüpfung vorübergehend unzugänglich machen;
sie greift nicht still auf eine andere NAS-Verbindung zu.

Für Zugriff unterwegs muss die Datei im Dokument-Explorer als Offline-Favorit
bereitstehen. Nicht vorgeladene Dateien benötigen das hinterlegte Heim-WLAN.
Checklisten, Wiederholungsregeln und Verknüpfungen sind lokale Zusatzfelder und
werden derzeit nicht zwischen Geräten oder als native Google-Unteraufgaben
synchronisiert. Normale Google-Aufgabenänderungen überschreiben sie nicht.

## Schnellerfassung, Teilen und Siri

Der Plus-Knopf oben auf dem Board und Einstellungen → Schnellerfassung öffnen
eine eigene Eingabe für Titel, Notiz und Liste. Ohne Listenwahl wird die erste
sichtbare Liste verwendet; bei Bedarf wird „Eingang“ erstellt.

Im iPhone-Teilen-Menü Text oder einen Webseiten-Link an die App senden. Die
Schnellerfassung zeigt den Inhalt zur Bearbeitung und ausdrücklichen Bestätigung.
Es werden nur rohe Texte/Links übernommen, keine Webseiten automatisch geladen
und keine lokalen Dateipfade als Anlagen importiert. Die Share Extension nutzt
dieselbe App Group wie die Widgets.

In Kurzbefehle steht „Aufgabe in Planner hinzufügen“ bereit. Siri-Phrase:
„Aufgabe in Kanban Tasks hinzufügen“ (der Name richtet sich nach dem installierten
App-Namen). Siri fragt den Titel ab und öffnet die App. Nach Geräte- und ggf.
App-Entsperrung wird die Aufgabe übernommen. Native Aufrufe bleiben bis zur
Verarbeitung in einer Warteschlange. Transaktionale Belege verhindern doppelte
Aufgaben bei wiederholter Zustellung oder einem Absturz nach dem Speichern.
Siri veröffentlicht keine Aufgabenlisten oder Notizen als Spotlight-Katalog.

`expo-app-intents` ist in dieser Expo-Version Alpha. Der Empfang über
`expo-sharing` ist experimentell; die iOS-Implementierung öffnet die Haupt-App aus
der Erweiterung über einen von Expo dokumentierten Workaround. Dieses Verhalten
muss insbesondere nach iOS-Updates auf einem Gerät geprüft werden.

## App-Sperre und Mitteilungen

Einstellungen → Datenschutz & App-Sperre: Face ID/Touch ID optional einschalten.
Aktivieren und Deaktivieren verlangen eine erfolgreiche Geräteprüfung. Der
Gerätecode dient als Alternative, wenn das Betriebssystem ihn anbietet.

Nach einem Wechsel in den Hintergrund wird die App gesperrt. Beim Kaltstart
werden private Ansichten erst nach dem Laden der Einstellung und erfolgreicher
Entsperrung aufgebaut. Geöffnete Formulare bleiben bei späterem Sperren montiert,
um ungespeicherte Eingaben nicht wegen der Sperre zu verlieren. Eine native
Vollbildabdeckung und der iOS-App-Switcher-Schutz verdecken die Oberfläche.
Abgebrochene oder veraltete Geräteprüfungen entsperren nicht. Bei einem Fehler
beim Lesen der geschützten Einstellung bleibt die Oberfläche geschlossen.

„Mitteilungstexte ausblenden“ ersetzt Aufgaben-/Listentitel durch neutrale Texte.
Geplante Aufgaben-Erinnerungen werden anhand ihres gespeicherten Fälligkeitszeitpunkts
neu geplant und sichtbare Mitteilungen dieser App entfernt. Neue Fokus-Erinnerungen
speichern ihren Endzeitpunkt, damit eine Anpassung ihn beibehält. Alte Fokus-
Erinnerungen ohne rekonstruierbaren Endzeitpunkt werden bei der Redaktion entfernt.
Beim Ausschalten erscheinen private Texte wieder bei neu geplanten Mitteilungen.

Die App-Sperre verschlüsselt weder SQLite noch Offlinekopien zusätzlich und
entfernt nach Abmeldung keine Daten. Widgets sind getrennte Oberflächen; ihre
Sichtbarkeit bleibt von den iOS-Einstellungen abhängig. Bestehende Google-/NAS-
Sitzungen werden durch das Sperren der Oberfläche nicht abgemeldet.

## Täglicher Überblick auf dem Sperrbildschirm

Einstellungen → Mitteilungen → Täglicher Überblick: täglich um 08:30 Uhr Ortszeit.
Offene Aufgaben aus sichtbaren Listen, fällige/überfällige Aufgaben und die Termine
aus den ausgewählten Google-Kalendern werden zusammengefasst. Tagesfilter gelten
auch für ganztägige und mehrtägige Termine. Jede Übersicht enthält einen Stand;
sie beschreibt die beim Planen bekannten Daten und sagt zukünftige Erledigungen
nicht voraus. Fehlende Kalenderdaten werden ausdrücklich als nicht geladen markiert.

Für bis zu 14 Tage werden einzelne lokale Mitteilungen vorgeplant und bei
Aufgaben-/Kalender-/Datenschutzänderungen sowie aktiver App-Nutzung ersetzt.
Ein Monatwechsel im Vorschauzeitraum lädt auch den nächsten Kalendermonat.
Bei vielen Einzel-Erinnerungen ist der Zeitraum kürzer; der Status in den
Einstellungen nennt Anzahl und Enddatum. Ohne erneute App-Nutzung endet die
Vorausplanung nach diesem Zeitraum. Ein Push-Server oder eine garantierte
Google-Abfrage bei Zustellung wurde nicht eingerichtet.

„Tagesübersicht als Test senden“ verwendet dieselbe Inhaltsaufbereitung und
beachtet „Mitteilungstexte ausblenden“. Antippen öffnet das Board. Face ID bleibt
dabei vorgeschaltet. Die alte wiederholte Nachricht mit dauerhaft gleichem
Aufgabenzähler wird entfernt. Beim Ausschalten werden nur Übersichten abbestellt,
keine individuellen Aufgaben-Erinnerungen.

Unter iPhone-Einstellungen → Mitteilungen → Kanban Tasks muss „Sperrbildschirm“
aktiviert sein. Fokus, Zusammenfassungen und ausgeblendete Vorschauen können die
Anzeige beeinflussen. Eine normale iOS-Mitteilung kann nicht dauerhaft angeheftet
oder gegen Wegwischen geschützt werden.

Das kleine Symbol stammt unter iOS aus dem App-Icon. Der lokale Config-Plugin
`plugins/withNotificationAppIcons.js` ergänzt die PNG-Größen für iPhone/iPad nach
der normalen Expo-Icon-Erzeugung; das bestehende Logo bleibt die Quelle. Dafür
ist ein neuer nativer Build nötig. Expo Go verwendet weiterhin das Expo-Go-Symbol.
Ob ein fehlendes Symbol durch diese Ergänzung auf einem konkreten Gerät behoben
wird, muss nach dem Neuinstallieren geprüft werden.

## Verlauf, Suche, Projekte, Fokus, Backups und Scanner

Auf dem Board öffnen Suche, Projekte, Verlauf und Fokus die neuen Ansichten.
Die Aufgabenbearbeitung enthält ein Projektfeld und bis zu 20 Tags. Diese lokalen
Felder bleiben bei Google-Synchronisierungen erhalten und werden an Folgeaufgaben
weitergegeben. Die Suche findet Titel, Notizen, Checklisten und Dokumentnamen in
allen lokalen Listen, bekannten NAS-Dateien und bereits geladenen ausgewählten
Kalendern. Dateiinhalte und unbekannte NAS-Ordner werden nicht durchsucht.

Lokale Aufgabenänderungen, Löschungen und Listenlöschungen erhalten einen
SQLite-Verlauf (höchstens 200 Einträge, die neuesten 100 sichtbar). Rückgängig
prüft den zwischenzeitlichen Aufgabenstand; bei Konflikten ist eine neue Kopie
möglich. Nach einem bereits synchronisierten Löschen wird eine neue Remote-Aufgabe
erstellt. Gelöschte Listen werden als separate Listen rekonstruiert. Eine bereits
erzeugte Wiederholungsfolge bleibt beim Rückgängigmachen eines Abschlusses erhalten.

Der Fokusmodus zeigt eine ausgewählte offene Aufgabe, optional mit Timer. Der
Endzeitpunkt und Pausen werden gespeichert; beim Wiederöffnen ergibt sich die
Restzeit aus der Uhrzeit. Die Timer-Mitteilung benötigt die iOS-Erlaubnis und
beachtet private Benachrichtigungen. Es werden keine Kalenderzeiten reserviert.

Unter Einstellungen → Sichern & Scannen sind Sicherungen und Dokumentkamera
erreichbar. Automatische NAS-Sicherungen sind aktiviert und laufen höchstens
alle 24 Stunden bei geöffneter, entsperrter App im erkannten Heimnetz. Das ist kein
garantierter iOS-Hintergrunddienst. Ziel ist `Planner-Backups` im NAS-Startordner.
Jede JSON-Sicherung bekommt einen eigenen Namen, wird mit SHA-256 versehen und
nach dem Upload zur Bestätigung zurückgelesen. Kein Überschreiben oder automatisches
Löschen alter Sicherungen. Enthalten sind aktive Listen mit offenen und erledigten
Aufgaben einschließlich lokaler Metadaten und Wiederholungsbelegen. Kalenderdaten,
Zugangsdaten, Dokumentdateien und der Änderungsverlauf sind nicht enthalten.
Importierte Sicherungen ergänzen neue Listen und Aufgaben; bestehende bleiben
erhalten. Die Google-Kontozuordnung wird geprüft. Dokumentverknüpfungen funktionieren
nach Wiederherstellung nur mit der zugehörigen NAS-Konfiguration.

Die iPhone-Dokumentkamera erstellt PDFs mit bis zu 20 Seiten und 50 MB. Bis zu
30 lokale Scans bzw. insgesamt 250 MB bleiben dauerhaft auf dem Gerät, bis sie
ausdrücklich gelöscht werden. Vorschau und Teilen funktionieren ohne NAS; Upload
verwendet die bestehenden Heimnetz-, HTTPS- und Überschreibschutz-Regeln. Die Kamera
ist unter Dokumente über das Scan-Symbol erreichbar. Die native Umsetzung liegt
unter `native/PlannerDocumentScanner.swift` und benötigt einen neuen iOS-Build;
in Expo Go ist die Dokumentkamera nicht verfügbar.

## Build und Prüfung

Ein neuer nativer iOS-Build ist für Face ID, Siri und den Empfang im Teilen-Menü
erforderlich. App, Widget und Share Extension müssen passend signiert sein und
die konfigurierte App Group behalten. Ein Expo-Go-Test ersetzt diese Prüfung nicht.
Siri-Definitionen liegen unter `app-intents/`; das Expo-Plugin bindet sie als
Inline-Module in das App-Target ein. Eine Tagesplanung wurde nicht implementiert.

`node --test tests/*.test.cjs` umfasst Tests mit echter In-Memory-SQLite für
Migration, Transaktionen, Checklisten, Wiederholungen und idempotente Erfassung.
Die Feature-Tests benötigen Node mit `node:sqlite` (Node 22.13 oder neuer).
Zusätzlich TypeScript-Prüfung und iOS-JavaScript-Export. Die native Generierung
wird auf Windows von Expo abgelehnt; der Xcode-Build und echte Siri-, Share-,
Face-ID- und Vorschau-Tests sind auf macOS/iPhone noch erforderlich.
