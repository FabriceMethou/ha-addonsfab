# MyLife360 — état des travaux et reprise

**Snapshot du 21 août 2026.** Étapes 1 à 3 du plan implémentées et testées ; l'étape 4 reste
entière. Ce document suffit à reprendre sans relire l'historique de conversation.

Revue et plan complets : https://claude.ai/code/artifact/88d7bd71-0e78-43f9-8cbd-0b655de7fa44

---

## Objectif

Recréer Life360 en gardant la localisation et les données sous contrôle. Quatre décisions
cadrent le travail :

| Sujet | Choix |
|---|---|
| Visibilité | Cercles séparés — un appareil ne voit que les membres de ses cercles |
| Alertes | Push auto-hébergé (ntfy / UnifiedPush), fonctionnant app fermée |
| Périmètre | Détection d'accident, bouton SOS, alertes de lieux, rapports de conduite |
| Backend | Il devient le cerveau (et non un simple relais vers Traccar) |

---

## Où vit le code

| Quoi | Dépôt | Chemin |
|---|---|---|
| Backend (add-on HA) | `ha-addonsfab` · branche `feature/mobile-app` | `traccar-backend/` |
| Application Android | `AndroidApp` · branche `main` | `MyLife360/` |
| Serveur Traccar | — | **Hors périmètre**, traité en boîte noire |

Le serveur Traccar n'a pas été inspecté ni modifié, à la demande.

---

## Architecture — le point non évident

Deux canaux, qui ne passent pas par le même endroit :

- **Lectures** : app → backend (REST + SSE) → API admin Traccar
- **Écritures de position** : app → **directement** l'endpoint OsmAnd de Traccar

Le backend ne voit donc jamais passer une position. C'est délibéré (télémétrie haute
fréquence), mais cela veut dire qu'il ne peut aujourd'hui ni limiter, ni journaliser, ni
refuser une position. L'étape 4 change cela en persistant les positions reçues par le
WebSocket admin.

---

## Ce qui est fait

Tests : **91 backend + 134 app = 225, 0 échec.** (Au départ : 64 backend, et 109 app dont
14 rouges.)

### Étape 1 — fermer l'enrôlement
- `/provision` exige un `enrolment_code` (`secrets.compare_digest`).
  **Échec fermé** : si le code n'est pas configuré, l'enrôlement renvoie 503 — un backend
  non configuré n'enrôle personne. *(C-02)*
- Jeton tronqué à 6 caractères dans les journaux. *(C-03)*
- `traccar_admin_token` typé `password`, valeurs par défaut neutres dans `config.yaml`. *(C-09, C-11)*
- `run.sh` ne journalise plus l'URL OsmAnd complète, et avertit si le code manque.

### Étape 2 — les cercles deviennent réels
- **`app/authz.py` (nouveau)** — la couche qui n'existait nulle part.
  `visible_device_ids(session)` : un appareil se voit lui-même, plus tout appareil partageant
  au moins un cercle. Sans cercle, il ne voit que lui-même : le cas sûr est le cas par défaut.
- Appliqué à `/family`, `/route` (403 hors cercle), `/events`. *(C-01, C-04)*
- **Bus SSE rendu conscient de l'identité** — il diffusait tout à tous. `subscribe(visible_ids)`
  filtre `positions` / `devices` / `events` par abonné ; les trames de contrôle passent à tous.
- **Correction du retrait silencieux** : un abonné saturé perdait son abonnement alors que sa
  connexion SSE restait ouverte — carte figée sans erreur. Il perd maintenant son message le
  plus ancien, jamais son abonnement. *(D-06)*
- 401 uniforme (`HTTPBearer(auto_error=False)`) au lieu d'un mélange 401/403. *(C-07)*
- `wifi_mappings` cloisonné par cercle, avec migration de schéma (`group_id`, 0 = héritage). *(C-08)*

### Étape 3 — réparer l'existant
- **Lieux liés aux appareils** à la création : `link_geofence_to_device`. Sans ce lien Traccar
  n'émet pas d'événement d'entrée/sortie. `link_permission` existait et n'était appelée que par
  les tests. *(D-04, D-05)*
- **Heuristique d'accident corrigée** : fenêtre de 30 s entre les deux points comparés. Avant,
  aucun contrôle du temps écoulé — « je roulais à 70, je suis garé » levait une alerte
  `CRITICAL` à **chaque fin de trajet**. *(D-01)*
- **Ancrage Wi-Fi** : GPS en pause, le battement de cœur reporte le centre du lieu associé au
  SSID au lieu de rejouer la dernière dérive GPS. Nouveau `utils/WifiAnchors.kt`. *(D-03)*
- **SSID personnels préservés** : séparés des SSID venus du serveur, ils ne sont plus écrasés
  au sync suivant. *(D-05 corrigé, voir plus bas)*
- `TraccarApi.kt` supprimé — 124 lignes jamais instanciées. *(C-06)*
- Réenrôlement automatique : sur 401, l'app efface sa session et revient à l'écran d'accueil. *(C-07)*
- `ProtocolFormatter` ne journalise plus l'URL de position (identifiant + coordonnées exactes).

### Étape 5 — partiellement
- **Bouton SOS** sur la carte, avec confirmation, émettant `alarm=sos` dans la trame OsmAnd.
  La moitié réceptrice (`AnomalyDetector` → `SOS_ALARM` → notification) existait déjà. *(D-07)*

---

## Trois corrections à des constats antérieurs

À lire avant de se fier au document de revue.

1. **C-10 n'a pas été appliqué, volontairement.** La revue proposait de retirer le bloc `ports`
   du `config.yaml`. L'app joint l'API **directement** avec un jeton porteur, ce que l'ingress
   HA ne relaie pas : le retirer aurait cassé toute l'installation. Le port reste publié, et
   c'est l'API qui se défend (étapes 1 et 2). Le `config.yaml` porte un commentaire à ce sujet.

2. **D-05 était faux dans le sens décrit.** Le constat visait `mergeWifiSsidsFromBackend`, qui
   est additive — mais elle n'a **aucun appelant**. Le chemin réel, `setHomeWifiSsids`,
   *remplace* la liste : la suppression d'un mapping se propageait donc correctement. Le vrai
   défaut était l'inverse — un SSID saisi personnellement était écrasé au sync suivant. C'est
   ce défaut-là qui a été corrigé, et la fonction morte a été supprimée.

3. **La suite de tests de l'app était rouge avant toute intervention** — 14 échecs. Onze
   venaient d'un `Log.d` non mocké en test JVM, sur la ligne même qui journalisait l'URL de
   position complète : la supprimer corrigeait la fuite et les tests d'un coup. Les trois
   autres décrivaient des seuils remplacés depuis (ajout de la catégorie « en train »).

---

## À vérifier sur le serveur réel

**Les alertes d'arrivée fonctionnent-elles ?** Tout `D-04` repose sur le modèle de permissions
de Traccar, qui n'a pas été inspecté. Test en cinq minutes :

1. Créer un lieu dans l'app, centré sur le domicile, rayon 150 m.
2. Sortir du rayon, attendre une position, revenir.
3. Ouvrir l'écran Alertes.

Un `geofenceEnter` apparaît → le lien implicite suffisait, et le code ajouté ne fait pas de mal.
Rien n'apparaît → vérifier que `link_geofence_to_device` poste bien la forme attendue par
votre version de Traccar (`{"deviceId": …, "geofenceId": …}` sur `/api/permissions`).

---

## Ce qui reste

### Étape 4 — le backend devient le cerveau *(le gros morceau, non commencé)*

C'est ce qui conditionne toute alerte app fermée.

1. **Persister les positions** à l'arrivée du WebSocket admin (`app/routers/stream.py`,
   `ws_reader_loop`). Nouvelle table `positions`. Donne un historique indépendant de la
   rétention de Traccar — premier pas pour s'en détacher.
2. **Déporter `AnomalyDetector` côté serveur**, sur ce flux persisté. Il tourne alors en
   continu. Porter la logique Kotlin de `utils/AnomalyDetector.kt`, **fenêtre de 30 s incluse**.
3. **Push auto-hébergé** : ntfy ou UnifiedPush, déclenché par le backend, avec un canal
   critique distinct pour accident et SOS. L'app doit s'abonner et enregistrer son endpoint
   (nouvelle colonne sur `device_sessions`).
4. Une fois (1) en place, `/route` peut lire la base locale plutôt que Traccar.

### Étape 5 — rapports de conduite *(non commencé)*
Segmenter l'historique persisté en trajets (départ, arrivée, distance, vitesse max) et les
présenter dans le détail d'un membre. Dépend de l'étape 4.1.

### Reliquats plus petits
- **Lecture des lieux non cloisonnée** : `/places` renvoie tous les géorepérages. Les lieux sont
  désormais *liés* par cercle, mais pas *filtrés* à la lecture. Demande une table
  `place_groups`.
- `TraccarRepository` → `BackendRepository` : le nom ment (il n'utilise que `backendApi`).
  Renommage mécanique, purement cosmétique. *(C-06)*
- `AppDatabase` en `fallbackToDestructiveMigration()` sans `exportSchema`. Tolérable tant que
  tout y est un cache rechargeable — à revoir si une table cesse de l'être. *(C-12)*
- **`.venv` et `__pycache__` sont suivis par git** (2722 fichiers) malgré le `.gitignore` :
  ajoutés avant lui. Un `git rm -r --cached traccar-backend/.venv` assainirait le dépôt, qui
  est public. Non fait ici pour ne pas mélanger 2722 suppressions à un commit de fonctionnalité.

---

## Faire tourner les tests

### Backend
```bash
cd traccar-backend
PYTHONPATH=. .venv/bin/python -m pytest app/tests -q     # 91 tests
```

### Application
```bash
cd MyLife360
./gradlew :app:testProdDebugUnitTest      # 134 tests
./gradlew compileProdDebugKotlin
```

Deux pièges :
- Les variantes s'appellent `prodDebug` / `betaDebug` — `compileDebugKotlin` seul est ambigu.
- `gradle.properties` fixe `org.gradle.java.home=/usr/lib/jvm/java-21-openjdk-amd64`. Si ce JDK
  n'existe pas sur la machine, surcharger sans modifier le fichier :
  ```bash
  ./gradlew :app:testProdDebugUnitTest -Dorg.gradle.java.home=/usr/lib/jvm/java-17-openjdk-amd64
  ```

---

## Avant de déployer — deux actions manuelles

1. **Définir `enrolment_code`** dans la configuration de l'add-on. Sans lui, `/provision`
   renvoie 503 et aucun nouvel appareil ne peut s'enrôler. Les appareils déjà enrôlés
   continuent de fonctionner (leur jeton reste valide).
2. **Mettre à jour l'app et l'add-on ensemble** — les deux passent en `1.1.0`. Une app
   antérieure n'envoie pas le code et ne pourra plus enrôler.

Après mise à jour, les appareils existants n'apparaîtront dans `/family` les uns des autres que
s'ils **partagent un cercle**. Sans cercle, chacun ne voit que lui-même : c'est le comportement
voulu, mais il surprend. Créer un cercle « Famille » et y ajouter les appareils.
