# Guide complet — QCM Live

Ce guide explique, pas à pas, comment installer et publier l’application **QCM Live**. À la fin, vous aurez une adresse web que le présentateur ouvre sur un PC et que les participants rejoignent avec un QR code.

> **Objectif final** : `https://VOTRE-COMPTE.github.io/qcm-live/`

---

## 1. Prérequis

Vous avez besoin de :

- Un compte Google, pour Firebase.
- Un compte GitHub, pour stocker le code et publier le site.
- Un ordinateur avec un navigateur récent.
- Idéalement Git installé, mais la méthode web GitHub fonctionne aussi.
- Pour le déploiement Firebase Hosting, Node.js LTS est nécessaire. Il n’est pas nécessaire si vous utilisez seulement GitHub Pages.

L’application fonctionne ensuite sur PC, Android et iPhone via navigateur.

---

## 2. Créer un compte GitHub

1. Ouvrez <https://github.com/signup>.
2. Créez votre compte avec une adresse e-mail et un mot de passe robuste.
3. Confirmez l’e-mail demandé par GitHub.
4. Connectez-vous à GitHub.
5. En haut à droite, cliquez sur votre photo > **Settings**.
6. Activez la double authentification dans **Password and authentication** si possible.

### Créer le dépôt

1. Cliquez sur le `+` en haut à droite > **New repository**.
2. Repository name : `qcm-live`.
3. Choisissez **Public** si vous utilisez GitHub Pages gratuit classique et acceptez que le code soit visible. Choisissez **Private** seulement si votre offre GitHub et votre configuration Pages le permettent.
4. Cochez **Add a README file** seulement si vous ne téléversez pas déjà celui du projet.
5. Cliquez sur **Create repository**.

---

## 3. Envoyer les fichiers sur GitHub

### Méthode simple, sans terminal

1. Décompressez l’archive `qcm-live.zip`.
2. Ouvrez votre dépôt GitHub `qcm-live`.
3. Cliquez sur **Add file** > **Upload files**.
4. Glissez-déposez tous les fichiers du projet : `index.html`, `app.js`, `style.css`, `database.rules.json`, etc.
5. Ne glissez pas le dossier parent lui-même : les fichiers doivent être à la racine du dépôt.
6. Cliquez sur **Commit changes**.

Vous devez voir au minimum :

```text
app.js
index.html
style.css
database.rules.json
manifest.webmanifest
sw.js
firebase.json
```

### Méthode terminal avec Git

Dans le dossier décompressé :

```bash
git init
git add .
git commit -m "Première version de QCM Live"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/qcm-live.git
git push -u origin main
```

Remplacez `VOTRE-COMPTE` par votre identifiant GitHub.

---

## 4. Créer un projet Firebase

1. Ouvrez <https://console.firebase.google.com/>.
2. Connectez-vous avec votre compte Google.
3. Cliquez sur **Ajouter un projet**.
4. Nom du projet : par exemple `QCM Live` ou `qcm-live-votre-prenom`.
5. Cliquez sur **Continuer**.
6. Google Analytics : vous pouvez le désactiver pour commencer.
7. Cliquez sur **Créer le projet**.
8. Attendez la fin, puis cliquez sur **Continuer**.

### Ajouter l’application Web Firebase

1. Dans l’accueil de votre projet Firebase, cliquez sur l’icône `</>` pour **Ajouter une application Web**.
2. Nom de l’application : `QCM Live Web`.
3. Ne cochez pas Firebase Hosting ici si vous choisissez GitHub Pages.
4. Cliquez sur **Enregistrer l’application**.
5. Firebase affiche un bloc `firebaseConfig` similaire à celui-ci :

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "qcm-live-xxxxx.firebaseapp.com",
  projectId: "qcm-live-xxxxx",
  storageBucket: "qcm-live-xxxxx.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

6. Copiez ce bloc : vous en aurez besoin à l’étape 7.

---

## 5. Activer l’authentification anonyme

L’authentification anonyme donne un identifiant Firebase technique à chaque navigateur. Les joueurs ne créent pas de compte.

1. Dans Firebase Console, menu gauche : **Build** > **Authentication**.
2. Cliquez sur **Get started** / **Commencer** si nécessaire.
3. Ouvrez l’onglet **Sign-in method**.
4. Cliquez sur **Anonymous** / **Anonyme**.
5. Activez le fournisseur.
6. Cliquez sur **Save** / **Enregistrer**.

Sans cette étape, l’application affichera une erreur de connexion Firebase.

---

## 6. Créer Realtime Database

1. Firebase Console > **Build** > **Realtime Database**.
2. Cliquez sur **Create Database** / **Créer une base de données**.
3. Choisissez une région proche de vos utilisateurs. Pour la France, choisissez une région Europe si Firebase la propose dans votre écran.
4. Pour démarrer, choisissez le mode de règles proposé, puis terminez la création.
5. Ouvrez l’onglet **Rules** / **Règles**.
6. Effacez le contenu existant.
7. Ouvrez le fichier local `database.rules.json`.
8. Copiez seulement le contenu JSON du fichier, collez-le dans l’éditeur Firebase.
9. Cliquez sur **Publish** / **Publier**.

### Important : ne laissez pas les règles ouvertes

N’utilisez jamais durablement cette règle :

```json
{ "rules": { ".read": true, ".write": true } }
```

Elle laisserait n’importe qui lire, modifier ou supprimer les QCM. Les règles incluses dans le projet exigent une authentification Firebase et empêchent un participant d’écraser la réponse qu’il a déjà envoyée.

---

## 7. Relier le code à Firebase

1. Dans GitHub, ouvrez le fichier `app.js`.
2. Cliquez sur l’icône crayon **Edit this file**.
3. En haut du fichier, repérez :

```javascript
const firebaseConfig = {
  apiKey: "REMPLACE_PAR_TON_API_KEY",
  authDomain: "REMPLACE_PAR_TON_PROJET.firebaseapp.com",
  databaseURL: "REMPLACE_PAR_TON_URL_REALTIME_DATABASE",
  projectId: "REMPLACE_PAR_TON_PROJECT_ID",
  storageBucket: "REMPLACE_PAR_TON_PROJET.firebasestorage.app",
  messagingSenderId: "REMPLACE_PAR_TON_MESSAGING_SENDER_ID",
  appId: "REMPLACE_PAR_TON_APP_ID"
};
```

4. Remplacez **tout l’objet** par celui affiché dans Firebase Console.
5. Vérifiez particulièrement `databaseURL`. Elle n’est parfois pas affichée dans la configuration Web initiale : vous la trouverez dans Firebase Console > Realtime Database, dans l’URL de la base. Elle ressemble à :

```text
https://VOTRE-PROJET-default-rtdb.europe-west1.firebasedatabase.app
```

6. Ajoutez-la dans l’objet si nécessaire :

```javascript
databaseURL: "https://VOTRE-PROJET-default-rtdb.europe-west1.firebasedatabase.app",
```

7. Cliquez sur **Commit changes**.

### À propos de `apiKey`

La configuration Firebase Web est normalement visible dans une application web : ce n’est pas un mot de passe secret. La protection repose sur Firebase Authentication et surtout sur les règles de la Realtime Database. Ne mettez en revanche jamais dans GitHub un mot de passe personnel, une clé de compte de service, un fichier `.env` sensible ou une clé privée.

---

## 8. Publier avec GitHub Pages

1. Ouvrez votre dépôt GitHub.
2. Cliquez sur **Settings**.
3. Dans le menu gauche, cliquez sur **Pages**.
4. Dans **Build and deployment** :
   - Source : **Deploy from a branch**.
   - Branch : `main`.
   - Folder : `/(root)`.
5. Cliquez sur **Save**.
6. Attendez une à trois minutes.
7. Rechargez la page **Pages** : GitHub affichera l’adresse de votre site, en général :

```text
https://VOTRE-COMPTE.github.io/qcm-live/
```

8. Ouvrez cette adresse dans un nouvel onglet.

### Vérification immédiate

Si le haut de l’application affiche **Connecté**, Firebase est bien configuré.

Si l’écran affiche une erreur ou reste sur « Connexion… » :

- vérifiez `firebaseConfig` dans `app.js` ;
- vérifiez que Anonymous est activé ;
- vérifiez que `databaseURL` est exacte ;
- ouvrez la console développeur du navigateur avec `F12` > Console pour lire l’erreur.

---

## 9. Tester l’application

### Test présentateur

1. Ouvrez l’adresse GitHub Pages sur votre PC.
2. Cliquez sur **Créer un QCM**.
3. Entrez un titre.
4. Écrivez au moins une question, quatre propositions et choisissez la bonne réponse avec le rond à gauche.
5. Cliquez sur **Créer la salle**.
6. Un code et un QR code apparaissent.

### Test participant

1. Sur un autre téléphone ou une fenêtre de navigation privée, scannez le QR code.
2. Saisissez un pseudo.
3. Cliquez sur **Rejoindre le QCM**.
4. Sur l’écran présentateur, vérifiez que le pseudo apparaît.
5. Cliquez sur **Démarrer le QCM**.
6. Répondez depuis le téléphone.
7. Le présentateur voit le nombre de réponses et la répartition A/B/C/D.
8. Cliquez sur **Fermer les réponses et afficher la correction**.
9. Passez à la question suivante ou affichez les résultats finaux.

> Une fenêtre normale et une fenêtre privée sont nécessaires si vous testez depuis le même PC, car Firebase identifie le même navigateur avec le même compte anonyme local.

---

## 10. Mettre à jour l’application

### Depuis GitHub Web

1. Ouvrez le fichier à modifier, par exemple `style.css`.
2. Cliquez sur le crayon.
3. Modifiez et faites **Commit changes**.
4. GitHub Pages redéploie le site automatiquement après un court délai.

### Depuis votre PC avec Git

```bash
git add .
git commit -m "Amélioration de l'interface"
git push
```

---

## 11. Option : déployer avec Firebase Hosting

Cette option n’est pas obligatoire. GitHub Pages suffit. Firebase Hosting peut toutefois être pratique si vous préférez une URL en `web.app`.

1. Installez Node.js LTS depuis <https://nodejs.org/>.
2. Ouvrez un terminal dans le dossier du projet.
3. Lancez :

```bash
npm install -g firebase-tools
firebase login
firebase use --add
```

4. Sélectionnez votre projet Firebase.
5. Déployez :

```bash
firebase deploy --only hosting,database
```

Le fichier `firebase.json` inclus est déjà configuré pour publier les fichiers du dossier actuel. Si vous utilisez Firebase Hosting, vous pouvez laisser GitHub uniquement pour le code.

---

## 12. Limites de sécurité de cette version

Cette version est faite pour des jeux, réunions, formations et démonstrations. Elle ne doit pas être utilisée telle quelle pour un examen certifiant, un vote officiel ou un concours avec enjeu.

Pourquoi : la bonne réponse (`correctIndex`) est envoyée au navigateur pour que la correction et les scores fonctionnent sans serveur. Un participant technique peut inspecter les données du navigateur.

Pour une version anti-triche, il faut :

1. Stocker les réponses correctes dans un chemin Firebase privé, non lisible par les participants.
2. Utiliser Firebase Cloud Functions ou un serveur pour accepter une réponse, vérifier la réponse et calculer le score côté serveur.
3. Authentifier les présentateurs avec Google ou e-mail/mot de passe.
4. Ajouter une validation des états de jeu dans les règles Firebase.

---

## 13. Dépannage rapide

| Symptôme | Cause probable | Correction |
|---|---|---|
| `auth/operation-not-allowed` | Authentification anonyme désactivée | Activez Anonymous dans Authentication > Sign-in method |
| `permission_denied` | Règles Realtime Database non publiées ou incorrectes | Publiez `database.rules.json` dans l’onglet Rules |
| QR code ouvre une page vide | Site GitHub Pages non encore publié ou mauvaise URL | Attendez le déploiement et utilisez l’adresse Pages indiquée par GitHub |
| Les réponses n’apparaissent pas | Mauvais `databaseURL` ou règles bloquantes | Vérifiez `app.js` et l’onglet Rules |
| La page affiche toujours l’ancienne version | Cache navigateur ou service worker | Rechargez avec Ctrl+F5 ou videz les données du site |
| Deux tests ont le même participant | Même navigateur et même session Firebase anonyme | Utilisez navigation privée ou un autre appareil |

---

## 14. Structure du projet

```text
qcm-live/
├── index.html                Interface web
├── style.css                 Mise en forme responsive
├── app.js                    Logique QCM + Firebase
├── database.rules.json       Règles Realtime Database
├── firebase.json             Configuration Firebase Hosting
├── manifest.webmanifest      Installation PWA
├── sw.js                     Service worker minimal
├── .gitignore                Fichiers à ignorer par Git
├── .nojekyll                 Compatibilité GitHub Pages
├── README.md                 Résumé du projet
└── GUIDE_INSTALLATION.md     Ce guide
```
