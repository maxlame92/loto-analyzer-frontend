<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, collection, getDocs, query, limit } from "firebase/firestore";
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const GOOGLE_SHEET_ID = "1HepqMzKcshKbRsLWwpEOOy5oO9ntK2CgdV7F_ijmjIo";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// --- ÉTATS ---
const user = ref(null);
const userRole = ref('');
const subscriptionEnd = ref('');
const email = ref('');
const password = ref('');
const authError = ref('');
const isAuthReady = ref(false);
const isLoginMode = ref(true); 
const totalUsersCount = ref(0);
const USER_LIMIT = 50;

// Compteur de tentatives par fonction (Limite 3)
const usageCounts = ref({ matrix: 0, sniper: 0, favorite: 0, visual: 0, report: 0, profile: 0, prophet: 0, trigger: 0 });

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
const viewMode = ref('table');
const lastOperationType = ref('');

// --- CALCULS ---
const isAdmin = computed(() => userRole.value === 'admin');
const isVIP = computed(() => subscriptionEnd.value !== '' || isAdmin.value);
const isLimitReached = computed(() => totalUsersCount.value >= USER_LIMIT);
const sheetDirectLink = computed(() => `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/edit${activeSheetGid.value ? '#gid=' + activeSheetGid.value : ''}`);

// --- SÉCURITÉ : LIMITE 3 CLICS ---
function checkUsage(type) {
  if (isVIP.value) return true;
  if (usageCounts.value[type] >= 3) {
    alert("CONTACTER L'EXPERT POUR VOUS ABONEZ : 📞 +225 0749522365 ou 📞 +225 0102275973 POUR AVOIR ACCES ET BENEFICIER DETOUT LES FONCTION - MR ABOUCHO MAX ELISER.");
    return false;
  }
  usageCounts.value[type]++;
  return true;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

const tableHeaders = computed(() => {
  if (!lastOperationType.value) return [];
  if (lastOperationType.value.includes('frequency')) return ['#', 'Numéro', 'Sorties', 'Détails'];
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
  if (standardResult.value?.data) return standardResult.value.data;
  return [];
});
const isTableVisible = computed(() => tableData.value.length > 0);

const chartOptions = { responsive: true, maintainAspectRatio: false };
const chartData = computed(() => {
  const data = tableData.value;
  if (!data || data.length === 0) return null;
  const labels = data.slice(0, 15).map(r => r.pair || r.number || r.companion || '?');
  const counts = data.slice(0, 15).map(r => r.count || r.total_hits);
  return { labels, datasets: [{ label: 'Occurrences', backgroundColor: '#4361ee', data: counts }] };
});

// --- INITIALISATION ---
onMounted(async () => {
  const today = new Date();
  selectedDate.value = today.toISOString().split('T')[0];
  endDate.value = selectedDate.value;
  const lastM = new Date(); lastM.setMonth(lastM.getMonth() - 1);
  startDate.value = lastM.toISOString().split('T')[0];

  try {
    const snap = await getDocs(query(collection(db, "users"), limit(100)));
    totalUsersCount.value = snap.size;
  } catch (e) { console.warn("Compteur désactivé."); }

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      if (!localStorage.getItem('session_id')) { logout(); return; }
      user.value = firebaseUser;
      const docRef = doc(db, "users", firebaseUser.uid);
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          userRole.value = data.role || 'user';
          userFavorites.value = data.favorites || []; 
          subscriptionEnd.value = data.subscription_end || '';
        }
      } catch (e) { console.error(e); }
    } else { user.value = null; userRole.value = ''; userFavorites.value = []; subscriptionEnd.value = ''; localStorage.removeItem('session_id'); }
    isAuthReady.value = true;
  });
});

// --- ACTIONS AUTH ---
const login = async () => {
  try {
    isLoading.value = true; authError.value = '';
    const userCredential = await signInWithEmailAndPassword(auth, email.value, password.value);
    const newSessionId = crypto.randomUUID();
    localStorage.setItem('session_id', newSessionId);
    await updateDoc(doc(db, "users", userCredential.user.uid), { current_session_id: newSessionId });
  } catch (error) { authError.value = "Identifiants incorrects."; } finally { isLoading.value = false; }
};

const signup = async () => {
  if (isLimitReached.value) { authError.value = "Désolé, la limite de 50 inscrits est atteinte."; return; }
  try {
    isLoading.value = true; authError.value = '';
    const userCredential = await createUserWithEmailAndPassword(auth, email.value, password.value);
    const sid = crypto.randomUUID();
    localStorage.setItem('session_id', sid);
    await setDoc(doc(db, "users", userCredential.user.uid), { email: email.value, role: 'user', favorites: [], subscription_end: null, current_session_id: sid, created_at: new Date().toISOString() });
  } catch (error) { authError.value = "Erreur inscription."; } finally { isLoading.value = false; }
};

const logout = async () => { localStorage.removeItem('session_id'); await signOut(auth); };

// --- API ENGINE ---
async function callApi(url, targetVar = 'standard') {
  showWelcomeMessage.value = false; isLoading.value = true; error.value = null;
  try {
    const token = await user.value.getIdToken();
    const sid = localStorage.getItem('session_id');
    const res = await fetch(`${API_BASE_URL}${url}`, { headers: { 'Authorization': `Bearer ${token}`, 'X-Session-ID': sid } });
    const data = await res.json();
    if (!res.ok) {
        if (data.detail === "SESSION_EXPIRED_ANOTHER_DEVICE") { alert("⚠️ Compte utilisé ailleurs !"); logout(); return; }
        throw new Error(data.detail || "Erreur");
    }
    if (targetVar === 'specialist') dayAnalysisResult.value = data;
    else if (targetVar === 'deep') deepFavoriteResult.value = data;
    else if (targetVar === 'profile') profileResult.value = data;
    else if (targetVar === 'matrix') matrixResult.value = data;
    else standardResult.value = data;
    if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
    viewMode.value = 'table';
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

// --- APPELS FONCTIONS ---
async function runTimeMatrix() { if(!checkUsage('matrix')) return; matrixResult.value = null; await callApi(`/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}${matrixMode.value==='cyclic'?'&target_cyclic_day='+cyclicDay.value:''}`, 'matrix'); }
async function runDayAnalysis() { if(!checkUsage('sniper')) return; await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist'); }
async function runReport(type) {
  if(!checkUsage('report')) return;
  if (type === 'daily-frequency') { lastOperationType.value = 'ranking_rich'; await callApi(`/analysis/daily-frequency/${selectedDate.value}`, 'standard'); }
  else if (type === 'weekly-frequency') { lastOperationType.value = 'ranking_rich'; await callApi(`/analysis/weekly-frequency/${selectedDate.value}`, 'standard'); }
  else if (type === 'companions') { lastOperationType.value = 'simple'; await callApi(`/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`, 'standard'); }
}
async function runRangeAnalysis() { if(!checkUsage('report')) return; lastOperationType.value = 'ranking_rich'; await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard'); }
async function runProfileAnalysis() { if(!checkUsage('profile')) return; lastOperationType.value = 'profile'; await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile'); }
async function runTriggerAnalysis() { if(!checkUsage('trigger')) return; lastOperationType.value = 'simple'; const parts = triggerInput.value.split(' '); await callApi(`/analysis/trigger-numbers?target_number=${parts[0]}&start_date=${startDate.value}&end_date=${endDate.value}`, 'standard'); }
async function runPredictionAnalysis() { if(!checkUsage('prophet')) return; lastOperationType.value = 'simple'; await callApi(`/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}${predictionCompanion.value?'&observed_companion='+predictionCompanion.value:''}`, 'standard'); }
async function runKantaReport() { if(!checkUsage('report')) return; lastOperationType.value = 'simple'; await callApi(`/analysis/kanta-daily-rank?date_str=${selectedDate.value}`, 'standard'); }
async function runSingleDayVisual(mode) { if(!isAdmin.value) return; await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`, 'standard'); }
async function runBatchVisualAnalysis(mode) { if(!isAdmin.value) return; await callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${mode}`, 'standard'); }
async function addFavorite() { if(!checkUsage('favorite')) return; if(newFavoriteInput.value) { await updateDoc(doc(db,"users",user.value.uid), {favorites: arrayUnion(newFavoriteInput.value)}); userFavorites.value.push(newFavoriteInput.value); newFavoriteInput.value=''; } }
async function removeFavorite(i) { await updateDoc(doc(db,"users",user.value.uid), {favorites: arrayRemove(i)}); userFavorites.value = userFavorites.value.filter(f=>f!==i); }
async function analyzeDeepFavorite(i) { if(!checkUsage('favorite')) return; deepFavoriteResult.value=null; await callApi(`/analysis/deep-favorite?target=${i}&start_date=${startDate.value}&end_date=${endDate.value}`, 'deep'); }
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen"><p>Chargement Premium...</p></div>
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2>LE GUIDE DES FOURCASTER</h2>
      <p style="color:#64748b; margin-bottom:15px;">{{ isLoginMode ? 'Connexion' : 'S\'inscrire (Gratuit)' }}</p>
      <form @submit.prevent="isLoginMode ? login() : signup()">
        <div class="input-group"><label>Email</label><input type="email" v-model="email" required /></div>
        <div class="input-group"><label>Mot de passe</label><input type="password" v-model="password" required /></div>
        <button type="submit" class="login-button">{{ isLoading ? '...' : (isLoginMode ? 'CONNEXION' : 'S\'INSCRIRE') }}</button>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
        <p class="toggle-auth" @click="isLoginMode = !isLoginMode">{{ isLoginMode ? 'Pas de compte ? S\'inscrire' : 'Déjà membre ? Se connecter' }}</p>
      </form>
    </div>
  </div>

  <main v-else class="dashboard">
    <header>
      <h1>LE GUIDE <span class="version-tag">V100 PRO</span></h1>
      <div class="user-info">
        <div class="sub-status">
            <span class="user-email">{{ user.email }}</span>
            <span v-if="subscriptionEnd" class="expiry-text">💎 VIP jusqu'au: {{ formatDate(subscriptionEnd) }}</span>
            <span v-else class="free-text">❄️ ESSAI GRATUIT (3 essais)</span>
        </div>
        <button @click="logout" class="logout-button">Quitter</button>
      </div>
    </header>

    <div class="contact-banner">
      📞 POUR VOUS ABONNER, CONTACTEZ : <span>+225 0749522365</span> ou <span>+225 0102275973</span> - <strong>MR ABOUCHO MAX ELISER</strong>
    </div>

    <div class="main-layout">
      <!-- SIDEBAR AVEC SCROLLBAR -->
      <div class="controls-column">
        <!-- ADMIN AREA -->
        <section v-if="isAdmin" class="card admin-card">
          <h2>🛠️ ADMINISTRATION (STRICT)</h2>
          <a :href="sheetDirectLink" target="_blank" class="gsheet-btn">📂 OUVRIR GOOGLE SHEETS</a>
          <hr>
          <label>Batch Couleurs :</label>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runBatchVisualAnalysis('frequency')" style="background:#ef5350;">Batch Fréq</button>
          <button @click="runBatchVisualAnalysis('kanta')" style="background:#66bb6a;">Batch Kanta</button>
          <hr>
          <input type="date" v-model="selectedDate"/>
          <button @click="runSingleDayVisual('frequency')" style="border:1px solid #ef5350; background:transparent; color:#d32f2f;">🎨 Surligner Jour</button>
        </section>

        <section class="card matrix-card">
          <div class="boss-header"><h2>🕰️ MATRICE TEMPORELLE</h2><span class="badge-spec">VIP</span></div>
          <div class="tabs"><button @click="matrixMode='continuous'" :class="{active: matrixMode==='continuous'}">CONTINU</button><button @click="matrixMode='cyclic'" :class="{active: matrixMode==='cyclic'}">CYCLIQUE</button></div>
          <div v-if="matrixMode==='cyclic'"><input type="number" v-model="cyclicDay" placeholder="Jour (1-31)"/></div>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runTimeMatrix" class="spec-btn orange">VOIR PRÉDICTIONS</button>
        </section>
        
        <section class="card spec-card">
          <div class="boss-header"><h2>📅 ANALYSTE SPÉCIALISTE</h2><span class="badge-spec">VIP</span></div>
          <select v-model="selectedDayName"><option v-for="d in ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']" :key="d">{{d}}</option></select>
          <select v-model="selectedHour"><option>Toute la journée</option><option v-for="h in ['10H','13H','16H','19H','21H','23H']" :key="h">{{h}}</option></select>
          <button @click="runDayAnalysis" class="spec-btn blue">SCANNER LE JOUR</button>
        </section>
        
        <section class="card">
          <h2>⭐ MES FAVORIS</h2>
          <div class="favorites-input-group"><input type="text" v-model="newFavoriteInput" placeholder="N°"/><button @click="addFavorite" class="btn-small">+</button></div>
          <div class="favorites-list"><div v-for="item in userFavorites" :key="item" class="favorite-chip">{{ item }} <span @click="analyzeDeepFavorite(item)">⚡</span><b @click="removeFavorite(item)">×</b></div></div>
        </section>
        
        <section class="card">
          <h2>📊 RAPPORTS</h2>
          <input type="date" v-model="selectedDate"/>
          <div class="button-group-vertical">
            <button @click="runReport('daily-frequency')">Top 10 Jour</button>
            <button @click="runReport('weekly-frequency')">Top 10 Semaine</button>
            <button @click="runKantaReport">Kanta Rank</button>
          </div>
          <hr>
          <div class="favorites-input-group"><input type="number" v-model="selectedNumber" placeholder="N°"/><button @click="runReport('companions')" style="font-size:0.7rem;">COMPAGNONS</button></div>
        </section>

        <section class="card">
          <h2>🔍 PROFILAGE</h2>
          <input type="number" v-model="profileNumber" placeholder="Numéro à profiler"/>
          <button @click="runProfileAnalysis">GÉNÉRER PROFIL COMPLET</button>
        </section>

        <section class="card prophet-card">
          <h2>🔮 LE PROPHÈTE</h2>
          <input type="number" v-model="predictionNumber" placeholder="N° vu"/>
          <button @click="runPredictionAnalysis" class="prophet-btn">VOIR LE FUTUR</button>
        </section>

        <section class="card">
          <h2>⚡ DÉCLENCHEURS</h2>
          <input type="text" v-model="triggerInput" placeholder="N° cible"/><button @click="runTriggerAnalysis">ANALYSER AMONT</button>
        </section>
      </div>

      <!-- RESULTS COLUMN -->
      <div class="results-column">
        <div v-if="isLoading" class="loader">Analyse stratégique en cours...</div>
        <div v-if="error" class="error-box">⚠️ {{ error }}</div>

        <div v-if="matrixResult" class="card result-spec-card" style="border-top:4px solid #ff9800;">
           <div class="spec-header"><h3>🕰️ RÉSULTATS MATRICE : {{ matrixResult.mode }}</h3><button @click="matrixResult=null">×</button></div>
           <div v-if="matrixResult.prediction" class="prediction-tab">
               <div class="best-duo-box" style="background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);"><span>🔮 SUGGESTION :</span><span class="duo-val">{{ matrixResult.prediction.two_short }}</span></div>
           </div>
           <table class="spec-table"><thead><tr><th>Date</th><th>Base</th><th>Hits</th></tr></thead><tbody><tr v-for="row in matrixResult.matrix_data" :key="row.date"><td>{{ row.date }}</td><td class="num-cell">{{ row.base_number }}</td><td><span v-for="h in row.detailed_hits" :key="h.num" class="badge-hit">{{ h.num }}</span></td></tr></tbody></table>
        </div>

        <div v-if="dayAnalysisResult" class="card result-spec-card">
          <div class="spec-header"><h3>📊 Sniper : {{ dayAnalysisResult.day_analyzed }}</h3><button @click="dayAnalysisResult=null">×</button></div>
          <div class="best-duo-box"><span class="duo-label">🔥 DUO D'OR :</span><span class="duo-val">{{ dayAnalysisResult.best_duo }}</span></div>
          <table class="spec-table"><thead><tr><th>Stat</th><th>N°</th><th>Kanta</th><th>Compagnons</th><th>Déclencheurs</th></tr></thead><tbody><tr v-for="row in dayAnalysisResult.recurrence_data" :key="row.number"><td>{{ row.status_icon }}</td><td class="num-cell">{{ row.number }}</td><td style="color:#d32f2f;">{{ row.kanta }}</td><td>{{ row.best_companion }}</td><td>{{ row.best_trigger }}</td></tr></tbody></table>
        </div>

        <section v-if="standardResult && lastOperationType === 'ranking_rich'" class="card results-card fade-in">
          <h3>🏆 Classement Top 10 des sorties</h3>
          <div v-if="viewMode === 'chart'" class="chart-container"><Bar :data="chartData" :options="chartOptions" /></div>
          <div class="ranking-list"><div v-for="(item, index) in standardResult.data" :key="item.number" class="rank-card"><div class="rank-badge">#{{ index + 1 }}</div><div class="rank-main"><span class="rank-num">{{ item.number }}</span><span class="rank-hits">{{ item.total_hits }} Sorties</span></div></div></div>
        </section>

        <div v-if="!dayAnalysisResult && !matrixResult && !standardResult && !isLoading" class="welcome-message">🎯 Sélectionnez une fonction à gauche pour démarrer l'intelligence décisionnelle.</div>
      </div>
    </div>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&family=Roboto:wght@400;500;700&display=swap');
:root { --primary: #4361ee; --secondary: #3f37c9; --error: #ef4444; }
body { font-family: 'Poppins', sans-serif; background-color: #f0f2f5; margin: 0; }
.dashboard { max-width: 1450px; margin: 0 auto; padding: 10px; }
header { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: white; padding: 1.2rem 2rem; border-radius: 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 20px rgba(0,0,0,0.2); margin-bottom: 10px; }
.version-tag { background: #f72585; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; }
.u-vip { color: #4cc9f0; font-size: 0.8rem; font-weight: bold; }
.u-free { color: #cbd5e1; font-size: 0.8rem; }
.logout-button { background: rgba(255,255,255,0.1); border: 1px solid white; color: white; padding: 5px 15px; border-radius: 8px; cursor: pointer; }
.contact-banner { background: #fff3e0; color: #e65100; padding: 12px; text-align: center; border-radius: 10px; margin-bottom: 20px; font-weight: bold; border: 1px solid #ff9800; }
.contact-banner span { color: #d32f2f; margin: 0 5px; text-decoration: underline; }
.main-layout { display: grid; grid-template-columns: 360px 1fr; gap: 25px; height: 85vh; }
.controls-column { overflow-y: auto; padding-right: 15px; }
.controls-column::-webkit-scrollbar { width: 6px; }
.controls-column::-webkit-scrollbar-thumb { background: var(--primary); border-radius: 10px; }
.card { background: white; border-radius: 18px; padding: 1.5rem; margin-bottom: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.05); }
.card h2 { font-size: 0.9rem; color: #64748b; text-transform: uppercase; margin-top: 0; }
.badge-spec { background: #ff9800; color: white; font-size: 0.6rem; padding: 3px 7px; border-radius: 5px; font-weight: bold; }
input, select { width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; font-family: 'Roboto'; }
.date-picker-row { display: flex; gap: 10px; }
button { font-family: 'Poppins', sans-serif; font-weight: 600; border: none; border-radius: 10px; padding: 12px; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; margin-top: 5px; color: white; background: #4361ee; text-transform: uppercase; }
.orange { background: #ff9800; }
.blue { background: #00b4d8; }
.gsheet-btn { background: #0f9d58; color: white; padding: 10px 20px; border-radius: 30px; text-decoration: none; font-weight: bold; display: block; text-align: center; margin-bottom: 10px; }
.res-card { border-top: 5px solid var(--primary); }
.spec-table { width: 100%; border-collapse: collapse; }
.spec-table th { background: #f1f5f9; padding: 15px; text-align: center; font-size: 0.8rem; }
.spec-table td { padding: 15px; border-bottom: 1px solid #f1f5f9; text-align: center; font-weight: 800; }
.num-cell { font-size: 1.5rem; color: #1e293b; }
.badge-hit { background: #ff9800; color: white; padding: 3px 8px; border-radius: 5px; margin-right: 5px; }
.best-duo-box { border-radius: 15px; padding: 20px; color: white; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
.duo-val { font-size: 2.5rem; font-weight: 800; }
.login-wrapper { display: flex; align-items: center; justify-content: center; height: 100vh; background: #1e293b; }
.login-box { background: white; padding: 3rem; border-radius: 25px; width: 400px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
.toggle-auth { color: var(--primary); cursor: pointer; margin-top: 15px; font-weight: bold; }
.favorite-chip { background: #e0f2f1; padding: 6px 12px; border-radius: 20px; font-weight: bold; display: inline-flex; align-items: center; gap: 10px; margin: 3px; }
.favorite-chip b { color: red; cursor: pointer; }
.loader { text-align: center; padding: 50px; font-weight: bold; color: var(--primary); }
.error-box { background: #fee2e2; color: #b91c1c; padding: 15px; border-radius: 10px; text-align: center; }
</style>