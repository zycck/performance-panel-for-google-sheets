# Performance Panel for Google Sheets

**Findet die Formeln, die deine Tabelle ausbremsen.**

[![Demovideo (MP4)](media/demo.gif)](media/demo.mp4)

[English](README.md) · [Русский](README.ru.md) · [Español](README.es.md) · Deutsch · [Português](README.pt.md) · [Français](README.fr.md) · [Українська](README.uk.md) · [中文](README.zh.md) · [日本語](README.ja.md)

Google Tabellen misst bereits, wie lange jede Formel braucht, zeigt diese Zahlen aber kaum. Dieses Userscript fügt neben „Freigeben“ einen kleinen Button hinzu. Ein Klick auf „Recalculate“, und du siehst die langsamsten Zellen zuerst – jeweils mit Formel, Zeit und einem Link, der direkt zur Zelle führt.

## Was es kann

- Berechnet die ganze Tabelle oder ein einzelnes Tabellenblatt mit Googles eigener Engine neu.
- Listet die langsamsten Zellen: Formeln, bedingte Formatierung und Datenvalidierung.
- Ein Klick auf die Adresse springt zur Zelle.
- Zeigt, wohin die Zeit ging: Formeln, Formatierung, Validierung, Laden.
- Tab „Experiment“: Engine-Zähler, wie oft Funktionen liefen, und die Verknüpfungen der ausgewählten Zelle.

<p>
  <a href="media/performance.png"><img src="media/performance-panel.png" alt="Langsamste Zellen mit Formeln" width="32%"></a>
  <a href="media/result.png"><img src="media/result-panel.png" alt="Zeit nach Phase" width="32%"></a>
  <a href="media/experiment-counters.png"><img src="media/experiment-counters-panel.png" alt="Engine-Zähler" width="32%"></a>
</p>

## Installation

1. Installiere [Violentmonkey](https://violentmonkey.github.io/) oder [Tampermonkey](https://www.tampermonkey.net/).
2. Öffne das Script auf [Greasy Fork](https://greasyfork.org/de/scripts/597075-performance-panel-for-google-sheets) und klicke auf Installieren.
3. Lade deine Tabelle neu. Der Button mit dem Tacho erscheint neben „Freigeben“.

Läuft in Chrome und Firefox. Ist Google Tabellen auf Russisch, spricht das Panel Russisch, sonst Englisch.

## Gut zu wissen

- Alle Zahlen stammen von Google. Das Script schätzt nichts, und wenn Google etwas nicht liefert, sagt das Panel das auch.
- Nichts verlässt deinen Browser: keine Server, keine Analytics. Die Ergebnisse bleiben im Speicher, bis du die Seite neu lädst.
- Wer ein Tabellenblatt neu berechnet, berechnet unter Umständen auch die Blätter neu, von denen es abhängt.
- Google ändert Tabellen oft. Ändert sich etwas, worauf das Script aufbaut, siehst du eine klare Meldung statt falscher Zahlen.
- Keine Verbindung zu Google.

Die Demo nutzt Beispieldaten. Dieses Repository enthält nur das fertige Script; Greasy Fork aktualisiert sich automatisch daraus.

Von [@zycck](https://t.me/zycck).
