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

// --- ÉTATS SYSTÈME ---
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

// --- COMPTEUR DE LIMITATION (3 ESSAIS PAR FONCTION) ---
const usageCounts = ref({ matrix: 0, sniper: 0, favorite: 0, report: 0, profile: 0, prophet: 0, trigger: 0 });

// --- DONNÉES D'ANALYSE (V86) ---
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
const showWelcomeMessage = ref(true);
const viewMode = ref('table');
const lastOperationType = ref('');

// --- CALCULS ---
const isAdmin = computed(() => userRole.value === 'admin');
const isVIP = computed(() => subscriptionEnd.value !== '' || isAdmin.value);
const isLimitReached = computed(() => totalUsersCount.value >= USER_LIMIT);
const sheetDirectLink = computed(() => {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
  return activeSheetGid.value ? `${base}/edit#gid=${activeSheetGid.value}` : `${base}/edit`;
});

// --- LOGIQUE DE VÉRIFICATION DROITS & LIMITES ---
function checkAndCountUsage(type) {
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
  return { labels, datasets: [{ label: 'Occurrences', backgroundColor: '#4361ee', borderRadius: 4, data: counts }] };
});

// --- INITIALISATION ---
onMounted(async () => {
  const today = new Date();
  selectedDate.value = today.toISOString().split('T')[0];
  endDate.value = selectedDate.value;
  const oneMonthAgo = new Date(); oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  startDate.value = oneMonthAgo.toISOString().split('T')[0];

  try {
    const qUsers = query(collection(db, "users"), limit(100));
    const snapshot = await getDocs(qUsers);
    totalUsersCount.value = snapshot.size;
  } catch (e) { console.warn("Erreur permission compteur."); }

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
      } catch (e) { console.error("Firebase Sync Error"); }
    } else { user.value = null; userRole.value = ''; userFavorites.value = []; subscriptionEnd.value = ''; localStorage.removeItem('session_id'); }
    isAuthReady.value = true;
  });
});

// --- ACTIONS AUTH ---
const login = async () => {
  try {
    isLoading.value = true; authError.value = '';
    const userCredential = await signInWithEmailAndPassword(auth, email.value, password.value);
    const sid = crypto.randomUUID();
    localStorage.setItem('session_id', sid);
    await updateDoc(doc(db, "users", userCredential.user.uid), { current_session_id: sid });
  } catch (error) { authError.value = "Identifiants incorrects."; } finally { isLoading.value = false; }
};

const signup = async () => {
  if (isLimitReached.value) { authError.value = "Limite d'inscriptions atteinte (50/50)."; return; }
  try {
    isLoading.value = true; authError.value = '';
    const userCredential = await createUserWithEmailAndPassword(auth, email.value, password.value);
    const sid = crypto.randomUUID();
    localStorage.setItem('session_id', sid);
    await setDoc(doc(db, "users", userCredential.user.uid), {
      email: email.value, role: 'user', favorites: [], subscription_end: null, current_session_id: sid, created_at: new Date().toISOString()
    });
  } catch (error) { authError.value = "Erreur lors de l'inscription."; } finally { isLoading.value = false; }
};

const logout = async () => { localStorage.removeItem('session_id'); await signOut(auth); };

// --- API ENGINE ---
async function callApi(url, targetVar = 'standard') {
  showWelcomeMessage.value = false; isLoading.value = true; error.value = null;
  if (targetVar === 'standard') standardResult.value = null;
  try {
    const token = await user.value.getIdToken();
    const sid = localStorage.getItem('session_id');
    const headers = { 'Authorization': `Bearer ${token}`, 'X-Session-ID': sid };
    const fullUrl = `${API_BASE_URL}${url}`;
    const response = await fetch(fullUrl, { method: 'GET', headers });
    const data = await response.json();
    if (!response.ok) {
        if (data.detail === "SESSION_EXPIRED_ANOTHER_DEVICE") { alert("⚠️ Session ouverte sur un autre appareil."); logout(); return; }
        throw new Error(data.detail || `Erreur ${response.status}`);
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

// --- FONCTIONS MÉTIER V86 ---
async function runTimeMatrix() { if(!checkAndCountUsage('matrix')) return; matrixResult.value = null; await callApi(`/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}${matrixMode.value==='cyclic'?'&target_cyclic_day='+cyclicDay.value:''}`, 'matrix'); }
async function runDayAnalysis() { if(!checkAndCountUsage('sniper')) return; await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist'); }
async function runReport(type) {
  if(!checkAndCountUsage('report')) return;
  if (type === 'daily-frequency') { lastOperationType.value = 'ranking_rich'; await callApi(`/analysis/daily-frequency/${selectedDate.value}`, 'standard'); }
  else if (type === 'weekly-frequency') { lastOperationType.value = 'ranking_rich'; await callApi(`/analysis/weekly-frequency/${selectedDate.value}`, 'standard'); }
  else if (type === 'companions') { lastOperationType.value = 'simple'; await callApi(`/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`, 'standard'); }
}
async function runRangeAnalysis() { if(!checkAndCountUsage('report')) return; lastOperationType.value = 'ranking_rich'; await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard'); }
async function runProfileAnalysis() { if(!checkAndCountUsage('profile')) return; lastOperationType.value = 'profile'; profileResult.value = null; await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile'); }
async function runTriggerAnalysis() { 
  if(!checkAndCountUsage('trigger')) return;
  lastOperationType.value = 'simple'; const parts = triggerInput.value.replace(/[^0-9]/g, ' ').trim().split(/\s+/);
  await callApi(`/analysis/trigger-numbers?target_number=${parts[0]}&start_date=${startDate.value}&end_date=${endDate.value}${parts[1]?'&companion_number='+parts[1]:''}`, 'standard'); 
}
async function runPredictionAnalysis() { if(!checkAndCountUsage('prophet')) return; lastOperationType.value = 'simple'; await callApi(`/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}${predictionCompanion.value?'&observed_companion='+predictionCompanion.value:''}`, 'standard'); }
async function runKantaReport(type) { if(!checkAndCountUsage('report')) return; lastOperationType.value = 'simple'; await callApi(`/analysis/kanta-daily-rank?date_str=${selectedDate.value}`, 'standard'); }

async function addFavorite() {
  if(!checkAndCountUsage('favorite')) return;
  const input = newFavoriteInput.value.trim();
  if (!input || !/^[0-9]{1,2}(-[0-9]{1,2})?$/.test(input)) return;
  if (userFavorites.value.includes(input)) { newFavoriteInput.value = ''; return; }
  try {
    await updateDoc(doc(db, "users", user.value.uid), { favorites: arrayUnion(input) });
    userFavorites.value.push(input); newFavoriteInput.value = '';
  } catch (e) { console.error("Fav Error"); }
}
async function removeFavorite(item) {
  try { await updateDoc(doc(db, "users", user.value.uid), { favorites: arrayRemove(item) }); userFavorites.value = userFavorites.value.filter(n => n !== item); } catch (e) { }
}
async function analyzeDeepFavorite(item) { if(!checkAndCountUsage('favorite')) return; deepFavoriteResult.value = null; await callApi(`/analysis/deep-favorite?target=${item}&start_date=${startDate.value}&end_date=${endDate.value}&context_day=${favDayName.value}&context_hour=${favHour.value}`, 'deep'); }

// --- ADMIN SEULEMENT ---
async function runDataUpdate(endpoint) { if(!isAdmin.value) return; lastOperationType.value = 'update'; await callApi(`/collection/${endpoint}`, 'standard'); }
async function runBatchVisualAnalysis(mode) { if(!isAdmin.value) return; lastOperationType.value = 'visual'; await callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${mode}`, 'standard'); }
async function runSingleDayVisual(mode) { if(!isAdmin.value) return; lastOperationType.value = 'visual'; await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`, 'standard'); }
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen"><p>Initialisation du Guide Fourcaster...</p></div>
  
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2>LE GUIDE DES FOURCASTER</h2>
      <p style="color:#64748b; margin-bottom:20px;">{{ isLoginMode ? 'Connexion Membre' : 'Inscription Gratuite (Limite 50)' }}</p>
      <form @submit.prevent="isLoginMode ? login() : signup()">
        <div class="input-group"><label>Email</label><input type="email" v-model="email" required /></div>
        <div class="input-group"><label>Mot de passe</label><input type="password" v-model="password" required /></div>
        <button type="submit" class="login-button" :disabled="isLoading">{{ isLoading ? '...' : (isLoginMode ? 'CONNEXION' : 'S\'INSCRIRE') }}</button>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
        <p class="toggle-auth" @click="isLoginMode = !isLoginMode">{{ isLoginMode ? 'Pas de compte ? S\'inscrire' : 'Déjà membre ? Se connecter' }}</p>
      </form>
    </div>
  </div>

  <main v-else class="dashboard">
    <header>
      <h1>LE GUIDE DES FOURCASTER <span class="version-tag">V100 PRO</span></h1>
      <div class="user-info">
        <div class="sub-status">
            <span class="user-email">{{ user.email }}</span>
            <span v-if="subscriptionEnd" class="expiry-text">💎 VIP jusqu'au: {{ formatDate(subscriptionEnd) }}</span>
            <span v-else class="free-text">❄️ ESSAI GRATUIT ACTIF (3 essais)</span>
        </div>
        <button @click="logout" class="logout-button">Déconnexion</button>
      </div>
    </header>

    <div class="contact-banner">
        🔥 CONTACTER L'EXPERT POUR VOUS ABONEZ : <span>📞 +225 0749522365</span> ou <span>📞 +225 0102275973</span> - <strong>MR ABOUCHO MAX ELISER</strong>
    </div>

    <div class="main-layout">
      <!-- SIDEBAR AVEC BARRE DE DEFILEMENT -->
      <div class="controls-column">
        
        <!-- ADMINISTRATION (VISIBLE UNIQUEMENT PAR ADMIN) -->
        <section v-if="isAdmin" class="card admin-card">
          <h2>🛠️ ADMINISTRATION (STRICT)</h2>
          <div class="button-group-horizontal"><button @click="runDataUpdate('update-recent-weeks')">Mise à Jour Site</button><button @click="runDataUpdate('start-full-rebuild')" class="danger">Full Rebuild</button></div>
          <hr>
          <div class="quick-link-box"><a :href="sheetDirectLink" target="_blank" class="gsheet-btn">📂 OUVRIR GOOGLE SHEETS DB</a></div>
          <hr>
          <label>Batch Couleurs (Couvre toute la période sélectionnée) :</label>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <div class="button-group-vertical">
            <button @click="runBatchVisualAnalysis('frequency')" style="background:#ef5350;">Surlignage Fréquence (Rouge/Bleu)</button>
            <button @click="runBatchVisualAnalysis('kanta')" style="background:#66bb6a;">Surlignage Kanta (Vert/Jaune)</button>
          </div>
          <hr>
          <label>Surlignage Jour Unique :</label>
          <input type="date" v-model="selectedDate"/>
          <button @click="runSingleDayVisual('frequency')" style="border:1px solid #ef5350; background:transparent; color:#d32f2f;">🎨 Surligner Jour Choisi</button>
        </section>

        <section class="card matrix-card">
          <div class="boss-header"><h2>🕰️ MATRICE TEMPORELLE</h2><span class="badge-spec" style="background:#ff9800;">VIP</span></div>
          <div class="tabs"><button @click="matrixMode='continuous'" :class="{active: matrixMode==='continuous'}">CONTINU</button><button @click="matrixMode='cyclic'" :class="{active: matrixMode==='cyclic'}">CYCLIQUE</button></div>
          <div v-if="matrixMode==='cyclic'" style="margin-bottom:10px;"><label>Jour du mois (1-31):</label><input type="number" v-model="cyclicDay" min="1" max="31"/></div>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runTimeMatrix" :disabled="isLoading" class="spec-btn" style="background:#ff9800;">ANALYSER & PRÉDIRE</button>
        </section>
        
        <section class="card spec-card">
          <div class="boss-header"><h2>📅 ANALYSTE SPÉCIALISTE</h2><span class="badge-spec">VIP</span></div>
          <label>Choisir Jour :</label><select v-model="selectedDayName" class="day-select"><option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option></select>
          <label>Choisir Heure :</label><select v-model="selectedHour" class="day-select"><option>Toute la journée</option><option v-for="h in ['01H','03H','07H','08H','10H','13H','16H','19H','21H','22H','23H']" :key="h">{{h}}</option></select>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runDayAnalysis" :disabled="isLoading" class="spec-btn">SCANNER LE JOUR</button>
        </section>
        
        <section class="card">
          <h2>⭐ Mes Numéros Favoris</h2>
          <div class="favorites-input-group"><input type="text" v-model="newFavoriteInput" placeholder="Ex: 7 ou 12-45" @keyup.enter="addFavorite"/><button @click="addFavorite" :disabled="!newFavoriteInput" class="btn-small">Ajouter</button></div>
          <div v-if="userFavorites.length>0" class="favorites-list"><div v-for="item in userFavorites" :key="item" class="favorite-chip"><span class="fav-label">{{ item }}</span><div class="fav-actions"><button @click="analyzeDeepFavorite(item)" class="icon-btn">⚡</button></div><span @click="removeFavorite(item)" class="fav-delete">×</span></div></div>
        </section>
        
        <section class="card">
          <h2>📊 Rapports Analyses</h2>
          <input type="date" v-model="selectedDate"/>
          <div class="button-group-vertical" style="margin-top:10px;">
            <button @click="runReport('daily-frequency')">Classement Jour (Top 10)</button>
            <button @click="runReport('weekly-frequency')">Classement Semaine (Top 10)</button>
            <button @click="runKantaReport('daily-rank')">Classement Kanta</button>
            <hr>
            <div class="favorites-input-group"><input type="number" v-model="selectedNumber" placeholder="N° Compagnons"/><button @click="runReport('companions')" style="font-size:0.7rem;">ANALYSER</button></div>
          </div>
        </section>
        
        <section class="card">
          <h2>🔍 PÉRIODE & PROFILAGE</h2>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runRangeAnalysis">Fréquence Période (Top 10)</button>
          <hr>
          <input type="number" v-model="profileNumber" placeholder="Numéro à profiler"/>
          <button @click="runProfileAnalysis">GÉNÉRER PROFIL COMPLET</button>
        </section>

        <section class="card prophet-card">
          <h2>🔮 LE PROPHÈTE (IA)</h2>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <input type="number" v-model="predictionNumber" placeholder="N° vu"/><input type="number" v-model="predictionCompanion" placeholder="Compagnon (Option)"/>
          <button @click="runPredictionAnalysis" :disabled="isLoading||!predictionNumber" class="prophet-btn">VOIR LE FUTUR</button>
        </section>
        
        <section class="card">
          <h2>⚡ DÉCLENCHEURS</h2>
          <input type="text" v-model="triggerInput" placeholder="N° ou Paire cible"/><button @click="runTriggerAnalysis">ANALYSER L'AMONT</button>
        </section>
      </div>

      <!-- RESULTS COLUMN (INTEGRAL V86) -->
      <div class="results-column">
        <div v-if="isLoading" class="loader">Calculs stratégiques en cours...</div>
        <div v-if="error" class="error-box">⚠️ {{ error }}</div>

        <!-- MATRIX RESULT (Detailed) -->
        <div v-if="matrixResult" class="card result-spec-card" style="border-top:4px solid #ff9800;">
           <div class="spec-header"><h3>🕰️ RÉSULTATS MATRICE : {{ matrixResult.mode }}</h3><button @click="matrixResult=null" class="close-btn">×</button></div>
           <div v-if="matrixResult.prediction" class="prediction-tab">
               <div class="best-duo-box" style="background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);"><span class="duo-label">🔮 TWO-SHORT PRÉDIT :</span><span class="duo-val">{{ matrixResult.prediction.two_short }}</span></div>
               <div class="ai-analysis" style="background:#e8eaf6; color:#1a237e;"><h4>💡 Top Formules :</h4><ul><li v-for="(f, i) in matrixResult.prediction.top_formulas_rich" :key="i"><strong>{{ f.name }}</strong> ({{ f.count }} Hits)</li></ul></div>
           </div>
           <div class="table-responsive"><table class="spec-table"><thead><tr><th>Date</th><th>Base</th><th>Hits</th></tr></thead><tbody><tr v-for="(row, idx) in matrixResult.matrix_data" :key="idx"><td>{{ row.date }}</td><td class="num-cell">{{ row.base_number }}</td><td><div v-for="h in row.detailed_hits" :key="h.num"><span class="badge-hit">{{ h.num }}</span> ({{ h.time }})</div></td></tr></tbody></table></div>
        </div>

        <!-- SNIPER RESULT (Detailed 6 Columns) -->
        <div v-if="dayAnalysisResult" class="card result-spec-card">
          <div class="spec-header"><h3>📊 Sniper : {{ dayAnalysisResult.day_analyzed }}</h3><button @click="dayAnalysisResult=null" class="close-btn">×</button></div>
          <div class="best-duo-box"><span class="duo-label">🔥 DUO D'OR :</span><span class="duo-val">{{ dayAnalysisResult.best_duo }}</span></div>
          <div class="table-responsive"><table class="spec-table"><thead><tr><th>Stat</th><th>N°</th><th>Kanta</th><th>Compagnons</th><th>Déclencheurs</th><th>Prophète</th></tr></thead><tbody><tr v-for="row in dayAnalysisResult.recurrence_data" :key="row.number"><td>{{ row.status_icon }}</td><td class="num-cell">{{ row.number }}</td><td style="color:#d32f2f;">{{ row.kanta }}</td><td>{{ row.best_companion }}</td><td>{{ row.best_trigger }}</td><td class="proph-cell">{{ row.best_prophet }}</td></tr></tbody></table></div>
        </div>

        <!-- DEEP FAVORITE (Detailed Summaries) -->
        <div v-if="deepFavoriteResult" class="card result-spec-card" style="border-top:4px solid #fdd835;">
          <div class="spec-header"><h3>⭐ Scan Profond : {{ deepFavoriteResult.favorite }}</h3><button @click="deepFavoriteResult=null" class="close-btn">×</button></div>
          <div v-if="deepFavoriteResult.data===null"><p>Ce numéro n'est jamais sorti sur cette période.</p></div>
          <div v-else>
             <div class="summary-grid">
                <div class="sum-card"><h5>Top Jours</h5><ul><li v-for="x in deepFavoriteResult.summary.top_days">{{ x.val }} ({{x.count}})</li></ul></div>
                <div class="sum-card"><h5>Top Heures</h5><ul><li v-for="x in deepFavoriteResult.summary.top_hours">{{ x.val }} ({{x.count}})</li></ul></div>
                <div class="sum-card"><h5>Top Déclencheurs</h5><ul><li v-for="x in deepFavoriteResult.summary.top_triggers">{{ x.val }} ({{x.count}})</li></ul></div>
                <div class="sum-card"><h5>Top Compagnons</h5><ul><li v-for="x in deepFavoriteResult.summary.top_companions">{{ x.val }} ({{x.count}})</li></ul></div>
                <div class="sum-card"><h5>Top Prophètes</h5><ul><li v-for="x in deepFavoriteResult.summary.top_prophets">{{ x.val }} ({{x.count}})</li></ul></div>
             </div>
             <div class="table-responsive"><table class="spec-table"><thead><tr><th>Date</th><th>Heure</th><th>Déclencheur</th><th>Compagnons</th><th>Prophète</th></tr></thead><tbody><tr v-for="(row, idx) in deepFavoriteResult.history_table" :key="idx"><td>{{ row.date }}</td><td>{{ row.time }}</td><td>{{ row.trigger }}</td><td>{{ row.companion }}</td><td>{{ row.prophet }}</td></tr></tbody></table></div>
          </div>
        </div>

        <!-- PROFILING RESULT -->
        <div v-if="profileResult" class="card result-spec-card" style="border-top:4px solid #ab47bc;">
          <div class="spec-header"><h3>👤 Profil Complet : {{ profileResult.profile_data.number }}</h3><button @click="profileResult=null" class="close-btn">×</button></div>
          <div class="ai-analysis"><h4>🧠 Analyse de l'Expert :</h4><p>{{ profileResult.ai_strategic_profile }}</p></div>
        </div>

        <!-- STANDARDS (Top 10 Lists) -->
        <section v-if="standardResult && lastOperationType === 'ranking_rich'" class="card results-card fade-in">
          <div class="spec-header"><h2>Classement Top 10 Contextuel</h2><button @click="standardResult=null" class="close-btn">Fermer</button></div>
          <div class="ranking-list"><div v-for="(item, index) in standardResult.data" :key="item.number" class="rank-card"><div class="rank-badge">#{{ index + 1 }}</div><div class="rank-main"><span class="rank-num">{{ item.number }}</span><span class="rank-hits">{{ item.total_hits }} Sorties</span></div><div class="rank-details"><div class="detail-col"><strong>Top Jours</strong> <span v-for="d in item.top_days">{{d.val}}, </span></div></div></div></div>
        </section>

        <!-- SIMPLE RESULTS (Tables/Charts) -->
        <section v-if="standardResult && lastOperationType === 'simple'" class="card results-card fade-in">
          <div class="spec-header"><h2>Résultat Standard</h2><button @click="standardResult=null" class="close-btn">Fermer</button></div>
          <div v-if="isTableVisible && viewMode === 'chart'" class="chart-container"><Bar :data="chartData" :options="chartOptions" /></div>
          <table v-else-if="isTableVisible" class="styled-table"><thead><tr><th v-for="h in tableHeaders" :key="h">{{ h }}</th></tr></thead><tbody><tr v-for="(row, index) in tableData" :key="index"><td>#{{ index + 1 }}</td><td>{{ row.number || row.pair }}</td><td>{{ row.count }}</td></tr></tbody></table>
        </section>

        <div v-if="!dayAnalysisResult && !standardResult && !deepFavoriteResult && !profileResult && !matrixResult && !isLoading" class="welcome-message">
            <div class="w-icon">🎯</div>
            <h3>Système de Prédiction Actif</h3>
            <p>Sélectionnez un moteur d'intelligence décisionnelle à gauche pour commencer l'analyse.</p>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&family=Roboto:wght@400;500;700&display=swap');

:root {
  --primary: #4361ee;
  --secondary: #3f37c9;
  --success: #4cc9f0;
  --danger: #f72585;
  --dark: #1b263b;
  --light: #f8f9fa;
}

body { font-family: 'Poppins', sans-serif; background-color: #f0f2f5; color: #2c3e50; margin: 0; }
.dashboard { max-width: 1450px; margin: 0 auto; padding: 10px; }

header {
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  color: white; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;
  box-shadow: 0 10px 20px rgba(0,0,0,0.2); display: flex; justify-content: space-between; align-items: center;
}
.version-tag { background: #f72585; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; }
.sub-status { display: flex; flex-direction: column; text-align: right; margin-right: 20px; }
.expiry-text { font-size: 0.8rem; color: #4cc9f0; font-weight: bold; }
.free-text { font-size: 0.8rem; color: #cbd5e1; }
.logout-button { background: rgba(255,255,255,0.1); border: 1px solid white; color: white; padding: 5px 15px; border-radius: 8px; cursor: pointer; }

.contact-banner { background: #fff3e0; color: #e65100; padding: 12px; text-align: center; border-radius: 10px; margin-bottom: 20px; font-weight: bold; border: 1px solid #ff9800; }
.contact-banner span { color: #d32f2f; margin: 0 5px; text-decoration: underline; }

.main-layout { display: grid; grid-template-columns: 380px 1fr; gap: 25px; height: 85vh; }

/* BARRE DE DEFILEMENT SIDEBAR */
.controls-column { overflow-y: auto; padding-right: 15px; }
.controls-column::-webkit-scrollbar { width: 6px; }
.controls-column::-webkit-scrollbar-thumb { background: var(--primary); border-radius: 10px; }

.card { background: white; border-radius: 18px; padding: 1.5rem; margin-bottom: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.05); }
.card h2 { font-size: 0.9rem; color: #64748b; text-transform: uppercase; margin-top: 0; }
.boss-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.v-badge { background: #ff9800; color: white; font-size: 0.6rem; padding: 3px 7px; border-radius: 5px; font-weight: bold; }

input, select { width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; font-family: 'Roboto'; }
.date-picker-row { display: flex; gap: 10px; }
button { font-family: 'Poppins', sans-serif; font-weight: 600; border: none; border-radius: 10px; padding: 12px; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; margin-top: 5px; color: white; background: #4361ee; text-transform: uppercase; }
.orange { background: #ff9800; }
.blue { background: #00b4d8; }
.danger { background: #ef4444; }
.gsheet-btn { background: #0f9d58; color: white; padding: 10px 20px; border-radius: 30px; text-decoration: none; font-weight: bold; display: block; text-align: center; }

.spec-table, .styled-table { width: 100%; border-collapse: collapse; }
.spec-table th, .styled-table th { background: #f1f5f9; padding: 15px; text-align: center; font-size: 0.8rem; }
.spec-table td, .styled-table td { padding: 15px; border-bottom: 1px solid #f1f5f9; text-align: center; font-weight: 800; }
.num-cell { font-size: 1.5rem; color: #1e293b; }
.badge-hit { background: #ff9800; color: white; padding: 3px 8px; border-radius: 5px; margin: 2px; display: inline-block; }

.best-duo-box { border-radius: 15px; padding: 20px; color: white; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
.duo-val { font-size: 2.5rem; font-weight: 800; }

.login-wrapper { display: flex; align-items: center; justify-content: center; height: 100vh; background: #1e293b; }
.login-box { background: white; padding: 3rem; border-radius: 25px; width: 400px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
.toggle-auth { color: var(--primary); cursor: pointer; margin-top: 15px; font-weight: bold; text-decoration: underline; }

.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 15px; }
.sum-card { background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; }
.sum-card h5 { margin: 0 0 5px 0; font-size: 0.75rem; color: #64748b; text-transform: uppercase; }
.sum-card ul { padding: 0; margin: 0; list-style: none; font-size: 0.85rem; font-weight: bold; }

.rank-card { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; display: flex; align-items: center; gap: 20px; margin-bottom: 10px; }
.rank-badge { background: var(--primary); color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; }
.rank-num { font-size: 1.8rem; font-weight: 800; }

.loader { text-align: center; padding: 50px; font-weight: bold; color: var(--primary); }
.error-box { background: #fee2e2; color: #b91c1c; padding: 15px; border-radius: 10px; text-align: center; }
.welcome-message { text-align: center; padding: 100px; color: #94a3b8; }
.w-icon { font-size: 4rem; margin-bottom: 15px; }
</style>