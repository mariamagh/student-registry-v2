const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, '../.env') });

// On charge l'artefact (ABI)
const artifact = require("../artifacts/contracts/StudentRegistry.sol/StudentRegistry.json");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client")));
const upload = multer({ dest: "uploads/" });

// --- CONFIGURATION ---
const provider = new ethers.JsonRpcProvider("https://polygon-amoy.infura.io/v3/" + process.env.INFURA_API_KEY);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// ⚠️ Assure-toi que c'est la NOUVELLE adresse après déploiement
const CONTRACT_ADDRESS = "0x7629CbFDD338E2BC4D4A984e95bd4ba2b89238d8"; 

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

// 1. AJOUTER ETUDIANT (sans mint)
app.post("/add-student", upload.single('diploma'), async (req, res) => {
  try {
    let { id, name, course, birthDate, grade, studentWallet } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "Données incomplètes (fichier manquant)" });

    // Le wallet étudiant est maintenant obligatoire
    if (!studentWallet || studentWallet.trim() === "") {
        return res.status(400).json({ error: "L'adresse wallet de l'étudiant est obligatoire" });
    }

    // Vérifier le format de l'adresse
    if (!studentWallet.startsWith('0x') || studentWallet.length !== 42) {
        return res.status(400).json({ error: "Format d'adresse wallet invalide" });
    }

    console.log(`Inscription : ${name} (ID: ${id}) -> Wallet Étudiant: ${studentWallet}`);

    // 1. Upload IPFS
    const tokenURI = await pinFileToIPFS(file.path);
    fs.unlinkSync(file.path); 

    // 2. Blockchain : Inscription uniquement (sans mint)
    console.log("Envoi Transaction (Inscription)...");
    const tx1 = await contract.addStudent(id, name, course, birthDate, grade, studentWallet);
    await tx1.wait();
    console.log("Tx Confirmée.");

    res.json({ success: true, txHash: tx1.hash, ipfsLink: tokenURI, studentId: id });

  } catch (error) {
    console.error("ERREUR SERVEUR:", error);
    if (error.code === "INSUFFICIENT_FUNDS" || error.message.includes("insufficient funds")) {
        return res.status(500).json({ error: "Le Serveur n'a plus de POL (Matic) pour payer le gaz !" });
    }
    res.status(500).json({ error: error.message });
  }
});

// 1b. MINTER NFT pour un étudiant déjà inscrit (vers admin MetaMask + étudiant)
app.post("/mint-diploma", async (req, res) => {
  try {
    const { studentId, ipfsLink, adminWallet, studentWallet } = req.body;

    if (!studentId || !ipfsLink || !adminWallet || !studentWallet) {
        return res.status(400).json({ error: "ID étudiant, IPFS link, adresse admin et adresse étudiant requis" });
    }

    // Récupérer les données de l'étudiant
    const studentData = await contract.students(studentId);
    
    if (!studentData.isEnrolled) {
        return res.status(400).json({ error: "Étudiant non inscrit" });
    }

    // Vérifier que les adresses sont valides
    if (!adminWallet.startsWith('0x') || adminWallet.length !== 42) {
        return res.status(400).json({ error: "Format d'adresse admin invalide" });
    }
    if (!studentWallet.startsWith('0x') || studentWallet.length !== 42) {
        return res.status(400).json({ error: "Format d'adresse étudiant invalide" });
    }

    console.log(`Mint NFT pour étudiant ${studentId}`);
    console.log(`  - Vers Admin MetaMask: ${adminWallet}`);
    console.log(`  - Vers Étudiant: ${studentWallet}`);

    // Mint NFT vers le wallet admin MetaMask
    const tx1 = await contract.issueDiploma(studentId, adminWallet, ipfsLink);
    console.log("Hash transaction Admin:", tx1.hash); 
    const receipt1 = await tx1.wait();
    console.log("Tx Admin Confirmée.");

    // Récupération du tokenId pour l'admin
    const studentDataAfterAdmin = await contract.students(studentId);
    const adminTokenId = studentDataAfterAdmin.diplomaTokenId.toString();

    // Pause entre les transactions
    await new Promise(r => setTimeout(r, 3000));

    // Mint NFT vers le wallet étudiant (créera un nouveau token avec un ID différent)
    const tx2 = await contract.issueDiploma(studentId, studentWallet, ipfsLink);
    console.log("Hash transaction Étudiant:", tx2.hash); 
    const receipt2 = await tx2.wait();
    console.log("Tx Étudiant Confirmée.");

    // Récupération du tokenId pour l'étudiant
    const studentDataAfterStudent = await contract.students(studentId);
    const studentTokenId = studentDataAfterStudent.diplomaTokenId.toString();

    console.log(`Succès ! Token Admin ID: ${adminTokenId}, Token Étudiant ID: ${studentTokenId}`);

    res.json({ 
        success: true, 
        adminTxHash: tx1.hash,
        studentTxHash: tx2.hash,
        adminTokenId: adminTokenId, 
        studentTokenId: studentTokenId,
        adminWallet: adminWallet,
        studentWallet: studentWallet,
        message: "NFT minté vers les deux wallets avec succès."
    });

  } catch (error) {
    console.error("ERREUR SERVEUR:", error);
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
                    wallet: student.wallet, // On renvoie le wallet pour la vérification Frontend
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