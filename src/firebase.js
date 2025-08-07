import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// CONFIGURATION CORRIGÉE ET PRÊTE À L'EMPLOI
const firebaseConfig = {
  apiKey: "AIzaSyBLoPpDT49_S1YfVYRfeRC9f8kpfht6VFs",
  authDomain: "analyse-loto-ia-467411.firebaseapp.com",
  projectId: "analyse-loto-ia-467411",
  storageBucket: "analyse-loto-ia-467411.appspot.com", // J'ai corrigé "firebasestorage.app" en "appspot.com" qui est le format standard
  messagingSenderId: "1079280363944",
  appId: "1:1079280363944:web:41de2a1855860c2040159d"
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);

// Exporter les services que nous utiliserons dans notre application
export const auth = getAuth(app);
export const db = getFirestore(app);