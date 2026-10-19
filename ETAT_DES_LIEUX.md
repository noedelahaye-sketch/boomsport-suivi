# État des lieux — Suivi Léopards (BoomsportRDC)

_Mis à jour le 19 octobre 2026. À lire en premier pour reprendre le projet dans une nouvelle discussion._

## En bref

Site privé pour l'équipe BoomsportRDC : suivi des joueurs congolais et binationaux évoluant en D1/D2 européennes, de leurs clubs, des contacts (agents, familles, presse), des matchs à venir, des déplacements et des publications.

| Élément | Où |
|---|---|
| Site en ligne | https://noedelahaye-sketch.github.io/boomsport-suivi/ |
| Code (public) | https://github.com/noedelahaye-sketch/boomsport-suivi — dossier local `~/Documents/boomsport-suivi` |
| Base de données | Supabase, projet `boomsport-suivi-joueurs` (id `jcezhdkbnapockggygrb`, région Paris, offre gratuite) |
| Publier une modification | `./deploy.sh` à la racine (branche `gh-pages`), puis commit + push sur `main` |

## Ce que fait le site

- **Connexion** : email + mot de passe, ou lien par email. Réservée aux adresses de la table `members` : la base refuse toute création de compte pour une autre adresse (trigger sur `auth.users`), et retirer un membre supprime son compte. Membre actuel : noedelahaye@gmail.com.
- **14 jours** : matchs des 14 prochains jours où joue au moins un joueur suivi, en liste par jour. Bouton « Filtrer » (type de joueur, pays, avec/sans contact, déplacement prévu ou non, compétition), filtres en pastilles retirables et mémorisés. Clic sur un joueur → sa fiche ; clic sur la ligne → le match (accréditations) ; icônes pour prévoir un déplacement ou une publication. Logo du club suivi uniquement (pas des adversaires).
- **Joueurs / Clubs / Contacts** : tableaux façon Notion (vues enregistrables, filtres combinables, tris multiples, regroupement, colonnes affichables). Clic → fiche en lecture seule avec icônes ✎ modifier et 🗑 supprimer (joueurs), ajout de contact direct depuis la fiche, 5 prochains matchs.
- **Calendrier** : matchs, déplacements et publications (FullCalendar), filtre par catégorie de joueurs.
- **Réglages** : membres de l'équipe, mot de passe.

## Données (au 19/10/2026)

- **285 joueurs** : 44 International RDC, 98 Binational, 33 Pépite, 70 Jeune, 28 International étranger.
- **157 clubs**, tous reliés à FotMob ; ~3 260 matchs à venir ; 1 contact, 2 événements (tests).
- Import initial depuis Transfermarkt (nationalité RDC première ou seconde) puis corrections de l'utilisateur. Collecte complète pour la France ; pour BEL, GER, SUI, ENG, ITA, NED seuls les joueurs les plus cotés (Transfermarkt a bloqué les requêtes).
- Règles appliquées : uniquement D1/D2 (France et étranger), pas d'équipes de jeunes/réserves (joueurs rattachés à l'équipe première, équipe d'origine en note), pas de plus de 35 ans, Monaco = France.

### Catégories

| Clé (base) | Libellé | Règle |
|---|---|---|
| `international` | International RDC | sélectionné en A avec la RDC — manuelle |
| `autre_selection` | International étranger | au moins une sélection A avec un autre pays — manuelle |
| `binational` | Binational | joue en pro, 21 ans ou plus — automatique |
| `jeune_binational` | Pépite | moins de 21 ans et au moins un match en pro — automatique |
| `jeune` | Jeune | moins de 23 ans, jamais joué en équipe première — automatique |

« Jamais joué en pro » = 0 match en équipe première tous clubs confondus (pas seulement le club actuel). Un adulte avec 0 match reste Binational (donnée FotMob souvent manquante pour les petits championnats).

## Automatisations (Supabase)

| Tâche | Fréquence | Rôle |
|---|---|---|
| `sync-matches` (Edge Function) | toutes les heures à :07, 40 clubs par lot | calendrier complet de chaque club depuis FotMob (ESPN en secours) : horaires, reports, annulations, scores, matchs disparus → « retiré » ; met à jour le championnat du club ; vérifie le pays (homonymes) |
| `sync-players` (Edge Function) | toutes les heures à :37, 40 joueurs par lot | matchs en équipe première depuis FotMob → colonnes `pro_apps`, `pro_apps_club` et catégories automatiques |
| Vue `club_next_match` | — | prochain match de chaque club (respecte les droits) |

Sources gratuites et non officielles (FotMob, ESPN) : elles peuvent changer sans prévenir.

## Technique

- `app/` : React 18 + Vite 5, FullCalendar, supabase-js. Pages dans `app/src/pages/`, tableau générique `app/src/DataTable.jsx`, composants `app/src/ui.jsx`, jetons de style en tête de `app/src/styles.css`.
- `supabase/functions/` : `sync-matches`, `sync-players` (déployées via l'outil Supabase, `verify_jwt` désactivé : appel autorisé par secret cron ou membre connecté).
- Sécurité : RLS « membres seulement » sur toutes les tables ; `app_config` (secret cron) sans accès API ; la clé Supabase dans le code est la clé publique.
- GitHub : le jeton local n'a pas le droit `workflow`, d'où la publication par `deploy.sh` plutôt que GitHub Actions.

## Préférences de l'utilisateur

- Tout en français. Interface épurée, pleine largeur, mais aérée (pas trop dense). Identité RDC discrète (étoile, jaune de l'onglet actif, filet du drapeau en haut des fiches).
- Ne plus utiliser Netlify (crédits) : publier soi-même avec `./deploy.sh`.
- Pas de logos pour les clubs adverses.

## À faire / points ouverts

- **Supabase → Authentication → URL Configuration** : mettre `https://noedelahaye-sketch.github.io/boomsport-suivi/` dans « Site URL » et « Redirect URLs » (sinon les liens de connexion par email renvoient vers l'ancienne adresse). À faire par l'utilisateur.
- Ajouter les collègues dans Réglages (un seul membre pour l'instant).
- Compléter la base hors France (BEL, GER, SUI, ENG, ITA, NED) quand Transfermarkt ne bloque plus, en requêtes lentes.
- 69 joueurs introuvables sur FotMob (surtout des jeunes de centres de formation) : classés « Jeune » s'ils ont moins de 21 ans.
- Rien n'a pu être vérifié en étant connecté dans le navigateur de l'assistant : les tests ont été faits sur des pages de démonstration et en base.
