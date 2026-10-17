# Halani

**Deutsch sprechen üben – für deinen Alltag in der Pflege.**

Halani ist eine native iPhone- und Android-App für ausländische Pflegekräfte, die in Deutschland arbeiten oder dort anfangen wollen. Man übt Deutsch im Gespräch mit einer KI: per Stimme oder getippt, mit Untertiteln in der eigenen Sprache und mit Vokabeln, die in späteren Gesprächen wiederkommen.

## Was die App kann

- **Nur Deutsch als Lernsprache.** Alte Backups in anderen Sprachen lassen sich weiterhin importieren und lesen (`LanguageRegistry.all`); wählbar ist nur Deutsch (`LanguageRegistry.selectable`).
- **Pflege-Rollenspiele:** Der Themen-Tab enthält die Kategorie „Care work“ mit 25 Situationen, von Übergabe, Aufnahmegespräch und Medikamentengabe über Nachtdienst, Vitalzeichen, Beschwerden, ambulante Pflege und Biografiearbeit bis zum Prüfungstraining für die Fachsprachprüfung.
- **Leben in Deutschland:** 10 Situationen für den Alltag nach dem Umzug, etwa Bürgeramt, Hausarzt, Wohnungsbesichtigung, Bank, Kita, Vorstellungsgespräch und Anerkennung der Berufsqualifikation. Dazu kommen 24 Alltagsthemen.
- **Kein Gespräch doppelt:** Wer ein Thema wiederholt, bekommt jedes Mal eine andere Wendung, etwa ein ungeduldiges Gegenüber, ein kleines Missverständnis oder einen Zeitdruck. Zwölf Wendungen laufen der Reihe nach durch, bevor sich eine wiederholt.
- **Untertitel in der Herkunftssprache**, unter anderem Tagalog (Filipino), Vietnamesisch, Türkisch, Rumänisch, Russisch, Hindi, Kroatisch, Serbisch, Albanisch, Arabisch, Polnisch und Ukrainisch.
- **Vokabeln und Karteikarten:** Wörter aus den Gesprächen werden gesammelt und mit Wiederholungsbalken angezeigt.
- **Daten bleiben auf dem Gerät.** Gespräche, Vokabeln und Einstellungen werden lokal gespeichert und lassen sich als JSON-Backup exportieren.

Alle Pflege-Situationen sind Sprachübungen. Sie geben keine medizinische, Dosierungs- oder Rechtsberatung und wurden noch **nicht** von einer Pflegefachperson geprüft.

## Datenschutz und Kosten

Während des Übens gehen Audio und ausgewählter Text an OpenAI. Rohaudio wird nicht gespeichert. Die App verbindet sich mit dem eigenen OpenAI-API-Key; OpenAI rechnet Sprache, Text und Suche über dieses Projekt ab.

## Bauen und testen

Voraussetzungen: Xcode 26 (iOS), Java 17 und Android SDK 36 (Android), Python 3.

```sh
# Skript-Tests und plattformübergreifende Prüfungen
python3 -m unittest discover -s scripts/tests -t .
python3 scripts/export_android_content.py --check
python3 scripts/check_cross_platform.py

# iOS-Kern
swift test --package-path apps/ios

# Android
cd apps/android
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Lerninhalte werden in Swift unter `apps/ios/Core/Languages/` gepflegt und mit `scripts/export_android_content.py` nach Kotlin exportiert. Mehr dazu in [docs/language-architecture.md](docs/language-architecture.md) und [docs/build-and-test.md](docs/build-and-test.md).

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `apps/ios/` | SwiftUI-App, Kern-Logik (Sprachmodule, Lehrstrategie, Vokabeln) und Tests |
| `apps/android/` | Kotlin/Compose-App und Tests |
| `scripts/` | Export der Lerninhalte und Prüfskripte |
| `docs/` | Anleitungen zu Aufbau, Build und Sprachmodulen |

## Lizenz

Die App baut auf einem Open-Source-Projekt unter MIT-Lizenz auf. Lizenz und Copyright stehen in [LICENSE](LICENSE); Drittkomponenten behalten ihre eigenen Lizenzen.
