<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const GOOGLE_SHEET_ID = "1HepqMzKcsbKbRsLWwpEOoy5oO9ntK2CgdV7F_ijmjlo";

// --- IMPORTANT : FORCAGE DE L'URL BACKEND ---
// Cela empêche l'erreur de connexion au localhost
const API_BASE_URL = 'https://loto-analyzer-backend.onrender.com';

const user = ref(null);
const userRole = ref('');
const email = ref('');
const password = ref('');
const authError = ref('');
const isAuthReady = ref(false);
const userFavorites = ref([]); 
const newFavoriteInput = ref('');
const currentView = ref('dashboard');
const dashboardData = ref(null);
const isDashboardLoading = ref(false);
const dashStartDate = ref('');
const dashEndDate = ref('');
const selectedDate = ref('');
const startDate = ref('');
const endDate = ref('');
const selectedNumber = ref('');
const profileNumber = ref('');
const triggerTargetNumber = ref('');
const triggerCompanionNumber = ref('');
const predictionNumber = ref('');
const predictionCompanion = ref('');
const multiPredictionInput = ref('');
const apiResponse = ref(null);
const isLoading = ref(false);
const error = ref(null);
const lastOperationType = ref('');
const activeSheetGid = ref(null);
const viewMode = ref('table');

// --- INITIALISATION ---
onMounted(() => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  selectedDate.value = todayStr;
  endDate.value = todayStr;
  dashEndDate.value = todayStr; 

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const startStr = oneMonthAgo.toISOString().split('T')[0];
  startDate.value = startStr;
  dashStartDate.value = startStr; 

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      user.value = firebaseUser;
      const docRef = doc(db, "users", firebaseUser.uid);
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          userRole.value = data.role || 'user';
          userFavorites.value = data.favorites || []; 
        } else {
          userRole.value = 'user';
          userFavorites.value = [];
          await setDoc(docRef, { role: 'user', favorites: [] }, { merge: true });
        }
      } catch (e) { console.error(e); }
      // Chargement auto du dashboard
      if(userFavorites.value.length > 0) loadDashboard();
    } else {
      user.value = null; userRole.value = ''; userFavorites.value = [];
    }
    isAuthReady.value = true;
  });
});

const login = async () => {
  try { authError.value = ''; isLoading.value = true; await signInWithEmailAndPassword(auth, email.value, password.value); } 
  catch (error) { authError.value = "Email ou mot de passe incorrect."; } finally { isLoading.value = false; }
};
const logout = async () => { await signOut(auth); };

function switchView(viewName) {
  currentView.value = viewName;
  if (viewName === 'dashboard') loadDashboard();
}

async function addFavorite() {
  const input = newFavoriteInput.value.trim();
  if (!input) return;
  if (userFavorites.value.includes(input)) { newFavoriteInput.value = ''; return; }
  try {
    const userRef = doc(db, "users", user.value.uid);
    userFavorites.value.push(input); 
    await updateDoc(userRef, { favorites: arrayUnion(input) });
    newFavoriteInput.value = '';
    loadDashboard(); // Refresh direct
  } catch (e) { console.error(e); }
}

async function removeFavorite(item) {
  try {
    const userRef = doc(db, "users", user.value.uid);
    userFavorites.value = userFavorites.value.filter(n => n !== item);
    await updateDoc(userRef, { favorites: arrayRemove(item) });
    loadDashboard();
  } catch (e) { console.error(e); }
}

async function loadDashboard() {
  if (userFavorites.value.length === 0) return;
  isDashboardLoading.value = true;
  try {
    const token = await user.value.getIdToken();
    const url = `${API_BASE_URL}/analysis/favorites-dashboard?start_date=${dashStartDate.value}&end_date=${dashEndDate.value}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(userFavorites.value)
    });
    if(!response.ok) throw new Error("Erreur Dashboard");
    const data = await response.json();
    dashboardData.value = data;
  } catch (e) { console.error(e); } finally { isDashboardLoading.value = false; }
}

async function callApi(url, method = 'GET') {
  currentView.value = 'results';
  isLoading.value = true; error.value = null; apiResponse.value = null;
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
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

async function runDataUpdate(endpoint) { lastOperationType.value = 'update'; await callApi(`/collection/${endpoint}`, 'POST'); }
async function runVisualAnalysis(endpoint) { if (!selectedDate.value) { error.value = "Date requise."; return; } lastOperationType.value = 'visual'; await callApi(`/analysis/${endpoint}/${selectedDate.value}`, 'POST'); }
async function runReport(reportType) {
  if (!selectedDate.value) { error.value = "Date requise."; return; }
  let url = '';
  if (reportType === 'weekly-frequency') { lastOperationType.value = 'frequency'; url = `/analysis/weekly-frequency/${selectedDate.value}`; }
  else if (reportType === 'daily-frequency') { lastOperationType.value = 'frequency'; url = `/analysis/daily-frequency/${selectedDate.value}`; }
  else if (reportType === 'companions') { if (!selectedNumber.value) { error.value = "Numéro requis."; return; } lastOperationType.value = 'companions'; url = `/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`; }
  await callApi(url);
}
async function runRangeAnalysis() { if (!startDate.value || !endDate.value) { error.value = "Dates requises."; return; } lastOperationType.value = 'frequency'; await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`); }
async function runProfileAnalysis() { if (!startDate.value || !endDate.value || !profileNumber.value) { error.value = "Infos requises."; return; } lastOperationType.value = 'profile'; await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`); }
async function runSequenceAnalysis() { if (!startDate.value || !endDate.value) { error.value = "Période requise."; return; } lastOperationType.value = 'sequence'; await callApi(`/analysis/sequence-detection?start_date=${startDate.value}&end_date=${endDate.value}`); }
async function runTriggerAnalysis() {
  if (!startDate.value || !endDate.value || !triggerTargetNumber.value) { error.value = "Infos requises."; return; }
  lastOperationType.value = 'trigger';
  let url = `/analysis/trigger-numbers?target_number=${triggerTargetNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  if (triggerCompanionNumber.value) url += `&companion_number=${triggerCompanionNumber.value}`;
  await callApi(url);
}
async function runPredictionAnalysis() {
  if (!startDate.value || !endDate.value || !predictionNumber.value) { error.value = "Infos requises."; return; }
  lastOperationType.value = 'prediction';
  let url = `/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  if (predictionCompanion.value) url += `&observed_companion=${predictionCompanion.value}`;
  await callApi(url);
}
async function runMultiPrediction() {
  if (!startDate.value || !endDate.value || !multiPredictionInput.value) { error.value = "Infos requises."; return; }
  const cleanInput = multiPredictionInput.value.replace(/[\s-]+/g, ',');
  lastOperationType.value = 'prediction';
  await callApi(`/analysis/multi-prediction?numbers_str=${cleanInput}&start_date=${startDate.value}&end_date=${endDate.value}`);
}
async function runKantaAnalysis(endpoint) { if (!selectedDate.value) { error.value = "Date requise."; return; } lastOperationType.value = 'visual'; await callApi(`/analysis/${endpoint}/${selectedDate.value}`, 'POST'); }
async function runKantaReport(reportType) { if (!selectedDate.value) { error.value = "Date requise."; return; } lastOperationType.value = 'kanta-rank'; await callApi(`/analysis/kanta-${reportType}/${selectedDate.value}`); }

const isAdmin = computed(() => userRole.value === 'admin' || user.value?.email === 'aboucho92@gmail.com');
const sheetDirectLink = computed(() => {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
  return activeSheetGid.value ? `${base}/edit#gid=${activeSheetGid.value}` : `${base}/edit`;
});
const tableHeaders = computed(() => {
  if (lastOperationType.value.includes('frequency')) return ['#', 'Numéro', 'Apparitions'];
  if (lastOperationType.value === 'companions') return ['#', 'Compagnon', 'Apparu avec'];
  if (lastOperationType.value === 'trigger') return ['#', 'N° Déclencheur', 'Fréquence'];
  if (lastOperationType.value === 'prediction') return ['#', 'Suivant Probable', 'Fréquence']; 
  if (lastOperationType.value.includes('kanta-rank')) return ['Paire Kanta', 'Apparitions'];
  return [];
});
const tableData = computed(() => {
  if (apiResponse.value?.frequency_ranking) return apiResponse.value.frequency_ranking;
  if (apiResponse.value?.companion_ranking) return apiResponse.value.companion_ranking;
  if (apiResponse.value?.trigger_numbers_ranking) return apiResponse.value.trigger_numbers_ranking;
  if (apiResponse.value?.prediction_ranking) return apiResponse.value.prediction_ranking;
  if (apiResponse.value?.kanta_pairs) return apiResponse.value.kanta_pairs;
  if (apiResponse.value?.kanta_pairs_ranking) return apiResponse.value.kanta_pairs_ranking;
  return [];
});
const isTableVisible = computed(() => tableData.value.length > 0);
const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
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

function analyzeFavorite(item, mode) {
  // Pré-remplit les champs et switch vers résultats
  if (item.includes('-')) {
    const parts = item.split('-');
    triggerTargetNumber.value = parts[0]; triggerCompanionNumber.value = parts[1];
    runTriggerAnalysis(); 
  } else {
    if (mode === 'companion') {
      selectedNumber.value = item;
      if(!selectedDate.value) selectedDate.value = new Date().toISOString().split('T')[0];
      runReport('companions');
    } else if (mode === 'trigger') {
      triggerTargetNumber.value = item; triggerCompanionNumber.value = ''; 
      runTriggerAnalysis();
    }
  }
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

    <nav class="main-nav">
      <button @click="switchView('dashboard')" :class="{ active: currentView === 'dashboard' }" class="nav-item">🏠 Mon Tableau de Bord</button>
      <button @click="switchView('results')" :class="{ active: currentView === 'results' }" class="nav-item">📊 Résultats d'Analyse</button>
    </nav>

    <div class="main-layout">
      <div class="controls-column">
        <section v-if="isAdmin" class="card data-update">
          <h2>Maintenance (Admin)</h2>
          <div class="button-group-horizontal">
            <button @click="runDataUpdate('update-recent-weeks')" :disabled="isLoading">Mise à Jour Rapide</button>
            <button @click="runDataUpdate('start-full-rebuild')" :disabled="isLoading" class="danger">Reconstruction</button>
          </div>
        </section>

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
                <button v-if="!item.includes('-')" @click="analyzeFavorite(item, 'companion')" class="icon-btn" title="Compagnons">👥</button>
                <button @click="analyzeFavorite(item, 'trigger')" class="icon-btn" title="Déclencheurs">⚡</button>
              </div>
              <span @click="removeFavorite(item)" class="fav-delete">×</span>
            </div>
          </div>
          <p v-else class="empty-msg">Ajoutez vos numéros fétiches.</p>
        </section>

        <section class="card">
          <h2>Analyse par Semaine</h2>
          <input type="date" v-model="selectedDate" />
          <div class="button-group-vertical">
            <button @click="runVisualAnalysis('highlight-day')" :disabled="isLoading || !selectedDate">Surlignage (Jour)</button>
            <button @click="runVisualAnalysis('process-entire-week')" :disabled="isLoading || !selectedDate">Surlignage (Semaine)</button>
            <hr />
            <button @click="runReport('daily-frequency')" :disabled="isLoading || !selectedDate">Classement Jour</button>
            <button @click="runReport('weekly-frequency')" :disabled="isLoading || !selectedDate">Classement Semaine</button>
            <hr />
            <input type="number" v-model="selectedNumber" placeholder="N° pour analyse compagnons" />
            <button @click="runReport('companions')" :disabled="isLoading || !selectedDate || !selectedNumber">Analyser Compagnons</button>
          </div>
        </section>

        <section class="card">
          <h2>Période & Profilage</h2>
          <label>Début :</label><input type="date" v-model="startDate" />
          <label>Fin :</label><input type="date" v-model="endDate" />
          <button @click="runRangeAnalysis" :disabled="isLoading || !startDate || !endDate">Fréquence sur Période</button>
          <hr />
          <input type="number" v-model="profileNumber" placeholder="N° pour profil complet" />
          <button @click="runProfileAnalysis" :disabled="isLoading || !startDate || !endDate || !profileNumber">Générer Profil du Numéro</button>
        </section>

        <section class="card prophet-card">
          <h2>🔮 Le Prophète</h2>
          <p class="small-text">Ce numéro vient de sortir. La suite ?</p>
          <input type="number" v-model="predictionNumber" placeholder="Numéro vu (Ex: 42)" />
          <input type="number" v-model="predictionCompanion" placeholder="Compagnon vu (Optionnel)" />
          <button @click="runPredictionAnalysis" :disabled="isLoading || !startDate || !endDate || !predictionNumber" class="prophet-btn">Voir Futur Probable</button>
        </section>

        <section class="card multi-prophet-card">
          <h2>🔮 Analyse Croisée</h2>
          <p class="small-text">Dernier tirage complet (ou sélection).</p>
          <input type="text" v-model="multiPredictionInput" placeholder="Ex: 5 12 34 56 78" @keyup.enter="runMultiPrediction"/>
          <button @click="runMultiPrediction" :disabled="isLoading || !startDate || !endDate || !multiPredictionInput" class="multi-btn">Lancer Projection</button>
        </section>

        <section class="card">
          <h2>IA Avancée & Kanta</h2>
          <button @click="runSequenceAnalysis" :disabled="isLoading || !startDate || !endDate">Détecter Suites</button>
          <hr />
          <input type="number" v-model="triggerTargetNumber" placeholder="Cible (ex: 18)" />
          <input type="number" v-model="triggerCompanionNumber" placeholder="Compagnon (Optionnel)" />
          <button @click="runTriggerAnalysis" :disabled="isLoading || !startDate || !endDate || !triggerTargetNumber">Trouver Déclencheurs ⚡</button>
          <hr />
          <div class="button-group-horizontal">
             <button @click="runKantaAnalysis('kanta-highlight-day')">Surlign. Kanta J</button>
             <button @click="runKantaAnalysis('kanta-highlight-week')">Surlign. Kanta S</button>
          </div>
          <div class="button-group-horizontal" style="margin-top:5px;">
             <button @click="runKantaReport('daily-rank')">Class. Kanta J</button>
             <button @click="runKantaReport('weekly-rank')">Class. Kanta S</button>
          </div>
        </section>
      </div>

      <div class="results-column">
        <div v-if="currentView === 'dashboard'" class="personal-dashboard">
            <div class="dash-header">
              <h3>👋 Tableau de Bord Personnalisé</h3>
              <div class="date-selectors">
                <input type="date" v-model="dashStartDate" />
                <span>à</span>
                <input type="date" v-model="dashEndDate" />
                <button @click="loadDashboard" class="refresh-btn">🔄 Actualiser</button>
              </div>
            </div>
            <div v-if="userFavorites.length === 0" class="empty-dashboard"><p>👈 Ajoutez des numéros "Favoris" pour activer votre tableau de bord.</p></div>
            <div v-else-if="isDashboardLoading" class="loader">Analyse de vos favoris en cours...</div>
            <div v-else-if="dashboardData" class="dash-grid">
              <div v-for="stat in dashboardData.dashboard_data" :key="stat.item" class="dash-card" :class="{ 'is-hot': stat.status.includes('🔥') }">
                <div class="dash-main"><span class="dash-number">{{ stat.item }}</span><span class="dash-status">{{ stat.status }}</span></div>
                <div class="dash-details">
                  <div class="detail-row"><span>Sorties ({{ dashboardData.analysis_period }}):</span><strong>{{ stat.frequency }} fois</strong></div>
                  <div class="detail-row" v-if="stat.type === 'number'"><span>Meilleur Ami (Sort avec):</span><strong>{{ stat.best_companion }}</strong></div>
                  <div class="detail-row" v-if="stat.frequency > 0"><span>⚡ Déclencheur (Appelé par):</span><strong>{{ stat.best_trigger }}</strong></div>
                  <div class="detail-row prop-row" v-if="stat.frequency > 0"><span>🔮 Prophète (A suivre):</span><strong>{{ stat.prophet_prediction }}</strong></div>
                </div>
                <div class="dash-actions"><button @click="analyzeFavorite(stat.item, 'trigger')" class="dash-act-btn">⚡ Analyse Complète</button></div>
              </div>
            </div>
        </div>

        <section v-else-if="currentView === 'results'" class="card results-card">
          <h2>Résultats d'Analyse</h2>
          <div v-if="isLoading" class="loader">Chargement...</div>
          <div v-if="error" class="error-box">{{ error }}</div>
          <div v-if="!isLoading && !apiResponse && !error" class="empty-state"><p>Sélectionnez une analyse à gauche pour voir les résultats ici.</p></div>
          <div v-if="apiResponse">
            <div v-if="apiResponse.message || apiResponse.analysis_period" class="success-box large">
              <p>✅ {{ apiResponse.message || `Analyse : ${apiResponse.analysis_period}` }}</p>
              <a v-if="apiResponse.worksheet_gid" :href="sheetDirectLink" target="_blank" class="button-link">Voir l'Onglet ↗</a>
            </div>
            <div v-if="isTableVisible && !lastOperationType.includes('visual')" class="view-controls">
              <button @click="viewMode = 'table'" :class="{ active: viewMode === 'table' }" class="toggle-btn">📋 Tableau</button>
              <button @click="viewMode = 'chart'" :class="{ active: viewMode === 'chart' }" class="toggle-btn">📊 Graphique</button>
            </div>
            <div v-if="isTableVisible && viewMode === 'chart' && !lastOperationType.includes('visual')" class="chart-container"><Bar :data="chartData" :options="chartOptions" /></div>
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
            <div v-if="apiResponse.ai_strategic_analysis" class="ai-analysis"><h3>🧠 Stratégie</h3><p>{{ apiResponse.ai_strategic_analysis }}</p></div>
            <div v-if="apiResponse.ai_strategic_profile" class="ai-analysis"><h3>🧠 Profil Numéro</h3><p>{{ apiResponse.ai_strategic_profile }}</p></div>
            <div v-if="apiResponse.ai_sequence_analysis" class="ai-analysis"><h3>🧠 Suites</h3><p>{{ apiResponse.ai_sequence_analysis }}</p></div>
            <div v-if="apiResponse.ai_trigger_analysis" class="ai-analysis"><h3>🧠 Déclencheurs</h3><p>{{ apiResponse.ai_trigger_analysis }}</p></div>
            <div v-if="apiResponse.ai_prediction_analysis" class="ai-analysis prophet-analysis"><h3>🔮 Prédiction</h3><p>{{ apiResponse.ai_prediction_analysis }}</p></div>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
  .main-nav { display: flex; justify-content: center; gap: 2rem; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #e0e0e0; }
  .nav-item { background: none; border: none; font-size: 1.2rem; font-weight: bold; color: #666; padding: 0.8rem 1.5rem; cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.3s; width: auto; }
  .nav-item:hover { color: #007bff; background-color: #f8f9fa; border-radius: 5px 5px 0 0; }
  .nav-item.active { color: #007bff; border-bottom: 3px solid #007bff; }
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
  .styled-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  .styled-table th, .styled-table td { border: 1px solid #ddd; padding: 8px; text-align: center; }
  .styled-table th { background-color: #f2f2f2; }
  .ai-analysis { background-color: #fffbe6; border-left: 5px solid #ffc107; padding: 1rem; margin-top: 1rem; border-radius: 4px; white-space: pre-wrap; }
  .success-box { background-color: #e8f5e9; color: #2e7d32; padding: 1rem; border-radius: 4px; text-align: center; }
  .button-link { display: inline-block; padding: 0.5rem 1rem; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; margin-top: 0.5rem; }
  .view-controls { display: flex; justify-content: center; gap: 1rem; margin: 1rem 0; }
  .toggle-btn { background: #e0e0e0; color: #333; width: auto; padding: 0.5rem 1.5rem; }
  .toggle-btn.active { background: #007bff; color: white; }
  .chart-container { height: 400px; width: 100%; }
  .favorites-input-group { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .btn-small { width: auto; padding: 0.5rem 1rem; }
  .favorites-list { display: flex; flex-wrap: wrap; gap: 0.8rem; }
  .favorite-chip { display: flex; align-items: center; background: #e3f2fd; border: 1px solid #90caf9; border-radius: 20px; padding: 0.3rem 0.5rem 0.3rem 1rem; }
  .fav-label { font-weight: bold; color: #1565c0; margin-right: 0.5rem; }
  .fav-actions { display: flex; gap: 0.2rem; margin-right: 0.5rem; }
  .icon-btn { background: white; border: 1px solid #bbdefb; color: #333; border-radius: 50%; width: 28px; height: 28px; padding: 0; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
  .icon-btn:hover { background: #bbdefb; transform: scale(1.1); }
  .fav-delete { cursor: pointer; color: #ef5350; font-weight: bold; font-size: 1.2rem; padding: 0 5px; }
  .empty-msg { font-style: italic; color: #999; font-size: 0.9rem; }
  .small-text { font-size: 0.8rem; color: #666; margin-top: -0.5rem; margin-bottom: 1rem; }
  hr { border: none; border-top: 1px solid #eee; margin: 1.5rem 0; }
  .prophet-card { border: 1px solid #d1c4e9; background: linear-gradient(to bottom right, #ffffff, #f3e5f5); }
  .prophet-btn { background-color: #7b1fa2; }
  .prophet-btn:hover { background-color: #4a148c; }
  .prophet-analysis { background-color: #f3e5f5; border-left: 5px solid #7b1fa2; }
  .multi-prophet-card { border: 2px solid #6f42c1; background-color: #f8f0fc; }
  .multi-btn { background: linear-gradient(45deg, #6f42c1, #007bff); border: none; }
  .multi-btn:hover { opacity: 0.9; transform: scale(1.02); }
  .personal-dashboard { background-color: #f8f9fa; padding: 1.5rem; border-radius: 12px; border: 1px solid #e9ecef; margin-bottom: 2rem; }
  .dash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;}
  .dash-header h3 { margin: 0; color: #333; }
  .date-selectors { display: flex; gap: 0.5rem; align-items: center; }
  .date-selectors input { width: auto; padding: 0.4rem; font-size: 0.9rem; }
  .refresh-btn { width: auto; padding: 0.4rem 1rem; font-size: 0.9rem; background: #6c757d; }
  .dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.5rem; }
  .dash-card { background: white; border-radius: 10px; padding: 1.2rem; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-top: 4px solid #ccc; transition: transform 0.2s; }
  .dash-card:hover { transform: translateY(-3px); }
  .dash-card.is-hot { border-top-color: #ff5722; background: #fff5f2; }
  .dash-main { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
  .dash-number { font-size: 1.8rem; font-weight: bold; color: #007bff; }
  .dash-status { font-size: 0.9rem; font-weight: bold; color: #555; }
  .detail-row { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.4rem; color: #555; }
  .prop-row { margin-top: 0.8rem; padding-top: 0.5rem; border-top: 1px dashed #ddd; color: #6f42c1; }
  .dash-actions { margin-top: 1rem; text-align: center; }
  .dash-act-btn { background: none; border: 1px solid #007bff; color: #007bff; padding: 0.3rem 0.8rem; font-size: 0.8rem; border-radius: 20px; cursor: pointer; width: 100%; }
  .dash-act-btn:hover { background: #007bff; color: white; }
  .empty-state { text-align: center; padding: 3rem; color: #999; font-style: italic; font-size: 1.1rem; }
  .empty-dashboard { text-align: center; padding: 2rem; color: #666; background: #fff; border-radius: 8px; }
  .error-box { background-color: #ffebee; color: #c62828; padding: 1rem; border-radius: 4px; text-align: center; margin-bottom: 1rem; white-space: pre-wrap;}
</style>