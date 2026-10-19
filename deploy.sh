#!/bin/sh
# Publie le site sur GitHub Pages : construit app/ puis envoie le résultat sur la branche gh-pages.
# Utilisation : ./deploy.sh
set -e
cd "$(dirname "$0")"
REMOTE=$(git remote get-url origin)

npm --prefix app run build
touch app/dist/.nojekyll

TMP=$(mktemp -d)
cp -R app/dist/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" add -A
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" commit -q -m "Publication du $(date '+%d/%m/%Y %H:%M')"
git push -q -f "$REMOTE" gh-pages
cd - > /dev/null
rm -rf "$TMP"
echo "Site publié : https://noedelahaye-sketch.github.io/boomsport-suivi/ (en ligne d'ici 1 à 2 minutes)"
