# Baby Steps Race — Guide complet

Tout ce qu'il faut savoir pour lancer le stream avec l'overlay.

---

## 🎯 Concept

Tracker auto qui lit le fichier de save de Baby Steps + serveur Node + overlay web pour OBS. Matteo et Abdou jouent chacun de chez eux, chaque stream affiche les data de **l'adversaire**.

---

## 🚀 Lancement RAPIDE (chaque session)

### 1. Lance le serveur local

**Terminal #1** (PowerShell) :
```powershell
cd C:\Users\Matteo\Desktop\babysteps
npm start
```
→ Doit afficher : `🚀  Baby Steps server running on http://localhost:3001`

### 2. Lance le tracker

**Terminal #2** (PowerShell) :
```powershell
node C:\Users\Matteo\Desktop\babysteps\tracker-client\file-tracker.js playerA
```
→ Doit afficher : `[Tracker] el_matte0 => pos: X | record: Y` qui défile.

⚠️ Si tu veux envoyer au serveur Render (cloud) au lieu du local :
```powershell
$env:SERVER_URL="https://babysteps-race.onrender.com"; node C:\Users\Matteo\Desktop\babysteps\tracker-client\file-tracker.js playerA
```

### 3. Lance Baby Steps
Joue normalement, les données sont envoyées en temps réel.

### 4. Ouvre l'overlay dans OBS
Browser Source → URL du cycle automatique :
```
http://localhost:3001/overlay?cycle=1
```

---

## 📺 URLs des overlays (cheatsheet)

### Cycle auto (recommandé pour stream)
| Stream | URL |
|---|---|
| **Matteo** (perspective : voit Abdou) | `http://localhost:3001/overlay?cycle=1` |
| **Abdou** (perspective : voit Matteo) | `http://localhost:3001/overlay?cycle=1&player=playerB` |

Le cycle alterne automatiquement :
- **duo** 18s — les 2 PPs + altitudes côte à côte
- **opp** 14s — PP adversaire + son altitude
- **delta** 12s — "+X m d'avance sur Y" (ou retard)
- **falls** 9s — nombre de chutes adversaire
- → repeat (53s par tour)

### Overlay précis (sans cycle)
| Overlay | URL |
|---|---|
| Duo (2 ensemble) | `http://localhost:3001/overlay` |
| Adversaire seul | `http://localhost:3001/overlay?style=opp` |
| Delta avance/retard | `http://localhost:3001/overlay?style=delta` |
| Chutes adversaire | `http://localhost:3001/overlay?style=falls` |
| VS dramatique | `http://localhost:3001/overlay?style=vs` |
| Solo (toi) | `http://localhost:3001/overlay?style=solo&player=playerA` |

### Admin (corrections manuelles)
```
http://localhost:3001/admin
```
→ Modifier pseudo, altitude, peak, chutes manuellement si bug.

---

## 🌍 Mode CLOUD (pour qu'Abdou se connecte)

Si vous streamez en même temps depuis vos maisons, le serveur Render héberge tout :

**Tracker d'Abdou** (à lancer chez lui) :
```powershell
$env:SERVER_URL="https://babysteps-race.onrender.com"; node file-tracker.js playerB
```

**Overlays Render** : remplace `localhost:3001` par `babysteps-race.onrender.com` dans toutes les URLs ci-dessus.

⚠️ Le serveur Render gratuit s'endort après 15 min d'inactivité. Le 1er chargement peut prendre 30-50 sec.

---

## 🛠️ Paramètres URL utiles

| Param | Effet | Exemple |
|---|---|---|
| `?cycle=1` | Active la rotation auto | `/overlay?cycle=1` |
| `?style=X` | Force un overlay précis | `/overlay?style=delta` |
| `?player=playerA` / `playerB` | Perspective (= dans quel stream) | `/overlay?cycle=1&player=playerB` |
| `?scale=X` | Calibration mètres (default 30) | `/overlay?scale=50` |
| `?twitchA=name` / `?twitchB=name` | Override pseudos Twitch | `/overlay?twitchA=el_matte0&twitchB=tvabdou` |

---

## 🎨 Configuration OBS

### Setup Browser Source
1. OBS → Sources → **+** → **Browser**
2. URL : `http://localhost:3001/overlay?cycle=1`
3. Largeur : **1200** / Hauteur : **400** (ajuste selon le placement)
4. ✅ Coche "Refresh browser when scene becomes active" (utile pour rejouer les anims VS)
5. ✅ Fond transparent (par défaut sur les Browser Sources)

### Multiples scènes possibles
- Scène "gameplay" → Browser source en bas/coin avec `?cycle=1`
- Scène "pause" → Browser source plein écran avec `?style=vs` (pour le moment dramatique)
- Scène "intro" → `?style=duo` (présentation des 2 joueurs)

---

## ⚙️ Calibration des mètres

Actuellement : `SCALE=30` (1 pas ≈ 3m affiché). Calibré sur retour utilisateur (18 pas = ~49m).

Pour changer sans redéployer :
```
http://localhost:3001/overlay?cycle=1&scale=50
```

Pour modifier en dur, édite `overlay/index.html` ligne ~530 :
```js
const SCALE = Math.max(1, parseFloat(params.get('scale')) || 30);
```

---

## 🐛 Troubleshooting

### "0m" partout / l'overlay ne se met pas à jour
- ✅ Vérifie que `npm start` tourne (Terminal #1)
- ✅ Vérifie que le tracker tourne (Terminal #2) et affiche `pos: X`
- ✅ Vérifie que Baby Steps est lancé et que tu bouges (le tracker lit le save file)
- ✅ Console navigateur (F12) → erreurs ?

### "Cannot GET /" sur localhost:3001
- Normal, il faut ajouter `/overlay` ou `/admin` à l'URL

### Render trop lent
- Free tier s'endort après 15 min, le 1er request prend 30-50s
- Solution : utilise le mode local (`localhost:3001`)

### Numbers qui sautent / pas fluides
- Le tracker poll toutes les 250ms + tween smooth 500ms côté overlay
- Si saccadé : vérifie ton CPU pas saturé

### Tracker ne trouve pas le save file
- Tracker cherche `C:\Users\$USERNAME\AppData\LocalLow\DefaultCompany\Babysteps\[steamID]\save\path0_0.sav`
- Lance le jeu au moins une fois pour créer le fichier
- Override possible avec `$env:SAVE_PATH="C:\path\to\file.sav"`

### Powershell n'accepte pas `&&`
Remplace `&&` par `;` :
```powershell
$env:SERVER_URL="https://babysteps-race.onrender.com"; node file-tracker.js playerA
```

---

## 📂 Structure du projet

```
babysteps/
├── server/
│   ├── index.js          # serveur Express + Socket.io
│   └── state.js          # état persistant (state.json)
├── tracker-client/
│   ├── file-tracker.js   # lit path0_0.sav, envoie au serveur
│   └── index.html        # tracker web manuel (backup)
├── overlay/
│   └── index.html        # tous les overlays (duo/opp/delta/falls/vs/solo)
├── admin/
│   └── index.html        # panel admin (corrections manuelles)
├── shared/
│   └── constants.js      # events Socket.io + state par défaut
├── package.json
└── GUIDE.md              # ce fichier
```

---

## 🔗 Liens utiles

- **GitHub** : https://github.com/walt0white1/babysteps-race
- **Render deploy** : https://babysteps-race.onrender.com
- **Dashboard Render** : https://dashboard.render.com

---

## 🎬 Checklist avant stream

- [ ] `npm start` lancé (Terminal #1)
- [ ] Tracker lancé avec le bon `playerA` ou `playerB` (Terminal #2)
- [ ] Baby Steps lancé et joué 2-3 pas (vérifier que le tracker affiche un pos > 0)
- [ ] Overlay ouvert dans OBS Browser Source avec `?cycle=1`
- [ ] Admin ouvert dans un onglet au cas où (`/admin`)
- [ ] Abdou prévenu de lancer son tracker côté playerB
