# Performance Panel for Google Sheets

**Repérez les formules qui ralentissent votre feuille de calcul.**

[![Vidéo de démonstration (MP4)](media/demo.gif)](media/demo.mp4)

[English](README.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · Français · [Українська](README.uk.md) · [中文](README.zh.md) · [日本語](README.ja.md)

Google Sheets mesure déjà le temps de chaque formule, mais garde ces chiffres pour lui. Ce userscript ajoute un petit bouton à côté de « Partager ». Cliquez sur « Recalculate » : les cellules les plus lentes s’affichent en premier, chacune avec sa formule, son temps et un lien qui y mène directement.

## Ce qu’il fait

- Recalcule toute la feuille de calcul ou une seule feuille avec le moteur de Google.
- Liste les cellules les plus lentes : formules, mise en forme conditionnelle et validation des données.
- Un clic sur l’adresse vous amène à la cellule.
- Montre où le temps est passé : formules, mise en forme, validation, chargement.
- Onglet Experiment : compteurs du moteur, fréquence d’appel des fonctions et liens de la cellule sélectionnée.

<p>
  <a href="media/performance.png"><img src="media/performance-panel.png" alt="Cellules les plus lentes avec leurs formules" width="32%"></a>
  <a href="media/result.png"><img src="media/result-panel.png" alt="Temps par étape" width="32%"></a>
  <a href="media/experiment-counters.png"><img src="media/experiment-counters-panel.png" alt="Compteurs du moteur" width="32%"></a>
</p>

## Installation

1. Installez [Violentmonkey](https://violentmonkey.github.io/) ou [Tampermonkey](https://www.tampermonkey.net/).
2. Ouvrez le script sur [Greasy Fork](https://greasyfork.org/fr/scripts/597075-performance-panel-for-google-sheets) et cliquez sur Installer.
3. Rechargez votre feuille de calcul. Le bouton avec le compteur apparaît à côté de « Partager ».

Fonctionne dans Chrome et Firefox. Si Google Sheets est en russe, le panneau l’est aussi ; sinon, il est en anglais.

## Bon à savoir

- Tous les chiffres viennent de Google. Le script n’estime rien, et quand Google ne fournit pas une donnée, le panneau le dit.
- Rien ne quitte votre navigateur : ni serveur, ni statistiques. Les résultats restent en mémoire jusqu’au rechargement de la page.
- Recalculer une feuille peut aussi recalculer les feuilles dont elle dépend.
- Google modifie souvent Sheets. Si quelque chose dont dépend le script change, vous verrez un message clair plutôt que des chiffres faux.
- Sans lien avec Google.

La démo utilise des données fictives. Ce dépôt ne contient que le script compilé ; Greasy Fork se met à jour automatiquement à partir de lui.

Créé par [@zycck](https://t.me/zycck).
