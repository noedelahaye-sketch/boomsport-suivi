# Suivi Léopards · BoomsportRDC

Outil privé de suivi des joueurs congolais / d'origine congolaise (France et pays frontaliers).

- `app/` : le site (Vite + React), à lancer en local avec `npm --prefix app run dev` → http://localhost:3000
- `supabase/functions/sync-matches/` : fonction qui synchronise le calendrier complet des clubs (FotMob, ESPN en secours), lancée à 5h et 16h UTC et via le bouton « Mettre à jour les matchs »

## Base de données (Supabase, projet `boomsport-suivi-joueurs`)

Tables : `players`, `clubs`, `contacts`, `interactions`, `matches`, `accreditations`, `events` (déplacements / publications), `members`.
Accès : seules les adresses présentes dans `members` voient et modifient les données (RLS). Connexion par lien envoyé par email.

## Mise en ligne (GitHub Pages)

- Adresse du site : https://noedelahaye-sketch.github.io/boomsport-suivi/
- Pour publier une modification : `./deploy.sh` (construit le site et l'envoie sur la branche `gh-pages`, en ligne en 1 à 2 minutes). Gratuit et sans limite.
- Le code est public, les données ne le sont pas : elles restent dans Supabase, accessibles uniquement aux membres connectés.
- Dans Supabase → Authentication → URL Configuration, l'adresse du site doit figurer dans « Site URL » et « Redirect URLs » pour les liens de connexion par email.

## Matchs automatiques (gratuit, sans clé)

- Calendrier complet de la saison de chaque club (championnat, coupes, coupes d'Europe). Synchronisation par lots de 40 clubs toutes les heures (chaque club est mis à jour plusieurs fois par jour), et via le bouton « Mettre à jour les matchs ».
- La synchronisation vérifie le pays du club pour éviter les homonymes (Nacional, Hearts…).
- Source principale : FotMob (tous pays : France, Belgique D1/D2, Suisse, Luxembourg, Allemagne, Espagne, Italie…). Secours : ESPN.
- Horaires modifiés, reports et annulations repris automatiquement ; un match qui disparaît du calendrier de son club passe en « retiré ».
- Si un club est mal reconnu, renseigner son identifiant FotMob dans sa fiche (page Clubs).
- Ces sources sont gratuites mais non officielles : elles peuvent changer sans prévenir. Les matchs peuvent toujours être ajoutés à la main.

## Base joueurs

- Import initial (oct. 2026) depuis Transfermarkt : joueurs ayant la nationalité RDC (première ou seconde), puis corrections de l'équipe.
- Règles de la base :
  - uniquement les clubs de 1re et 2e division (France et étranger) ; le championnat de chaque club est mis à jour automatiquement depuis FotMob ;
  - pas d'équipes de jeunes ni de réserves : les joueurs U19, B, II… sont rattachés à l'équipe première (l'équipe d'origine est notée dans leur fiche) ;
  - pas de joueurs de plus de 35 ans.
- Catégories : « International RDC » (sélectionné en équipe A), « Jeune binational » (21 ans ou moins), « Binational » (les autres), « International étranger » (au moins une sélection en A avec un autre pays).
- Collecte complète pour la France ; pour la Belgique, l'Allemagne, la Suisse, l'Angleterre, l'Italie et les Pays-Bas, seuls les joueurs les plus cotés ont été récupérés (Transfermarkt a limité les requêtes). À compléter.

## Identité visuelle

- Mise en page pleine largeur, barre latérale fine (réduite aux icônes sous 1 100 px, barre d'icônes en haut sur mobile).
- Contrôles compacts (32 px), tableaux à une ligne par élément, vues et outils du tableau sur une seule ligne.
- Couleurs du drapeau RDC en touches : étoile du logo, onglet actif en jaune, filet du drapeau en haut des fiches, pastilles de catégorie (bleu international, jaune binational, vert jeune, gris international étranger).
- Typographie Barlow (texte) et Barlow Condensed (logo, horaires).
- Thèmes clair et sombre automatiques ; jetons de couleur en tête de `app/src/styles.css`.
