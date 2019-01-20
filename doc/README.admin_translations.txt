Falls nicht vorhanden:
Project ADMIN erstellen mit

Project Name: ADMIN
Project Prefix: ADMIN
Title: Admin Dashboard (oder ein anderer Titel. Dieser Titel wird links über der nav-bar angezeigt)

Default Language: erstmal nichts eintragen

Neue Sprache hinzufügen:
Projects -> ADMIN -> Advanced -> admin_en.xml (right-click)
-> Save as admin_<new-lang>.xml, bspw. admin_fr.xml und wieder hochladen
mit Upload File to Project


Sobald eine neue Sprache existiert, kann diese auch in User/Settings und
Project->ADMIN->Source/Default Language ausgewählt werden.


Übersetzung pflegen:
Projects -> ADMIN -> Advanced -> admin_<lang>.xml (Klick auf den Globus)
-> Öffnet den translation-Editor
   -> auf den Stift klicken, alle Targets ändern und wenn fertig, dann auf Save klicken
   -> wird direkt gespeichert im Projekt


Die Sprache kann auf User-Ebene (User -> Language)
und auf Projekt-Ebene (Projects -> ADMIN -> Default Language) eingestellt werden.
Die User-Ebene hat immer Vorrang. Sind beide nicht gesetzt, wird auf Fallback
auf englisch gemacht.

Es gibt zusätzlich ein neues Tab Settings, in der jeder User ohne besondere
Rechte seine User-Settings editieren kann, das kann auch ein User, der nur
Reports sehen darf.
In den Settings kann er die Sprache umstellen, es werden in dem Dropdown
nur die Sprachen zur Auswahl gestellt, für die auch Übersetzungen vorhanden sind.

