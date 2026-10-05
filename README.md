# QCM Live

Application web de QCM en direct : création de quiz, QR code, connexion des participants, réponses en direct et classement final.

## Déploiement rapide

1. Créez un projet Firebase, activez **Authentication > Anonymous** et **Realtime Database**.
2. Dans `app.js`, remplacez intégralement l'objet `firebaseConfig` par celui donné par Firebase.
3. Publiez le dépôt sur GitHub Pages ou déployez avec Firebase Hosting.
4. Publiez les règles `database.rules.json` dans Firebase Realtime Database > Rules.

La procédure détaillée est dans le guide livré avec le projet.

## Attention sécurité

Cette version est un MVP. La correction (`correctIndex`) est transmise aux navigateurs car le calcul est réalisé côté client. Ne l'utilisez pas pour un examen certifiant ou un vote sensible. Pour empêcher la triche, séparez les corrections dans une zone privée et utilisez Cloud Functions pour valider les réponses.
