# Installation détaillée — QCM Live gratuit V2

## Fonctionnalités ajoutées

Cette version ajoute :

- **Priorité 1 — fiabilité** : sauvegarde dans Firebase, import/export JSON, PDF vierge hors ligne, indication de connexion et conservation des QCM.
- **Priorité 2 — bibliothèque** : plusieurs QCM, modification, import JSON, import Excel à connecter selon la bibliothèque SheetJS utilisée.
- **Barre de progression** : affichée chez le participant avec `Question x / y`.
- **Alerte de temps** : si une durée est configurée, la minuterie passe en orange à 5 secondes et vibre brièvement si le navigateur autorise la vibration.
- **Priorité 5 — suivi** : tableau coloré, filtres Tous / En cours / Terminés, score et progression.
- **Priorité 6 — PDF** : rapport formateur détaillé et PDF vierge pour une session papier hors ligne.

## Installation GitHub/Firebase

1. Créez un dépôt GitHub public nommé `qcm-live`.
2. Téléversez tous les fichiers à la racine : `index.html`, `app.js`, `style.css`, etc.
3. Dans Firebase Console, créez ou utilisez votre projet.
4. Ajoutez une application Web et copiez sa configuration.
5. Dans `app.js`, remplacez l’objet `firebaseConfig` par vos valeurs et ajoutez `databaseURL` si nécessaire.
6. Firebase > Build > Authentication > Sign-in method > Anonymous > Activer.
7. Firebase > Build > Realtime Database > créer la base.
8. Ouvrez Rules et publiez le contenu de `database.rules.json`.
9. GitHub > Settings > Pages > Deploy from a branch > `main` > `/(root)`.

## Structure de firebaseConfig

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "votre-projet.firebaseapp.com",
  databaseURL: "https://votre-projet-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "votre-projet",
  storageBucket: "votre-projet.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc"
};
```

Ne laissez aucune valeur `REMPLACE_PAR_TON_...`.

## Créer un QCM

1. Ouvrez l’URL GitHub Pages.
2. Vérifiez que le bandeau affiche **Connecté**.
3. Cliquez sur **Mes QCM** puis **Nouveau QCM**.
4. Renseignez le titre et la description.
5. Indiquez une durée par défaut. Mettez `0` pour désactiver le minuteur.
6. Pour chaque question, vous pouvez définir une durée spécifique ; `0` reprend la durée par défaut.
7. Cochez une ou plusieurs bonnes réponses.
8. Activez la note partielle si nécessaire.
9. Enregistrez.

## Importer un QCM JSON

Dans **Mes QCM** :

```text
Importer JSON → choisir qcm-mathematiques.json
```

ou :

```text
Importer JSON → choisir qcm-qualite-agroalimentaire.json
```

## Lancer une session

1. Dans Mes QCM, cliquez sur **Lancer**.
2. Le code et le QR code apparaissent.
3. Les participants scannent le QR code.
4. Chaque participant saisit son pseudo.
5. Chaque personne répond à son rythme.
6. Aucune correction n’est montrée.
7. Après la dernière question, seul le résultat global apparaît.

## Minuterie

Pour activer la minuterie :

- mettez `30` dans Durée par question pour 30 secondes ;
- ou mettez une valeur spécifique dans chaque question.

À moins de 5 secondes :

- le compteur devient orange ;
- une animation attire l’attention ;
- le téléphone peut vibrer si le navigateur autorise `navigator.vibrate`.

À zéro :

- la réponse sélectionnée est envoyée automatiquement ;
- si aucune réponse n’est sélectionnée, la question est enregistrée sans réponse et vaut 0.

## Tableau présentateur

Le tableau affiche :

- participant ;
- une colonne Q1, Q2, etc. ;
- score question par question ;
- score total ;
- progression ;
- statut.

Couleurs :

- vert : 1 point ;
- orange : 0,5 point ;
- rouge : 0 point ;
- gris : pas encore répondu.

Les filtres permettent d’afficher :

```text
Tous
En cours
Terminés
```

## Rapports PDF

### Rapport formateur

Cliquez sur :

```text
Rapport PDF formateur
```

Le PDF contient :

- une fiche par participant ;
- date, titre et pseudo ;
- réponses sélectionnées encadrées ;
- bonnes réponses en gras ;
- score par question ;
- synthèse de la session.

### PDF vierge hors ligne

Cliquez sur :

```text
PDF vierge hors ligne
```

Ce PDF ne demande pas de nom. Il contient une ligne vide pour écrire le nom à la main et toutes les questions avec cases à cocher. Il peut être utilisé sans réseau pour distribuer une version papier.

## Sauvegarde et dépannage

Les QCM sont sauvegardés dans Realtime Database. Si Firebase n’est pas joignable, la page ne pourra pas charger la bibliothèque distante ; gardez une copie JSON exportée localement.

Erreurs courantes :

- `permission-denied` : publiez `database.rules.json` et vérifiez Anonymous activé.
- `auth/operation-not-allowed` : activez Authentication > Anonymous.
- `Connexion…` permanent : vérifiez `firebaseConfig` et `databaseURL`.
- Page ancienne : rechargez avec Ctrl+F5 et effacez les données du site.
- PDF non généré : vérifiez que les scripts jsPDF et AutoTable sont chargés.

## Limite gratuite

Cette édition n’utilise pas Cloud Functions. Elle est donc gratuite avec Firebase Spark dans un usage raisonnable. Les bonnes réponses sont transmises au navigateur pour calculer les notes : l’application n’est pas anti-triche. Pour un examen officiel, il faut un backend sécurisé et probablement un plan payant.
