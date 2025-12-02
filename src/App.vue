<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, setDoc } from "firebase/firestore";

// --- IMPORTS POUR LES GRAPHIQUES (Chart.js) ---
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

// --- CONFIGURATION ---
const GOOGLE_SHEET_ID = "1HepqMzKcshKbRsLWwpEOOy5oO9ntK2CgdV7F_ijmjIo";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// --- VARIABLES ---
const user = ref(null);
const userRole = ref('');
const email = ref('');
const password = ref('');
const authError = ref('');
const isAuthReady = ref(false);

const userFavorites = ref([]); 
const newFavoriteInput = ref('');

// --- INITIALISATION ---
onMounted(() => {
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  selectedDate.value = `${year}-${month}-${day}`;
  endDate.value = `${year}-${month}-${day}`;
  
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const startYear = oneMonthAgo.getFullYear();
  const startMonth = (oneMonthAgo.getMonth() + 1).toString().padStart(2, '0');
  const startDay = oneMonthAgo.getDate().toString().padStart(2, '0');
  startDate.value = `${startYear}-${startMonth}-${startDay}`;

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      user.value = firebaseUser;
      const docRef = doc(db, "users", firebaseUser.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        userRole.value = data.role || 'user';
        userFavorites.value = data.favorites || []; 
      } else {
        userRole.value = 'user';
        userFavorites.value = [];
        await setDoc(docRef, { role: 'user', favorites: [] });
      }
    } else {
      user.value = null; userRole.value = ''; userFavorites.value = [];
    }
    isAuthReady.value = true;
  });
});

const login = async () => {
  try {
    authError.value = '';
    isLoading.value = true;
    await signInWithEmailAndPassword(auth, email.value, password.value);
  } catch (error) { authError.value = "Email ou mot de passe incorrect."; }
  finally { isLoading.value = false; }
};
const logout = async () => { await signOut(auth); };

// --- GESTION FAVORIS ---
async function addFavorite() {
  const input = newFavoriteInput.value.trim();
  if (!input) return;
  const isSingleNumber = /^[0-9]{1,2}$/.test(input);
  const isPair = /^[0-9]{1,2}-[0-9]{1,2}$/.test(input);

  if (!isSingleNumber && !isPair) {
    alert("Format invalide. Entrez un numéro (ex: 7) ou une paire (ex: 12-45).");
    return;
  }
  if (userFavorites.value.includes(input)) {
    newFavoriteInput.value = '';
    return;
  }
  try {
    const userRef = doc(db, "users", user.value.uid);
    userFavorites.value.push(input); 
    await updateDoc(userRef, { favorites: arrayUnion(input) }); 
    newFavoriteInput.value = '';
  } catch (e) {
    console.error("Erreur ajout favori:", e);
    alert("Erreur lors de la sauvegarde.");
  }
}

async function removeFavorite(item) {
  if (!confirm(`Retirer ${item} des favoris ?`)) return;
  try {
    const userRef = doc(db, "users", user.value.uid);
    userFavorites.value = userFavorites.value.filter(n => n !== item);
    await updateDoc(userRef, { favorites: arrayRemove(item) });
  } catch (e) {
    console.error("Erreur suppression:", e);
  }
}

// Fonction Polyvalente pour les Favoris
function analyzeFavorite(item, mode) {
  // mode = 'companion' (pour voir avec qui il sort)
  // mode = 'trigger' (pour voir qui le fait sortir)

  if (!startDate.value || !endDate.value) {
     alert("Attention: Vérifiez que les dates de début et fin sont bien sélectionnées dans 'Analyse sur Période Étendue'.");
  }

  // CAS 1 : C'est une PAIRE (ex: 12-45)
  if (item.includes('-')) {
    const parts = item.split('-');
    triggerTargetNumber.value = parts[0];
    triggerCompanionNumber.value = parts[1];
    
    // Pour une paire, le mode 'companion' n'a pas trop de sens direct ici, on fait Trigger par défaut
    runTriggerAnalysis(); 
  } 
  // CAS 2 : C'est un NUMÉRO SIMPLE (ex: 7)
  else {
    if (mode === 'companion') {
      selectedNumber.value = item;
      if (!selectedDate.value) { alert("Veuillez sélectionner une date pour l'analyse compagnon."); return; }
      runReport('companions');
    } 
    else if (mode === 'trigger') {
      triggerTargetNumber.value = item;
      triggerCompanionNumber.value = ''; // On vide le compagnon pour chercher en mode solo
      runTriggerAnalysis();
    }
  }
}

// --- DASHBOARD VARIABLES ---
const selectedDate = ref('');
const startDate = ref('');
const endDate = ref('');
const selectedNumber = ref('');
const profileNumber = ref('');
const triggerTargetNumber = ref('');
const triggerCompanionNumber = ref('');
const apiResponse = ref(null);
const isLoading = ref(false);
const error = ref(null);
const lastOperationType = ref('');
const activeSheetGid = ref(null);
const showWelcomeMessage = ref(true);
const viewMode = ref('table');

const isAdmin = computed(() => userRole.value === 'admin');
const sheetDirectLink = computed(() => {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
  return activeSheetGid.value ? `${base}/edit#gid=${activeSheetGid.value}` : `${base}/edit`;
});

const tableHeaders = computed(() => {
  if (lastOperationType.value.includes('frequency')) return ['#', 'Numéro', 'Apparitions'];
  if (lastOperationType.value === 'companions') return ['#', 'Compagnon', 'Apparu avec'];
  if (lastOperationType.value === 'trigger') return ['#', 'N° Déclencheur', 'Fréquence']; // Titre mis à jour
  if (lastOperationType.value.includes('kanta-rank')) return ['Paire Kanta', 'Apparitions'];
  return [];
});

const tableData = computed(() => {
  if (apiResponse.value?.frequency_ranking) return apiResponse.value.frequency_ranking;
  if (apiResponse.value?.companion_ranking) return apiResponse.value.companion_ranking;
  if (apiResponse.value?.trigger_numbers_ranking) return apiResponse.value.trigger_numbers_ranking;
  if (apiResponse.value?.kanta_pairs) return apiResponse.value.kanta_pairs;
  if (apiResponse.value?.kanta_pairs_ranking) return apiResponse.value.kanta_pairs_ranking;
  return [];
});
const isTableVisible = computed(() => tableData.value.length > 0);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, title: { display: true, text: 'Analyse Visuelle (Top 20)' } },
  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
};
const chartData = computed(() => {
  const data = tableData.value;
  if (!data || data.length === 0) return null;
  const limitedData = data.slice(0, 20);
  let labels = [], counts = [];
  limitedData.forEach(row => {
    if (row.pair) labels.push(row.pair);
    else if (row.number) labels.push(row.number.toString());
    else if (row.companion) labels.push(row.companion.toString());
    else labels.push('?');
    counts.push(row.count);
  });
  return { labels, datasets: [{ label: 'Occurrences', backgroundColor: '#007bff', borderRadius: 4, data: counts }] };
});

// --- API CALLS ---
async function callApi(url, method = 'GET') {
  showWelcomeMessage.value = false;
  isLoading.value = true;
  error.value = null;
  apiResponse.value = null;
  try {
    const token = await user.value.getIdToken();
    const headers = { 'Authorization': `Bearer ${token}` };
    const fullUrl = `${API_BASE_URL}${url}`;
    const response = await fetch(fullUrl, { method, headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || `Erreur ${response.status}`);
    apiResponse.value = data;
    if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
    viewMode.value = 'table';
  } catch (err) { error.value = err.message; } 
  finally { isLoading.value = false; }
}

async function runDataUpdate(endpoint) { lastOperationType.value = 'update'; await callApi(`/collection/${endpoint}`, 'POST'); }
async function runVisualAnalysis(endpoint) {
  if (!selectedDate.value) { error.value = "Veuillez sélectionner une date."; return; }
  lastOperationType.value = 'visual';
  await callApi(`/analysis/${endpoint}/${selectedDate.value}`, 'POST');
}
async function runReport(reportType) {
  if (!selectedDate.value) { error.value = "Veuillez sélectionner une date."; return; }
  let url = '';
  if (reportType === 'weekly-frequency') { lastOperationType.value = 'weekly-frequency'; url = `/analysis/weekly-frequency/${selectedDate.value}`; }
  else if (reportType === 'daily-frequency') { lastOperationType.value = 'daily-frequency'; url = `/analysis/daily-frequency/${selectedDate.value}`; }
  else if (reportType === 'companions') {
    if (!selectedNumber.value) { error.value = "Veuillez entrer un numéro."; return; }
    lastOperationType.value = 'companions';
    url = `/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`;
  }
  await callApi(url);
}
async function runRangeAnalysis() {
  if (!startDate.value || !endDate.value) { error.value = "Veuillez sélectionner une date de début ET de fin."; return; }
  lastOperationType.value = 'frequency';
  await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`);
}
async function runProfileAnalysis() {
  if (!startDate.value || !endDate.value || !profileNumber.value) { error.value = "Veuillez sélectionner une période ET un numéro."; return; }
  lastOperationType.value = 'profile';
  await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`);
}
async function runSequenceAnalysis() {
  if (!startDate.value || !endDate.value) { error.value = "Veuillez sélectionner une période."; return; }
  lastOperationType.value = 'sequence';
  await callApi(`/analysis/sequence-detection?start_date=${startDate.value}&end_date=${endDate.value}`);
}

// MISE A JOUR TRIGGER pour supporter les numéros seuls
async function runTriggerAnalysis() {
  if (!startDate.value || !endDate.value || !triggerTargetNumber.value) {
    error.value = "Veuillez sélectionner une période et au moins un numéro principal.";
    return;
  }
  lastOperationType.value = 'trigger';
  
  // Construction de l'URL intelligente (avec ou sans compagnon)
  let url = `/analysis/trigger-numbers?target_number=${triggerTargetNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  if (triggerCompanionNumber.value) {
    url += `&companion_number=${triggerCompanionNumber.value}`;
  }
  
  await callApi(url);
}

async function runKantaAnalysis(endpoint) {
  if (!selectedDate.value) { error.value = "Veuillez sélectionner une date."; return; }
  lastOperationType.value = 'visual';
  await callApi(`/analysis/${endpoint}/${selectedDate.value}`, 'POST');
}
async function runKantaReport(reportType) {
  if (!selectedDate.value) { error.value = "Veuillez sélectionner une date."; return; }
  lastOperationType.value = 'kanta-rank';
  await callApi(`/analysis/kanta-${reportType}/${selectedDate.value}`);
}
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen"><p>Chargement...</p></div>
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2>LE GUIDE DES FOURCASTER</h2>
      <form @submit.prevent="login">
        <div class="input-group"><label>Email</label><input type="email" v-model="email" required /></div>
        <div class="input-group"><label>Mot de passe</label><input type="password" v-model="password" required /></div>
        <button type="submit" class="login-button" :disabled="isLoading">{{ isLoading ? '...' : 'Connexion' }}</button>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
      </form>
    </div>
  </div>

  <main v-else class="dashboard">
    <header>
      <h1>LE GUIDE DES FOURCASTER</h1>
      <div class="user-info">
        <span>Connecté : <strong>{{ user.email }}</strong></span>
        <button @click="logout" class="logout-button">Déconnexion</button>
      </div>
    </header>

    <div class="main-layout">
      <div class="controls-column">
        <section v-if="isAdmin" class="card data-update">
          <h2>Maintenance (Admin)</h2>
          <div class="button-group-horizontal">
            <button @click="runDataUpdate('update-recent-weeks')" :disabled="isLoading">Mise à Jour Rapide</button>
            <button @click="runDataUpdate('start-full-rebuild')" :disabled="isLoading" class="danger">Reconstruction</button>
          </div>
        </section>

        <!-- FAVORIS AMÉLIORÉS -->
        <section class="card">
          <h2>⭐ Mes Numéros Favoris</h2>
          <div class="favorites-input-group">
            <input type="text" v-model="newFavoriteInput" placeholder="Ex: 7 ou 12-45" @keyup.enter="addFavorite"/>
            <button @click="addFavorite" :disabled="!newFavoriteInput" class="btn-small">Ajouter</button>
          </div>

          <div v-if="userFavorites.length > 0" class="favorites-list">
            <div v-for="item in userFavorites" :key="item" class="favorite-chip">
              <span class="fav-label">{{ item }}</span>
              <div class="fav-actions">
                <!-- Bouton Compagnons (Numéro seul) -->
                <button v-if="!item.includes('-')" @click="analyzeFavorite(item, 'companion')" class="icon-btn" title="Voir les Compagnons (Sortent AVEC)">👥</button>
                <!-- Bouton Déclencheurs (Numéro ou Paire) -->
                <button @click="analyzeFavorite(item, 'trigger')" class="icon-btn" title="Voir les Déclencheurs (Sortent AVANT)">⚡</button>
              </div>
              <span @click="removeFavorite(item)" class="fav-delete">×</span>
            </div>
          </div>
          <p v-else class="empty-msg">Ajoutez vos numéros fétiches pour un accès rapide.</p>
        </section>

        <section class="card">
          <h2>Analyse par Semaine</h2>
          <input type="date" v-model="selectedDate" />
          <div class="button-group-vertical">
            <button @click="runVisualAnalysis('highlight-day')" :disabled="isLoading || !selectedDate">Surlignage Standard</button>
            <hr />
            <button @click="runReport('daily-frequency')" :disabled="isLoading || !selectedDate">Classement du Jour</button>
            <button @click="runReport('weekly-frequency')" :disabled="isLoading || !selectedDate">Classement de la Semaine</button>
            <hr />
            <input type="number" v-model="selectedNumber" placeholder="N° pour analyse compagnons" />
            <button @click="runReport('companions')" :disabled="isLoading || !selectedDate || !selectedNumber">Analyser Compagnons</button>
          </div>
        </section>

        <section class="card">
          <h2>Période & IA Avancée</h2>
          <label>Début :</label><input type="date" v-model="startDate" />
          <label>Fin :</label><input type="date" v-model="endDate" />
          
          <hr />
          <h3>Détecteur de Déclencheurs</h3>
          <p class="small-text">Trouver les numéros qui sortent le tirage D'AVANT.</p>
          <label>Cible :</label>
          <input type="number" v-model="triggerTargetNumber" placeholder="Ex: 18" />
          <label>Compagnon (Optionnel) :</label>
          <input type="number" v-model="triggerCompanionNumber" placeholder="Laisser vide pour n° seul" />
          <button @click="runTriggerAnalysis" :disabled="isLoading || !startDate || !endDate || !triggerTargetNumber">
            Trouver les Déclencheurs ⚡
          </button>
        </section>

        <section class="card">
          <h2>Kanta Tracker</h2>
          <div class="button-group-vertical">
            <button @click="runKantaAnalysis('kanta-highlight-day')" :disabled="isLoading || !selectedDate">Surligner Kanta (Jour)</button>
            <button @click="runKantaReport('daily-rank')" :disabled="isLoading || !selectedDate">Classement Kanta (Jour)</button>
          </div>
        </section>
      </div>

      <div class="results-column">
        <section class="card results-card">
          <h2>Résultats</h2>
          <div v-if="showWelcomeMessage" class="welcome-message">
            <h3>Bienvenue !</h3>
            <p>Utilisez les ⭐ Favoris pour lancer des analyses rapides.</p>
            <button @click="showWelcomeMessage = false" class="close-welcome">OK</button>
          </div>
          <div v-else>
            <div v-if="isLoading" class="loader">Chargement...</div>
            <div v-if="error" class="error-box">{{ error }}</div>
            
            <div v-if="apiResponse">
              <div v-if="apiResponse.message || apiResponse.analysis_period" class="success-box large">
                <p>✅ {{ apiResponse.message || `Analyse : ${apiResponse.analysis_period}` }}</p>
                <a v-if="apiResponse.worksheet_gid" :href="sheetDirectLink" target="_blank" class="button-link">Voir l'Onglet ↗</a>
              </div>

              <div v-if="isTableVisible && !lastOperationType.includes('visual')" class="view-controls">
                <button @click="viewMode = 'table'" :class="{ active: viewMode === 'table' }" class="toggle-btn">📋 Tableau</button>
                <button @click="viewMode = 'chart'" :class="{ active: viewMode === 'chart' }" class="toggle-btn">📊 Graphique</button>
              </div>

              <div v-if="isTableVisible && viewMode === 'chart' && !lastOperationType.includes('visual')" class="chart-container">
                <Bar :data="chartData" :options="chartOptions" />
              </div>

              <table v-else-if="isTableVisible" class="styled-table">
                <thead><tr><th v-for="h in tableHeaders" :key="h">{{ h }}</th></tr></thead>
                <tbody>
                  <tr v-for="(row, index) in tableData" :key="index">
                    <td v-if="lastOperationType.includes('kanta-rank')">{{ row.pair }}</td>
                    <td v-else>#{{ index + 1 }}</td>
                    <td v-if="!lastOperationType.includes('kanta-rank')">{{ row.number }}</td>
                    <td>{{ row.count }}</td>
                  </tr>
                </tbody>
              </table>

              <div v-if="apiResponse.ai_strategic_analysis" class="ai-analysis"><h3>🧠 Stratégie Compagnons</h3><p>{{ apiResponse.ai_strategic_analysis }}</p></div>
              <div v-if="apiResponse.ai_trigger_analysis" class="ai-analysis"><h3>🧠 Analyse Déclencheurs</h3><p>{{ apiResponse.ai_trigger_analysis }}</p></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
  /* STYLES DE BASE */
  .loading-screen { display: flex; align-items: center; justify-content: center; min-height: 100vh; font-size: 1.5rem; color: #666; }
  .login-wrapper { display: flex; align-items: center; justify-content: center; min-height: 100vh; background-color: #f0f2f5; }
  .login-box { background: white; padding: 2.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
  .input-group { margin-bottom: 1rem; }
  .input-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
  input { width: 100%; padding: 0.8rem; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
  button { padding: 0.8rem; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold; }
  button:disabled { background-color: #ccc; }
  .dashboard { max-width: 95%; margin: 1rem auto; font-family: sans-serif; }
  header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid #eee; margin-bottom: 2rem; }
  .user-info { display: flex; gap: 1rem; align-items: center; }
  .logout-button { background-color: #6c757d; padding: 0.5rem 1rem; width: auto; }
  
  .main-layout { display: grid; grid-template-columns: 350px 1fr; gap: 2rem; }
  .card { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-bottom: 1.5rem; }
  .card h2 { margin-top: 0; font-size: 1.2rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; margin-bottom: 1rem; }
  .button-group-vertical { display: flex; flex-direction: column; gap: 0.5rem; }
  .button-group-horizontal { display: flex; gap: 1rem; }
  .danger { background-color: #dc3545; }
  
  /* RESULTATS */
  .styled-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  .styled-table th, .styled-table td { border: 1px solid #ddd; padding: 8px; text-align: center; }
  .styled-table th { background-color: #f2f2f2; }
  .ai-analysis { background-color: #fffbe6; border-left: 5px solid #ffc107; padding: 1rem; margin-top: 1rem; border-radius: 4px; }
  .success-box { background-color: #e8f5e9; color: #2e7d32; padding: 1rem; border-radius: 4px; text-align: center; }
  .button-link { display: inline-block; padding: 0.5rem 1rem; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; margin-top: 0.5rem; }
  
  /* GRAPHIQUES */
  .view-controls { display: flex; justify-content: center; gap: 1rem; margin: 1rem 0; }
  .toggle-btn { background: #e0e0e0; color: #333; width: auto; padding: 0.5rem 1.5rem; }
  .toggle-btn.active { background: #007bff; color: white; }
  .chart-container { height: 400px; width: 100%; }

  /* FAVORIS */
  .favorites-input-group { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .btn-small { width: auto; padding: 0.5rem 1rem; }
  .favorites-list { display: flex; flex-wrap: wrap; gap: 0.8rem; }
  .favorite-chip { 
    display: flex; align-items: center; background: #e3f2fd; 
    border: 1px solid #90caf9; border-radius: 20px; padding: 0.3rem 0.5rem 0.3rem 1rem; 
  }
  .fav-label { font-weight: bold; color: #1565c0; margin-right: 0.5rem; }
  .fav-actions { display: flex; gap: 0.2rem; margin-right: 0.5rem; }
  .icon-btn { 
    background: white; border: 1px solid #bbdefb; color: #333; 
    border-radius: 50%; width: 28px; height: 28px; padding: 0; 
    font-size: 0.8rem; display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
  }
  .icon-btn:hover { background: #bbdefb; transform: scale(1.1); }
  .fav-delete { cursor: pointer; color: #ef5350; font-weight: bold; font-size: 1.2rem; padding: 0 5px; }
  .empty-msg { font-style: italic; color: #999; font-size: 0.9rem; }
  .small-text { font-size: 0.8rem; color: #666; margin-top: -0.5rem; margin-bottom: 1rem; }
  hr { border: none; border-top: 1px solid #eee; margin: 1.5rem 0; }
</style>