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
const generalResult = ref(null);  
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
const viewMode = ref('cards'); 
const lastOperationType = ref('');

const isAdmin = computed(() => userRole.value === 'admin');
const sheetDirectLink = computed(() => {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
  return activeSheetGid.value ? `${base}/edit#gid=${activeSheetGid.value}` : `${base}/edit`;
});

const tableHeaders = computed(() => {
  if (lastOperationType.value === 'simple') {
      if (standardResult.value?.companion_ranking) return ['#', 'Compagnon', 'Apparu avec'];
      if (standardResult.value?.trigger_numbers_ranking) return ['#', 'N° Déclencheur', 'Fréquence'];
      if (standardResult.value?.prediction_ranking) return ['#', 'Numéro Suivant', 'Fréquence']; 
      if (standardResult.value?.kanta_pairs) return ['Paire Kanta', 'Apparitions'];
  }
  return [];
});

const tableData = computed(() => {
  if (standardResult.value?.companion_ranking) return standardResult.value.companion_ranking;
  if (standardResult.value?.trigger_numbers_ranking) return standardResult.value.trigger_numbers_ranking;
  if (standardResult.value?.prediction_ranking) return standardResult.value.prediction_ranking;
  if (standardResult.value?.kanta_pairs) return standardResult.value.kanta_pairs;
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
  cyclicDay.value = today.getDate();
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
  await callApi(`/analysis/deep-favorite?target=${item}&start_date=${startDate.value}&end_date=${endDate.value}&context_day=${favDayName.value}&context_hour=${favHour.value}`, 'deep');
}

async function runTimeMatrix() {
  matrixResult.value = null;
  let url = `/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}`;
  if (matrixMode.value === 'cyclic') url += `&target_cyclic_day=${cyclicDay.value}`;
  await callApi(url, 'matrix');
}

async function callApi(url, targetVar = 'general') {
  showWelcomeMessage.value = false; isLoading.value = true; error.value = null;
  if (targetVar === 'general') generalResult.value = null;
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
    else if (targetVar === 'matrix') matrixResult.value = data;
    else if (targetVar === 'general') generalResult.value = data; 
    else standardResult.value = data;

    if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
    
    if (targetVar === 'general') viewMode.value = 'cards';
    else viewMode.value = 'table';

  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

async function runDataUpdate(endpoint) { lastOperationType.value = 'update'; await callApi(`/collection/${endpoint}`, 'standard'); }
async function runBatchVisualAnalysis(mode) { if (!startDate.value) return; lastOperationType.value = 'visual'; await callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${mode}`, 'standard'); }
async function runSingleDayVisual(mode) { if (!selectedDate.value) return; lastOperationType.value = 'visual'; await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`, 'standard'); }

// CLASSEMENTS ENRICHIS (Utilise generalResult)
async function runReport(reportType) {
  if (!selectedDate.value) return;
  
  if (reportType === 'daily-frequency') {
      lastOperationType.value = 'ranking_rich';
      await callApi(`/analysis/daily-frequency/${selectedDate.value}`, 'general');
  }
  else if (reportType === 'weekly-frequency') {
      lastOperationType.value = 'ranking_rich';
      await callApi(`/analysis/weekly-frequency/${selectedDate.value}`, 'general');
  }
  else if (reportType === 'companions') { 
      lastOperationType.value = 'simple'; 
      await callApi(`/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`, 'standard'); 
  }
}
async function runRangeAnalysis() {
  if (!startDate.value) return;
  lastOperationType.value = 'ranking_rich';
  await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`, 'general');
}

// FONCTIONS SPECIALES
async function runProfileAnalysis() {
  if (!profileNumber.value) return;
  lastOperationType.value = 'profile';
  profileResult.value = null;
  await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile');
}
async function runDayAnalysis() { if (!startDate.value) return; await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist'); }

// FONCTIONS SIMPLES
async function runSequenceAnalysis() { if (!startDate.value) return; lastOperationType.value = 'simple'; await callApi(`/analysis/sequence-detection?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard'); }
async function runTriggerAnalysis() { if (!triggerTargetNumber.value) return; lastOperationType.value = 'simple'; let url = `/analysis/trigger-numbers?target_number=${triggerTargetNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`; if (triggerCompanionNumber.value) url += `&companion_number=${triggerCompanionNumber.value}`; await callApi(url, 'standard'); }
async function runPredictionAnalysis() { if (!predictionNumber.value) return; lastOperationType.value = 'simple'; let url = `/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`; if (predictionCompanion.value) url += `&observed_companion=${predictionCompanion.value}`; await callApi(url, 'standard'); }
async function runMultiPrediction() { if (!multiPredictionInput.value) return; lastOperationType.value = 'simple'; await callApi(`/analysis/multi-prediction?numbers_str=${multiPredictionInput.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'standard'); }
async function runKantaReport(reportType) { if (!selectedDate.value) return; lastOperationType.value = 'simple'; await callApi(`/analysis/kanta-${reportType}/${selectedDate.value}`, 'standard'); }

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
    <header><h1>LE GUIDE DES FOURCASTER <span class="version-tag">V78</span></h1><div class="user-info"><span>{{ user.email }}</span><button @click="logout" class="logout-button">Déconnexion</button></div></header>

    <div class="main-layout">
      <!-- COLONNE GAUCHE (CONTROLS) -->
      <div class="controls-column">
        
        <section v-if="isAdmin" class="card data-update">
          <h2>Maintenance (Admin)</h2>
          <div class="button-group-horizontal">
            <button @click="runDataUpdate('update-recent-weeks')" :disabled="isLoading">Mise à Jour Rapide</button>
            <button @click="runDataUpdate('start-full-rebuild')" :disabled="isLoading" class="danger">Reconstruction</button>
          </div>
        </section>

        <!-- ... (Matrice, Spécialiste, Favoris, Visuel, Prophet, Multi, IA Avancée inchangés) ... -->
        <section class="card matrix-card">
          <div class="boss-header"><h2>🕰️ MATRICE TEMPORELLE</h2><span class="badge-spec" style="background:#ff9800;">PREDICTOR</span></div>
          <p class="small-text">Apprentissage sur la formule Date/Renversé/Kanta.</p>
          <div class="tabs"><button @click="matrixMode='continuous'" :class="{active: matrixMode==='continuous'}">CONTINU</button><button @click="matrixMode='cyclic'" :class="{active: matrixMode==='cyclic'}">CYCLIQUE</button></div>
          <div v-if="matrixMode==='cyclic'" style="margin-bottom:10px;"><label>Jour (1-31):</label><input type="number" v-model="cyclicDay" min="1" max="31"/></div>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runTimeMatrix" :disabled="isLoading" class="spec-btn" style="background:#ff9800;">ANALYSER & PRÉDIRE</button>
        </section>

        <section class="card spec-card">
          <div class="boss-header"><h2>📅 ANALYSTE SPÉCIALISTE</h2><span class="badge-spec">360°</span></div>
          <label>Jour :</label><select v-model="selectedDayName" class="day-select"><option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option></select>
          <label>Heure :</label><select v-model="selectedHour" class="day-select"><option>Toute la journée</option><option>01H</option><option>03H</option><option>07H</option><option>08H</option><option>10H</option><option>13H</option><option>16H</option><option>19H</option><option>21H</option><option>22H</option><option>23H</option></select>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runDayAnalysis" :disabled="isLoading" class="spec-btn">SCANNER {{ selectedDayName.toUpperCase() }}</button>
        </section>

        <section class="card">
          <h2>⭐ Mes Numéros Favoris</h2>
          <div class="favorites-input-group"><input type="text" v-model="newFavoriteInput" placeholder="Ex: 7 ou 12-45" @keyup.enter="addFavorite"/><button @click="addFavorite" :disabled="!newFavoriteInput" class="btn-small">Ajouter</button></div>
          <div style="display:flex; gap:5px; margin-bottom:10px;"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <div class="date-picker-row"><select v-model="favDayName" class="day-select"><option>Tous</option><option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option></select><select v-model="favHour" class="day-select"><option>Toutes</option><option>10H</option><option>13H</option><option>16H</option><option>19H</option><option>21H</option><option>22H</option><option>23H</option></select></div>
          <div v-if="userFavorites.length>0" class="favorites-list"><div v-for="item in userFavorites" :key="item" class="favorite-chip"><span class="fav-label">{{ item }}</span><div class="fav-actions"><button @click="analyzeDeepFavorite(item)" class="icon-btn">⚡</button></div><span @click="removeFavorite(item)" class="fav-delete">×</span></div></div>
        </section>

        <section class="card">
          <h2>Analyse Visuelle</h2>
          <div style="display:flex; gap:5px; margin-bottom:10px;"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <div class="button-group-vertical"><button @click="runBatchVisualAnalysis('frequency')" :disabled="isLoading||!startDate" style="background:#ef5350;">Rouge/Bleu (Période)</button><button @click="runBatchVisualAnalysis('kanta')" :disabled="isLoading||!startDate" style="background:#66bb6a;">Kanta (Période)</button></div>
        </section>

        <section class="card">
          <h2>Rapports Ponctuels</h2>
          <input type="date" v-model="selectedDate"/>
          <div class="button-group-vertical" style="margin-top:10px;"><button @click="runSingleDayVisual('frequency')" :disabled="isLoading||!selectedDate" style="border:1px solid #ef5350; background:transparent; color:#d32f2f;">🎨 Surlignage Jour</button><button @click="runSingleDayVisual('kanta')" :disabled="isLoading||!selectedDate" style="border:1px solid #66bb6a; background:transparent; color:#388e3c;">🎨 Surlignage Kanta</button></div>
          <hr>
          <div class="button-group-vertical">
            <button @click="runReport('daily-frequency')" :disabled="isLoading||!selectedDate">Classement Jour (Top 10)</button>
            <button @click="runReport('weekly-frequency')" :disabled="isLoading||!selectedDate">Classement Semaine (Top 10)</button>
            <hr>
            <input type="number" v-model="selectedNumber" placeholder="N° Compagnons"/><button @click="runReport('companions')" :disabled="isLoading||!selectedDate||!selectedNumber">Analyser Compagnons</button>
          </div>
        </section>

        <section class="card">
          <h2>Période & Profilage</h2>
          <div style="display:flex; gap:5px; margin-bottom:10px;"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runRangeAnalysis" :disabled="isLoading||!startDate">Fréquence Période (Top 10)</button>
          <hr>
          <input type="number" v-model="profileNumber" placeholder="N° Profil"/><button @click="runProfileAnalysis" :disabled="isLoading||!startDate||!profileNumber">Générer Profil</button>
        </section>

        <section class="card prophet-card"><h2>🔮 Le Prophète</h2><div style="display:flex; gap:5px; margin-bottom:10px;"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div><input type="number" v-model="predictionNumber" placeholder="N° vu"/><input type="number" v-model="predictionCompanion" placeholder="Compagnon"/><button @click="runPredictionAnalysis" :disabled="isLoading||!startDate||!predictionNumber" class="prophet-btn">Voir Futur</button></section>
        <section class="card multi-prophet-card"><h2>🔮 Analyse Croisée</h2><div style="display:flex; gap:5px; margin-bottom:10px;"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div><input type="text" v-model="multiPredictionInput" placeholder="Ex: 5 12 34"/><button @click="runMultiPrediction" :disabled="isLoading||!startDate||!multiPredictionInput" class="multi-btn">Lancer</button></section>
        <section class="card"><h2>IA Avancée</h2><div style="display:flex; gap:5px; margin-bottom:10px;"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div><button @click="runSequenceAnalysis" :disabled="isLoading">Suites</button><hr><input type="number" v-model="triggerTargetNumber" placeholder="Cible"/><button @click="runTriggerAnalysis" :disabled="isLoading||!triggerTargetNumber">Déclencheurs ⚡</button><hr><div class="button-group-horizontal"><button @click="runKantaReport('daily-rank')">Kanta J</button><button @click="runKantaReport('weekly-rank')">Kanta S</button></div></section>
      </div>

      <!-- COLONNE DROITE (RESULTATS) -->
      <div class="results-column">
        
        <div class="quick-link-box"><a :href="sheetDirectLink" target="_blank" class="gsheet-btn">📂 OUVRIR GOOGLE SHEETS</a></div>

        <!-- 1. MATRICE TEMPORELLE -->
        <div v-if="matrixResult" class="card result-spec-card" style="border-top:4px solid #ff9800;">
           <div class="spec-header"><h3>🕰️ MATRICE TEMPORELLE</h3><button @click="matrixResult=null" class="close-btn">×</button></div>
           <div v-if="matrixResult.prediction" class="prediction-tab">
               <div class="best-duo-box" style="background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);"><span class="duo-label">🔮 PRÉDICTION ({{ matrixResult.prediction.target_date_label }}) :</span><span class="duo-val">{{ matrixResult.prediction.two_short }}</span></div>
               <div class="ai-analysis" style="background:#e8eaf6; color:#1a237e;"><h4>💡 Top Formules :</h4><ul><li v-for="(f, i) in matrixResult.prediction.top_formulas_rich" :key="i"><strong>{{ f.name }}</strong> ({{ f.count }} Hits) - <em>{{ f.best_times }}</em></li></ul></div>
           </div>
           <div class="table-responsive"><table class="spec-table"><thead><tr><th>Date</th><th>Base</th><th>Hits</th></tr></thead><tbody><tr v-for="(row, idx) in matrixResult.matrix_data" :key="idx"><td>{{ row.date }}</td><td class="num-cell">{{ row.base_number }}</td><td><div v-for="h in row.detailed_hits" :key="h.num"><span class="badge-hit">{{ h.num }}</span> ({{ h.time }} - {{ h.reason }})</div></td></tr></tbody></table></div>
        </div>

        <!-- 2. SPECIALISTE JOUR -->
        <div v-if="dayAnalysisResult" class="card result-spec-card">
          <div class="spec-header"><h3>📊 TOP 5 : {{ dayAnalysisResult.day_analyzed }}</h3><button @click="dayAnalysisResult=null" class="close-btn">×</button></div>
          <div class="best-duo-box"><span class="duo-label">🔥 DUO OR :</span><span class="duo-val">{{ dayAnalysisResult.best_duo }}</span></div>
          <div class="table-responsive"><table class="spec-table"><thead><tr><th>Stat</th><th>N°</th><th>Kanta</th><th>Compagnons</th><th>Déclencheurs</th></tr></thead><tbody><tr v-for="row in dayAnalysisResult.recurrence_data" :key="row.number"><td style="font-size:1.2rem;">{{ row.status_icon }}</td><td class="num-cell">{{ row.number }}</td><td style="color:#d32f2f;">{{ row.kanta }}</td><td>{{ row.best_companion }}</td><td>{{ row.best_trigger }}</td></tr></tbody></table></div>
        </div>

        <!-- 3. DEEP FAVORITE -->
        <div v-if="deepFavoriteResult" class="card result-spec-card" style="border-top:4px solid #fdd835;">
          <div class="spec-header"><h3>⭐ SCAN PROFOND : {{ deepFavoriteResult.favorite }}</h3><button @click="deepFavoriteResult=null" class="close-btn">×</button></div>
          <div v-if="deepFavoriteResult.data===null"><p>Jamais sorti.</p></div>
          <div v-else>
             <div class="summary-grid"><div class="sum-card"><h5>Top Jours</h5><ul><li v-for="x in deepFavoriteResult.summary.top_days">{{ x.val }} ({{x.count}})</li></ul></div><div class="sum-card"><h5>Top Heures</h5><ul><li v-for="x in deepFavoriteResult.summary.top_hours">{{ x.val }} ({{x.count}})</li></ul></div><div class="sum-card"><h5>Top Déclencheurs</h5><ul><li v-for="x in deepFavoriteResult.summary.top_triggers">{{ x.val }} ({{x.count}})</li></ul></div></div>
             <div class="table-responsive"><table class="spec-table"><thead><tr><th>Date</th><th>Heure</th><th>Déclencheur</th><th>Compagnons</th><th>Prophète</th></tr></thead><tbody><tr v-for="(row, idx) in deepFavoriteResult.history_table" :key="idx"><td>{{ row.date }} {{row.day}}</td><td>{{ row.time }}</td><td>{{ row.trigger }}</td><td>{{ row.companion }}</td><td>{{ row.prophet }}</td></tr></tbody></table></div>
          </div>
        </div>

        <!-- 4. PROFIL NUMERO (TABLEAU FIXÉ) -->
        <div v-if="profileResult" class="card result-spec-card" style="border-top:4px solid #ab47bc;">
          <div class="spec-header"><h3>👤 PROFIL COMPLET : {{ profileResult.profile_data.number }}</h3><button @click="profileResult=null" class="close-btn">×</button></div>
          <div class="stats-grid"><div class="stat-item"><strong>Sorties</strong><br>{{ profileResult.profile_data.total_hits }}</div><div class="stat-item"><strong>Jour</strong><br>{{ profileResult.profile_data.top_days[0]?.val }}</div><div class="stat-item"><strong>Heure</strong><br>{{ profileResult.profile_data.top_hours[0]?.val }}</div></div>
          
          <div class="summary-grid">
             <div class="sum-card"><h5>Top Déclencheurs (Avant)</h5><ul><li v-for="t in profileResult.profile_data.top_triggers" :key="t.val">{{ t.val }} ({{ t.count }})</li></ul></div>
             <div class="sum-card"><h5>Top Compagnons (Avec)</h5><ul><li v-for="c in profileResult.profile_data.top_companions" :key="c.val">{{ c.val }} ({{ c.count }})</li></ul></div>
             <div class="sum-card"><h5>Top Prophètes (Après)</h5><ul><li v-for="p in profileResult.profile_data.top_prophets" :key="p.val">{{ p.val }} ({{ p.count }})</li></ul></div>
          </div>

          <div class="ai-analysis"><h4>🧠 Analyse Expert :</h4><p>{{ profileResult.ai_strategic_profile }}</p></div>
        </div>

        <!-- 5. RESULTATS STANDARDS ENRICHIS (LISTE DE CARTES) -->
        <section v-if="generalResult && lastOperationType === 'ranking_rich'" class="card results-card fade-in">
          <div class="spec-header"><h2>Classement Top 10 (Deep Context)</h2><button @click="generalResult=null" class="close-btn">Fermer</button></div>
          <div class="ranking-list">
             <div v-for="(item, index) in generalResult.data" :key="item.number" class="rank-card">
                <div class="rank-badge">#{{ index + 1 }}</div>
                <div class="rank-main"><span class="rank-num">{{ item.number }}</span><span class="rank-hits">{{ item.total_hits }} Sorties</span></div>
                <div class="rank-details">
                   <div class="detail-col"><strong>Top Jours</strong> <span v-for="d in item.top_days" :key="d.val">{{d.val}} </span></div>
                   <div class="detail-col"><strong>Top Heures</strong> <span v-for="h in item.top_hours" :key="h.val">{{h.val}} </span></div>
                   <div class="detail-col red"><strong>Déclencheurs</strong> <span v-for="t in item.top_triggers" :key="t.val">{{t.val}} </span></div>
                   <div class="detail-col blue"><strong>Compagnons</strong> <span v-for="c in item.top_companions" :key="c.val">{{c.val}} </span></div>
                   <div class="detail-col purple"><strong>Prophètes</strong> <span v-for="p in item.top_prophets" :key="p.val">{{p.val}} </span></div>
                </div>
             </div>
          </div>
        </section>

        <!-- RESULTATS SIMPLES (STANDARD) -->
        <section v-if="standardResult && lastOperationType === 'simple'" class="card results-card fade-in">
          <div class="spec-header"><h2>Résultat Standard</h2><button @click="standardResult=null" class="close-btn">Fermer</button></div>
          <div v-if="isTableVisible && !lastOperationType.includes('visual')" class="view-controls"><button @click="viewMode = 'table'" :class="{ active: viewMode === 'table' }" class="toggle-btn">📋 Tableau</button><button @click="viewMode = 'chart'" :class="{ active: viewMode === 'chart' }" class="toggle-btn">📊 Graphique</button></div>
          <div v-if="isTableVisible && viewMode === 'chart' && !lastOperationType.includes('visual')" class="chart-container"><Bar :data="chartData" :options="chartOptions" /></div>
          <table v-else-if="isTableVisible" class="styled-table">
            <thead><tr><th v-for="h in tableHeaders" :key="h">{{ h }}</th></tr></thead>
            <tbody><tr v-for="(row, index) in tableData" :key="index"><td v-if="lastOperationType.includes('kanta-rank')">{{ row.pair }}</td><td v-else>#{{ index + 1 }}</td><td v-if="!lastOperationType.includes('kanta-rank')">{{ row.number }}</td><td>{{ row.count }}</td></tr></tbody>
          </table>
          <div v-if="standardResult.ai_strategic_analysis" class="ai-analysis"><h3>🧠 Stratégie</h3><p>{{ standardResult.ai_strategic_analysis }}</p></div>
          <div v-if="standardResult.ai_trigger_analysis" class="ai-analysis"><h3>🧠 Déclencheurs</h3><p>{{ standardResult.ai_trigger_analysis }}</p></div>
          <div v-if="standardResult.ai_prediction_analysis" class="ai-analysis prophet-analysis"><h3>🔮 Prédiction</h3><p>{{ standardResult.ai_prediction_analysis }}</p></div>
        </section>

        <div v-if="!dayAnalysisResult && !generalResult && !standardResult && !deepFavoriteResult && !profileResult && !matrixResult && !isLoading" class="welcome-message">
            <h3>Prêt à analyser</h3><p>Sélectionnez une fonction à gauche.</p>
        </div>
        <div v-if="isLoading" class="loader">Analyse en cours...</div>
        <div v-if="error" class="error-box">{{ error }}</div>

      </div>
    </div>
  </main>
</template>

<style scoped>
  /* ... (Reprenez tout le CSS V67 complet ici) ... */
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
  body { font-family: 'Inter', sans-serif; background-color: #f8f9fa; color: #1e293b; }
  
  .ranking-list { display: flex; flex-direction: column; gap: 15px; }
  .rank-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; display: flex; align-items: flex-start; gap: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
  .rank-badge { background: #3b82f6; color: white; font-weight: bold; padding: 5px 10px; border-radius: 50%; font-size: 1.2rem; min-width: 40px; text-align: center; }
  .rank-main { display: flex; flex-direction: column; align-items: center; min-width: 80px; border-right: 1px solid #eee; padding-right: 15px; }
  .rank-num { font-size: 2rem; font-weight: 800; color: #0f172a; }
  .rank-hits { font-size: 0.8rem; color: #64748b; font-weight: 600; }
  .rank-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; width: 100%; }
  .detail-col { font-size: 0.8rem; color: #334155; }
  .detail-col strong { display: block; color: #64748b; text-transform: uppercase; font-size: 0.7rem; margin-bottom: 2px; }
  .detail-col.red span { color: #d32f2f; font-weight: bold; }
  .detail-col.blue span { color: #1976d2; font-weight: bold; }
  .detail-col.purple span { color: #7b1fa2; font-weight: bold; }

  /* (Reste du CSS standard : dashboard, card, table, summary-grid, etc.) */
  .dashboard { max-width: 98%; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 2rem; border-radius: 0 0 12px 12px; }
  h1 { font-weight: 800; color: #0f172a; margin: 0; font-size: 1.5rem; }
  .version-tag { background: #f59e0b; color: white; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; margin-left: 10px; }
  .main-layout { display: grid; grid-template-columns: 350px 1fr; gap: 2rem; padding: 0 1rem; }
  .card { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-bottom: 1.5rem; }
  .card h2 { margin-top: 0; font-size: 1.1rem; color: #334155; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.8rem; margin-bottom: 1rem; font-weight: 600; }
  input, select { width: 100%; padding: 0.8rem; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-family: 'Inter', sans-serif; }
  button { padding: 0.9rem; background-color: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; width: 100%; font-weight: 600; }
  button:disabled { background-color: #94a3b8; }
  .matrix-card { border-top: 4px solid #ff9800; background: #fff8e1; }
  .spec-card { border-top: 4px solid #10b981; background: #f0fdf4; }
  .spec-btn { background: #059669; }
  .boss-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
  .badge-spec { background: #10b981; color: white; padding: 4px 8px; border-radius: 20px; font-size: 0.7rem; }
  .result-spec-card { border-top: 4px solid #3b82f6; }
  .spec-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
  .best-duo-box { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; padding: 15px; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
  .duo-val { font-size: 2rem; font-weight: 800; color: #fbbf24; }
  .styled-table, .spec-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 1rem; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
  .styled-table th, .spec-table th { background-color: #f8fafc; color: #64748b; font-weight: 600; padding: 12px; text-align: center; }
  .styled-table td, .spec-table td { padding: 12px; text-align: center; border-bottom: 1px solid #e2e8f0; color: #334155; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .sum-card { background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; }
  .sum-card h5 { margin: 0 0 8px 0; font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: 700; }
  .sum-card ul { list-style: none; padding: 0; margin: 0; }
  .sum-card li { font-size: 0.9rem; color: #0f172a; font-weight: 600; margin-bottom: 4px; }
  .controls-column { max-height: 90vh; overflow-y: auto; padding-right: 10px; }
  .close-btn { width: auto; background: transparent; color: #94a3b8; font-size: 1.5rem; padding: 0; }
  .ai-analysis { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 1rem; border-radius: 6px; margin-top: 1rem; color: #92400e; }
  .fade-in { animation: fadeIn 0.4s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .icon-btn { background: white; border: 1px solid #bbdefb; color: #333; border-radius: 50%; width: 28px; height: 28px; padding: 0; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; }
  .gsheet-btn { background: #0f9d58; color: white; padding: 10px 20px; border-radius: 30px; text-decoration: none; font-weight: bold; display: inline-block; box-shadow: 0 4px 10px rgba(15, 157, 88, 0.3); }
  .prediction-tab { padding: 10px; background: #fff; border-radius: 8px; }
  .badge-hit { background: #4caf50; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
  .proph-cell { color: #7b1fa2; font-weight: bold; background: #f3e5f5; border-radius: 4px; padding: 2px; }
</style>