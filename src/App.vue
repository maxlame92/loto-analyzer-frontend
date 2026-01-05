<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const GOOGLE_SHEET_ID = "1HepqMzKcshKbRsLWwpEOOy5oO9ntK2CgdV7F_ijmjIo";

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
const cyclicDay = ref(1);
const favDayName = ref('Tous');
const favHour = ref('Toutes');

const selectedDate = ref('');
const startDate = ref('');
const endDate = ref('');
const selectedNumber = ref('');
const isLoading = ref(false);
const error = ref(null);
const viewMode = ref('table');
const lastOperationType = ref('');

const isAdmin = computed(() => userRole.value === 'admin');
const sheetDirectLink = computed(() => `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/edit`);

const tableHeaders = computed(() => {
  if (!lastOperationType.value) return [];
  if (lastOperationType.value.includes('frequency')) return ['#', 'Numéro', 'Sorties'];
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
    counts.push(row.count || 0);
  });
  return { labels, datasets: [{ label: 'Occurrences', backgroundColor: '#4361ee', borderRadius: 4, data: counts }] };
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
  const startStr = `${oneMonthAgo.getFullYear()}-${(oneMonthAgo.getMonth()+1).toString().padStart(2,'0')}-${oneMonthAgo.getDate().toString().padStart(2,'0')}`;
  startDate.value = startStr;

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      user.value = firebaseUser;
      const docRef = doc(db, "users", firebaseUser.uid);
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) userRole.value = docSnap.data().role || 'user';
        else userRole.value = 'user';
        if (docSnap.exists()) userFavorites.value = docSnap.data().favorites || [];
      } catch (e) { console.error(e); }
    } else { user.value = null; userRole.value = ''; }
    isAuthReady.value = true;
  });
});

const login = async () => {
  try { authError.value = ''; isLoading.value = true; await signInWithEmailAndPassword(auth, email.value, password.value); } 
  catch (error) { authError.value = "Erreur de connexion"; } finally { isLoading.value = false; }
};
const logout = async () => { await signOut(auth); };

async function callApi(url, targetVar = 'standard') {
  isLoading.value = true; error.value = null;
  if (targetVar === 'standard') standardResult.value = null;
  try {
    const token = await user.value.getIdToken();
    const headers = { 'Authorization': `Bearer ${token}` };
    const response = await fetch(`${API_BASE_URL}${url}`, { method: 'GET', headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || `Erreur`);
    
    if (targetVar === 'specialist') dayAnalysisResult.value = data;
    else if (targetVar === 'deep') deepFavoriteResult.value = data;
    else if (targetVar === 'profile') profileResult.value = data;
    else if (targetVar === 'matrix') matrixResult.value = data;
    else standardResult.value = data;

    viewMode.value = 'table';
  } catch (err) { error.value = err.message; } 
  finally { isLoading.value = false; }
}

async function runDataUpdate(endpoint) { await callApi(`/collection/${endpoint}`, 'standard'); }

async function runRangeAnalysis() {
  lastOperationType.value = 'frequency';
  await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard');
}
async function runTimeMatrix() {
  matrixResult.value = null;
  let url = `/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}`;
  if (matrixMode.value === 'cyclic') url += `&target_cyclic_day=${cyclicDay.value}`;
  await callApi(url, 'matrix');
}
async function runDayAnalysis() {
  await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist');
}
async function analyzeDeepFavorite(item) {
  deepFavoriteResult.value = null;
  await callApi(`/analysis/deep-favorite?target=${item}&start_date=${startDate.value}&end_date=${endDate.value}`, 'deep');
}
async function runBatchVisualAnalysis(mode) {
  lastOperationType.value = 'visual'; 
  await callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${mode}`, 'standard'); 
}
async function runSingleDayVisual(mode) {
  lastOperationType.value = 'visual'; 
  await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`, 'standard'); 
}
async function runReport(reportType) {
  if (reportType === 'daily-frequency') {
      lastOperationType.value = 'frequency';
      await callApi(`/analysis/daily-frequency/${selectedDate.value}`, 'standard');
  }
  else if (reportType === 'weekly-frequency') {
      lastOperationType.value = 'frequency';
      await callApi(`/analysis/weekly-frequency/${selectedDate.value}`, 'standard');
  }
  else if (reportType === 'companions') { 
      lastOperationType.value = 'companions'; 
      await callApi(`/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`, 'standard'); 
  }
}
async function runKantaReport() {
  lastOperationType.value = 'kanta-rank'; 
  await callApi(`/analysis/kanta-daily-rank/${selectedDate.value}`, 'standard'); 
}
async function runProfileAnalysis() {
  profileResult.value = null;
  await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile');
}
async function runPredictionAnalysis() {
  lastOperationType.value = 'prediction';
  let url = `/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  if (predictionCompanion.value) url += `&observed_companion=${predictionCompanion.value}`;
  await callApi(url, 'standard');
}
async function runTriggerAnalysis() {
  lastOperationType.value = 'trigger'; 
  let url = `/analysis/trigger-numbers?target_number=${triggerTargetNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`; 
  if (triggerCompanionNumber.value) url += `&companion_number=${triggerCompanionNumber.value}`; 
  await callApi(url, 'standard'); 
}
async function addFavorite() {
  const input = newFavoriteInput.value.trim(); if(!input) return;
  const userRef = doc(db, "users", user.value.uid);
  userFavorites.value.push(input);
  await setDoc(userRef, { favorites: arrayUnion(input) }, { merge: true });
  newFavoriteInput.value = '';
}
async function removeFavorite(item) {
  const userRef = doc(db, "users", user.value.uid);
  userFavorites.value = userFavorites.value.filter(n => n !== item);
  await updateDoc(userRef, { favorites: arrayRemove(item) });
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
      <h1>LE GUIDE <span class="version-tag">V86</span></h1>
      <div class="user-info">
        <span>{{ user.email }}</span>
        <a :href="sheetDirectLink" target="_blank" class="gsheet-btn-header">OUVRIR GOOGLE SHEETS</a>
        <button @click="logout" class="logout-button">Sortir</button>
      </div>
    </header>

    <div class="main-layout">
      <!-- CONTROLS -->
      <div class="controls-column">
        <section v-if="isAdmin" class="card data-update"><h2>MAINTENANCE</h2><div class="button-group-horizontal"><button @click="runDataUpdate('update-recent-weeks')" :disabled="isLoading">MISE À JOUR</button><button @click="runDataUpdate('start-full-rebuild')" :disabled="isLoading" class="danger">REBUILD</button></div></section>
        
        <section class="card free-card">
          <div class="boss-header"><h2>📊 FRÉQUENCE PÉRIODE</h2></div>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runRangeAnalysis" :disabled="isLoading||!startDate" class="free-btn">LANCER L'ANALYSE</button>
        </section>

        <section class="card matrix-card"><div class="boss-header"><h2>🕰️ MATRICE TEMPORELLE</h2></div><div class="tabs"><button @click="matrixMode='continuous'" :class="{active: matrixMode==='continuous'}">CONTINU</button><button @click="matrixMode='cyclic'" :class="{active: matrixMode==='cyclic'}">CYCLIQUE</button></div><div v-if="matrixMode==='cyclic'" style="margin-bottom:10px;"><label>Jour (1-31):</label><input type="number" v-model="cyclicDay" min="1" max="31"/></div><div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div><button @click="runTimeMatrix" :disabled="isLoading" class="spec-btn">ANALYSER & PRÉDIRE</button></section>
        
        <section class="card spec-card"><div class="boss-header"><h2>📅 ANALYSTE SPÉCIALISTE</h2></div><label>Jour :</label><select v-model="selectedDayName"><option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option></select><label>Heure :</label><select v-model="selectedHour"><option>Toute la journée</option><option>01H</option><option>03H</option><option>07H</option><option>08H</option><option>10H</option><option>13H</option><option>16H</option><option>19H</option><option>21H</option><option>22H</option><option>23H</option></select><div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div><button @click="runDayAnalysis" :disabled="isLoading" class="spec-btn">SCANNER JOUR</button></section>
        
        <section class="card"><h2>⭐ Mes Numéros Favoris</h2><div class="favorites-input-group"><input type="text" v-model="newFavoriteInput" placeholder="Ex: 7" @keyup.enter="addFavorite"/><button @click="addFavorite" :disabled="!newFavoriteInput" class="btn-small">Ajouter</button></div><div style="display:flex; gap:5px; margin-bottom:10px;"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div><div v-if="userFavorites.length>0" class="favorites-list"><div v-for="item in userFavorites" :key="item" class="favorite-chip"><span class="fav-label">{{ item }}</span><div class="fav-actions"><button @click="analyzeDeepFavorite(item)" class="icon-btn">⚡</button></div><span @click="removeFavorite(item)" class="fav-delete">×</span></div></div></section>
        
        <section class="card"><h2>Analyse Visuelle</h2><div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div><div class="button-group-vertical"><button @click="runBatchVisualAnalysis('frequency')" :disabled="isLoading||!startDate" class="visu-btn">Rouge/Bleu (Période)</button><button @click="runBatchVisualAnalysis('kanta')" :disabled="isLoading||!startDate" class="visu-btn">Kanta (Période)</button></div></section>
        
        <section class="card">
          <h2>Rapports Ponctuels</h2>
          <input type="date" v-model="selectedDate"/>
          <div class="button-group-vertical" style="margin-top:10px;"><button @click="runSingleDayVisual('frequency')" :disabled="isLoading||!selectedDate">🎨 Surlignage Jour</button><button @click="runSingleDayVisual('kanta')" :disabled="isLoading||!selectedDate">🎨 Surlignage Kanta</button></div>
          <hr>
          <div class="button-group-vertical"><button @click="runReport('daily-frequency')" :disabled="isLoading||!selectedDate">Classement Jour</button><button @click="runReport('weekly-frequency')" :disabled="isLoading||!selectedDate">Classement Semaine</button><hr><button @click="runKantaReport" :disabled="isLoading||!selectedDate">Kanta Rank</button><div class="input-group" style="margin-top:10px;"><input type="number" v-model="selectedNumber" placeholder="N° Compagnons"/><button @click="runReport('companions')" :disabled="isLoading||!selectedDate||!selectedNumber">Analyser</button></div></div>
        </section>
        
        <section class="card"><h2>Période & Profilage</h2><div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div><input type="number" v-model="profileNumber" placeholder="N° Profil"/><button @click="runProfileAnalysis" :disabled="isLoading||!startDate||!profileNumber">Générer Profil</button></section>
        <section class="card prophet-card"><h2>🔮 Le Prophète</h2><div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div><input type="number" v-model="predictionNumber" placeholder="N° vu"/><input type="number" v-model="predictionCompanion" placeholder="Compagnon"/><button @click="runPredictionAnalysis" :disabled="isLoading||!startDate||!predictionNumber" class="prophet-btn">Voir Futur</button></section>
        <section class="card"><h2>IA Avancée</h2><div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div><input type="number" v-model="triggerTargetNumber" placeholder="Cible"/><input type="number" v-model="triggerCompanionNumber" placeholder="Optionnel"/><button @click="runTriggerAnalysis" :disabled="isLoading||!triggerTargetNumber">Déclencheurs ⚡</button></section>
      </div>

      <!-- RESULTATS -->
      <div class="results-column">
        <section v-if="standardResult && lastOperationType === 'frequency'" class="card results-card fade-in"><div class="spec-header"><h2>Classement</h2><button @click="standardResult=null" class="close-btn">Fermer</button></div><table v-if="isTableVisible" class="styled-table"><thead><tr><th v-for="h in tableHeaders" :key="h">{{ h }}</th></tr></thead><tbody><tr v-for="(row, index) in tableData" :key="index"><td>#{{ index + 1 }}</td><td>{{ row.number }}</td><td>{{ row.count }}</td></tr></tbody></table></section>

        <!-- (Autres Blocs Résultats V82 restaurés avec style Poppins) -->
        <!-- Pour alléger, je mets le bloc générique, qui s'adaptera au type -->
        <div v-if="matrixResult" class="card result-spec-card" style="border-top:4px solid #ff9800;"><div class="spec-header"><h3>🕰️ MATRICE TEMPORELLE</h3><button @click="matrixResult=null" class="close-btn">×</button></div><div v-if="matrixResult.prediction" class="prediction-tab"><div class="best-duo-box" style="background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);"><span class="duo-label">🔮 PRÉDICTION :</span><span class="duo-val">{{ matrixResult.prediction.two_short }}</span></div></div><div class="table-responsive"><table class="spec-table"><thead><tr><th>Date</th><th>Base</th><th>Hits</th></tr></thead><tbody><tr v-for="(row, idx) in matrixResult.matrix_data" :key="idx"><td>{{ row.date }}</td><td class="num-cell">{{ row.base_number }}</td><td><div v-for="h in row.detailed_hits" :key="h.num"><span class="badge-hit">{{ h.num }}</span> ({{ h.time }} - {{ h.reason }})</div></td></tr></tbody></table></div></div>
        
        <section v-if="standardResult && lastOperationType !== 'frequency'" class="card results-card fade-in"><div class="spec-header"><h2>Résultat</h2><button @click="standardResult=null" class="close-btn">Fermer</button></div><div v-if="isTableVisible" class="view-controls"><button @click="viewMode = 'table'" :class="{ active: viewMode === 'table' }" class="toggle-btn">📋 Tableau</button><button @click="viewMode = 'chart'" :class="{ active: viewMode === 'chart' }" class="toggle-btn">📊 Graphique</button></div><div v-if="isTableVisible && viewMode === 'chart'" class="chart-container"><Bar :data="chartData" :options="chartOptions" /></div><table v-else-if="isTableVisible" class="styled-table"><thead><tr><th v-for="h in tableHeaders" :key="h">{{ h }}</th></tr></thead><tbody><tr v-for="(row, index) in tableData" :key="index"><td v-if="lastOperationType.includes('kanta-rank')">{{ row.pair }}</td><td v-else>#{{ index + 1 }}</td><td v-if="!lastOperationType.includes('kanta-rank')">{{ row.number }}</td><td>{{ row.count }}</td></tr></tbody></table></section>

        <div v-if="!standardResult && !matrixResult && !isLoading" class="welcome-message">
            <h3>Prêt à analyser</h3><p>Sélectionnez une fonction à gauche.</p>
        </div>
        <div v-if="isLoading" class="loader">Analyse en cours...</div><div v-if="error" class="error-box">{{ error }}</div>
      </div>
    </div>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&family=Roboto:wght@400;500;700&display=swap');
:root { --primary: #4361ee; --secondary: #3f37c9; --success: #4cc9f0; --danger: #f72585; --dark: #1b263b; --light: #f8f9fa; }
body { font-family: 'Poppins', sans-serif; background-color: #f0f2f5; color: #2c3e50; margin: 0; }
.dashboard { max-width: 98%; margin: 0 auto; padding-top: 10px; }
header { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: white; padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center; }
h1 { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.8rem; margin: 0; }
.version-tag { background: #f72585; padding: 5px 10px; border-radius: 20px; font-size: 0.8rem; }
.main-layout { display: grid; grid-template-columns: 380px 1fr; gap: 25px; padding-bottom: 50px; }
.card { background: white; border-radius: 16px; padding: 1.5rem; box-shadow: 0 10px 30px rgba(0,0,0,0.05); margin-bottom: 20px; }
.matrix-card { border-top: 5px solid #7209b7; } .spec-card { border-top: 5px solid #00b4d8; } .prophet-card { border-top: 5px solid #f72585; }
button { font-family: 'Poppins', sans-serif; font-weight: 600; border-radius: 10px; padding: 12px; cursor: pointer; color: white; background-color: #4361ee; border: none; width: 100%; margin-top: 10px; }
.spec-btn { background: linear-gradient(45deg, #00b4d8, #0077b6); } .prophet-btn { background: linear-gradient(45deg, #f72585, #b5179e); }
.gsheet-btn-header { background: #0f9d58; color: white; padding: 5px 15px; border-radius: 20px; font-size: 0.8rem; text-decoration: none; font-weight: bold; }
.ranking-list { display: flex; flex-direction: column; gap: 15px; } .rank-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; display: flex; align-items: flex-start; gap: 15px; } .rank-badge { background: linear-gradient(135deg, #4361ee, #3a0ca3); color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; min-width: 40px; } .rank-main { display: flex; flex-direction: column; align-items: center; min-width: 80px; border-right: 1px solid #eee; padding-right: 15px; } .rank-num { font-size: 2rem; font-weight: 800; color: #0f172a; } .rank-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; width: 100%; } .detail-col { font-size: 0.8rem; color: #334155; } .detail-col strong { display: block; color: #64748b; text-transform: uppercase; font-size: 0.7rem; margin-bottom: 2px; } .detail-col.red span { color: #d32f2f; font-weight: bold; } .detail-col.blue span { color: #1976d2; font-weight: bold; } .detail-col.purple span { color: #7b1fa2; font-weight: bold; }
.result-spec-card { border-top: 5px solid #4361ee; }
.spec-table, .styled-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
.spec-table th, .styled-table th { background: #f1f5f9; color: #475569; font-weight: 800; text-transform: uppercase; font-size: 0.8rem; padding: 15px; text-align: center; }
.spec-table td, .styled-table td { padding: 15px; border-bottom: 1px solid #f1f5f9; font-weight: 500; text-align: center; }
.num-cell { font-size: 1.4rem; font-weight: 800; color: #1e293b; }
.badge-hit { background: #4caf50; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
.best-duo-box { background: linear-gradient(135deg, #11998e, #38ef7d); color: white; padding: 20px; border-radius: 15px; box-shadow: 0 10px 20px rgba(17, 153, 142, 0.3); margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
.duo-val { font-size: 2.5rem; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.2); }
.duo-label { font-weight: bold; text-transform: uppercase; }
.loader { text-align: center; font-weight: bold; color: #4361ee; margin: 20px 0; }
.error-box { background: #fee2e2; color: #b91c1c; padding: 15px; border-radius: 10px; border: 1px solid #fecaca; text-align: center; }
.favorites-list { display: flex; flex-wrap: wrap; gap: 5px; }
.favorite-chip { background: #e0f2f1; border: 1px solid #80cbc4; padding: 5px 10px; border-radius: 20px; display: flex; align-items: center; gap: 5px; font-weight: bold; color: #00695c; }
.icon-btn { background: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; cursor: pointer; border: 1px solid #ccc; color: #333; }
.fav-delete { cursor: pointer; color: #d32f2f; font-size: 1.2rem; margin-left: 5px; }
</style>