<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const GOOGLE_SHEET_ID = "1HepqMzKcshKbRsLWwpEOOy5oO9ntK2CgdV7F_ijmjIo";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// --- ÉTATS ---
const user = ref(null);
const userRole = ref('');
const email = ref('');
const password = ref('');
const authError = ref('');
const isAuthReady = ref(false);
const userFavorites = ref([]); 

const newFavoriteInput = ref('');
const predictionNumber = ref('');
const predictionCompanion = ref('');
const multiPredictionInput = ref('');
const profileNumber = ref('');
const triggerTargetNumber = ref('');
const triggerCompanionNumber = ref('');

const selectedDayName = ref('Mercredi');
const selectedHour = ref('Toute la journée'); 
const dayAnalysisResult = ref(null); 
const standardResult = ref(null);
const deepFavoriteResult = ref(null);
const profileResult = ref(null);
const matrixResult = ref(null);

const matrixMode = ref('continuous'); 
const matrixTab = ref('analysis');
const cyclicDay = ref(1);
const favDayName = ref('Tous');
const favHour = ref('Toutes');

const selectedDate = ref('');
const startDate = ref('');
const endDate = ref('');
const selectedNumber = ref('');
const isLoading = ref(false);
const error = ref(null);
const activeSheetGid = ref(null);
const showWelcomeMessage = ref(true);
const viewMode = ref('table');
const lastOperationType = ref('');

const isAdmin = computed(() => userRole.value === 'admin');
const sheetDirectLink = computed(() => {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
  return activeSheetGid.value ? `${base}/edit#gid=${activeSheetGid.value}` : `${base}/edit`;
});

// --- DYNAMIQUE DES TABLEAUX ---
const tableHeaders = computed(() => {
  if (!lastOperationType.value) return [];
  // Standardisation de l'affichage pour les fréquences
  if (lastOperationType.value.includes('frequency') || lastOperationType.value === 'frequency-range') {
    return ['#', 'N°', 'Sorties', 'SYNTHÈSE STRATÉGIQUE (Top 3)'];
  }
  if (lastOperationType.value === 'companions') return ['#', 'Compagnon', 'Apparu avec'];
  if (lastOperationType.value === 'trigger') return ['#', 'N° Déclencheur', 'Fréquence'];
  if (lastOperationType.value === 'prediction') return ['#', 'Numéro Suivant', 'Fréquence']; 
  if (lastOperationType.value.includes('kanta-rank')) return ['Paire Kanta', 'Apparitions'];
  return [];
});

const tableData = computed(() => {
  if (standardResult.value?.frequency_ranking) return standardResult.value.frequency_ranking;
  if (standardResult.value?.companion_ranking) return standardResult.value.companion_ranking;
  if (standardResult.value?.trigger_numbers_ranking) return standardResult.value.trigger_numbers_ranking;
  if (standardResult.value?.prediction_ranking) return standardResult.value.prediction_ranking;
  if (standardResult.value?.kanta_pairs) return standardResult.value.kanta_pairs;
  if (standardResult.value?.kanta_pairs_ranking) return standardResult.value.kanta_pairs_ranking;
  return [];
});
const isTableVisible = computed(() => tableData.value.length > 0);

const chartData = computed(() => {
  const data = tableData.value;
  if (!data || data.length === 0) return null;
  const labels = data.slice(0, 15).map(row => (row.number || row.pair || row.companion).toString());
  const counts = data.slice(0, 15).map(row => row.count);
  return { labels, datasets: [{ label: 'Occurrences', backgroundColor: '#007bff', data: counts }] };
});

// --- CYCLE DE VIE ---
onMounted(() => {
  const today = new Date();
  cyclicDay.value = today.getDate();
  selectedDate.value = today.toISOString().split('T')[0];
  endDate.value = today.toISOString().split('T')[0];
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  startDate.value = start.toISOString().split('T')[0];

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      user.value = firebaseUser;
      const docRef = doc(db, "users", firebaseUser.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        userRole.value = docSnap.data().role || 'user';
        userFavorites.value = docSnap.data().favorites || [];
      } else {
        await setDoc(docRef, { role: 'user', favorites: [] });
      }
    } else { user.value = null; }
    isAuthReady.value = true;
  });
});

// --- LOGIQUE API ---
const login = async () => {
  try { isLoading.value = true; await signInWithEmailAndPassword(auth, email.value, password.value); } 
  catch (e) { authError.value = "Erreur d'authentification."; } finally { isLoading.value = false; }
};
const logout = async () => { await signOut(auth); };

async function callApi(url, targetVar = 'standard') {
  showWelcomeMessage.value = false; isLoading.value = true; error.value = null;
  if (targetVar === 'standard') standardResult.value = null;
  try {
    const token = await user.value.getIdToken();
    const response = await fetch(`${API_BASE_URL}${url}`, { 
      headers: { 'Authorization': `Bearer ${token}` } 
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Erreur serveur");
    
    if (targetVar === 'specialist') dayAnalysisResult.value = data;
    else if (targetVar === 'deep') deepFavoriteResult.value = data;
    else if (targetVar === 'profile') profileResult.value = data;
    else if (targetVar === 'matrix') matrixResult.value = data;
    else standardResult.value = data;
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

// --- FONCTIONS ACTIONS ---
async function addFavorite() {
  if (!newFavoriteInput.value) return;
  const userRef = doc(db, "users", user.value.uid);
  await updateDoc(userRef, { favorites: arrayUnion(newFavoriteInput.value) });
  userFavorites.value.push(newFavoriteInput.value);
  newFavoriteInput.value = '';
}
async function removeFavorite(item) {
  const userRef = doc(db, "users", user.value.uid);
  await updateDoc(userRef, { favorites: arrayRemove(item) });
  userFavorites.value = userFavorites.value.filter(n => n !== item);
}
async function analyzeDeepFavorite(item) {
  deepFavoriteResult.value = null;
  await callApi(`/analysis/deep-favorite?target=${item}&start_date=${startDate.value}&end_date=${endDate.value}`, 'deep');
}
async function runTimeMatrix() {
  matrixResult.value = null;
  let url = `/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}`;
  if (matrixMode.value === 'cyclic') url += `&target_cyclic_day=${cyclicDay.value}`;
  await callApi(url, 'matrix');
}
async function runReport(type) {
  lastOperationType.value = type;
  await callApi(`/analysis/${type}/${selectedDate.value}`, 'standard');
}
async function runRangeAnalysis() {
  lastOperationType.value = 'frequency-range';
  await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard');
}
async function runProfileAnalysis() {
  profileResult.value = null;
  await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile');
}
async function runDayAnalysis() {
  await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist');
}
async function runDataUpdate(endpoint) { await callApi(`/collection/${endpoint}`, 'standard'); }
async function runBatchVisualAnalysis(mode) { await callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${mode}`, 'standard'); }
async function runPredictionAnalysis() { lastOperationType.value = 'prediction'; await callApi(`/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'standard'); }
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen"><p>Chargement...</p></div>
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2>LE GUIDE DES FOURCASTER</h2>
      <form @submit.prevent="login">
        <div class="input-group"><label>Email</label><input type="email" v-model="email" required /></div>
        <div class="input-group"><label>Mot de passe</label><input type="password" v-model="password" required /></div>
        <button type="submit" class="login-button" :disabled="isLoading">Connexion</button>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
      </form>
    </div>
  </div>

  <main v-else class="dashboard">
    <header>
      <h1>LE GUIDE DES FOURCASTER <span class="version-tag">V76</span></h1>
      <div class="user-info">
        <span><strong>{{ user.email }}</strong></span>
        <button @click="logout" class="logout-button">Déconnexion</button>
      </div>
    </header>

    <div class="main-layout">
      <!-- SIDEBAR -->
      <div class="controls-column">
        
        <section class="card matrix-card">
          <div class="boss-header"><h2>🕰️ MATRICE</h2><span class="badge-spec">PREDICTOR</span></div>
          <div class="tabs">
             <button @click="matrixMode = 'continuous'" :class="{ active: matrixMode === 'continuous' }">CONTINU</button>
             <button @click="matrixMode = 'cyclic'" :class="{ active: matrixMode === 'cyclic' }">CYCLIQUE</button>
          </div>
          <input v-if="matrixMode === 'cyclic'" type="number" v-model="cyclicDay" min="1" max="31" />
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runTimeMatrix" class="spec-btn" style="background:#ff9800;">ANALYSER & PRÉDIRE</button>
        </section>

        <section class="card spec-card">
          <div class="boss-header"><h2>📅 SPÉCIALISTE</h2><span class="badge-spec">360°</span></div>
          <select v-model="selectedDayName" class="day-select">
            <option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option>
          </select>
          <select v-model="selectedHour" class="day-select">
            <option>Toute la journée</option><option>10H</option><option>13H</option><option>16H</option><option>19H</option>
          </select>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runDayAnalysis" class="spec-btn">SCANNER LE JOUR</button>
        </section>

        <section class="card">
          <h2>⭐ MES FAVORIS</h2>
          <div class="favorites-input-group">
            <input type="text" v-model="newFavoriteInput" placeholder="Ex: 7 ou 12-45" />
            <button @click="addFavorite" class="btn-small">Ajouter</button>
          </div>
          <div class="favorites-list">
            <div v-for="item in userFavorites" :key="item" class="favorite-chip">
              <span @click="analyzeDeepFavorite(item)" class="fav-label">{{ item }}</span>
              <span @click="removeFavorite(item)" class="fav-delete">×</span>
            </div>
          </div>
        </section>

        <section class="card">
          <h2>📊 RAPPORTS</h2>
          <input type="date" v-model="selectedDate" />
          <div class="button-group-vertical" style="margin-top:10px;">
            <button @click="runReport('daily-frequency')">Classement Jour</button>
            <button @click="runReport('weekly-frequency')">Classement Semaine</button>
          </div>
        </section>
        
        <section class="card">
          <h2>👤 PROFILAGE</h2>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runRangeAnalysis">Fréquence sur Période</button>
          <hr />
          <input type="number" v-model="profileNumber" placeholder="Numéro pour profil" />
          <button @click="runProfileAnalysis">Générer Rapport Expert</button>
        </section>

        <section v-if="isAdmin" class="card data-update">
          <h2>ADMIN</h2>
          <div class="button-group-horizontal">
            <button @click="runDataUpdate('update-recent-weeks')">Mise à Jour</button>
            <button @click="runBatchVisualAnalysis('frequency')" class="danger">Surlignage</button>
          </div>
        </section>
      </div>

      <!-- ZONE RÉSULTATS -->
      <div class="results-column">
        <div class="quick-link-box"><a :href="sheetDirectLink" target="_blank" class="gsheet-btn">📂 OUVRIR GOOGLE SHEETS</a></div>

        <!-- RÉSULTAT MATRICE -->
        <div v-if="matrixResult" class="card result-spec-card" style="border-top:4px solid #ff9800;">
           <div class="spec-header"><h3>🕰️ MATRICE TEMPORELLE</h3><button @click="matrixResult = null" class="close-btn">×</button></div>
           <div class="tabs">
             <button @click="matrixTab = 'analysis'" :class="{active: matrixTab === 'analysis'}">ANALYSE</button>
             <button @click="matrixTab = 'prediction'" :class="{active: matrixTab === 'prediction'}">PRÉDICTION</button>
           </div>
           <div v-if="matrixTab === 'analysis'" class="table-responsive">
             <table class="spec-table">
               <thead><tr><th>Date</th><th>Base</th><th>Résultats (Origine)</th></tr></thead>
               <tbody>
                 <tr v-for="row in matrixResult.matrix_data" :key="row.date">
                   <td>{{ row.date }}</td><td class="num-cell">{{ row.base_number }}</td>
                   <td><div v-for="h in row.detailed_hits" class="mini-hit"><span class="badge-hit">{{ h.num }}</span> ({{ h.reason }})</div></td>
                 </tr>
               </tbody>
             </table>
           </div>
           <div v-else class="prediction-tab">
             <div class="best-duo-box"><span>🔮 TWO SHORT :</span><span class="duo-val">{{ matrixResult.prediction?.two_short }}</span></div>
             <p>Cible : {{ matrixResult.prediction?.target_date_label }}</p>
           </div>
        </div>

        <!-- RÉSULTAT SPÉCIALISTE -->
        <div v-if="dayAnalysisResult" class="card result-spec-card">
          <div class="spec-header"><h3>📊 TOP 5 {{ dayAnalysisResult.day_analyzed }}</h3><button @click="dayAnalysisResult = null" class="close-btn">×</button></div>
          <div class="best-duo-box"><span>🔥 DUO EN OR :</span><span class="duo-val">{{ dayAnalysisResult.best_duo }}</span></div>
          <div class="table-responsive">
            <table class="spec-table">
              <thead><tr><th>Status</th><th>N°</th><th>Kanta</th><th>Meilleure Heure</th></tr></thead>
              <tbody>
                <tr v-for="row in dayAnalysisResult.recurrence_data" :key="row.number">
                  <td>{{ row.status_icon }}</td><td class="num-cell">{{ row.number }}</td><td>{{ row.kanta }}</td><td>{{ row.best_time }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- RÉSULTAT DEEP FAVORITE / SCAN PROFOND -->
        <div v-if="deepFavoriteResult" class="card result-spec-card" style="border-top:4px solid #fdd835;">
          <div class="spec-header"><h3>⭐ SCAN : {{ deepFavoriteResult.favorite }}</h3><button @click="deepFavoriteResult = null" class="close-btn">×</button></div>
          <div class="summary-grid">
            <div class="sum-card"><h5>Top Jours</h5><ul><li v-for="x in deepFavoriteResult.summary.top_days">{{ x.val }} ({{x.count}})</li></ul></div>
            <div class="sum-card"><h5>Top Heures</h5><ul><li v-for="x in deepFavoriteResult.summary.top_hours">{{ x.val }} ({{x.count}})</li></ul></div>
            <div class="sum-card"><h5>Déclencheurs</h5><div class="mini-list">{{ deepFavoriteResult.summary.top_triggers.map(t=>t.val).join(' - ') }}</div></div>
            <div class="sum-card"><h5>Compagnons</h5><div class="mini-list">{{ deepFavoriteResult.summary.top_companions.map(t=>t.val).join(' - ') }}</div></div>
            <div class="sum-card"><h5>Prophètes</h5><div class="mini-list">{{ deepFavoriteResult.summary.top_prophets.map(t=>t.val).join(' - ') }}</div></div>
          </div>
          <div class="table-responsive">
             <table class="spec-table">
               <thead><tr><th>Date</th><th>Heure</th><th>Déclencheurs</th><th>Compagnons</th><th>Prophètes</th></tr></thead>
               <tbody>
                 <tr v-for="row in deepFavoriteResult.history_table">
                   <td>{{ row.date }}</td><td>{{ row.time }}</td><td>{{ row.trigger }}</td><td>{{ row.companion }}</td><td>{{ row.prophet }}</td>
                 </tr>
               </tbody>
             </table>
          </div>
        </div>

        <!-- RAPPORT D'EXPERTISE (PROFIL NUMÉRO) -->
        <div v-if="profileResult" class="card result-spec-card" style="border-top:4px solid #ab47bc;">
          <div class="spec-header"><h3>👤 RAPPORT EXPERT : N° {{ profileResult.profile_data.number }}</h3><button @click="profileResult = null" class="close-btn">×</button></div>
          <div class="stats-row"><span class="badge-stat">Sorties totales : {{ profileResult.profile_data.hits }}</span></div>
          <div class="summary-grid">
            <div class="sum-card"><h5>Top Jours</h5><div class="mini-list">{{ profileResult.profile_data.summary.top_days.map(d=>d.val).join(', ') }}</div></div>
            <div class="sum-card"><h5>Top Heures</h5><div class="mini-list">{{ profileResult.profile_data.summary.top_hours.map(h=>h.val).join(', ') }}</div></div>
            <div class="sum-card"><h5>Déclencheurs</h5><div class="mini-list" style="color:#e65100;">{{ profileResult.profile_data.summary.top_triggers.map(t=>t.val).join(' - ') }}</div></div>
            <div class="sum-card"><h5>Compagnons</h5><div class="mini-list" style="color:#0277bd;">{{ profileResult.profile_data.summary.top_companions.map(t=>t.val).join(' - ') }}</div></div>
            <div class="sum-card"><h5>Prophètes</h5><div class="mini-list" style="color:#7b1fa2;">{{ profileResult.profile_data.summary.top_prophets.map(t=>t.val).join(' - ') }}</div></div>
          </div>
          <div class="table-responsive">
            <table class="spec-table">
              <thead><tr><th>Date</th><th>Jour</th><th>Déclencheurs</th><th>Compagnons</th><th>Prophètes</th></tr></thead>
              <tbody>
                <tr v-for="row in profileResult.profile_data.history_table">
                  <td>{{ row.date }}</td><td>{{ row.day }}</td><td>{{ row.trigger }}</td><td>{{ row.companion }}</td><td>{{ row.prophet }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- STANDARDS RANKINGS (JOUR / SEMAINE / PÉRIODE) -->
        <section v-if="standardResult" class="card results-card fade-in">
          <div class="spec-header"><h2>CLASSEMENTS STRATÉGIQUES</h2><button @click="standardResult = null" class="close-btn">×</button></div>
          <div class="view-controls"><button @click="viewMode = 'table'" :class="{ active: viewMode === 'table' }">📋 Tableau</button><button @click="viewMode = 'chart'" :class="{ active: viewMode === 'chart' }">📊 Graphe</button></div>
          
          <div v-if="viewMode === 'chart'" class="chart-container"><Bar :data="chartData" /></div>
          
          <table v-else class="styled-table">
            <thead><tr><th v-for="h in tableHeaders" :key="h">{{ h }}</th></tr></thead>
            <tbody>
              <tr v-for="row in tableData">
                <td class="num-cell">{{ row.number }}</td><td><strong>{{ row.count }}</strong></td>
                <td>
                  <div v-if="row.synthesis" class="summary-grid mini">
                    <div v-if="row.synthesis.top_days" class="sum-card"><h5>Top Jours</h5><div class="mini-list">{{ row.synthesis.top_days.join(', ') }}</div></div>
                    <div class="sum-card"><h5>Top Heures</h5><div class="mini-list">{{ row.synthesis.top_hours.join(', ') }}</div></div>
                    <div class="sum-card"><h5>Déclencheurs</h5><div class="mini-list" style="color:#e65100;">{{ row.synthesis.top_triggers.join(' - ') }}</div></div>
                    <div class="sum-card"><h5>Compagnons</h5><div class="mini-list" style="color:#0277bd;">{{ row.synthesis.top_companions.join(' - ') }}</div></div>
                    <div class="sum-card"><h5>Prophètes</h5><div class="mini-list" style="color:#7b1fa2;">{{ row.synthesis.top_prophets.join(' - ') }}</div></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <div v-if="!standardResult && !dayAnalysisResult && !deepFavoriteResult && !profileResult && !matrixResult && !isLoading" class="welcome-message">
            <h3>ANALYSEUR PRÊT</h3><p>Choisissez une fonction pour démarrer.</p>
        </div>
        <div v-if="isLoading" class="loader">Traitement en cours...</div>
        <div v-if="error" class="error-box">{{ error }}</div>
      </div>
    </div>
  </main>
</template>

<style scoped>
  .loading-screen { display: flex; align-items: center; justify-content: center; height: 100vh; }
  .login-wrapper { display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; }
  .login-box { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
  .dashboard { max-width: 1400px; margin: auto; padding: 20px; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; margin-bottom: 20px; }
  .main-layout { display: grid; grid-template-columns: 320px 1fr; gap: 20px; }
  .controls-column { max-height: 90vh; overflow-y: auto; }
  .card { background: white; padding: 15px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 15px; }
  .boss-header { display: flex; justify-content: space-between; align-items: center; }
  .badge-spec { background: #673ab7; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; }
  .spec-btn { width: 100%; padding: 10px; border: none; border-radius: 8px; color: white; cursor: pointer; font-weight: bold; margin-top: 10px; }
  .date-picker-row { display: flex; gap: 5px; margin: 10px 0; }
  .date-picker-row input { flex: 1; }
  .day-select { width: 100%; margin-bottom: 10px; padding: 8px; }
  .favorites-list { display: flex; flex-wrap: wrap; gap: 5px; }
  .favorite-chip { background: #e3f2fd; border-radius: 20px; padding: 5px 15px; display: flex; gap: 10px; cursor: pointer; }
  .fav-delete { color: red; font-weight: bold; }
  .gsheet-btn { background: #0f9d58; color: white; padding: 12px 24px; border-radius: 30px; text-decoration: none; font-weight: bold; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 15px 0; }
  .summary-grid.mini { grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 5px; }
  .sum-card { background: #f8f9fa; border: 1px solid #eee; padding: 8px; border-radius: 6px; }
  .sum-card h5 { margin: 0 0 5px; font-size: 0.65rem; text-transform: uppercase; color: #777; }
  .mini-list { font-size: 0.8rem; font-weight: bold; }
  .spec-table { width: 100%; border-collapse: collapse; }
  .spec-table th, .spec-table td { padding: 12px; border-bottom: 1px solid #eee; text-align: center; }
  .num-cell { font-size: 1.4rem; font-weight: 900; color: #00796b; background: #f0f4f8; }
  .best-duo-box { background: linear-gradient(90deg, #ffc107, #ff9800); padding: 15px; border-radius: 10px; text-align: center; font-weight: bold; }
  .duo-val { font-size: 1.8rem; display: block; }
  .styled-table { width: 100%; border-collapse: collapse; }
  .styled-table th { background: #f4f4f4; padding: 10px; }
  .styled-table td { padding: 10px; border-bottom: 1px solid #eee; }
  .close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
  .badge-stat { background: #eee; padding: 5px 15px; border-radius: 20px; font-weight: bold; }
  .badge-hit { background: #4caf50; color: white; padding: 2px 6px; border-radius: 4px; }
</style>