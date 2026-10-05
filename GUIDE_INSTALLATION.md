# Mode d’emploi complet — QCM Live 100 % gratuit

## 1. Ce que cette édition permet

Cette édition est conçue pour rester gratuite :

- Code et site : GitHub + GitHub Pages.
- Connexion technique des utilisateurs : Firebase Authentication anonyme.
- Données live : Firebase Realtime Database, plan Spark gratuit.
- PDF : généré dans le navigateur du présentateur.
- Aucun Cloud Function, aucun serveur à payer, aucune carte bancaire nécessaire pour cette architecture de départ.

Fonctions incluses :

- Plusieurs QCM enregistrés.
- Création, modification et import de QCM JSON.
- QR code de participation.
- Avancement autonome des participants.
- Questions à plusieurs bonnes réponses.
- 1 point pour une réponse complète ; demi-point configurable.
- Aucun affichage de correction pendant le QCM.
- Résultat final global uniquement chez le participant.
- Tableau présentateur par participant et par question.
- PDF présentateur comprenant fiches individuelles, réponses encadrées, bonnes réponses en gras et synthèse/statistiques.

## 2. Limite à connaître absolument

Pour rester totalement gratuit sans backend, le navigateur doit posséder les bonnes réponses afin de calculer les scores. Elles ne sont jamais affichées dans l’interface participant, mais un utilisateur très technique peut les retrouver dans les données du navigateur/Firebase.

Cette application est donc adaptée à :

- formation ;
- entraînement ;
- autoévaluation ;
- réunion ;
- animation ;
- QCM interne sans enjeu officiel.

Elle n’est pas adaptée à :

- examen certifiant ;
- concours ;
- vote officiel ;
- évaluation RH sensible.

## 3. Créer le compte GitHub

1. Ouvrez https://github.com/signup.
2. Créez votre compte, confirmez votre e-mail et connectez-vous.
3. En haut à droite, cliquez sur `+` > **New repository**.
4. Nom du dépôt : `qcm-live`.
5. Choisissez **Public**.
6. Cliquez sur **Create repository**.

## 4. Mettre les fichiers sur GitHub

1. Décompressez l’archive livrée.
2. Dans le dépôt GitHub créé, cliquez sur **Add file** > **Upload files**.
3. Sélectionnez tous les fichiers du dossier `qcm-live-gratuit`.
4. Les fichiers `index.html`, `style.css` et `app.js` doivent être à la racine du dépôt, pas dans un sous-dossier supplémentaire.
5. Cliquez sur **Commit changes**.

## 5. Créer le projet Firebase

1. Ouvrez https://console.firebase.google.com/.
2. Connectez-vous avec votre compte Google.
3. Cliquez sur **Ajouter un projet**.
4. Nom : par exemple `QCM Live`.
5. Google Analytics : vous pouvez le désactiver au début.
6. Cliquez sur **Créer le projet** puis **Continuer**.

## 6. Ajouter l’application Web

1. Firebase Console > roue dentée > **Paramètres du projet**.
2. Descendez jusqu’à **Vos applications**.
3. Cliquez sur l’icône `</>` pour ajouter une application Web.
4. Nom : `QCM Live Web`.
5. Cliquez sur **Enregistrer l’application**.
6. Firebase affiche un objet `firebaseConfig`.
7. Ouvrez `app.js` dans GitHub, cliquez sur le crayon d’édition.
8. Remplacez entièrement l’objet présent au début de `app.js` par celui de Firebase.
9. Cliquez sur **Commit changes**.

### Ajouter `databaseURL`

Après avoir créé Realtime Database, récupérez son URL. Elle ressemble à :

```text
https://VOTRE-PROJET-default-rtdb.europe-west1.firebasedatabase.app
```

Si `databaseURL` n’est pas présente dans la configuration Firebase copiée, ajoutez-la dans l’objet :

```javascript
databaseURL: "https://VOTRE-PROJET-default-rtdb.europe-west1.firebasedatabase.app",
```

## 7. Activer l’authentification anonyme

1. Firebase Console > menu **Build** > **Authentication**.
2. Cliquez sur **Commencer** si nécessaire.
3. Ouvrez l’onglet **Sign-in method** / **Méthodes de connexion**.
4. Cliquez sur **Anonymous / Anonyme**.
5. Activez le fournisseur.
6. Enregistrez.

## 8. Créer Realtime Database

1. Firebase Console > **Build** > **Realtime Database**.
2. Cliquez sur **Créer une base de données**.
3. Choisissez une région Europe si possible.
4. Terminez la création.
5. Ouvrez l’onglet **Rules / Règles**.
6. Ouvrez le fichier local `database.rules.json`.
7. Copiez le contenu complet et collez-le dans Firebase.
8. Cliquez sur **Publier**.

Ne laissez pas les règles temporaires de test ouvertes.

## 9. Activer GitHub Pages

1. Dans GitHub, ouvrez votre dépôt `qcm-live`.
2. Cliquez sur **Settings**.
3. Cliquez sur **Pages** dans le menu gauche.
4. Source : **Deploy from a branch**.
5. Branche : `main`.
6. Dossier : `/(root)`.
7. Cliquez sur **Save**.
8. Après une ou deux minutes, GitHub affiche une URL semblable à :

```text
https://VOTRE-COMPTE.github.io/qcm-live/
```

Ouvrez-la. Le bandeau doit afficher **Connecté** après quelques secondes.

## 10. Tester

### Présentateur

1. Sur PC, ouvrez l’adresse GitHub Pages.
2. Cliquez sur **Mes QCM**.
3. Cliquez sur **Nouveau QCM**.
4. Ajoutez un titre, les questions, 4 réponses et cochez les bonnes réponses.
5. Cliquez sur **Enregistrer le QCM**.
6. Dans la bibliothèque, cliquez sur **Lancer**.
7. Affichez le QR code aux participants.

### Participant

1. Avec un autre téléphone ou une fenêtre de navigation privée, scannez le QR code.
2. Saisissez un pseudo.
3. Répondez à chaque question.
4. Vous ne voyez ni correction ni score intermédiaire.
5. À la dernière question, le score global apparaît.

### Présentateur — rapport

1. Regardez le tableau : chaque colonne Q1, Q2, etc. affiche `1`, `0,5`, `0` ou `—`.
2. Cliquez sur **Télécharger le rapport PDF**.
3. Le PDF contient une fiche détaillée par participant.
4. Les réponses sélectionnées sont encadrées ; les bonnes réponses sont en gras.
5. Les dernières pages contiennent la synthèse et les statistiques par question.

## 11. Créer une question à demi-point

Pour une question avec 3 bonnes réponses parmi 4 :

1. Cochez les trois bonnes réponses dans l’éditeur.
2. Cochez **Autoriser une note partielle**.
3. Mettez `2` dans « Bonnes réponses nécessaires ».
4. Mettez `0,5` dans « Points partiels ».

Exemple : A, C et D correctes ; B fausse.

| Réponses cochées | Note |
|---|---:|
| A + C + D | 1 |
| A + C | 0,5 |
| A + D | 0,5 |
| C + D | 0,5 |
| A + B | 0 |
| A + C + B | 0 |
| Toutes les réponses | 0 |

Une mauvaise réponse cochée annule la note partielle.

## 12. Importer les QCM fournis

Deux fichiers sont inclus :

```text
qcm-mathematiques.json
qcm-qualite-agroalimentaire.json
```

Pour les charger :

1. Ouvrez **Mes QCM**.
2. Cliquez sur **Importer un QCM JSON**.
3. Sélectionnez l’un des deux fichiers.
4. Le QCM apparaît dans la liste.
5. Cliquez sur **Modifier** si vous voulez l’adapter.
6. Cliquez sur **Lancer** pour créer une salle.

## 13. Limites gratuites à surveiller

- Firebase Spark Realtime Database : environ 100 connexions simultanées pour ce type d’usage gratuit.
- Un onglet navigateur ouvert compte généralement comme une connexion.
- Pour rester confortable, limitez les séances à environ 70 à 80 participants connectés simultanément.
- Nettoyez occasionnellement les anciennes salles dans Firebase Realtime Database si vous effectuez beaucoup de tests.

## 14. Dépannage

| Problème | Cause probable | Solution |
|---|---|---|
| `auth/operation-not-allowed` | Auth anonyme inactive | Activez Anonymous dans Authentication |
| `permission_denied` | Règles non publiées | Collez et publiez `database.rules.json` |
| Le bandeau reste sur Connexion | Mauvaise config Firebase | Vérifiez `firebaseConfig` et `databaseURL` |
| QR code mène à une page absente | GitHub Pages non publié | Vérifiez Settings > Pages et attendez le déploiement |
| Ancienne interface affichée | Cache navigateur | Rechargez avec Ctrl+F5 ou videz les données du site |
| Deux tests partagent le même participant | Même navigateur | Utilisez un autre appareil ou une fenêtre privée |

## 15. Évolutions possibles sans changer l’usage

- Ajout d’un logo sur le PDF.
- Ajout de nom, prénom et groupe participant.
- Export CSV.
- Minuteur par question.
- Suppression des QCM et des salles depuis l’interface.
- Duplication d’un QCM.
- Classement final optionnel.

Pour une correction réellement cachée et un usage anti-triche, il faudra à l’avenir ajouter un backend sécurisé, ce qui sort de la solution strictement gratuite.
