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

// Compteur pour blocage après 3 utilisations
const usageCounts = ref({ matrix: 0, sniper: 0, favorite: 0, visual: 0, report: 0, profile: 0, prophet: 0, trigger: 0 });

const userFavorites = ref([]); 
const newFavoriteInput = ref('');
const predictionNumber = ref('');
const predictionCompanion = ref('');
const profileNumber = ref('');
const triggerInput = ref(''); 

const dayAnalysisResult = ref(null); 
const standardResult = ref(null);
const deepFavoriteResult = ref(null);
const profileResult = ref(null);
const matrixResult = ref(null);

const selectedDayName = ref('Mercredi');
const selectedHour = ref('Toute la journée'); 
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

// FONCTION DE SÉCURITÉ LIMITATION
function checkAccess(type) {
  if (isVIP.value) return true;
  if (usageCounts.value[type] >= 3) {
    alert("CONTACTER L'EXPERT POUR VOUS ABONEZ : 📞 +225 0749522365 ou 📞 +225 0102275973 POUR AVOIR ACCES ET BENEFICIER DETOUT LES FONCTION MR ABOUCHO MAX ELISER.");
    return false;
  }
  usageCounts.value[type]++;
  return true;
}

function formatDate(d) { return d ? d.split('-').reverse().join('/') : ''; }

const tableHeaders = computed(() => {
  if (!lastOperationType.value) return [];
  if (lastOperationType.value.includes('frequency')) return ['#', 'Numéro', 'Sorties', 'Détails'];
  if (lastOperationType.value === 'companions') return ['#', 'Compagnon', 'Apparu avec'];
  if (lastOperationType.value === 'trigger') return ['#', 'N° Déclencheur', 'Fréquence'];
  if (lastOperationType.value === 'prediction') return ['#', 'Numéro Suivant', 'Fréquence']; 
  return ['#', 'Donnée', 'Hits'];
});

const tableData = computed(() => {
  if (standardResult.value?.frequency_ranking) return standardResult.value.frequency_ranking;
  if (standardResult.value?.companion_ranking) return standardResult.value.companion_ranking;
  if (standardResult.value?.trigger_numbers_ranking) return standardResult.value.trigger_numbers_ranking;
  if (standardResult.value?.prediction_ranking) return standardResult.value.prediction_ranking;
  if (standardResult.value?.data) return standardResult.value.data;
  return [];
});

const chartData = computed(() => {
  const d = tableData.value;
  if (!d || d.length === 0) return null;
  return { labels: d.slice(0, 15).map(r => r.number || r.pair || '?'), datasets: [{ label: 'Occurrences', backgroundColor: '#4361ee', data: d.slice(0, 15).map(r => r.count || r.total_hits) }] };
});

onMounted(async () => {
  const today = new Date();
  selectedDate.value = today.toISOString().split('T')[0];
  endDate.value = selectedDate.value;
  const lastM = new Date(); lastM.setMonth(lastM.getMonth() - 1);
  startDate.value = lastM.toISOString().split('T')[0];

  const snap = await getDocs(query(collection(db, "users"), limit(100)));
  totalUsersCount.value = snap.size;

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      if (!localStorage.getItem('session_id')) { logout(); return; }
      user.value = firebaseUser;
      const docSnap = await getDoc(doc(db, "users", firebaseUser.uid));
      if (docSnap.exists()) {
        const d = docSnap.data();
        userRole.value = d.role || 'user';
        userFavorites.value = d.favorites || [];
        subscriptionEnd.value = d.subscription_end || '';
      }
    } else { user.value = null; userRole.value = ''; subscriptionEnd.value = ''; }
    isAuthReady.value = true;
  });
});

const login = async () => {
  try {
    isLoading.value = true;
    const cred = await signInWithEmailAndPassword(auth, email.value, password.value);
    const sid = crypto.randomUUID();
    localStorage.setItem('session_id', sid);
    await updateDoc(doc(db, "users", cred.user.uid), { current_session_id: sid });
  } catch (e) { authError.value = "Identifiants incorrects."; } finally { isLoading.value = false; }
};

const signup = async () => {
  if (isLimitReached.value) { authError.value = "Limite atteinte."; return; }
  try {
    isLoading.value = true;
    const cred = await createUserWithEmailAndPassword(auth, email.value, password.value);
    const sid = crypto.randomUUID();
    localStorage.setItem('session_id', sid);
    await setDoc(doc(db, "users", cred.user.uid), { email: email.value, role: 'user', favorites: [], subscription_end: null, current_session_id: sid });
  } catch (e) { authError.value = "Erreur inscription."; } finally { isLoading.value = false; }
};

const logout = async () => { localStorage.removeItem('session_id'); await signOut(auth); };

async function callApi(url, targetVar = 'standard') {
  showWelcomeMessage.value = false; isLoading.value = true; error.value = null;
  try {
    const token = await user.value.getIdToken();
    const sid = localStorage.getItem('session_id');
    const res = await fetch(`${API_BASE_URL}${url}`, { headers: { 'Authorization': `Bearer ${token}`, 'X-Session-ID': sid } });
    const data = await res.json();
    if (!res.ok) {
      if (data.detail === "SESSION_EXPIRED_ANOTHER_DEVICE") { alert("Compte utilisé ailleurs !"); logout(); return; }
      throw new Error(data.detail || "Erreur API");
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

async function runTimeMatrix() { if(!checkAccess('matrix')) return; matrixResult.value = null; await callApi(`/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}${matrixMode.value==='cyclic'?'&target_cyclic_day='+cyclicDay.value:''}`, 'matrix'); }
async function runDayAnalysis() { if(!checkAccess('sniper')) return; await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist'); }
async function runReport(type) {
  if(!checkAccess('report')) return;
  if (type === 'daily-frequency') { lastOperationType.value = 'ranking_rich'; await callApi(`/analysis/daily-frequency/${selectedDate.value}`); }
  else if (type === 'weekly-frequency') { lastOperationType.value = 'ranking_rich'; await callApi(`/analysis/weekly-frequency/${selectedDate.value}`); }
  else if (type === 'companions') { lastOperationType.value = 'simple'; await callApi(`/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`); }
}
async function runRangeAnalysis() { if(!checkAccess('report')) return; lastOperationType.value = 'ranking_rich'; await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`); }
async function runProfileAnalysis() { if(!checkAccess('profile')) return; lastOperationType.value = 'profile'; await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile'); }
async function runTriggerAnalysis() { if(!checkAccess('trigger')) return; lastOperationType.value = 'simple'; const p = triggerInput.value.split(' '); await callApi(`/analysis/trigger-numbers?target_number=${p[0]}&start_date=${startDate.value}&end_date=${endDate.value}`); }
async function runPredictionAnalysis() { if(!checkAccess('prophet')) return; lastOperationType.value = 'simple'; await callApi(`/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`); }
async function runKantaReport() { if(!checkAccess('report')) return; lastOperationType.value = 'simple'; await callApi(`/analysis/kanta-daily-rank?date_str=${selectedDate.value}`); }
async function runSingleDayVisual(mode) { if(!isAdmin.value) return; await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`); }
async function runBatchVisualAnalysis(mode) { if(!isAdmin.value) return; await callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${mode}`); }
async function addFavorite() { if(!checkAccess('favorite')) return; if(newFavoriteInput.value) { await updateDoc(doc(db,"users",user.value.uid), {favorites: arrayUnion(newFavoriteInput.value)}); userFavorites.value.push(newFavoriteInput.value); newFavoriteInput.value=''; } }
async function removeFavorite(i) { await updateDoc(doc(db,"users",user.value.uid), {favorites: arrayRemove(i)}); userFavorites.value = userFavorites.value.filter(f=>f!==i); }
async function analyzeDeepFavorite(i) { if(!checkAccess('favorite')) return; deepFavoriteResult.value = null; await callApi(`/analysis/deep-favorite?target=${i}&start_date=${startDate.value}&end_date=${endDate.value}`, 'deep'); }
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen"><p>Chargement Premium...</p></div>
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2 class="auth-title">LE GUIDE DES FOURCASTER</h2>
      <p style="color:#64748b; margin-bottom:15px;">{{ isLoginMode ? 'Connexion Membre' : 'Création de compte (Libre)' }}</p>
      <form @submit.prevent="isLoginMode ? login() : signup()">
        <div class="input-group"><label>Email</label><input type="email" v-model="email" required /></div>
        <div class="input-group"><label>Mot de passe</label><input type="password" v-model="password" required /></div>
        <button type="submit" class="login-button">{{ isLoading ? '...' : (isLoginMode ? 'CONNEXION' : 'S\'INSCRIRE') }}</button>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
        <p class="toggle-auth" @click="isLoginMode = !isLoginMode">{{ isLoginMode ? 'S\'inscrire' : 'Se connecter' }}</p>
      </form>
    </div>
  </div>

  <main v-else class="dashboard">
    <header class="dashboard-header">
      <h1>LE GUIDE <span class="version-tag">V100 PRO</span></h1>
      <div class="vip-zone">
        <div class="u-meta">
          <span class="u-mail">{{ user.email }}</span>
          <span v-if="subscriptionEnd" class="u-vip">💎 VIP: {{ formatDate(subscriptionEnd) }}</span>
          <span v-else class="u-free">❄️ MODE ESSAI</span>
        </div>
        <button @click="logout" class="logout-btn">Quitter</button>
      </div>
    </header>

    <div class="contact-strip">
      📞 POUR VOUS ABONEZ, CONTACTEZ : <span>+225 0749522365</span> / <span>+225 0102275973</span> - <strong>MR ABOUCHO MAX ELISER</strong>
    </div>

    <div class="main-layout">
      <!-- SIDEBAR SCROLLABLE -->
      <div class="controls-column">
        <section v-if="isAdmin" class="card admin-card">
          <h2>🛠️ ADMIN (GOOGLE SHEETS)</h2>
          <div class="quick-link-box"><a :href="sheetDirectLink" target="_blank" class="gsheet-btn">📂 OUVRIR LA BASE</a></div>
          <hr>
          <label>Batch Couleurs :</label>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runBatchVisualAnalysis('frequency')" style="background:red">Batch Fréq</button>
          <button @click="runBatchVisualAnalysis('kanta')" style="background:green">Batch Kanta</button>
          <hr>
          <input type="date" v-model="selectedDate"/>
          <button @click="runSingleDayVisual('frequency')" style="border:1px solid red; color:red; background:none">Surligner Jour</button>
        </section>

        <section class="card matrix-card">
          <div class="card-head"><h2>🕰️ MATRICE</h2><span class="v-badge">VIP</span></div>
          <div class="tabs"><button @click="matrixMode='continuous'" :class="{active: matrixMode==='continuous'}">CONTINU</button><button @click="matrixMode='cyclic'" :class="{active: matrixMode==='cyclic'}">CYCLIQUE</button></div>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runTimeMatrix" class="act-btn orange">PRÉDICTIONS</button>
        </section>

        <section class="card spec-card">
          <div class="card-head"><h2>📅 SNIPER</h2><span class="v-badge">VIP</span></div>
          <select v-model="selectedDayName"><option v-for="d in ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']" :key="d">{{d}}</option></select>
          <button @click="runDayAnalysis" class="act-btn blue">SCANNER JOUR</button>
        </section>

        <section class="card">
          <h2>⭐ MES FAVORIS</h2>
          <div class="fav-box"><input type="text" v-model="newFavoriteInput" placeholder="N°"/><button @click="addFavorite">+</button></div>
          <div class="fav-chips"><div v-for="f in userFavorites" :key="f" class="chip">{{ f }} <span @click="analyzeDeepFavorite(f)">⚡</span><b @click="removeFavorite(f)">×</b></div></div>
        </section>

        <section class="card">
          <h2>📊 RAPPORTS</h2>
          <input type="date" v-model="selectedDate"/><div class="btn-group"><button @click="runReport('daily-frequency')">Top 10 Jour</button><button @click="runReport('weekly-frequency')">Top 10 Semaine</button></div>
        </section>

        <section class="card prophet-card"><h2>🔮 PROPHÈTE</h2><input type="number" v-model="predictionNumber" placeholder="N° vu"/><button @click="runPredictionAnalysis" class="proph-btn">VOIR FUTUR</button></section>

        <section class="card"><h2>🔍 PROFILAGE</h2><input type="number" v-model="profileNumber" placeholder="Numéro"/><button @click="runProfileAnalysis">GÉNÉRER PROFIL</button></section>
        
        <section class="card"><h2>⚡ DÉCLENCHEURS</h2><input type="text" v-model="triggerInput" placeholder="Numéro cible"/><button @click="runTriggerAnalysis">ANALYSER</button></section>
      </div>

      <!-- RESULTS -->
      <div class="results-column">
        <div v-if="isLoading" class="loader-box"><div class="spin"></div><p>Analyse stratégique...</p></div>
        <div v-if="error" class="err-msg">⚠️ {{ error }}</div>

        <div v-if="matrixResult" class="card res-card">
          <h3>🕰️ Résultats Matrice : {{ matrixResult.mode }}</h3>
          <div v-if="matrixResult.prediction" class="pred-box"><span>🔮 SUGGESTION :</span><strong>{{ matrixResult.prediction.two_short }}</strong></div>
          <table class="prem-table"><thead><tr><th>Date</th><th>Base</th><th>Hits</th></tr></thead><tbody><tr v-for="r in matrixResult.matrix_data" :key="r.date"><td>{{r.date}}</td><td class="bold">{{r.base_number}}</td><td><span v-for="h in r.detailed_hits" :key="h.num" class="hit">{{h.num}}</span></td></tr></tbody></table>
        </div>

        <div v-if="dayAnalysisResult" class="card res-card">
          <h3>📊 Sniper : {{ dayAnalysisResult.day_analyzed }}</h3>
          <div class="duo-or">DUO D'OR : {{ dayAnalysisResult.best_duo }}</div>
          <table class="prem-table"><thead><tr><th>N°</th><th>Kanta</th><th>Compagnons</th><th>Déclencheurs</th></tr></thead><tbody><tr v-for="r in dayAnalysisResult.recurrence_data" :key="r.number"><td class="bold">{{r.number}}</td><td class="red">{{r.kanta}}</td><td>{{r.best_companion}}</td><td>{{r.best_trigger}}</td></tr></tbody></table>
        </div>

        <section v-if="standardResult && lastOperationType === 'ranking_rich'" class="card res-card">
          <h3>🏆 Classement Top 10</h3>
          <div class="list"><div v-for="(item, i) in standardResult.data" :key="i" class="li-item"><span class="idx">#{{i+1}}</span><span class="num">{{item.number}}</span><span class="hits">{{item.total_hits}} Sorties</span></div></div>
        </section>

        <div v-if="!matrixResult && !dayAnalysisResult && !standardResult && !isLoading" class="welcome">🎯 Sélectionnez une fonction.</div>
      </div>
    </div>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&family=Roboto:wght@400;700&display=swap');
:root { --p: #4361ee; --s: #3f37c9; --error: #ef4444; }
body { font-family: 'Poppins', sans-serif; background: #f0f2f5; margin: 0; }
.dashboard { max-width: 1450px; margin: 0 auto; padding: 10px; }
header { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: white; padding: 1.2rem 2rem; border-radius: 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 20px rgba(0,0,0,0.2); margin-bottom: 10px; }
.version-tag { background: #f72585; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; }
.u-meta { display: flex; flex-direction: column; text-align: right; margin-right: 20px; }
.u-vip { color: #4cc9f0; font-size: 0.8rem; font-weight: bold; }
.u-free { color: #cbd5e1; font-size: 0.8rem; }
.logout-btn { background: rgba(255,255,255,0.1); border: 1px solid white; color: white; padding: 5px 15px; border-radius: 8px; cursor: pointer; }
.contact-strip { background: #fff3e0; color: #e65100; padding: 12px; text-align: center; border-radius: 10px; margin-bottom: 20px; font-weight: bold; border: 1px solid #ff9800; }
.contact-strip span { color: #d32f2f; margin: 0 5px; text-decoration: underline; }
.main-layout { display: grid; grid-template-columns: 380px 1fr; gap: 25px; height: 85vh; }
.controls-column { overflow-y: auto; padding-right: 15px; }
.controls-column::-webkit-scrollbar { width: 6px; }
.controls-column::-webkit-scrollbar-thumb { background: var(--p); border-radius: 10px; }
.card { background: white; border-radius: 18px; padding: 1.5rem; margin-bottom: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.05); }
.card h2 { font-size: 0.9rem; color: #64748b; text-transform: uppercase; margin-top: 0; }
.v-badge { background: #ff9800; color: white; font-size: 0.6rem; padding: 3px 7px; border-radius: 5px; font-weight: bold; }
input, select { width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; font-family: 'Roboto'; }
.date-picker-row { display: flex; gap: 10px; }
.act-btn { width: 100%; padding: 12px; border: none; border-radius: 10px; color: white; font-weight: bold; cursor: pointer; }
.orange { background: #ff9800; }
.blue { background: #00b4d8; }
.gsheet-btn { background: #0f9d58; color: white; padding: 10px 20px; border-radius: 30px; text-decoration: none; font-weight: bold; display: block; text-align: center; margin-bottom: 10px; }
.res-card { border-top: 5px solid var(--p); }
.pred-box { background: linear-gradient(to right, #4361ee, #4cc9f0); color: white; padding: 15px; border-radius: 12px; display: flex; justify-content: space-between; margin-bottom: 20px; }
.duo-or { background: #e3f2fd; color: #0d47a1; padding: 15px; border-radius: 10px; text-align: center; font-weight: 800; margin-bottom: 15px; }
.prem-table { width: 100%; border-collapse: collapse; }
.prem-table th { background: #f8fafc; padding: 12px; font-size: 0.75rem; color: #64748b; }
.prem-table td { padding: 12px; text-align: center; border-bottom: 1px solid #f1f5f9; }
.bold { font-weight: 800; font-size: 1.2rem; }
.red { color: #d32f2f; font-weight: bold; }
.hit { background: #fff3e0; color: #e65100; padding: 3px 8px; border-radius: 5px; margin: 2px; font-weight: bold; }
.chip { background: #e0f2f1; padding: 5px 12px; border-radius: 20px; font-weight: bold; display: inline-flex; align-items: center; gap: 10px; margin: 3px; }
.chip b { color: red; cursor: pointer; }
.spin { border: 4px solid #f3f3f3; border-top: 4px solid var(--p); border-radius: 50%; width: 35px; height: 35px; animation: spin 1s linear infinite; margin: 0 auto 10px; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.li-item { display: flex; align-items: center; gap: 15px; padding: 12px; border-bottom: 1px solid #eee; }
.idx { background: var(--p); color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.login-wrapper { background: #0f172a; height: 100vh; display: flex; align-items: center; justify-content: center; }
.login-box { background: white; padding: 3rem; border-radius: 25px; width: 400px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
.login-button { background: var(--p); color: white; width: 100%; padding: 15px; border: none; border-radius: 12px; font-weight: bold; cursor: pointer; }
.toggle-auth { color: var(--p); cursor: pointer; margin-top: 15px; font-weight: bold; text-decoration: underline; }
</style>