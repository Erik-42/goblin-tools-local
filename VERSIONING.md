# Versionnage Sémantique (SemVer)

Ce projet suit les règles du **Versionnage Sémantique** (Semantic Versioning, ou **SemVer**) pour gérer les versions des releases. Le format utilisé est :
**`MAJEUR.MINEUR.CORRECTIF`** (ou **`X.Y.Z`**).

---

## Règles du SemVer

### 1. **`MAJEUR` (X)**
- Incrémenté lorsque :
  - Des **changements incompatibles** avec les versions précédentes sont introduits (ex. : suppression d'une fonctionnalité, modification majeure de l'API).
  - Une refonte majeure du code ou de l'architecture est effectuée.
- **Impact** : Les utilisateurs doivent mettre à jour leur code ou leurs dépendances pour utiliser cette version.

### 2. **`MINEUR` (Y)**
- Incrémenté lorsque :
  - De **nouvelles fonctionnalités** sont ajoutées **sans casser la compatibilité** avec les versions précédentes.
  - Des améliorations mineures sont apportées.
- **Impact** : Les utilisateurs peuvent mettre à jour sans risque de rupture.

### 3. **`CORRECTIF` (Z)**
- Incrémenté lorsque :
  - Des **correctifs de bugs** sont apportés **sans ajouter de nouvelles fonctionnalités**. 
  - Des corrections de sécurité sont effectuées.
- **Impact** : Les utilisateurs doivent mettre à jour pour bénéficier des corrections, mais sans risque de rupture.

---

## Règles supplémentaires

### 1. **Version `0.Y.Z` (développement initial)**
- Pour les versions **inférieures à `1.0.0`**, tout peut changer à tout moment. Aucune garantie de stabilité.
- Exemple : `0.1.0`, `0.2.0`, `0.2.1`.

### 2. **Version `1.0.0`**
- Marque la **première version stable** du projet.
- À partir de cette version, les règles du SemVer s'appliquent strictement.

### 3. **Pré-versions (ou versions beta)**
- Ajoute un suffixe pour indiquer une version non stable, par exemple :
  - `1.0.0-alpha` (version alpha, instable).
  - `1.0.0-beta` (version beta, testable mais pas finale).
  - `1.0.0-rc.1` (release candidate, candidate à la version finale).

### 4. **Métadonnées de build**
- Peuvent être ajoutées après un `+` pour indiquer des informations supplémentaires (ex. : `1.0.0+build.123`).

---

## Exemples

| Version | Explication |
|---------|-------------|
| `1.0.0` | Première version stable. |
| `1.1.0` | Ajout d'une nouvelle fonctionnalité compatible. |
| `1.1.1` | Correction d'un bug mineur. |
| `2.0.0` | Refonte majeure avec des changements incompatibles. |
| `2.1.0` | Ajout d'une nouvelle fonctionnalité compatible. |
| `2.1.1` | Correction d'un bug critique. |
| `2.0.0-beta.1` | Version beta pour tester la `2.0.0`. |

---

## Bonnes pratiques

1. **Documenter les changements** :
   - Utilise un fichier `CHANGELOG.md` pour lister les modifications apportées à chaque version.

2. **Automatiser le versionnage** :
   - Utilise des outils comme `standard-version`, `bumpversion` ou `semantic-release` pour automatiser les releases.

3. **Respecter les dépendances** :
   - Si le projet est une bibliothèque, utilise des plages de versions dans les dépendances pour éviter les ruptures.

4. **Communiquer les changements** :
   - Informe les utilisateurs des **changements incompatibles** via la documentation ou des avertissements dans le code.

5. **Tester les versions** :
   - Avant de publier une version `MAJEUR`, teste la compatibilité avec les versions précédentes.

---

## Outils recommandés
- **[`standard-version`](https://github.com/conventional-changelog/standard-version)** : Pour générer automatiquement des versions SemVer et un `CHANGELOG.md`.
- **[`bumpversion`](https://github.com/c4urself/bump2version)** : Pour incrémenter automatiquement les numéros de version.
- **[`semantic-release`](https://github.com/semantic-release/semantic-release)** : Pour automatiser les releases en fonction des commits Git.