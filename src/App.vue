<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, collection, getDocs } from "firebase/firestore";
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const GOOGLE_SHEET_ID = "1HepqMzKcshKbRsLWwpEOOy5oO9ntK2CgdV7F_ijmjIo";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// --- RÉFÉRENCES ÉTATS ---
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

// --- COMPUTED ---
const isAdmin = computed(() => userRole.value === 'admin');
const isLimitReached = computed(() => totalUsersCount.value >= USER_LIMIT);
const sheetDirectLink = computed(() => {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
  return activeSheetGid.value ? `${base}/edit#gid=${activeSheetGid.value}` : `${base}/edit`;
});

function formatDate(dateStr) {
  if (!dateStr) return '';
  return dateStr.split('-').reverse().join('/');
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

const chartData = computed(() => {
  const data = tableData.value;
  if (!data || data.length === 0) return null;
  const limitedData = data.slice(0, 20);
  let labels = [], counts = [];
  limitedData.forEach(row => {
    labels.push(row.number || row.pair || row.companion || '?');
    counts.push(row.count || row.total_hits);
  });
  return { labels, datasets: [{ label: 'Sorties', backgroundColor: '#4361ee', data: counts }] };
});

const isTableVisible = computed(() => tableData.value.length > 0);

// --- FONCTIONS AUTH ---
onMounted(async () => {
  const today = new Date();
  selectedDate.value = today.toISOString().split('T')[0];
  endDate.value = selectedDate.value;
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
  startDate.value = lastMonth.toISOString().split('T')[0];

  const snapshot = await getDocs(collection(db, "users"));
  totalUsersCount.value = snapshot.size;

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
    } else { user.value = null; }
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
  } catch (e) { authError.value = "Erreur de connexion."; } finally { isLoading.value = false; }
};

const signup = async () => {
  if (isLimitReached.value) { authError.value = "Limite d'utilisateurs atteinte."; return; }
  try {
    isLoading.value = true;
    const cred = await createUserWithEmailAndPassword(auth, email.value, password.value);
    const sid = crypto.randomUUID();
    localStorage.setItem('session_id', sid);
    await setDoc(doc(db, "users", cred.user.uid), {
      email: email.value, role: 'user', subscription_end: null, current_session_id: sid
    });
  } catch (e) { authError.value = "Erreur d'inscription."; } finally { isLoading.value = false; }
};

const logout = async () => { localStorage.removeItem('session_id'); await signOut(auth); };

// --- FONCTIONS API ---
async function callApi(url, targetVar = 'standard') {
  showWelcomeMessage.value = false; isLoading.value = true; error.value = null;
  try {
    const token = await user.value.getIdToken();
    const sid = localStorage.getItem('session_id');
    const res = await fetch(`${API_BASE_URL}${url}`, { 
      headers: { 'Authorization': `Bearer ${token}`, 'X-Session-ID': sid }
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.detail === "SESSION_EXPIRED_ANOTHER_DEVICE") { alert("Compte utilisé ailleurs !"); logout(); return; }
      throw new Error(data.detail || "Erreur serveur");
    }
    if (targetVar === 'specialist') dayAnalysisResult.value = data;
    else if (targetVar === 'deep') deepFavoriteResult.value = data;
    else if (targetVar === 'matrix') matrixResult.value = data;
    else standardResult.value = data;
    if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

async function runTimeMatrix() { matrixResult.value = null; await callApi(`/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}${matrixMode.value==='cyclic'?'&target_cyclic_day='+cyclicDay.value:''}`, 'matrix'); }
async function runDayAnalysis() { await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist'); }
async function runRangeAnalysis() { lastOperationType.value = 'ranking_rich'; await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`); }
async function runReport(type) {
  if (type === 'daily-frequency') { lastOperationType.value = 'ranking_rich'; await callApi(`/analysis/daily-frequency/${selectedDate.value}`); }
  else if (type === 'weekly-frequency') { lastOperationType.value = 'ranking_rich'; await callApi(`/analysis/weekly-frequency/${selectedDate.value}`); }
}
async function runBatchVisualAnalysis(mode) { lastOperationType.value = 'visual'; await callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${mode}`); }
async function runSingleDayVisual(mode) { await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`); }
async function runPredictionAnalysis() { lastOperationType.value = 'simple'; await callApi(`/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`); }
async function addFavorite() { if (newFavoriteInput.value) { const refU = doc(db,"users",user.value.uid); await updateDoc(refU, {favorites: arrayUnion(newFavoriteInput.value)}); userFavorites.value.push(newFavoriteInput.value); newFavoriteInput.value=''; } }
async function removeFavorite(item) { const refU = doc(db,"users",user.value.uid); await updateDoc(refU, {favorites: arrayRemove(item)}); userFavorites.value = userFavorites.value.filter(f => f !== item); }
async function analyzeDeepFavorite(item) { deepFavoriteResult.value = null; await callApi(`/analysis/deep-favorite?target=${item}&start_date=${startDate.value}&end_date=${endDate.value}`, 'deep'); }
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen"><p>Chargement du Guide...</p></div>
  
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2 class="premium-title">LE GUIDE DES FOURCASTER</h2>
      <p class="auth-sub">{{ isLoginMode ? 'Accès sécurisé' : 'Rejoindre la communauté (Gratuit)' }}</p>
      <form @submit.prevent="isLoginMode ? login() : signup()">
        <div class="input-group"><label>Email</label><input type="email" v-model="email" required /></div>
        <div class="input-group"><label>Mot de passe</label><input type="password" v-model="password" required /></div>
        <button type="submit" class="login-button">{{ isLoading ? 'Vérification...' : (isLoginMode ? 'CONNEXION' : 'CRÉER MON COMPTE') }}</button>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
        <p class="toggle-link" @click="isLoginMode = !isLoginMode">{{ isLoginMode ? "Pas de compte ? S'inscrire" : "Déjà inscrit ? Se connecter" }}</p>
      </form>
    </div>
  </div>

  <main v-else class="dashboard">
    <header class="premium-header">
      <h1>LE GUIDE <span class="version-tag">V100 PRO</span></h1>
      <div class="vip-info">
          <div class="user-meta">
            <span class="user-email">{{ user.email }}</span>
            <span v-if="subscriptionEnd" class="expiry">💎 VIP jusqu'au: {{ formatDate(subscriptionEnd) }}</span>
            <span v-else class="free">❄️ Mode Gratuit</span>
          </div>
          <button @click="logout" class="logout-btn">Quitter</button>
      </div>
    </header>

    <div class="contact-strip">
       ⚠️ Pour activer le <strong>MODE VIP</strong>, contactez l'Expert : <span>+225 0749522365</span> ou <span>+225 0102275973</span>
    </div>

    <div class="main-layout">
      <!-- SIDEBAR -->
      <div class="controls-column">
        <section class="card matrix-card">
          <div class="card-head"><h2>🕰️ MATRICE</h2><span class="vip-badge">VIP</span></div>
          <div class="tabs"><button @click="matrixMode='continuous'" :class="{active: matrixMode==='continuous'}">CONTINU</button><button @click="matrixMode='cyclic'" :class="{active: matrixMode==='cyclic'}">CYCLIQUE</button></div>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runTimeMatrix" class="action-btn orange">ANALYSER MATRICE</button>
        </section>

        <section class="card sniper-card">
          <div class="card-head"><h2>📅 SNIPER</h2><span class="vip-badge">VIP</span></div>
          <select v-model="selectedDayName"><option v-for="d in ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']" :key="d">{{d}}</option></select>
          <button @click="runDayAnalysis" class="action-btn blue">SCANNER {{ selectedDayName.toUpperCase() }}</button>
        </section>

        <section class="card">
          <h2>⭐ MES FAVORIS</h2>
          <div class="fav-input"><input type="text" v-model="newFavoriteInput" placeholder="N° ou Paire"/><button @click="addFavorite">+</button></div>
          <div class="fav-list">
            <div v-for="f in userFavorites" :key="f" class="fav-chip">{{ f }} <span @click="analyzeDeepFavorite(f)">⚡</span><b @click="removeFavorite(f)">×</b></div>
          </div>
        </section>

        <section class="card">
          <h2>📊 RAPPORTS</h2>
          <input type="date" v-model="selectedDate"/>
          <div class="btn-grid">
            <button @click="runReport('daily-frequency')">Top 10 Jour</button>
            <button @click="runReport('weekly-frequency')">Top 10 Semaine</button>
          </div>
          <hr>
          <div class="btn-grid">
            <button @click="runSingleDayVisual('frequency')" class="visual-btn red">Surlignage Jour</button>
            <button @click="runSingleDayVisual('kanta')" class="visual-btn green">Kanta Jour</button>
          </div>
        </section>

        <section class="card prophet-card">
          <h2>🔮 PROPHÈTE</h2>
          <input type="number" v-model="predictionNumber" placeholder="Numéro vu"/>
          <button @click="runPredictionAnalysis" class="prophet-btn">VOIR LE FUTUR</button>
        </section>
      </div>

      <!-- MAIN AREA -->
      <div class="results-column">
        <div class="sheet-link"><a :href="sheetDirectLink" target="_blank">📂 ACCÉDER À GOOGLE SHEETS</a></div>
        
        <div v-if="isLoading" class="loading-box"><div class="spin"></div><p>Analyse en cours...</p></div>
        <div v-if="error" class="error-box">⚠️ {{ error }}</div>

        <!-- MATRIX RESULT -->
        <div v-if="matrixResult" class="card res-card">
          <h3>🕰️ Résultats Matrice</h3>
          <div v-if="matrixResult.prediction" class="prediction-box">
             <span>🔮 PRÉDICTION :</span><strong>{{ matrixResult.prediction.two_short }}</strong>
          </div>
          <div class="table-scroll"><table class="premium-table"><thead><tr><th>Date</th><th>Base</th><th>Hits</th></tr></thead><tbody><tr v-for="r in matrixResult.matrix_data" :key="r.date"><td>{{r.date}}</td><td class="bold">{{r.base_number}}</td><td><span v-for="h in r.detailed_hits" :key="h.num" class="hit-tag">{{h.num}}</span></td></tr></tbody></table></div>
        </div>

        <!-- SNIPER RESULT -->
        <div v-if="dayAnalysisResult" class="card res-card">
          <h3>📊 Sniper : {{ dayAnalysisResult.day_analyzed }}</h3>
          <div class="best-duo">DUO D'OR : {{ dayAnalysisResult.best_duo }}</div>
          <table class="premium-table"><thead><tr><th>N°</th><th>Kanta</th><th>Compagnons</th><th>Déclencheurs</th></tr></thead><tbody><tr v-for="r in dayAnalysisResult.recurrence_data" :key="r.number"><td class="bold large">{{r.number}}</td><td class="red">{{r.kanta}}</td><td>{{r.best_companion}}</td><td>{{r.best_trigger}}</td></tr></tbody></table>
        </div>

        <!-- STANDARDS -->
        <div v-if="standardResult && lastOperationType === 'ranking_rich'" class="card res-card">
          <h3>🏆 Classement Top 10</h3>
          <div v-if="viewMode==='chart'" class="chart-box"><Bar :data="chartData" /></div>
          <div class="rank-list"><div v-for="(item, i) in standardResult.data" :key="i" class="rank-item"><span class="idx">#{{i+1}}</span><span class="num">{{item.number}}</span><span class="hits">{{item.total_hits}} Sorties</span></div></div>
        </div>

        <div v-if="!matrixResult && !dayAnalysisResult && !standardResult && !isLoading" class="welcome">🎯 Sélectionnez une fonction à gauche pour démarrer l'analyse.</div>
      </div>
    </div>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&family=Roboto:wght@400;700&display=swap');

:root { --p: #4361ee; --s: #3f37c9; --d: #1b263b; --error: #ef4444; }
body { font-family: 'Poppins', sans-serif; background: #f0f2f5; margin: 0; }
.dashboard { max-width: 1400px; margin: 0 auto; padding: 10px; }

/* HEADER */
.premium-header { 
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: white; 
  padding: 1.2rem 2rem; border-radius: 15px; display: flex; justify-content: space-between; align-items: center;
  box-shadow: 0 10px 20px rgba(0,0,0,0.2); margin-bottom: 10px;
}
.version-tag { background: #f72585; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; }
.vip-info { display: flex; align-items: center; gap: 20px; }
.user-meta { display: flex; flex-direction: column; text-align: right; }
.expiry { color: #4cc9f0; font-size: 0.8rem; font-weight: bold; }
.logout-btn { background: rgba(255,255,255,0.1); border: 1px solid white; color: white; padding: 5px 15px; border-radius: 8px; cursor: pointer; }

/* CONTACT STRIP */
.contact-strip { background: #fff3e0; color: #e65100; padding: 10px; text-align: center; border-radius: 10px; margin-bottom: 20px; font-weight: bold; border: 1px solid #ff9800; }
.contact-strip span { color: #d32f2f; margin: 0 5px; }

/* AUTH */
.login-wrapper { background: #0f172a; height: 100vh; display: flex; align-items: center; justify-content: center; }
.login-box { background: white; padding: 3rem; border-radius: 25px; width: 400px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
.premium-title { color: var(--p); font-weight: 800; margin-bottom: 5px; }
.toggle-link { color: var(--p); cursor: pointer; margin-top: 15px; font-weight: bold; text-decoration: underline; }
.login-button { background: var(--p); color: white; width: 100%; padding: 15px; border: none; border-radius: 12px; font-weight: bold; cursor: pointer; margin-top: 10px; }

/* LAYOUT */
.main-layout { display: grid; grid-template-columns: 360px 1fr; gap: 25px; }
.card { background: white; border-radius: 18px; padding: 1.5rem; margin-bottom: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #eee; }
.card h2 { font-size: 0.9rem; color: #64748b; text-transform: uppercase; margin-top: 0; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.vip-badge { background: #ff9800; color: white; font-size: 0.6rem; padding: 3px 7px; border-radius: 5px; font-weight: bold; }

/* INPUTS */
input, select { width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; font-family: 'Roboto'; }
.date-picker-row { display: flex; gap: 10px; }
.action-btn { width: 100%; padding: 12px; border: none; border-radius: 10px; color: white; font-weight: bold; cursor: pointer; }
.orange { background: #ff9800; }
.blue { background: #00b4d8; }
.visual-btn { padding: 8px; font-size: 0.8rem; border: 1px solid #ccc; border-radius: 5px; cursor: pointer; }
.visual-btn.red { color: #d32f2f; }
.visual-btn.green { color: #388e3c; }

/* RESULTS */
.sheet-link { text-align: center; margin-bottom: 20px; }
.sheet-link a { background: #0f9d58; color: white; padding: 12px 25px; border-radius: 30px; text-decoration: none; font-weight: bold; box-shadow: 0 5px 15px rgba(15,157,88,0.3); }
.res-card { border-top: 5px solid var(--p); }
.prediction-box { background: linear-gradient(to right, #6a11cb, #2575fc); color: white; padding: 15px; border-radius: 12px; display: flex; justify-content: space-between; margin-bottom: 20px; }
.rank-item { display: flex; align-items: center; gap: 20px; padding: 15px; border-bottom: 1px solid #eee; }
.rank-item .idx { background: var(--p); color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.rank-item .num { font-size: 1.5rem; font-weight: 800; }

.premium-table { width: 100%; border-collapse: collapse; }
.premium-table th { background: #f8fafc; padding: 12px; font-size: 0.75rem; text-align: center; color: #64748b; }
.premium-table td { padding: 15px; text-align: center; border-bottom: 1px solid #f1f5f9; }
.bold { font-weight: 800; font-size: 1.2rem; }
.hit-tag { background: #fff3e0; color: #e65100; padding: 3px 8px; border-radius: 5px; margin: 2px; font-weight: bold; }

/* FAVORITES */
.fav-list { display: flex; flex-wrap: wrap; gap: 5px; }
.fav-chip { background: #e0f2f1; padding: 5px 10px; border-radius: 20px; font-weight: bold; display: flex; align-items: center; gap: 8px; }
.fav-chip span { cursor: pointer; color: #00796b; }
.fav-chip b { cursor: pointer; color: red; }

.loading-box { text-align: center; padding: 40px; }
.spin { border: 4px solid #f3f3f3; border-top: 4px solid var(--p); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 10px; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.error-box { background: #fee2e2; color: #b91c1c; padding: 15px; border-radius: 10px; text-align: center; }
.welcome { text-align: center; padding: 100px; color: #94a3b8; font-size: 1.2rem; }
</style>