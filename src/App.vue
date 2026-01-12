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
const profileNumber = ref('');
const triggerInput = ref(''); 

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
  if (lastOperationType.value.includes('frequency')) return ['#', 'Numéro', 'Sorties', 'Détails'];
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
  if (standardResult.value?.data) return standardResult.value.data;
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
    counts.push(row.count || row.total_hits);
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
  const startStr = `${oneMonthAgo.getFullYear()}-${(oneMonthAgo.getMonth()+1).toString().padStart(2,'0')}-${oneMonthAgo.getDate().toString().padStart(2,'0')}`;
  startDate.value = startStr;

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      user.value = firebaseUser;
      await refreshUserProfile();
    } else { 
      user.value = null; 
      userRole.value = ''; 
      userFavorites.value = []; 
      localStorage.removeItem('session_id');
    }
    isAuthReady.value = true;
  });
});

async function refreshUserProfile() {
  if (!user.value) return;
  const docRef = doc(db, "users", user.value.uid);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      userRole.value = data.role || 'user';
      userFavorites.value = data.favorites || []; 
    }
  } catch (e) { console.error("Erreur Sync Profil:", e); }
}

const login = async () => {
  try { 
    authError.value = ''; 
    isLoading.value = true; 
    const userCredential = await signInWithEmailAndPassword(auth, email.value, password.value);
    
    // ANTI-PARTAGE V100
    const newSessionId = crypto.randomUUID();
    localStorage.setItem('session_id', newSessionId);
    
    await updateDoc(doc(db, "users", userCredential.user.uid), {
      current_session_id: newSessionId,
      last_login: new Date().toISOString()
    });
  } catch (error) { 
    authError.value = "Email ou mot de passe incorrect."; 
  } finally { 
    isLoading.value = false; 
  }
};

const logout = async () => { 
  localStorage.removeItem('session_id');
  await signOut(auth); 
};

// --- APPELS API SÉCURISÉS ---
async function callApi(url, targetVar = 'standard') {
  showWelcomeMessage.value = false; 
  isLoading.value = true; 
  error.value = null;
  if (targetVar === 'standard') standardResult.value = null;
  
  try {
    const token = await user.value.getIdToken();
    const sessionId = localStorage.getItem('session_id');
    const headers = { 
      'Authorization': `Bearer ${token}`,
      'X-Session-ID': sessionId 
    };
    
    const fullUrl = `${API_BASE_URL}${url}`;
    const response = await fetch(fullUrl, { method: 'GET', headers });
    const data = await response.json();
    
    if (!response.ok) {
        if (data.detail === "SESSION_EXPIRED_ANOTHER_DEVICE") {
            alert("⚠️ SESSION TERMINÉE : Votre compte a été ouvert sur un autre appareil.");
            logout();
            return;
        }
        if (response.status === 402 || response.status === 403) {
            throw new Error(`👑 VIP : ${data.detail || 'Abonnement requis.'}`);
        }
        throw new Error(data.detail || `Erreur ${response.status}`);
    }
    
    if (targetVar === 'specialist') dayAnalysisResult.value = data;
    else if (targetVar === 'deep') deepFavoriteResult.value = data;
    else if (targetVar === 'profile') profileResult.value = data;
    else if (targetVar === 'matrix') matrixResult.value = data;
    else standardResult.value = data;

    if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
    viewMode.value = 'table';
  } catch (err) { error.value = err.message; } 
  finally { isLoading.value = false; }
}

// --- LOGIQUE MÉTIER ---
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
  } catch (e) { alert("Erreur favoris."); }
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
  if (!startDate.value || !endDate.value) { alert("Dates requises."); return; }
  deepFavoriteResult.value = null;
  await callApi(`/analysis/deep-favorite?target=${item}&start_date=${startDate.value}&end_date=${endDate.value}&context_day=${favDayName.value}&context_hour=${favHour.value}`, 'deep');
}

async function runTimeMatrix() {
  matrixResult.value = null;
  let url = `/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}`;
  if (matrixMode.value === 'cyclic') url += `&target_cyclic_day=${cyclicDay.value}`;
  await callApi(url, 'matrix');
}

async function runDataUpdate(endpoint) { lastOperationType.value = 'update'; await callApi(`/collection/${endpoint}`, 'standard'); }
async function runBatchVisualAnalysis(mode) { if (!startDate.value) return; lastOperationType.value = 'visual'; await callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${mode}`, 'standard'); }

async function runSingleDayVisual(mode) { 
  if (!selectedDate.value) return;
  lastOperationType.value = 'visual'; 
  await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`, 'standard'); 
}

async function runReport(reportType) {
  if (!selectedDate.value) return;
  if (reportType === 'daily-frequency') {
      lastOperationType.value = 'ranking_rich';
      await callApi(`/analysis/daily-frequency/${selectedDate.value}`, 'standard');
  } else if (reportType === 'weekly-frequency') {
      lastOperationType.value = 'ranking_rich';
      await callApi(`/analysis/weekly-frequency/${selectedDate.value}`, 'standard');
  }
}

async function runRangeAnalysis() {
  if (!startDate.value) return;
  lastOperationType.value = 'ranking_rich';
  await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard');
}

async function runProfileAnalysis() {
  if (!profileNumber.value) return;
  lastOperationType.value = 'profile';
  profileResult.value = null;
  await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile');
}

async function runDayAnalysis() { if (!startDate.value) return; await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist'); }

async function runTriggerAnalysis() { 
  if (!triggerInput.value) return; 
  lastOperationType.value = 'simple'; 
  const parts = triggerInput.value.replace(/[^0-9]/g, ' ').trim().split(/\s+/);
  let url = `/analysis/trigger-numbers?target_number=${parts[0]}&start_date=${startDate.value}&end_date=${endDate.value}`; 
  if (parts.length > 1) url += `&companion_number=${parts[1]}`; 
  await callApi(url, 'standard'); 
}

async function runPredictionAnalysis() { if (!predictionNumber.value) return; lastOperationType.value = 'simple'; let url = `/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`; if (predictionCompanion.value) url += `&observed_companion=${predictionCompanion.value}`; await callApi(url, 'standard'); }

async function runKantaReport() { 
  if (!selectedDate.value) return;
  lastOperationType.value = 'simple'; 
  await callApi(`/analysis/kanta-daily-rank?date_str=${selectedDate.value}`, 'standard'); 
}
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen"><div class="spinner"></div><p>Connexion sécurisée...</p></div>
  
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <div class="logo-area">🎯</div>
      <h2>FOURCASTER <span style="color:#4361ee">PRO</span></h2>
      <p class="login-subtitle">Intelligence de jeu V100</p>
      <form @submit.prevent="login">
        <div class="input-group"><label>Email</label><input type="email" v-model="email" required /></div>
        <div class="input-group"><label>Mot de passe</label><input type="password" v-model="password" required /></div>
        <button type="submit" class="login-button" :disabled="isLoading">{{ isLoading ? 'Vérification...' : 'Se Connecter' }}</button>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
      </form>
    </div>
  </div>

  <main v-else class="dashboard">
    <header>
        <div class="brand"><h1>FOURCASTER V100</h1><span class="status-indicator">● Session Active</span></div>
        <div class="user-info"><span>{{ user.email }}</span><button @click="logout" class="logout-button">Quitter</button></div>
    </header>

    <div class="main-layout">
      <!-- SIDEBAR -->
      <div class="controls-column">
        <div v-if="error && error.includes('VIP')" class="vip-banner">🌟 <strong>{{ error }}</strong></div>

        <section v-if="isAdmin" class="card admin-card">
            <h2>🛠️ Maintenance</h2>
            <div class="button-group-horizontal">
                <button @click="runDataUpdate('update-recent-weeks')">Update</button>
                <button @click="runDataUpdate('start-full-rebuild')" class="danger">Rebuild</button>
            </div>
        </section>
        
        <section class="card matrix-card">
            <div class="boss-header"><h2>🕰️ MATRICE</h2><span class="badge-spec">VIP</span></div>
            <div class="tabs"><button @click="matrixMode='continuous'" :class="{active: matrixMode==='continuous'}">CONTINU</button><button @click="matrixMode='cyclic'" :class="{active: matrixMode==='cyclic'}">CYCLIQUE</button></div>
            <input v-if="matrixMode==='cyclic'" type="number" v-model="cyclicDay" placeholder="Jour (1-31)"/>
            <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
            <button @click="runTimeMatrix" class="spec-btn orange">ANALYSER & PRÉDIRE</button>
        </section>
        
        <section class="card sniper-card">
            <div class="boss-header"><h2>📅 SNIPER</h2><span class="badge-spec">VIP</span></div>
            <select v-model="selectedDayName"><option v-for="d in ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']" :key="d">{{d}}</option></select>
            <select v-model="selectedHour"><option>Toute la journée</option><option v-for="h in ['07H','10H','13H','16H','19H','21H','23H']" :key="h">{{h}}</option></select>
            <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
            <button @click="runDayAnalysis" class="spec-btn blue">SCANNER LE JOUR</button>
        </section>
        
        <section class="card fav-card">
            <h2>⭐ FAVORIS</h2>
            <div class="favorites-input-group"><input type="text" v-model="newFavoriteInput" placeholder="N° ou Paire"/><button @click="addFavorite">Add</button></div>
            <div class="favorites-list">
                <div v-for="item in userFavorites" :key="item" class="favorite-chip">
                    {{ item }} <button @click="analyzeDeepFavorite(item)" class="mini-btn">⚡</button><span @click="removeFavorite(item)" class="close-x">×</span>
                </div>
            </div>
        </section>

        <section class="card">
          <h2>📊 RAPPORTS</h2>
          <input type="date" v-model="selectedDate"/>
          <div class="button-group-vertical" style="margin-top:10px;">
            <button @click="runReport('daily-frequency')">Top 10 Jour</button>
            <button @click="runReport('weekly-frequency')">Top 10 Semaine</button>
            <button @click="runKantaReport">Kanta du jour</button>
          </div>
        </section>

        <section class="card prophet-card">
            <h2>🔮 PROPHÈTE</h2>
            <div class="input-pair"><input type="number" v-model="predictionNumber" placeholder="N°"/><input type="number" v-model="predictionCompanion" placeholder="Cible"/></div>
            <button @click="runPredictionAnalysis" class="prophet-btn">VOIR FUTUR</button>
        </section>
      </div>

      <!-- MAIN PANEL -->
      <div class="results-column">
        <div class="quick-link-box"><a :href="sheetDirectLink" target="_blank" class="gsheet-btn">📂 DATABASE GOOGLE SHEETS</a></div>
        <div v-if="error && !error.includes('VIP')" class="error-box">{{ error }}</div>
        <div v-if="isLoading" class="loader-container"><div class="spinner"></div><p>Calculs stratégiques...</p></div>

        <!-- MATRIX RESULT -->
        <div v-if="matrixResult" class="card result-card">
           <div class="spec-header"><h3>🕰️ MATRICE : {{ matrixResult.mode }}</h3><button @click="matrixResult=null">×</button></div>
           <div v-if="matrixResult.prediction" class="best-duo-box matrix-gradient">
               <span class="duo-label">🔮 PRÉDICTION {{ matrixResult.prediction.target_date_label }} :</span>
               <span class="duo-val">{{ matrixResult.prediction.two_short }}</span>
           </div>
           <div class="table-responsive">
               <table class="spec-table">
                   <thead><tr><th>Date</th><th>Base</th><th>Résultats</th></tr></thead>
                   <tbody>
                       <tr v-for="(row, idx) in matrixResult.matrix_data" :key="idx">
                           <td>{{ row.date }}</td><td>{{ row.base_number }}</td>
                           <td><span v-for="h in row.detailed_hits" :key="h.num" class="badge-hit">{{ h.num }}</span></td>
                       </tr>
                   </tbody>
               </table>
           </div>
        </div>

        <!-- SNIPER RESULT -->
        <div v-if="dayAnalysisResult" class="card result-card">
          <div class="spec-header"><h3>📊 ANALYSE : {{ dayAnalysisResult.day_analyzed }}</h3><button @click="dayAnalysisResult=null">×</button></div>
          <div class="best-duo-box sniper-gradient"><span class="duo-label">🔥 DUO D'OR :</span><span class="duo-val">{{ dayAnalysisResult.best_duo }}</span></div>
          <table class="spec-table">
              <thead><tr><th>État</th><th>N°</th><th>Kanta</th><th>Compagnons</th></tr></thead>
              <tbody>
                  <tr v-for="row in dayAnalysisResult.recurrence_data" :key="row.number">
                      <td>{{ row.status }}</td><td class="num-cell">{{ row.number }}</td><td>{{ row.kanta }}</td><td>{{ row.best_companion }}</td>
                  </tr>
              </tbody>
          </table>
        </div>

        <div v-if="!matrixResult && !dayAnalysisResult && !isLoading" class="welcome-message">🎯 Sélectionnez une analyse.</div>
      </div>
    </div>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&display=swap');

:root { --primary: #4361ee; --dark: #1e293b; --light: #f8fafc; }
body { font-family: 'Poppins', sans-serif; background: var(--light); margin: 0; }
.dashboard { max-width: 1400px; margin: 0 auto; padding: 10px; }

header { background: var(--dark); color: white; padding: 15px 25px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.brand h1 { font-size: 1.2rem; margin: 0; }
.status-indicator { font-size: 0.7rem; color: #4ade80; }
.logout-button { background: #ef4444; border: none; color: white; padding: 5px 15px; border-radius: 6px; cursor: pointer; }

.main-layout { display: grid; grid-template-columns: 350px 1fr; gap: 20px; }
.login-wrapper { display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; }
.login-box { background: white; padding: 40px; border-radius: 20px; width: 350px; text-align: center; }
.logo-area { font-size: 3rem; margin-bottom: 10px; }
.login-button { width: 100%; background: var(--primary); color: white; padding: 12px; border: none; border-radius: 8px; margin-top: 20px; cursor: pointer; }

.card { background: white; border-radius: 12px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
.card h2 { font-size: 0.9rem; margin-top: 0; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }

input, select { width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 10px; }
.date-picker-row { display: flex; gap: 8px; }
.spec-btn { width: 100%; padding: 12px; border: none; border-radius: 8px; color: white; font-weight: 800; cursor: pointer; }
.orange { background: #f59e0b; }
.blue { background: #3b82f6; }
.danger { background: #ef4444; color: white; }

.vip-banner { background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-size: 0.8rem; }
.badge-spec { background: #4361ee; color: white; font-size: 0.6rem; padding: 2px 6px; border-radius: 4px; }

.best-duo-box { border-radius: 12px; padding: 20px; color: white; display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.matrix-gradient { background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); }
.sniper-gradient { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); }
.duo-val { font-size: 2.5rem; font-weight: 800; }

.spec-table { width: 100%; border-collapse: collapse; }
.spec-table th { text-align: left; padding: 10px; font-size: 0.7rem; color: #94a3b8; border-bottom: 1px solid #f1f5f9; }
.spec-table td { padding: 12px 10px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }
.num-cell { font-weight: 800; font-size: 1.1rem; color: var(--dark); }
.badge-hit { background: #fef3c7; color: #b45309; padding: 2px 6px; border-radius: 4px; font-weight: 800; margin-right: 4px; }

.spinner { width: 30px; height: 30px; border: 3px solid #f3f3f3; border-top: 3px solid var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 20px auto; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.gsheet-btn { background: #10b981; color: white; padding: 10px 20px; border-radius: 25px; text-decoration: none; font-size: 0.8rem; font-weight: 700; display: inline-block; margin-bottom: 15px; }
.welcome-message { text-align: center; padding: 100px; color: #94a3b8; }
.error-box { background: #fef2f2; color: #b91c1c; padding: 12px; border-radius: 8px; margin-bottom: 15px; }

/* Responsive adjustments for mobile */
@media (max-width: 800px) {
  .main-layout { grid-template-columns: 1fr; }
  .dashboard { padding: 5px; }
  .controls-column { order: 2; }
  .results-column { order: 1; }
}
</style>