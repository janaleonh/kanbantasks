# Sicherheitsprüfung vom 01.11.2026

Geprüft wurden der Quellcode von Anmeldung, Aufgaben-Synchronisierung,
Kalenderverwaltung, SQLite-Speicherung, Widgets, Benachrichtigungen, NAS-Explorer,
Dateivorschau und Upload sowie App-/Build-Konfiguration und npm-Abhängigkeiten.
Die Prüfung ist kein vollständiger Penetrationstest oder Sicherheitsnachweis.
Der native Release-Build, Betriebssystembibliotheken und NAS-/Google-Konten
wurden nicht durch einen Angriffstest untersucht.

## Behobene Probleme der Gesamtprüfung

1. Die Aufgaben-Datenbank war keinem Google-Konto zugeordnet. Nach Abmeldung
   und Login mit einem anderen Konto konnten lokale Aufgaben in das andere
   Konto übertragen werden. Die Datenbank merkt sich jetzt das erste bekannte
   Konto; Tasks-Sync und jede Tasks-Anfrage verweigern abweichende Konten.
   Bestehende Daten werden ohne Löschung dem bisher gespeicherten Konto
   zugeordnet; historische Kontozugehörigkeit lässt sich nicht rekonstruieren.
   Ein Kontowechsel mit getrennter Aufgabenverwaltung ist damit noch nicht
   implementiert. Lokale Daten bleiben nach Abmeldung sichtbar, wie im Dialog
   angekündigt; diese Sperre verhindert Übertragung, nicht lokalen Zugriff.
2. Verspätete OAuth-, Token-Refresh- oder Userinfo-Antworten konnten nach der
   Abmeldung Tokens bzw. Kontodaten erneut speichern. Eine Sitzungsrevision und
   serialisierte Schreibvorgänge verhindern dies nun. Neue Tokens sind für
   API-Aufrufe gesperrt, bis Google eine verifizierte Identität bestätigt hat.
   Der manuelle Test-Login ohne bestätigte Kontoinformation wurde entfernt.
3. Die automatische Duplikatbereinigung konnte absichtlich gleich benannte
   Aufgaben trotz unterschiedlicher Termine lokal und auf Google löschen.
   Textgleichheit löst jetzt keine Löschung mehr aus. Mehrere lokale Zeilen für
   dieselbe Remote-ID werden weiterhin bereinigt.
4. Remote-IDs und Seitentokens im Tasks-Client werden URL-kodiert; rohe
   API-Fehlerantworten werden nicht mehr in die Fehlermeldung übernommen.
5. Widget-Inhalte sind für SwiftUI als `privacySensitive` markiert. Die tatsächliche
   Darstellung richtet sich nach iOS und den Datenschutz-Einstellungen des Nutzers.

## Weitere geprüfte Schutzmechanismen und Grenzen

- Google-OAuth verwendet Authorization Code mit PKCE und keinen eingebetteten
  Client-Secret. Die sichtbare OAuth-Client-ID ist kein geheimer Schlüssel.
- Google-API-Adressen sind fest auf HTTPS gesetzt. Tasks und Kalender prüfen
  Sitzungswechsel vor und nach Antworten. Bereits abgeschickte Änderungen sind
  beim Abmelden nicht rückgängig zu machen; ein serverseitiger Token-Widerruf
  wird derzeit nicht ausgeführt.
- SQLite-Abfragen binden Benutzereingaben als Parameter. Dynamische Spaltennamen
  stammen aus fest vorgegebenen Feldern, nicht aus Benutzereingaben.
- Deep Links öffnen Ansichten; sie führen keine automatischen Terminänderungen
  oder Uploads aus. Externe Kalenderlinks werden auf Google-HTTPS-Hosts begrenzt.
- Aufgaben und NAS-Offlinekopien haben keine zusätzliche Datenbank-/Dateiverschlüsselung
  auf Anwendungsebene. Gerätesperre und OS-Schutz bleiben wesentlich. Es gibt
  keine eigene Face-ID-/PIN-Sperre und keinen Schutz der App-Umschaltvorschau.
- Benachrichtigungen können Aufgaben- und Listentitel auf dem Sperrbildschirm
  zeigen. Widgets enthalten ebenfalls Aufgabeninformationen. Abmeldung entfernt
  diese lokalen Inhalte und Erinnerungen nicht automatisch.
- Die IPA-Pipeline erstellt ein unsigniertes Release-Artefakt zum späteren
  Sideload-Signieren. Die Sicherheit der abschließenden Signierung und der
  tatsächlich installierten Binärdatei wurde nicht geprüft.
- `.env.*` ist zusätzlich ignoriert; das schützt nicht gegen bereits veröffentlichte
  oder außerhalb dieser Dateimuster gespeicherte Geheimnisse.

## NAS-Dateien und Upload

- Ausschließlich HTTPS mit der nativen Zertifikatsprüfung; keine HTTP-Ausnahme,
  deaktivierte Zertifikatsprüfung oder eingebettete Zugangsdaten in URLs.
- Zugangsdaten bleiben im SecureStore mit `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
  Google-Tokens verwenden diese Einstellung nun ebenfalls beim Speichern.
- Netzwerkanfragen prüfen vor dem Versand den konfigurierten WLAN-Netzbereich.
  Ein passender IP-Bereich allein identifiziert kein WLAN eindeutig. Zusätzlich
  muss das NAS-Zertifikat für den konfigurierten Hostnamen vertrauenswürdig sein.
- Keine Weiterleitungen und keine Cookies bei NAS-Anfragen. Keine Zugangsdaten
  an die Dokumentvorschau; lokale PDF-Vorschau ohne JavaScript.
- Uploads nur nach Dateiauswahl und Bestätigung von Dateiname/Zielordner,
  einzeln, maximal 50 MiB. Die Quelle ist die native Auswahlkopie im App-Cache;
  der Dateipfad wird nicht aus einem NAS-Dateinamen gebildet.
- Dateinamen dürfen keinen Verzeichniswechsel, Pfadtrenner, Steuerzeichen,
  reservierte NAS-Metadatennamen oder mehr als 255 UTF-8-Bytes enthalten.
- PUT mit `If-None-Match: *` schützt vorhandene Dateien serverseitig. Keine
  automatische Wiederholung oder automatische Löschung bei unklarem Ausgang.
- WLAN-Verlust, Verbindungswechsel oder Entfernen der NAS-Konfiguration bricht
  laufende Netzwerkanfragen ab. Eine Anfrage kann zu diesem Zeitpunkt bereits
  serverseitig verarbeitet worden sein. Im Fehlerfall den NAS-Zielordner prüfen;
  direkte PUT-Uploads sind keine atomare Übertragung über eine temporäre NAS-Datei.
- Temporäre Auswahlkopien werden im `finally` entfernt. Bei einem Prozessabsturz
  kann eine Kopie bis zur Bereinigung des Betriebssystem-Caches zurückbleiben.
- Offline-Dateien liegen im App-Dateisystem; keine zusätzliche Verschlüsselung
  der Dokumente auf Anwendungsebene implementiert.

## Abhängigkeiten

`npm audit` meldete nach der Installation 32 betroffene Pakete: 6 hoch,
24 mittel, 2 niedrig. `npm audit --omit=dev` meldete 13 mittel, keine hohen
oder kritischen Meldungen. Diese 13 betreffen die mit Expo ausgelieferten
Node-Bauwerkzeuge (insbesondere glob/minimatch), nicht einen nachgewiesenen
Angriffspfad in der nativen Dokumentansicht.

Hohe Meldungen betreffen u. a. joi, minimatch, nanoid, node-forge und tar in
der Entwicklungs-/EAS-Werkzeugkette. Updates innerhalb der vorhandenen
Versionsvorgaben brachten keine Korrektur. Die von npm angebotenen direkten
Gesamtfixes würden Expo 58 auf 51 und EAS 27 auf 0.24 zurückstufen. Diese
inkompatiblen Änderungen wurden nicht angewandt. Die Meldungen sind daher
weiterhin offen; keine Aussage, dass sämtliche Abhängigkeiten sicher seien.

## Validierung und Grenzen

Automatisierte Tests decken u. a. Upload-Pfadvalidierung, Größenbegrenzung,
Create-only-Header, Berechtigungs-/Namenskonflikte, Redirect-Sperre, fehlende
Wiederholungen, Netzwerksperre und späte Antworten nach Trennung ab.
Zusätzlich Tests für Kontobindung vor Synchronisierung, späte OAuth-/Refresh-/
Userinfo-Antworten nach Abmeldung, gesperrte unbestätigte Identitäten, URL-Kodierung
und Erhalt gleich benannter Aufgaben mit verschiedenen Fälligkeiten.
Außerdem TypeScript-Prüfung und iOS-JavaScript-Export.

Ein echter Upload mit iPhone und NAS-Zugangsdaten sowie der native iOS-Build
müssen noch auf einem Gerät geprüft werden. Es wurden keine echten NAS-Dateien
während dieser Prüfung geschrieben oder verändert.
