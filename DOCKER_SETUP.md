# 🐳 Docker & GitHub Actions Setup Guide

## 📋 Configuration requise

### 1. Secrets GitHub à configurer
Allez dans votre repository GitHub → Settings → Secrets and variables → Actions

Ajoutez ces secrets :

```
DOCKERT_USERNAME= votre_username_dockerhub
DOCKER_PASSWORD= votre_token_dockerhub
INFURA_API_KEY= votre_clé_infura
PRIVATE_KEY= votre_clé_privée_ethereum
ADMIN_WALLET_ADDRESS= votre_adresse_wallet_admin
PINATA_API_KEY= votre_clé_pinata_api
PINATA_SECRET_KEY= votre_clé_secrète_pinata
```

### 2. Créer un token Docker Hub
1. Allez sur https://hub.docker.com/
2. Connectez-vous → Account Settings → Security
3. Cliquez sur "New Access Token"
4. Donnez un nom (ex: github-actions)
5. Copiez le token généré

### 3. Workflow GitHub Actions
Le fichier `.github/workflows/main.yml` est déjà configuré pour :
- ✅ Construire l'image Docker
- ✅ Utiliser les secrets GitHub
- ✅ Pousser sur Docker Hub
- ✅ Gérer le port 3001

## 🚀 Déploiement

### Option 1: Automatique avec GitHub Actions
1. Poussez votre code sur la branche `main`
2. L'action GitHub va automatiquement :
   - Construire l'image Docker
   - La pousser sur Docker Hub
   - Afficher la commande de déploiement

### Option 2: Manuel avec Docker
```bash
# Construire l'image localement
docker build -t student-registry-v2 .

# Lancer le conteneur
docker run -d \
  -p 3001:3001 \
  --env-file .env \
  --name student-registry \
  student-registry-v2

# Ou utiliser l'image depuis Docker Hub
docker run -d \
  -p 3001:3001 \
  --env-file .env \
  votre_username/student-registry-v2:latest
```

### Option 3: Avec Docker Compose
```bash
docker-compose up -d
```

## 🔧 Vérification

```bash
# Vérifier que le conteneur tourne
docker ps

# Vérifier les logs
docker logs student-registry

# Tester l'API
curl http://localhost:3001/students
```

## 📝 Notes importantes

- Le port a été changé de 3000 → 3001
- L'image Docker expose le port 3001
- Tous les secrets sont gérés via GitHub Secrets
- Le fichier .env est créé automatiquement dans le workflow
- L'application est accessible sur `http://localhost:3001`

## 🐛 Problèmes courants

### Si le port est déjà utilisé :
```bash
# Trouver le processus utilisant le port 3001
netstat -ano | findstr :3001

# Tuer le processus (remplacer PID)
taskkill /PID <PID> /F
```

### Si l'image ne se construit pas :
- Vérifiez que tous les secrets sont configurés
- Vérifiez que votre token Docker Hub est valide
- Regardez les logs de l'action GitHub
