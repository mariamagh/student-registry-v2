const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const path = require("path");
require("dotenv").config({ path: "../.env" });

// On charge l'artefact (ABI)
const artifact = require("../artifacts/contracts/StudentRegistry.sol/StudentRegistry.json");

const app = express();
app.use(cors());
app.use(express.json());
// Sert les fichiers du dossier 'client'
app.use(express.static(path.join(__dirname, "../client")));
const upload = multer({ dest: "uploads/" });

// --- CONFIGURATION ---
const provider = new ethers.JsonRpcProvider("https://polygon-amoy.infura.io/v3/" + process.env.INFURA_API_KEY);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// ⚠️ C'est la bonne adresse (Celle où tu écris)
const CONTRACT_ADDRESS = "0x3E2Bf68F9BbD30A83ff3E06C88916592b294ea17"; 

const contract = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, wallet);

// Utilitaire IPFS
const pinFileToIPFS = async (filePath) => {
    const url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;
    let data = new FormData();
    data.append('file', fs.createReadStream(filePath));
    try {
        const response = await axios.post(url, data, {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
                'pinata_api_key': process.env.PINATA_API_KEY,
                'pinata_secret_api_key': process.env.PINATA_SECRET_KEY
            }
        });
        return "https://gateway.pinata.cloud/ipfs/" + response.data.IpfsHash;
    } catch (error) { throw new Error("Echec upload IPFS"); }
};

// --- ROUTES ---

// 1. AJOUTER ETUDIANT + MINT
app.post("/add-student", upload.single('diploma'), async (req, res) => {
  try {
    const { id, name, course, birthDate, grade, studentWallet } = req.body;
    const file = req.file;

    if (!file || !studentWallet) return res.status(400).json({ error: "Données incomplètes" });

    console.log(`Traitement : ${name} (ID: ${id})...`);

    // 1. Upload IPFS
    const tokenURI = await pinFileToIPFS(file.path);
    fs.unlinkSync(file.path); // Supprime le fichier temporaire

    // 2. Blockchain : Inscription (addStudent)
    // Attention: Si pas de gaz (POL), ça va planter ici
    console.log("Envoi Transaction 1 (Inscription)...");
    const tx1 = await contract.addStudent(id, name, course, birthDate, grade);
    await tx1.wait();
    console.log("Tx 1 Confirmée.");

    // 3. Blockchain : Mint NFT (issueDiploma)
    // ...
    const tx2 = await contract.issueDiploma(id, studentWallet, tokenURI);
    
    // Le hash est disponible IMMÉDIATEMENT ici, avant même le wait()
    console.log("Hash de la transaction :", tx2.hash); 

    const receipt = await tx2.wait();
    console.log("Tx 2 Confirmée.");
    // ...

    
    // Pause de sécurité pour la propagation (2 secondes)
    await new Promise(r => setTimeout(r, 2000));

    // 4. Récupération de l'ID du Token créé
    const studentData = await contract.students(id);
    const newTokenId = studentData.diplomaTokenId.toString();

    console.log(`Succès ! Token ID: ${newTokenId}`);

    // On renvoie tout au Frontend
    res.json({ success: true, txHash: tx2.hash, ipfsLink: tokenURI, tokenId: newTokenId });

  } catch (error) {
    console.error("ERREUR SERVEUR:", error);
    // Si l'erreur contient "insufficient funds", on prévient l'utilisateur clairement
    if (error.code === "INSUFFICIENT_FUNDS" || error.message.includes("insufficient funds")) {
        return res.status(500).json({ error: "Le Serveur n'a plus de POL (Matic) pour payer le gaz !" });
    }
    res.status(500).json({ error: error.message });
  }
});

// 2. SUPPRIMER
app.post("/delete-student", async (req, res) => {
    try {
        const { id } = req.body;
        console.log(`Suppression ID: ${id}`);
        const tx = await contract.removeStudent(id);
        await tx.wait();
        res.json({ success: true });
    } catch (error) {
        console.error(error); res.status(500).json({ error: error.message });
    }
});

// 3. LIRE TOUT
app.get("/students", async (req, res) => {
  try {
    const total = await contract.getTotalStudents();
    let studentsList = [];

    for (let i = 0; i < total; i++) {

        await new Promise(resolve => setTimeout(resolve, 500));
        // On met un try/catch dans la boucle pour éviter qu'un étudiant buggé ne casse toute la liste
        try {
            const studentId = await contract.studentIds(i); 
            const student = await contract.getStudent(studentId);
            
            if (student.isEnrolled) {
                let ipfsLink = "";
                if (student.diplomaTokenId > 0) {
                     ipfsLink = await contract.tokenURI(student.diplomaTokenId);
                }
                studentsList.push({
                    id: student.id.toString(),
                    name: student.name,
                    course: student.course,
                    birthDate: student.birthDate,
                    grade: student.grade.toString(),
                    ipfsLink: ipfsLink 
                });
            }
        } catch (err) {
            console.error(`Erreur lecture étudiant index ${i}`, err);
        }
    }
    res.json(studentsList);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.listen(3000, () => { console.log("✅ Serveur prêt sur le port 3000"); });