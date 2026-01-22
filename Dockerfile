# 1. On part d'une version légère de Node.js
FROM node:18-alpine

# 2. On crée un dossier de travail dans la "boîte"
WORKDIR /app

# 3. On copie le fichier qui liste les installations nécessaires
COPY package*.json ./

# 4. On installe les outils (express, ethers, etc.)
RUN npm install

# 5. On copie TOUS tes dossiers (client, server, artifacts) dans la boîte
COPY . .

# 6. On compile les contrats intelligents
RUN npx hardhat compile

# 7. On ouvre le port 3001 (celui de ton serveur)
EXPOSE 3001

# 8. La commande pour démarrer quand on ouvre la boîte
CMD ["sh", "-c", "if [ -f .env ]; then export $(cat .env | xargs); fi && node server/server.js"]

