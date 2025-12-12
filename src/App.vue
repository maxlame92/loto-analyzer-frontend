<script setup>
import { ref, onMounted, computed } from 'vue';
// Assurez-vous que './firebase.js' exporte bien `auth`, `db`, et initialise Firebase
import { auth, db } from './firebase'; 
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// --- CONFIGURATION GLOBALE ---
// Remplacez par votre ID Google Sheet trouvé dans l'URL
const GOOGLE_SHEET_ID = "1HepqMzKcsbKbRsLWwpEOoy5oO9ntK2CgdV7F_ijmjlo"; 
// URL de votre API Backend (Ex: Render, ou localhost pour le dev)
const API_BASE_URL = "http://127.0.0.1:8000"; 

// --- STATE DE L'AUTHENTIFICATION ---
const user = ref(null); // Objet utilisateur Firebase s'il est connecté
const userRole = ref(''); // 'admin', 'user', ou ''
const email = ref('');
const password = ref('');
const authError = ref(''); // Message d'erreur de connexion
const isAuthReady = ref(false); // Pour afficher l'appli une fois Firebase prêt

// --- STATE DE L'APPLICATION ET DES ANALYSES ---
const selectedDate = ref('');      // Date principale pour les analyses (jour/semaine)
const selectedEndDate = ref('');   // Date de fin pour le Dashboard (période)
const selectedNumber = ref('');    // Numéro pour analyses Compagnons / Prophète
const selectedCompanion = ref(''); // Compagnon optionnel pour Prophète
const favoritesInput = ref('7, 24, 10-90, 45'); // Favoris pour le dashboard (par défaut)

const apiResponse = ref(null);     // Stocke la réponse JSON du backend
const isLoading = ref(false);      // Indicateur de chargement
const error = ref(null);           // Message d'erreur d'une requête API
const lastOperationType = ref(''); // Pour adapter l'affichage du tableau (ex: 'frequency', 'dashboard')
const activeSheetGid = ref(null);  // GID de l'onglet Google Sheet actif
const showWelcomeMessage = ref(true); // Contrôle l'affichage initial

// --- INITIALISATION ET AUTH STATE ---
onMounted(() => {
  // Définir les dates par défaut pour la sélection
  const today = new Date();
  const lastWeek = new Date();
  lastWeek.setDate(today.getDate() - 7); // Prend la date d'il y a 7 jours

  selectedDate.value = today.toISOString().split('T')[0]; // Format YYYY-MM-DD
  selectedEndDate.value = today.toISOString().split('T')[0]; // Date de fin par défaut = aujourd'hui

  // Écoute les changements d'état d'authentification Firebase
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      user.value = firebaseUser;
      // Récupère le rôle de l'utilisateur depuis Firestore
      try {
        const docRef = doc(db, "users", firebaseUser.uid);
        const docSnap = await getDoc(docRef);
        userRole.value = docSnap.exists() ? docSnap.data().role : 'user'; // Défaut 'user'
      } catch (e) {
        console.error("Erreur lors de la récupération du rôle:", e);
        userRole.value = 'user'; // Sécurité : assume rôle 'user' en cas d'erreur
      }
    } else {
      user.value = null;
      userRole.value = '';
    }
    isAuthReady.value = true; // Indique que l'état d'authentification est prêt
  });
});

// Propriété calculée pour vérifier si l'utilisateur est admin
const isAdmin = computed(() => userRole.value === 'admin');

// --- FONCTIONS D'AUTHENTIFICATION ---
const login = async () => {
  try {
    authError.value = ''; isLoading.value = true;
    await signInWithEmailAndPassword(auth, email.value, password.value);
  } catch (error) { 
    authError.value = "Email ou mot de passe incorrect."; 
    console.error("Erreur Login:", error);
  } finally { isLoading.value = false; }
};

const logout = async () => {
  await signOut(auth);
  // Reset les states de l'appli lors de la déconnexion
  user.value = null; userRole.value = ''; activeSheetGid.value = null;
  apiResponse.value = null; error.value = null; lastOperationType.value = '';
};

// --- LOGIQUE D'APPEL À L'API BACKEND ---
async function callApi(endpoint, method = 'GET', body = null) {
  // Vérifie si l'utilisateur est connecté
  if (!user.value) { 
    error.value = "Veuillez vous connecter pour accéder aux analyses."; 
    return; 
  }
  
  showWelcomeMessage.value = false; // Cache le message de bienvenue
  isLoading.value = true;           // Affiche le loader
  error.value = null;               // Réinitialise l'erreur précédente
  apiResponse.value = null;         // Réinitialise la réponse précédente

  try {
    // Récupère le token JWT pour authentification
    const token = await user.value.getIdToken(); 
    const headers = { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json' 
    };
    
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body); // Ajoute le body si nécessaire (POST, PUT etc)

    // Appel fetch
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();

    // Gestion des erreurs HTTP (4xx, 5xx)
    if (!response.ok) throw new Error(data.detail || `Erreur serveur ${response.status}`);
    
    // Succès : Stocke la réponse et le GID si présent
    apiResponse.value = data;
    if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
    
  } catch (err) {
    error.value = err.message; // Affiche l'erreur utilisateur
    console.error(`Erreur API (${endpoint}):`, err);
    // Garde le sheet visible si possible même en cas d'erreur d'analyse
  } finally {
    isLoading.value = false; // Cache le loader
  }
}

// --- FONCTIONS SPÉCIFIQUES POUR CHAQUE ACTION ---

// 1. ADMIN : Lancement des mises à jour
const runUpdate = (type) => {
  lastOperationType.value = 'admin';
  callApi(`/collection/${type}`, 'POST');
};

// 2. ANALYSE VISUELLE (Modification du Google Sheet)
const runVisual = (type) => {
  if (!selectedDate.value) { error.value = "Veuillez sélectionner une date."; return; }
  lastOperationType.value = 'visual'; 
  // Les types sont 'highlight-day' et 'kanta-highlight-day'
  callApi(`/analysis/${type}/${selectedDate.value}`, 'POST');
};

// 3. RAPPORTS CLASSIQUES & COMPAGNONS
const runReport = (type) => {
  if (!selectedDate.value) { error.value = "Veuillez sélectionner une date."; return; }
  lastOperationType.value = type;
  
  if (type === 'companions') {
    if (!selectedNumber.value) { error.value = "Numéro cible requis pour l'analyse des compagnons."; return; }
    // Appel API avec paramètres pour numéro et date de semaine
    callApi(`/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`);
  } else {
    // Appel API pour fréquence journalière ou hebdomadaire
    callApi(`/analysis/${type}/${selectedDate.value}`);
  }
};

// 4. DASHBOARD PERSONNEL
const runDashboard = () => {
  if (!favoritesInput.value) { error.value = "Veuillez entrer vos numéros favoris."; return; }
  
  // Nettoie et formate les favoris (ex: "7, 10-20, 30" -> ['7', '10-20', '30'])
  const favoritesList = favoritesInput.value.split(',')
    .map(s => s.trim()).filter(s => s); // Filtre les entrées vides

  // Définit la période d'analyse pour le dashboard (par défaut 30 jours avant la date sélectionnée)
  const endDateObj = new Date(selectedDate.value);
  const startDateObj = new Date(endDateObj);
  startDateObj.setDate(endDateObj.getDate() - 30); // Analyse sur les 30 derniers jours
  
  const startDateStr = startDateObj.toISOString().split('T')[0];
  const endDateStr = selectedDate.value;

  lastOperationType.value = 'dashboard';
  // Appel POST avec le corps (liste des favoris) et les dates en query params
  callApi(
    `/analysis/favorites-dashboard?start_date=${startDateStr}&end_date=${endDateStr}`, 
    'POST', 
    favoritesList
  );
};

// 5. LE PROPHÈTE (Prédiction IA)
const runProphet = () => {
  if (!selectedNumber.value) { error.value = "Numéro observé requis pour la prédiction."; return; }
  
  // Période d'analyse pour le prophète (fixe ou dynamique)
  // Ici, on utilise une période fixe depuis début 2023 pour plus de données historiques
  const fixedStartDate = new Date(2023, 0, 1); // 1er Janvier 2023
  const endDateObj = new Date(selectedDate.value); // La date sélectionnée sert de fin

  const startDateStr = fixedStartDate.toISOString().split('T')[0];
  const endDateStr = endDateObj.toISOString().split('T')[0];

  lastOperationType.value = 'prophet';
  
  // Construction de l'URL avec paramètres optionnels
  let url = `/analysis/predict-next?observed_number=${selectedNumber.value}&start_date=${startDateStr}&end_date=${endDateStr}`;
  if (selectedCompanion.value && selectedCompanion.value > 0) { // Vérifie si un compagnon valide est entré
    url += `&observed_companion=${selectedCompanion.value}`;
  }
  
  callApi(url);
};

// --- PROPRIÉTÉS CALCULÉES POUR L'INTERFACE ---

// URL de l'iframe Google Sheets (dynamique selon le GID)
const sheetEmbedUrl = computed(() => {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
  // Ajoute le gid seulement si on a un onglet actif
  const gidParam = activeSheetGid.value ? `&gid=${activeSheetGid.value}` : ''; 
  return `${base}/htmlembed?widget=true&headers=false${gidParam}`;
});

// Lien direct vers l'onglet actif dans Google Sheets
const sheetDirectLink = computed(() => 
  `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/edit#gid=${activeSheetGid.value || 0}` // Gid 0 = Feuille principale si pas d'onglet actif
);

// Détermine les en-têtes du tableau en fonction de la dernière opération
const tableHeaders = computed(() => {
  if (lastOperationType.value === 'dashboard') return ['Item', 'Statut', 'Freq.', 'Meilleur Compagnon', 'Meilleur Déclencheur'];
  if (lastOperationType.value === 'prophet') return ['#', 'Numéro Prédit', 'Force'];
  if (lastOperationType.value.includes('kanta') && apiResponse.value?.kanta_pairs_ranking) return ['#', 'Paire Kanta', 'Apparitions'];
  if (lastOperationType.value === 'companions') return ['#', 'Compagnon', 'Sorties ensemble'];
  // Par défaut (Fréquence)
  return ['#', 'Numéro', 'Apparitions']; 
});

// Prépare les données pour le tableau en fonction de la réponse API et du type d'opération
const tableData = computed(() => {
  const data = apiResponse.value;
  if (!data) return []; // Si pas de réponse, tableau vide
  
  if (lastOperationType.value === 'dashboard') return data.dashboard_data;
  if (lastOperationType.value === 'prophet') return data.prediction_ranking;
  if (lastOperationType.value.includes('kanta') && data.kanta_pairs_ranking) return data.kanta_pairs_ranking;
  if (data.frequency_ranking) return data.frequency_ranking; // Fréquence journalière ou hebdo
  if (data.companion_ranking) return data.companion_ranking;
  
  return []; // Retour par défaut si rien ne correspond
});

// Extrait le texte de l'analyse IA depuis la réponse API
const aiAnalysisText = computed(() => {
  const r = apiResponse.value;
  if (!r) return null;
  // Tente de récupérer le texte d'analyse depuis différentes clés possibles
  return r.ai_strategic_analysis || r.ai_strategic_profile || r.ai_prediction_analysis || r.ai_trigger_analysis;
});

</script>

<template>
  <!-- ÉCRAN DE CHARGEMENT INITIAL -->
  <div v-if="!isAuthReady" class="loading-screen">
    <div class="spinner"></div>
    <p>Chargement du Guide des Fourcaster...</p>
  </div>

  <!-- ÉCRAN DE CONNEXION -->
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h1>🔐 ACCÈS FOURCASTER</h1>
      <form @submit.prevent="login">
        <div class="input-group">
          <label>Email</label>
          <input type="email" v-model="email" required placeholder="votre@email.com" />
        </div>
        <div class="input-group">
          <label>Mot de passe</label>
          <input type="password" v-model="password" required placeholder="••••••••" />
        </div>
        <button type="submit" class="primary-btn" :disabled="isLoading">
          {{ isLoading ? 'Vérification...' : 'Entrer' }}
        </button>
        <p v-if="authError" class="error-msg">{{ authError }}</p>
      </form>
    </div>
  </div>

  <!-- DASHBOARD PRINCIPAL (Utilisateur connecté) -->
  <main v-else class="app-layout">
    
    <!-- Header -->
    <header class="app-header">
      <div class="logo">🎱 LE GUIDE DES FOURCASTER</div>
      <div class="user-controls">
        <span class="desktop-only">Connecté : {{ user.email }} ({{ userRole }})</span>
        <button @click="logout" class="logout-btn">Déconnexion</button>
      </div>
    </header>

    <!-- Grille principale : Colonnes Contrôles + Résultats -->
    <div class="content-grid">
      
      <!-- COLONNE GAUCHE : CONTROLES -->
      <aside class="controls-sidebar">
        
        <!-- Section Admin -->
        <div v-if="isAdmin" class="control-card admin-card">
          <h3>🛠️ Maintenance (Admin)</h3>
          <div class="btn-row">
            <button @click="runUpdate('update-recent-weeks')" :disabled="isLoading">Mise à Jour Rapide</button>
            <button @click="runUpdate('start-full-rebuild')" class="danger-btn" :disabled="isLoading">Full Rebuild</button>
          </div>
        </div>

        <!-- Section Paramètres Généraux -->
        <div class="control-card">
          <h3>📅 Date & Cible</h3>
          <label>Date Référence (Fin)</label>
          <input type="date" v-model="selectedDate" />
          
          <label style="margin-top:10px; display:block">Numéro Cible (Optionnel)</label>
          <input type="number" v-model="selectedNumber" placeholder="Ex: 42" />
          <input v-if="lastOperationType === 'prophet'" type="number" v-model="selectedCompanion" placeholder="Compagnon (Optionnel)" style="margin-top: 8px;" />
        </div>

        <!-- Section Dashboard Personnel -->
        <div class="control-card highlight-card">
          <h3>🚀 Mon Dashboard</h3>
          <p class="hint">Entrez vos numéros/paires favoris (séparés par virgule).</p>
          <textarea v-model="favoritesInput" rows="2" placeholder="Ex: 7, 24, 10-90"></textarea>
          <button @click="runDashboard" :disabled="isLoading">Analyser Favoris (30j)</button>
        </div>

        <!-- Section Analyse Visuelle -->
        <div class="control-card">
          <h3>🎨 Visuel (Google Sheet)</h3>
          <div class="btn-stack">
            <button @click="runVisual('highlight-day')" :disabled="isLoading || !selectedDate">Surligner Jour (Chaud/Froid)</button>
            <button @click="runVisual('kanta-highlight-day')" :disabled="isLoading || !selectedDate" class="kanta-btn">Surligner Kanta (Opposés)</button>
          </div>
        </div>

        <!-- Section Rapports & Prophète -->
        <div class="control-card">
          <h3>📊 Rapports & Prophète</h3>
          <div class="btn-stack">
            <button @click="runReport('daily-frequency')" :disabled="isLoading">Classement Jour</button>
            <button @click="runReport('weekly-frequency')" :disabled="isLoading">Classement Semaine</button>
            <button @click="runReport('companions')" :disabled="isLoading || !selectedNumber">Compagnons du {{ selectedNumber || '?' }}</button>
            <div class="separator"></div>
            <button @click="runProphet" :disabled="isLoading" class="prophet-btn">🔮 Prédiction Prophète</button>
          </div>
        </div>

      </aside>

      <!-- COLONNE DROITE : RÉSULTATS -->
      <section class="results-area">
        
        <!-- Message de Bienvenue / Infos -->
        <div v-if="showWelcomeMessage" class="welcome-box">
          <h2>Bienvenue Fourcaster !</h2>
          <p>Utilisez les contrôles à gauche pour analyser les tirages.</p>
          <ul>
            <li><strong>Dashboard :</strong> Suivez vos numéros favoris.</li>
            <li><strong>Visuel :</strong> Coloriez les tirages sur Google Sheet.</li>
            <li><strong>Rapports :</strong> Statistiques détaillées.</li>
            <li><strong>Prophète :</strong> Prédictions IA basées sur l'historique.</li>
          </ul>
        </div>

        <!-- Bannières d'Erreur / Succès -->
        <div v-if="error" class="error-banner">❌ {{ error }}</div>
        <div v-if="apiResponse?.message" class="success-banner">
          ✅ {{ apiResponse.message }}
          <a v-if="apiResponse.worksheet_gid" :href="sheetDirectLink" target="_blank" class="sheet-link">Ouvrir l'onglet ↗</a>
        </div>

        <!-- Loader pendant le chargement -->
        <div v-if="isLoading" class="loader-overlay">
          <div class="spinner"></div>
          <span>Analyse en cours...</span>
        </div>

        <!-- Intégration Google Sheet -->
        <div class="sheet-wrapper">
          <!-- Clé : url pour forcer le rechargement si le GID change -->
          <iframe :key="sheetEmbedUrl" :src="sheetEmbedUrl" loading="lazy"></iframe>
        </div>

        <!-- Tableau des Résultats (si des données sont disponibles) -->
        <div v-if="tableData.length > 0" class="data-table-wrapper">
          <h3>Résultats : {{ lastOperationType.toUpperCase() }}</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th v-for="h in tableHeaders" :key="h">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <!-- Boucle sur les données du tableau -->
              <tr v-for="(row, idx) in tableData" :key="idx">
                <!-- Cas spécifique pour le Dashboard -->
                <template v-if="lastOperationType === 'dashboard'">
                  <td><strong>{{ row.item }}</strong></td>
                  <td :class="{'status-hot': row.status.includes('Brûlant'), 'status-cold': row.status.includes('Gelé')}">{{ row.status }}</td>
                  <td>{{ row.frequency }}</td>
                  <td>{{ row.best_companion }}</td>
                  <td>{{ row.best_trigger }}</td>
                </template>
                <!-- Cas général (Prophète, Fréquence, Kanta, Compagnons) -->
                <template v-else>
                  <td>{{ idx + 1 }}</td>
                  <td><strong>{{ row.number || row.pair || row.item }}</strong></td>
                  <td>{{ row.count || row.frequency }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Bloc d'Analyse IA -->
        <div v-if="aiAnalysisText" class="ai-box">
          <div class="ai-header">🧠 L'AVIS DE L'EXPERT (IA)</div>
          <div class="ai-content">{{ aiAnalysisText }}</div>
        </div>

      </section>

    </div>
  </main>
</template>

<style scoped>
/* --- STYLES GÉNÉRAUX & COMPOSANTS --- */
.loading-screen {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 100vh; background: #f4f7f6; color: #7f8c8d; font-size: 1.1rem;
}
.spinner {
  border: 4px solid #f3f3f3; border-top: 4px solid #3498db; /* Bleu */
  border-radius: 50%; width: 40px; height: 40px;
  animation: spin 1s linear infinite; margin-bottom: 10px;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.login-wrapper {
  display: flex; align-items: center; justify-content: center; height: 100vh;
  background: linear-gradient(135deg, #3498db, #2980b9); /* Bleu dégradé */
}
.login-box {
  background: white; padding: 40px; border-radius: 12px; width: 100%; max-width: 420px;
  box-shadow: 0 15px 30px rgba(0,0,0,0.15); text-align: center;
}
.login-box h1 { margin-bottom: 30px; color: #2c3e50; font-size: 1.8rem; font-weight: bold;}
.input-group { text-align: left; margin-bottom: 15px; }
.input-group label { display: block; margin-bottom: 5px; color: #7f8c8d; font-size: 0.9rem; }
.primary-btn {
  background: #3498db; color: white; padding: 12px 20px; font-size: 1rem; font-weight: bold;
  border: none; border-radius: 6px; cursor: pointer; transition: background 0.3s ease; width: 100%;
}
.primary-btn:hover { background: #2980b9; }
.primary-btn:disabled { background: #bdc3c7; cursor: not-allowed; }
.error-msg { color: #e74c3c; margin-top: 15px; font-size: 0.9rem; }

.app-layout { max-width: 1400px; margin: 0 auto; padding: 15px; font-family: 'Inter', sans-serif; background-color: #f4f7f6; min-height: 100vh; }
.app-header {
  display: flex; justify-content: space-between; align-items: center;
  background: #2c3e50; /* Bleu nuit */ color: white; padding: 15px 25px; border-radius: 10px;
  margin-bottom: 20px; box-shadow: 0 5px 10px rgba(0,0,0,0.1);
}
.logo { font-size: 1.3rem; font-weight: bold; letter-spacing: 0.5px; }
.user-controls { display: flex; align-items: center; }
.logout-btn {
  background: #e74c3c; /* Rouge */ color: white; border: none; padding: 8px 18px;
  border-radius: 5px; cursor: pointer; font-weight: bold; margin-left: 15px;
}

.content-grid { display: grid; grid-template-columns: 300px 1fr; gap: 25px; }

/* --- COLONNE GAUCHE : CONTROLES --- */
.controls-sidebar { display: flex; flex-direction: column; gap: 15px; }
.control-card {
  background: white; padding: 20px; border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e0e0e0;
}
.admin-card { background: #fff8e1; border-color: #ffe082; }
.highlight-card { border-left: 5px solid #3498db; } /* Bleu */
.control-card h3 {
  margin-top: 0; font-size: 1.1rem; color: #34495e;
  border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px;
}
label { display: block; margin-bottom: 6px; color: #555; font-size: 0.9rem; font-weight: 500;}
input[type="date"], input[type="number"], textarea {
  width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 5px;
  box-sizing: border-box; font-family: inherit; font-size: 0.95rem;
  margin-bottom: 10px;
}
textarea { resize: vertical; min-height: 50px; }
.btn-stack { display: flex; flex-direction: column; gap: 10px; }
.btn-row { display: flex; gap: 10px; }
button {
  padding: 10px 15px; border: none; background: #34495e; /* Gris anthracite */
  color: white; border-radius: 5px; cursor: pointer; font-weight: bold;
  font-size: 0.95rem; transition: background 0.3s ease;
}
button:hover { background: #2c3e50; } /* Bleu nuit */
button:disabled { background: #bdc3c7; cursor: not-allowed; }
.danger-btn { background: #e74c3c; } /* Rouge */
.danger-btn:hover { background: #c0392b; }
.kanta-btn { background: #27ae60; } /* Vert */
.kanta-btn:hover { background: #229954; }
.prophet-btn { background: #8e44ad; } /* Violet */
.prophet-btn:hover { background: #7d3c98; }
.separator { height: 1px; background: #eee; margin: 8px 0; }

/* --- COLONNE DROITE : RÉSULTATS --- */
.results-area { display: flex; flex-direction: column; gap: 15px; }
.welcome-box {
  background: #d6eaf8; /* Bleu clair */ color: #2980b9;
  padding: 20px; border-radius: 10px; border-left: 5px solid #3498db;
}
.welcome-box h2 { margin-top: 0; font-size: 1.4rem; }
.welcome-box ul { padding-left: 25px; }
.welcome-box li { margin-bottom: 8px; }

.error-banner, .success-banner {
  padding: 12px 15px; border-radius: 5px; font-weight: bold;
  text-align: center;
}
.error-banner { background: #fadbd8; color: #c0392b; border: 1px solid #e74c3c; }
.success-banner { background: #d5f5e3; color: #27ae60; border: 1px solid #82e0aa; display: flex; justify-content: space-between; align-items: center; }
.sheet-link { color: #27ae60; text-decoration: none; border-bottom: 1px dashed; }

.loader-overlay {
  position: absolute; /* Dans results-area */
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(255,255,255,0.85);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border-radius: 10px; z-index: 10; /* Surcouche */
}
.loader-overlay span { margin-top: 10px; color: #34495e; font-size: 1.1rem; }

.sheet-wrapper {
  height: 550px; background: white; border-radius: 10px; overflow: hidden;
  box-shadow: 0 4px 15px rgba(0,0,0,0.08); border: 1px solid #ddd;
}
iframe { width: 100%; height: 100%; border: none; display: block;}

.data-table-wrapper {
  background: white; padding: 20px; border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow-x: auto; /* Scroll horizontal si table trop large */
}
.data-table {
  width: 100%; border-collapse: collapse; min-width: 550px; /* Largeur min pour éviter trop de compression */
}
.data-table th, .data-table td {
  padding: 12px 10px; text-align: center; border-bottom: 1px solid #eee;
  font-size: 0.95rem;
}
.data-table th {
  background: #ecf0f1; /* Gris clair */ color: #2c3e50; font-weight: bold;
  font-size: 0.9rem;
}
.data-table td:first-child { font-weight: bold; } /* Première colonne (ex: numéro) en gras */
.status-hot { color: #e74c3c; font-weight: bold; } /* Rouge */
.status-cold { color: #3498db; } /* Bleu */

.ai-box {
  background: #fdfdfd; /* Blanc cassé */
  border: 1px solid #e0e0e0; border-left: 6px solid #34495e; /* Bordure anthracite */
  border-radius: 8px; overflow: hidden; margin-top: 15px;
}
.ai-header {
  background: #34495e; color: #f1c40f; /* Jaune */
  padding: 12px; font-weight: bold; font-size: 0.9rem; letter-spacing: 0.5px;
}
.ai-content {
  padding: 15px; line-height: 1.7; white-space: pre-wrap; /* Conserve les sauts de ligne de l'IA */
  font-size: 0.95rem; color: #333;
}

/* --- MEDIA QUERIES POUR ADAPTABILITÉ --- */
@media (max-width: 992px) {
  .content-grid { grid-template-columns: 1fr; } /* Colonne unique sur petits écrans */
  .controls-sidebar { flex-direction: row; overflow-x: auto; padding-bottom: 5px; } /* Barre de défilement si trop de sections */
  .control-card { margin-bottom: 0; flex-shrink: 0; width: 280px; } /* Cartes plus petites */
  .sheet-wrapper { height: 400px; }
}

@media (max-width: 768px) {
  .app-header { padding: 10px 15px; }
  .logo { font-size: 1.1rem; }
  .logout-btn { font-size: 0.9rem; padding: 6px 12px;}
  .desktop-only { display: none; } /* Cache l'email sur mobile */
  .controls-sidebar { flex-direction: column; } /* Remet en colonne sur très petits écrans */
  .control-card { width: auto; } /* Prend toute la largeur */
}
</style>