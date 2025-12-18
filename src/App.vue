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

const tableHeaders = computed(() => {
  if (!lastOperationType.value) return [];
  if (lastOperationType.value.includes('frequency')) return ['#', 'Numéro', 'Apparitions'];
  if (lastOperationType.value === 'companions') return ['#', 'Compagnon', 'Apparu avec'];
  if (lastOperationType.value === 'trigger') return ['#', 'N° Déclencheur', 'Fréquence'];
  if (lastOperationType.value === 'prediction') return ['#', 'Numéro Suivant (Probable)', 'Fréquence']; 
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

const chartOptions = { responsive: true, maintainAspectRatio: false };
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

onMounted(() => {
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  selectedDate.value = `${year}-${month}-${day}`;
  endDate.value = `${year}-${month}-${day}`;
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  startDate.value = `${oneMonthAgo.getFullYear()}-${(oneMonthAgo.getMonth()+1).toString().padStart(2,'0')}-${oneMonthAgo.getDate().toString().padStart(2,'0')}`;

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
      } catch (e) { console.error("Erreur Firebase:", e); }
    } else { user.value = null; userRole.value = ''; userFavorites.value = []; }
    isAuthReady.value = true;
  });
});

const login = async () => {
  try { authError.value = ''; isLoading.value = true; await signInWithEmailAndPassword(auth, email.value, password.value); } 
  catch (error) { authError.value = "Email ou mot de passe incorrect."; } finally { isLoading.value = false; }
};
const logout = async () => { await signOut(auth); };

async function addFavorite() {
  const input = newFavoriteInput.value.trim();
  if (!input) return;
  if (!/^[0-9]{1,2}(-[0-9]{1,2})?$/.test(input)) { alert("Format invalide."); return; }
  if (userFavorites.value.includes(input)) { newFavoriteInput.value = ''; return; }
  try {
    const userRef = doc(db, "users", user.value.uid);
    userFavorites.value.push(input); 
    await setDoc(userRef, { favorites: arrayUnion(input) }, { merge: true }); 
    newFavoriteInput.value = '';
  } catch (e) { alert("Erreur sauvegarde favoris."); }
}

async function removeFavorite(item) {
  if (!confirm(`Retirer ${item} ?`)) return;
  try {
    const userRef = doc(db, "users", user.value.uid);
    userFavorites.value = userFavorites.value.filter(n => n !== item);
    await updateDoc(userRef, { favorites: arrayRemove(item) });
  } catch (e) { console.error(e); }
}

async function analyzeDeepFavorite(item) {
  if (!startDate.value || !endDate.value) { alert("Vérifiez les dates."); return; }
  deepFavoriteResult.value = null;
  await callApi(`/analysis/deep-favorite?target=${item}&start_date=${startDate.value}&end_date=${endDate.value}`, 'deep');
}

async function callApi(url, targetVar = 'standard') {
  showWelcomeMessage.value = false; isLoading.value = true; error.value = null;
  if (targetVar === 'standard') standardResult.value = null;
  try {
    const token = await user.value.getIdToken();
    const headers = { 'Authorization': `Bearer ${token}` };
    const fullUrl = `${API_BASE_URL}${url}`;
    const response = await fetch(fullUrl, { method: 'GET', headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || `Erreur ${response.status}`);
    
    if (targetVar === 'specialist') dayAnalysisResult.value = data;
    else if (targetVar === 'deep') deepFavoriteResult.value = data;
    else if (targetVar === 'profile') profileResult.value = data;
    else standardResult.value = data;

    if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
    viewMode.value = 'table';
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

async function runDataUpdate(endpoint) { lastOperationType.value = 'update'; await callApi(`/collection/${endpoint}`, 'standard'); }

async function runBatchVisualAnalysis(mode) {
  if (!startDate.value || !endDate.value) { error.value = "Période requise."; return; }
  lastOperationType.value = 'visual'; 
  await callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${mode}`, 'standard'); 
}

async function runSingleDayVisual(mode) {
  if (!selectedDate.value) { error.value = "Sélectionnez une date."; return; }
  lastOperationType.value = 'visual'; 
  await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`, 'standard'); 
}

async function runReport(reportType) {
  if (!selectedDate.value) { error.value = "Selectionnez une date."; return; }
  let url = '';
  if (reportType === 'weekly-frequency') { lastOperationType.value = 'weekly-frequency'; url = `/analysis/weekly-frequency/${selectedDate.value}`; }
  else if (reportType === 'daily-frequency') { lastOperationType.value = 'daily-frequency'; url = `/analysis/daily-frequency/${selectedDate.value}`; }
  else if (reportType === 'companions') {
    if (!selectedNumber.value) { error.value = "Entrez un numéro."; return; }
    lastOperationType.value = 'companions'; url = `/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`;
  }
  await callApi(url, 'standard');
}

async function runRangeAnalysis() {
  if (!startDate.value || !endDate.value) { error.value = "Dates requises."; return; }
  lastOperationType.value = 'frequency';
  await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard');
}
async function runProfileAnalysis() {
  if (!startDate.value || !endDate.value || !profileNumber.value) { error.value = "Numéro requis."; return; }
  lastOperationType.value = 'profile';
  profileResult.value = null;
  await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile');
}
async function runSequenceAnalysis() {
  if (!startDate.value || !endDate.value) { error.value = "Dates requises."; return; }
  lastOperationType.value = 'sequence'; await callApi(`/analysis/sequence-detection?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard');
}
async function runTriggerAnalysis() {
  if (!startDate.value || !endDate.value || !triggerTargetNumber.value) { error.value = "Numéro requis."; return; }
  lastOperationType.value = 'trigger';
  let url = `/analysis/trigger-numbers?target_number=${triggerTargetNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  if (triggerCompanionNumber.value) url += `&companion_number=${triggerCompanionNumber.value}`;
  await callApi(url, 'standard');
}
async function runPredictionAnalysis() {
  if (!startDate.value || !endDate.value || !predictionNumber.value) { error.value = "Numéro requis."; return; }
  lastOperationType.value = 'prediction';
  let url = `/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  if (predictionCompanion.value) url += `&observed_companion=${predictionCompanion.value}`;
  await callApi(url, 'standard');
}
async function runMultiPrediction() {
  if (!startDate.value || !endDate.value || !multiPredictionInput.value) { error.value = "Numéros requis."; return; }
  const cleanInput = multiPredictionInput.value.replace(/[\s-]+/g, ',');
  lastOperationType.value = 'prediction';
  await callApi(`/analysis/multi-prediction?numbers_str=${cleanInput}&start_date=${startDate.value}&end_date=${endDate.value}`, 'standard');
}
async function runKantaReport(reportType) {
  if (!selectedDate.value) { error.value = "Date requise."; return; }
  lastOperationType.value = 'kanta-rank'; 
  await callApi(`/analysis/kanta-${reportType}/${selectedDate.value}`, 'standard');
}
async function runDayAnalysis() {
  if (!startDate.value || !endDate.value) { error.value = "Dates requises."; return; }
  await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist');
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
      <h1>LE GUIDE DES FOURCASTER <span class="version-tag">PLATINUM V53</span></h1>
      <div class="user-info">
        <span>Connecté : <strong>{{ user.email }}</strong></span>
        <button @click="logout" class="logout-button">Déconnexion</button>
      </div>
    </header>

    <div class="main-layout">
      <!-- COLONNE GAUCHE AVEC SCROLLBAR -->
      <div class="controls-column">
        
        <section class="card spec-card">
          <div class="boss-header"><h2>📅 ANALYSTE SPÉCIALISTE</h2><span class="badge-spec">360°</span></div>
          <p class="small-text">Trouvez les Habitués de chaque jour.</p>
          <label>Jour :</label>
          <select v-model="selectedDayName" class="day-select">
            <option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option>
          </select>
          <label>Heure :</label>
          <select v-model="selectedHour" class="day-select">
            <option>Toute la journée</option><option>10H</option><option>13H</option><option>16H</option><option>19H</option><option>21H</option><option>22H</option><option>23H</option>
          </select>
          <label class="period-label">Période d'Analyse :</label>
          <div class="date-picker-row">
             <input type="date" v-model="startDate" />
             <input type="date" v-model="endDate" />
          </div>
          <button @click="runDayAnalysis" :disabled="isLoading" class="spec-btn">SCANNER {{ selectedDayName.toUpperCase() }}</button>
        </section>

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
          <label class="period-label">Période d'analyse :</label>
          <div style="display:flex; gap:5px; margin-bottom:10px;">
             <input type="date" v-model="startDate" />
             <input type="date" v-model="endDate" />
          </div>
          <div v-if="userFavorites.length > 0" class="favorites-list">
            <div v-for="item in userFavorites" :key="item" class="favorite-chip">
              <span class="fav-label">{{ item }}</span>
              <div class="fav-actions">
                <button @click="analyzeDeepFavorite(item)" class="icon-btn" title="Scan Profond (Période)">⚡</button>
              </div>
              <span @click="removeFavorite(item)" class="fav-delete">×</span>
            </div>
          </div>
          <p v-else class="empty-msg">Ajoutez vos numéros fétiches.</p>
        </section>

        <section class="card">
          <h2>Analyse Visuelle (Batch)</h2>
          <p class="small-text">Applique les couleurs sur toute la période choisie.</p>
          <div style="display:flex; gap:5px; margin-bottom:10px;">
             <input type="date" v-model="startDate" />
             <input type="date" v-model="endDate" />
          </div>
          <div class="button-group-vertical">
            <button @click="runBatchVisualAnalysis('frequency')" :disabled="isLoading || !startDate || !endDate" style="background:#ef5350;">Surlignage Rouge/Bleu (Période)</button>
            <button @click="runBatchVisualAnalysis('kanta')" :disabled="isLoading || !startDate || !endDate" style="background:#66bb6a;">Surlignage Kanta (Période)</button>
          </div>
        </section>

        <section class="card">
          <h2>Rapports Ponctuels (1 Semaine)</h2>
          <input type="date" v-model="selectedDate" />
          <div class="button-group-vertical" style="margin-top:10px;">
             <button @click="runSingleDayVisual('frequency')" :disabled="isLoading || !selectedDate" style="border:1px solid #ef5350; background:transparent; color:#d32f2f;">🎨 Surlignage Jour Unique</button>
             <button @click="runSingleDayVisual('kanta')" :disabled="isLoading || !selectedDate" style="border:1px solid #66bb6a; background:transparent; color:#388e3c;">🎨 Surlignage Kanta Jour Unique</button>
          </div>
          <hr>
          <div class="button-group-vertical">
            <button @click="runReport('daily-frequency')" :disabled="isLoading || !selectedDate">Classement Jour</button>
            <button @click="runReport('weekly-frequency')" :disabled="isLoading || !selectedDate">Classement Semaine</button>
            <hr />
            <input type="number" v-model="selectedNumber" placeholder="N° pour analyse compagnons" />
            <button @click="runReport('companions')" :disabled="isLoading || !selectedDate || !selectedNumber">Analyser Compagnons</button>
          </div>
        </section>

        <section class="card">
          <h2>Période & Profilage</h2>
          <div style="display:flex; gap:5px; margin-bottom:10px;">
             <input type="date" v-model="startDate" />
             <input type="date" v-model="endDate" />
          </div>
          <button @click="runRangeAnalysis" :disabled="isLoading || !startDate || !endDate">Fréquence sur Période</button>
          <hr />
          <input type="number" v-model="profileNumber" placeholder="N° pour profil complet" />
          <button @click="runProfileAnalysis" :disabled="isLoading || !startDate || !endDate || !profileNumber">Générer Profil du Numéro</button>
        </section>

        <section class="card prophet-card">
          <h2>🔮 Le Prophète</h2>
          <div style="display:flex; gap:5px; margin-bottom:10px;">
             <input type="date" v-model="startDate" />
             <input type="date" v-model="endDate" />
          </div>
          <input type="number" v-model="predictionNumber" placeholder="Numéro vu (Ex: 42)" />
          <input type="number" v-model="predictionCompanion" placeholder="Compagnon vu (Optionnel)" />
          <button @click="runPredictionAnalysis" :disabled="isLoading || !startDate || !endDate || !predictionNumber" class="prophet-btn">Voir Futur Probable</button>
        </section>

        <section class="card multi-prophet-card">
          <h2>🔮 Analyse Croisée</h2>
          <div style="display:flex; gap:5px; margin-bottom:10px;">
             <input type="date" v-model="startDate" />
             <input type="date" v-model="endDate" />
          </div>
          <input type="text" v-model="multiPredictionInput" placeholder="Ex: 5 12 34 56 78" @keyup.enter="runMultiPrediction"/>
          <button @click="runMultiPrediction" :disabled="isLoading || !startDate || !endDate || !multiPredictionInput" class="multi-btn">Lancer Projection</button>
        </section>

        <section class="card">
          <h2>IA Avancée & Kanta</h2>
          <div style="display:flex; gap:5px; margin-bottom:10px;">
             <input type="date" v-model="startDate" />
             <input type="date" v-model="endDate" />
          </div>
          <button @click="runSequenceAnalysis" :disabled="isLoading || !startDate || !endDate">Détecter Suites</button>
          <hr />
          <input type="number" v-model="triggerTargetNumber" placeholder="Cible (ex: 18)" />
          <input type="number" v-model="triggerCompanionNumber" placeholder="Compagnon (Optionnel)" />
          <button @click="runTriggerAnalysis" :disabled="isLoading || !startDate || !endDate || !triggerTargetNumber">Trouver Déclencheurs ⚡</button>
          <hr />
          <div class="button-group-horizontal">
             <button @click="runKantaReport('daily-rank')">Class. Kanta J</button>
             <button @click="runKantaReport('weekly-rank')">Class. Kanta S</button>
          </div>
        </section>
      </div>

      <div class="results-column">
        
        <div class="quick-link-box">
           <a :href="sheetDirectLink" target="_blank" class="gsheet-btn">📂 OUVRIR GOOGLE SHEETS</a>
        </div>

        <!-- RESULTAT SPECIALISTE JOUR -->
        <div v-if="dayAnalysisResult" class="card result-spec-card">
          <div class="spec-header">
            <h3>📊 TOP 5 : {{ dayAnalysisResult.day_analyzed.toUpperCase() }} ({{ dayAnalysisResult.hour_analyzed }})</h3>
            <span class="total-badge">{{ dayAnalysisResult.total_draws_found }} Tirages</span>
            <button @click="dayAnalysisResult = null" class="close-btn">×</button>
          </div>
          <div class="best-duo-box">
             <span class="duo-label">🔥 LE DUO EN OR :</span>
             <span class="duo-val">{{ dayAnalysisResult.best_duo }}</span>
             <span class="duo-count">(Vu {{ dayAnalysisResult.best_duo_count }} fois)</span>
          </div>
          <div class="table-responsive">
            <table class="spec-table">
              <thead><tr><th>Status</th><th>N°</th><th>Kanta</th><th>2 Compagnons (Présent)</th><th>2 Déclencheurs (Passé)</th><th>Prophète (Futur)</th></tr></thead>
              <tbody>
                <tr v-for="row in dayAnalysisResult.recurrence_data" :key="row.number">
                  <td style="font-size:1.2rem;" :title="row.status_text">{{ row.status_icon }}</td>
                  <td class="num-cell">{{ row.number }}</td>
                  <td style="color:#d32f2f; font-weight:bold;">{{ row.kanta }}</td>
                  <td class="comp-cell">{{ row.best_companion }}</td>
                  <td class="trig-cell">{{ row.best_trigger }}</td>
                  <td class="proph-cell">{{ row.best_prophet }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="ai-analysis"><h4>🧠 Conseil Stratégique :</h4><p>{{ dayAnalysisResult.ai_analysis }}</p></div>
        </div>

        <!-- RESULTAT DEEP FAVORITE (TABLEAU HISTORIQUE + RESUME) -->
        <div v-if="deepFavoriteResult" class="card result-spec-card" style="border-top:4px solid #fdd835;">
          <div class="spec-header">
            <h3>⭐ SCAN PROFOND : {{ deepFavoriteResult.favorite }}</h3>
            <button @click="deepFavoriteResult = null" class="close-btn">×</button>
          </div>
          
          <div v-if="deepFavoriteResult.data === null">
             <p>Ce favori n'est jamais sorti sur la période.</p>
          </div>
          <div v-else>
             <!-- BLOC RESUME TOP STATS -->
             <div class="summary-grid">
               <div class="sum-card"><h5>Top Jours</h5><ul><li v-for="x in deepFavoriteResult.summary.top_days" :key="x.val">{{ x.val }} ({{x.count}})</li></ul></div>
               <div class="sum-card"><h5>Top Heures</h5><ul><li v-for="x in deepFavoriteResult.summary.top_hours" :key="x.val">{{ x.val }} ({{x.count}})</li></ul></div>
               <div class="sum-card"><h5>Top Déclencheurs</h5><ul><li v-for="x in deepFavoriteResult.summary.top_triggers" :key="x.val">{{ x.val }} ({{x.count}})</li></ul></div>
               <div class="sum-card"><h5>Top Compagnons</h5><ul><li v-for="x in deepFavoriteResult.summary.top_companions" :key="x.val">{{ x.val }} ({{x.count}})</li></ul></div>
               <div class="sum-card"><h5>Top Prophètes</h5><ul><li v-for="x in deepFavoriteResult.summary.top_prophets" :key="x.val">{{ x.val }} ({{x.count}})</li></ul></div>
             </div>

             <div class="stats-row">
                <span class="badge-stat">Sorties : {{ deepFavoriteResult.total_hits }}</span>
             </div>

             <div class="table-responsive">
               <table class="spec-table">
                 <thead>
                   <tr><th>Date</th><th>Jour</th><th>Heure</th><th>Déclencheur</th><th>Compagnons</th><th>Prophète</th></tr>
                 </thead>
                 <tbody>
                   <tr v-for="(row, idx) in deepFavoriteResult.history_table" :key="idx">
                     <td>{{ row.date }}</td><td>{{ row.day }}</td><td>{{ row.time }}</td>
                     <td class="trig-cell">{{ row.trigger }}</td>
                     <td class="comp-cell">{{ row.companion }}</td>
                     <td class="proph-cell">{{ row.prophet }}</td>
                   </tr>
                 </tbody>
               </table>
             </div>
             <div class="ai-analysis"><h4>🧠 Stratégie Favori :</h4><p>{{ deepFavoriteResult.ai_analysis }}</p></div>
          </div>
        </div>

        <!-- NOUVEAU RESULTAT : PROFIL NUMERO (TABLEAU) -->
        <div v-if="profileResult" class="card result-spec-card" style="border-top:4px solid #ab47bc;">
          <div class="spec-header">
            <h3>👤 PROFIL COMPLET : {{ profileResult.profile_data.number }}</h3>
            <button @click="profileResult = null" class="close-btn">×</button>
          </div>
          
          <div class="stats-grid">
             <div class="stat-item"><strong>Sorties Totales</strong><br>{{ profileResult.profile_data.hits }}</div>
             <div class="stat-item"><strong>Jour Favori</strong><br>{{ profileResult.profile_data.best_day }}</div>
             <div class="stat-item"><strong>Heure Favorite</strong><br>{{ profileResult.profile_data.best_time }}</div>
          </div>
          <div style="margin:15px 0; padding:10px; background:#f3e5f5; border-radius:8px;">
             <strong>Top 5 Compagnons :</strong> {{ profileResult.profile_data.top_companions }}
          </div>

          <div class="ai-analysis"><h4>🧠 Analyse Expert :</h4><p>{{ profileResult.ai_strategic_profile }}</p></div>
        </div>

        <!-- RESULTATS STANDARDS -->
        <section v-if="standardResult" class="card results-card fade-in">
          <div class="spec-header">
             <h2>Résultat Standard</h2>
             <button @click="standardResult = null" class="close-btn">Fermer</button>
          </div>
          <div v-if="standardResult.message || standardResult.analysis_period" class="success-box large">
            <p>✅ {{ standardResult.message || `Analyse : ${standardResult.analysis_period}` }}</p>
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
          <div v-if="standardResult.ai_strategic_analysis" class="ai-analysis"><h3>🧠 Stratégie</h3><p>{{ standardResult.ai_strategic_analysis }}</p></div>
          <div v-if="standardResult.ai_strategic_profile" class="ai-analysis"><h3>🧠 Profil Numéro</h3><p>{{ standardResult.ai_strategic_profile }}</p></div>
          <div v-if="standardResult.ai_sequence_analysis" class="ai-analysis"><h3>🧠 Suites</h3><p>{{ standardResult.ai_sequence_analysis }}</p></div>
          <div v-if="standardResult.ai_trigger_analysis" class="ai-analysis"><h3>🧠 Déclencheurs</h3><p>{{ standardResult.ai_trigger_analysis }}</p></div>
          <div v-if="standardResult.ai_prediction_analysis" class="ai-analysis prophet-analysis"><h3>🔮 Prédiction</h3><p>{{ standardResult.ai_prediction_analysis }}</p></div>
        </section>

        <div v-if="!dayAnalysisResult && !standardResult && !deepFavoriteResult && !profileResult && !isLoading" class="welcome-message">
            <h3>Prêt à analyser</h3>
            <p>Sélectionnez une fonction à gauche pour commencer.</p>
        </div>
        
        <div v-if="isLoading" class="loader">Analyse en cours...</div>
        <div v-if="error" class="error-box">{{ error }}</div>

      </div>
    </div>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');

body { font-family: 'Inter', sans-serif; background-color: #f8f9fa; color: #1e293b; }

.dashboard { max-width: 98%; margin: 0 auto; }
header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 2rem; border-radius: 0 0 12px 12px; }
h1 { font-weight: 800; color: #0f172a; margin: 0; font-size: 1.5rem; }
.version-tag { background: #f59e0b; color: white; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; vertical-align: middle; margin-left: 10px; }

.main-layout { display: grid; grid-template-columns: 350px 1fr; gap: 2rem; padding: 0 1rem; }

.card { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); margin-bottom: 1.5rem; transition: transform 0.2s; }
.card:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
.card h2 { margin-top: 0; font-size: 1.1rem; color: #334155; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.8rem; margin-bottom: 1rem; font-weight: 600; }

/* BOUTONS ET INPUTS */
input, select { width: 100%; padding: 0.8rem; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-family: 'Inter', sans-serif; transition: border 0.2s; }
input:focus, select:focus { border-color: #3b82f6; outline: none; }
button { padding: 0.9rem; background-color: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; width: 100%; font-weight: 600; transition: background 0.2s; }
button:hover { background-color: #2563eb; }
button:disabled { background-color: #94a3b8; cursor: not-allowed; }

/* SPECIALIST CARD */
.spec-card { border-top: 4px solid #10b981; background: #f0fdf4; }
.boss-header h2 { color: #065f46; border: none; }
.badge-spec { background: #10b981; color: white; padding: 4px 8px; border-radius: 20px; font-size: 0.7rem; }
.spec-btn { background: #059669; }
.spec-btn:hover { background: #047857; }

/* TABLES */
.styled-table, .spec-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 1rem; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
.styled-table th, .spec-table th { background-color: #f8fafc; color: #64748b; font-weight: 600; padding: 12px; text-align: center; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
.styled-table td, .spec-table td { padding: 12px; text-align: center; border-bottom: 1px solid #e2e8f0; color: #334155; font-size: 0.9rem; }
.styled-table tr:last-child td { border-bottom: none; }
.styled-table tr:hover, .spec-table tr:hover { background-color: #f1f5f9; }

/* DEEP SCAN SUMMARY GRID */
.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
.sum-card { background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; }
.sum-card h5 { margin: 0 0 8px 0; font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: 700; }
.sum-card ul { list-style: none; padding: 0; margin: 0; }
.sum-card li { font-size: 0.9rem; color: #0f172a; font-weight: 600; margin-bottom: 4px; }

/* RESULTATS CARDS */
.result-spec-card { border-top: 4px solid #3b82f6; }
.spec-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.spec-header h3 { margin: 0; color: #1e293b; font-size: 1.2rem; }
.total-badge { background: #e2e8f0; color: #475569; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }

.num-cell { font-weight: 800; color: #0f172a; font-size: 1.2rem; }
.comp-cell { color: #0369a1; font-weight: 600; }
.trig-cell { color: #c2410c; font-weight: 600; }
.proph-cell { color: #7e22ce; font-weight: 600; background: #f3e8ff; border-radius: 4px; padding: 2px 6px; }

.best-duo-box { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; padding: 15px; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
.duo-label { font-size: 0.9rem; color: #94a3b8; font-weight: 600; }
.duo-val { font-size: 2rem; font-weight: 800; color: #fbbf24; text-shadow: 0 2px 4px rgba(0,0,0,0.2); }
.duo-count { font-size: 0.9rem; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; }

/* UTILS */
.controls-column { max-height: 90vh; overflow-y: auto; padding-right: 10px; }
.controls-column::-webkit-scrollbar { width: 6px; }
.controls-column::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 3px; }
.close-btn { width: auto; background: transparent; color: #94a3b8; font-size: 1.5rem; padding: 0; }
.close-btn:hover { color: #ef4444; background: transparent; }
.ai-analysis { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 1rem; border-radius: 6px; margin-top: 1rem; color: #92400e; }
.ai-analysis h4 { margin-top: 0; color: #b45309; }

/* SCROLLBAR & FADE */
.fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>