# GymLog

Einfache Android App für Körpergewicht und Training. Alles offline, Daten bleiben dauerhaft auf dem Handy.

## Installieren
`release/GymLog.apk` aufs Handy laden und öffnen (Installation aus unbekannten Quellen erlauben).
Updates einfach drüber installieren, die Daten bleiben erhalten (gleicher Signaturschlüssel `gymlog.keystore`).

## Funktionen
* Körpergewicht: täglicher Eintrag, Wochenschnitt, Veränderung zur Vorwoche, Trend, Diagramm
* Trainingspläne: beliebig viele, Aufwärm und Arbeitssätze, Wiederholungsbereich, Pausen pro Übung
* Training: RIR pro Satz, Notizen pro Übung (dauerhaft und für heute), Werte vom letzten Mal vorausgefüllt, Steigerungsvorschlag (+kg), Pausentimer mit Benachrichtigung
* Deload: Schalter, automatische Berechnung (Sätze, Wdh., Gewicht), Empfehlung wann der nächste fällig ist
* Verlauf: alle Trainings, Entwicklung jeder Übung (1RM, Top Gewicht, Volumen, Wdh.)
* Sicherung: Auto Backup in einen Ordner deiner Wahl, Export/Import als JSON, Android Cloud Backup

## Bauen
`gradle assembleRelease` (Android SDK 35). Die Oberfläche liegt in `app/src/main/assets`.
