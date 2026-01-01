<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// ETAT UTILISATEUR
const user = ref(null);
const userRole = ref('free'); // 'free' ou 'vip'
const subscriptionEnd = ref(null);
const showPaywall = ref(false);
const showGuide = ref(false); 
const isRegistering = ref(false); 

// FORMULAIRES
const email = ref('');
const password = ref('');
const authError = ref('');
const isAuthReady = ref(false);
const userFavorites = ref([]); 
const newFavoriteInput = ref('');

// INPUTS ANALYSE
const predictionNumber = ref('');
const predictionCompanion = ref('');
const profileNumber = ref('');
const triggerInput = ref(''); 
const selectedDayName = ref('Mercredi');
const selectedHour = ref('Toute la journée'); 
const matrixMode = ref('continuous'); 
const cyclicDay = ref(1);
const favDayName = ref('Tous');
const favHour = ref('Toutes');

// DATES
const selectedDate = ref('');
const startDate = ref('');
const endDate = ref('');
const spotStartDate = ref('');
const spotEndDate = ref('');

// RESULTATS
const standardResult = ref(null);
const dayAnalysisResult = ref(null); 
const deepFavoriteResult = ref(null);
const profileResult = ref(null);
const matrixResult = ref(null);
const isLoading = ref(false);
const error = ref(null);
const viewMode = ref('table');
const lastOperationType = ref('');
const selectedNumber = ref('');

// --- COMPUTED ---
const isVip = computed(() => {
  if (userRole.value === 'admin') return true;
  if (!subscriptionEnd.value) return false;
  const today = new Date();
  const expiry = new Date(subscriptionEnd.value);
  return today <= expiry;
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

const chartOptions = { responsive: true, maintainAspectRatio: false };

// --- INITIALISATION ---
onMounted(() => {
  const today = new Date();
  cyclicDay.value = today.getDate();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  selectedDate.value = `${year}-${month}-${day}`;
  endDate.value = `${year}-${month}-${day}`;
  spotEndDate.value = `${year}-${month}-${day}`;
  
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const startStr = `${oneMonthAgo.getFullYear()}-${(oneMonthAgo.getMonth()+1).toString().padStart(2,'0')}-${oneMonthAgo.getDate().toString().padStart(2,'0')}`;
  startDate.value = startStr;
  spotStartDate.value = startStr;

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      user.value = firebaseUser;
      const docRef = doc(db, "users", firebaseUser.uid);
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          userRole.value = data.role || 'free';
          subscriptionEnd.value = data.subscription_end || null;
          userFavorites.value = data.favorites || []; 
        } else {
          await setDoc(docRef, { role: 'free', subscription_end: null, favorites: [] }, { merge: true });
          userRole.value = 'free';
        }
      } catch (e) { console.error(e); }
    } else { user.value = null; userRole.value = ''; }
    isAuthReady.value = true;
  });
});

// --- AUTH ---
const handleAuth = async () => {
  isLoading.value = true; authError.value = '';
  try {
    if (isRegistering.value) {
      const cred = await createUserWithEmailAndPassword(auth, email.value, password.value);
      await setDoc(doc(db, "users", cred.user.uid), { role: 'free', subscription_end: null, favorites: [] });
      showGuide.value = true; 
    } else {
      await signInWithEmailAndPassword(auth, email.value, password.value);
    }
  } catch (error) { authError.value = "Erreur d'authentification. Vérifiez vos infos."; } 
  finally { isLoading.value = false; }
};
const logout = async () => { await signOut(auth); };

// --- API ---
async function callApi(url, targetVar = 'standard') {
  isLoading.value = true; error.value = null;
  if (targetVar === 'standard') standardResult.value = null;
  try {
    const token = await user.value.getIdToken();
    const headers = { 'Authorization': `Bearer ${token}` };
    const response = await fetch(`${API_BASE_URL}${url}`, { method: 'GET', headers });
    
    if (response.status === 403) {
       showPaywall.value = true;
       throw new Error("🔒 ACCÈS VIP REQUIS");
    }
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || `Erreur ${response.status}`);
    
    if (targetVar === 'specialist') dayAnalysisResult.value = data;
    else if (targetVar === 'deep') deepFavoriteResult.value = data;
    else if (targetVar === 'profile') profileResult.value = data;
    else if (targetVar === 'matrix') matrixResult.value = data;
    else standardResult.value = data;

    viewMode.value = 'table';
  } catch (err) { error.value = err.message; } 
  finally { isLoading.value = false; }
}

function requireVip(callback) {
  if (isVip.value) { callback(); } else { showPaywall.value = true; }
}

// --- ACTIONS ---
async function runRangeAnalysis() {
  if (!startDate.value) return;
  lastOperationType.value = 'ranking_rich';
  await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard');
}

async function runTimeMatrix() { requireVip(async () => {
  matrixResult.value = null;
  let url = `/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}`;
  if (matrixMode.value === 'cyclic') url += `&target_cyclic_day=${cyclicDay.value}`;
  await callApi(url, 'matrix');
});}

async function runDayAnalysis() { requireVip(async () => {
  await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist');
});}

async function analyzeDeepFavorite(item) { requireVip(async () => {
  deepFavoriteResult.value = null;
  await callApi(`/analysis/deep-favorite?target=${item}&start_date=${startDate.value}&end_date=${endDate.value}`, 'deep');
});}

async function runProfileAnalysis() { requireVip(async () => {
  profileResult.value = null;
  await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile');
});}

async function runPredictionAnalysis() { requireVip(async () => {
  lastOperationType.value = 'simple';
  let url = `/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  if (predictionCompanion.value) url += `&observed_companion=${predictionCompanion.value}`;
  await callApi(url, 'standard');
});}

async function runTriggerAnalysis() { requireVip(async () => {
  lastOperationType.value = 'simple'; 
  const parts = triggerInput.value.replace(/[^0-9]/g, ' ').trim().split(/\s+/);
  let url = `/analysis/trigger-numbers?target_number=${parts[0]}&start_date=${startDate.value}&end_date=${endDate.value}`; 
  if (parts.length > 1) url += `&companion_number=${parts[1]}`; 
  await callApi(url, 'standard'); 
});}

async function runSingleDayVisual(mode) { requireVip(async () => {
  lastOperationType.value = 'visual'; 
  await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`, 'standard'); 
});}

async function runReport(reportType) { requireVip(async () => {
  if (reportType === 'daily-frequency') {
      lastOperationType.value = 'ranking_rich';
      await callApi(`/analysis/daily-frequency/${selectedDate.value}`, 'standard');
  }
  else if (reportType === 'weekly-frequency') {
      lastOperationType.value = 'ranking_rich';
      await callApi(`/analysis/weekly-frequency/${selectedDate.value}`, 'standard');
  }
  else if (reportType === 'companions') { 
      lastOperationType.value = 'simple'; 
      await callApi(`/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`, 'standard'); 
  }
});}

async function runKantaReport() { requireVip(async () => {
  lastOperationType.value = 'simple'; 
  await callApi(`/analysis/kanta-daily-rank/${selectedDate.value}`, 'standard'); 
});}

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

function contactWhatsApp() {
  // NUMERO MIS A JOUR ICI
  window.open("https://wa.me/2250749522365?text=Bonjour, je veux activer mon compte VIP Le Guide.", "_blank");
}
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen"><p>Chargement...</p></div>
  
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2>{{ isRegistering ? 'INSCRIPTION GRATUITE' : 'CONNEXION' }}</h2>
      <p style="text-align:center; color:#666; font-size:0.9rem; margin-bottom:20px;">
        Accédez à la plus puissante IA de prédiction Loto.
      </p>
      <form @submit.prevent="handleAuth">
        <div class="input-group"><label>Email</label><input type="email" v-model="email" required /></div>
        <div class="input-group"><label>Mot de passe</label><input type="password" v-model="password" required /></div>
        <button type="submit" class="login-button" :disabled="isLoading">{{ isLoading ? '...' : (isRegistering ? "S'inscrire" : 'Se Connecter') }}</button>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
        <p class="switch-auth">
          <span v-if="!isRegistering">Pas de compte ? <a @click="isRegistering = true">Créer un compte</a></span>
          <span v-else>Déjà inscrit ? <a @click="isRegistering = false">Se connecter</a></span>
        </p>
      </form>
    </div>
  </div>

  <main v-else class="dashboard">
    <header>
      <h1>LE GUIDE <span class="version-tag">V90</span></h1>
      <div class="user-info">
        <span v-if="isVip" class="vip-badge">👑 VIP ACTIF</span>
        <span v-else class="free-badge">GRATUIT</span>
        <button @click="showGuide = true" class="guide-btn-header">📘 GUIDE & STRATÉGIES</button>
        <button @click="logout" class="logout-button">Sortir</button>
      </div>
    </header>

    <div class="main-layout">
      <!-- CONTROLS -->
      <div class="controls-column">
        
        <section class="card free-card">
          <div class="boss-header">
             <h2>📊 FRÉQUENCE PÉRIODE (Top 10)</h2>
             <span class="badge-free">GRATUIT</span>
          </div>
          <p class="small-text">Détectez les numéros en forme sur une période.</p>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runRangeAnalysis" :disabled="isLoading||!startDate" class="free-btn">LANCER L'ANALYSE GRATUITE</button>
        </section>

        <section class="card matrix-card">
          <div class="boss-header"><h2>🕰️ MATRICE TEMPORELLE</h2><span class="badge-spec">VIP</span></div>
          <div class="tabs"><button @click="matrixMode='continuous'" :class="{active: matrixMode==='continuous'}">CONTINU</button><button @click="matrixMode='cyclic'" :class="{active: matrixMode==='cyclic'}">CYCLIQUE</button></div>
          <div v-if="matrixMode==='cyclic'" style="margin-bottom:10px;"><label>Jour (1-31):</label><input type="number" v-model="cyclicDay" min="1" max="31"/></div>
          <button @click="runTimeMatrix" :disabled="isLoading" class="spec-btn"><span v-if="!isVip">🔒 </span>ANALYSER & PRÉDIRE</button>
        </section>
        
        <section class="card spec-card">
          <div class="boss-header"><h2>📅 ANALYSTE SPÉCIALISTE</h2><span class="badge-spec">VIP</span></div>
          <label>Jour :</label><select v-model="selectedDayName"><option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option></select>
          <label>Heure :</label><select v-model="selectedHour"><option>Toute la journée</option><option>01H</option><option>03H</option><option>07H</option><option>08H</option><option>10H</option><option>13H</option><option>16H</option><option>19H</option><option>21H</option><option>22H</option><option>23H</option></select>
          <button @click="runDayAnalysis" :disabled="isLoading" class="spec-btn"><span v-if="!isVip">🔒 </span>SCANNER JOUR</button>
        </section>
        
        <section class="card">
          <h2>⭐ Mes Numéros Favoris</h2>
          <div class="favorites-input-group"><input type="text" v-model="newFavoriteInput" placeholder="Ex: 7" @keyup.enter="addFavorite"/><button @click="addFavorite" :disabled="!newFavoriteInput" class="btn-small">Ajouter</button></div>
          <div v-if="userFavorites.length>0" class="favorites-list"><div v-for="item in userFavorites" :key="item" class="favorite-chip"><span class="fav-label">{{ item }}</span><div class="fav-actions"><button @click="analyzeDeepFavorite(item)" class="icon-btn">⚡</button></div><span @click="removeFavorite(item)" class="fav-delete">×</span></div></div>
          <p v-if="!isVip" class="lock-msg">🔒 Analyse réservée aux VIP</p>
        </section>
        
        <section class="card">
          <h2>Analyse Visuelle</h2>
          <div class="button-group-vertical">
             <button @click="runBatchVisualAnalysis('frequency')" :disabled="isLoading||!startDate" class="visu-btn"><span v-if="!isVip">🔒 </span>Rouge/Bleu (Période)</button>
             <button @click="runBatchVisualAnalysis('kanta')" :disabled="isLoading||!startDate" class="visu-btn"><span v-if="!isVip">🔒 </span>Kanta (Période)</button>
          </div>
        </section>
        
        <section class="card">
          <h2>Rapports Ponctuels</h2>
          <input type="date" v-model="selectedDate"/>
          <div class="button-group-vertical" style="margin-top:10px;">
             <button @click="runSingleDayVisual('frequency')" :disabled="isLoading||!selectedDate"><span v-if="!isVip">🔒 </span>🎨 Surlignage Jour</button>
             <button @click="runSingleDayVisual('kanta')" :disabled="isLoading||!selectedDate"><span v-if="!isVip">🔒 </span>🎨 Surlignage Kanta</button>
          </div>
          <hr>
          <div class="button-group-vertical">
            <button @click="runReport('daily-frequency')" :disabled="isLoading||!selectedDate"><span v-if="!isVip">🔒 </span>Classement Jour</button>
            <button @click="runReport('weekly-frequency')" :disabled="isLoading||!selectedDate"><span v-if="!isVip">🔒 </span>Classement Semaine</button>
            <hr>
            <button @click="runKantaReport" :disabled="isLoading||!selectedDate"><span v-if="!isVip">🔒 </span>Kanta Rank</button>
            <div class="input-group" style="margin-top:10px;">
                <input type="number" v-model="selectedNumber" placeholder="N° Compagnons"/>
                <button @click="runReport('companions')" :disabled="isLoading||!selectedDate||!selectedNumber"><span v-if="!isVip">🔒 </span>Analyser</button>
            </div>
          </div>
        </section>
        
        <section class="card"><h2>Période & Profilage</h2><input type="number" v-model="profileNumber" placeholder="N° Profil"/><button @click="runProfileAnalysis" :disabled="isLoading||!startDate||!profileNumber"><span v-if="!isVip">🔒 </span>Générer Profil</button></section>
        <section class="card prophet-card"><h2>🔮 Le Prophète</h2><input type="number" v-model="predictionNumber" placeholder="N° vu"/><button @click="runPredictionAnalysis" :disabled="isLoading||!startDate||!predictionNumber" class="prophet-btn"><span v-if="!isVip">🔒 </span>Voir Futur</button></section>
        <section class="card"><h2>IA Avancée</h2><input type="text" v-model="triggerInput" placeholder="Cible"/><button @click="runTriggerAnalysis" :disabled="isLoading||!triggerInput"><span v-if="!isVip">🔒 </span>Déclencheurs ⚡</button></section>
      </div>

      <!-- RESULTATS -->
      <div class="results-column">
        
        <section v-if="standardResult && lastOperationType === 'ranking_rich'" class="card results-card fade-in">
          <div class="spec-header"><h2>Classement Top 10</h2><button @click="standardResult=null" class="close-btn">Fermer</button></div>
          <div class="ranking-list"><div v-for="(item, index) in standardResult.data" :key="item.number" class="rank-card"><div class="rank-badge">#{{ index + 1 }}</div><div class="rank-main"><span class="rank-num">{{ item.number }}</span><span class="rank-hits">{{ item.total_hits }} Sorties</span></div><div class="rank-details"><div class="detail-col"><strong>Top Jours</strong> <span v-for="(d, i) in item.top_days">{{d.val}} ({{d.count}}){{ i < item.top_days.length - 1 ? ', ' : '' }}</span></div><div class="detail-col"><strong>Top Heures</strong> <span v-for="(h, i) in item.top_hours">{{h.val}} ({{h.count}}){{ i < item.top_hours.length - 1 ? ', ' : '' }}</span></div><div class="detail-col red"><strong>Déclencheurs</strong> <span v-for="(t, i) in item.top_triggers">{{t.val}} ({{t.count}}){{ i < item.top_triggers.length - 1 ? ', ' : '' }}</span></div><div class="detail-col blue"><strong>Compagnons</strong> <span v-for="(c, i) in item.top_companions">{{c.val}} ({{c.count}}){{ i < item.top_companions.length - 1 ? ', ' : '' }}</span></div><div class="detail-col purple"><strong>Prophètes</strong> <span v-for="(p, i) in item.top_prophets">{{p.val}} ({{p.count}}){{ i < item.top_prophets.length - 1 ? ', ' : '' }}</span></div></div></div></div>
          <div v-if="!isVip" class="teaser-box">
             <h3>🚀 PASSEZ A LA VITESSE SUPÉRIEURE</h3>
             <p>Ce classement est un bon début. Mais pour gagner VRAIMENT, il vous faut la Matrice et le Spécialiste.</p>
             <button @click="showPaywall = true" class="teaser-btn">DÉBLOQUER L'ARSENAL VIP</button>
          </div>
        </section>

        <div v-if="matrixResult" class="card result-spec-card" style="border-top:4px solid #ff9800;">
           <div class="spec-header"><h3>🕰️ MATRICE TEMPORELLE</h3><button @click="matrixResult=null" class="close-btn">×</button></div>
           <div v-if="matrixResult.prediction" class="prediction-tab"><div class="best-duo-box" style="background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);"><span class="duo-label">🔮 PRÉDICTION :</span><span class="duo-val">{{ matrixResult.prediction.two_short }}</span></div></div>
           <div class="table-responsive"><table class="spec-table"><thead><tr><th>Date</th><th>Base</th><th>Hits</th></tr></thead><tbody><tr v-for="(row, idx) in matrixResult.matrix_data" :key="idx"><td>{{ row.date }}</td><td class="num-cell">{{ row.base_number }}</td><td><div v-for="h in row.detailed_hits" :key="h.num"><span class="badge-hit">{{ h.num }}</span> ({{ h.time }} - {{ h.reason }})</div></td></tr></tbody></table></div>
        </div>

        <!-- Autres blocs résultats identiques... -->
        <div v-if="dayAnalysisResult" class="card result-spec-card"><div class="spec-header"><h3>📊 TOP 5 : {{ dayAnalysisResult.day_analyzed }}</h3><button @click="dayAnalysisResult=null" class="close-btn">×</button></div><div class="best-duo-box"><span class="duo-label">🔥 DUO OR :</span><span class="duo-val">{{ dayAnalysisResult.best_duo }}</span></div><div class="table-responsive"><table class="spec-table"><thead><tr><th>Stat</th><th>N°</th><th>Kanta</th><th>Compagnons</th><th>Déclencheurs</th><th>Prophète</th></tr></thead><tbody><tr v-for="row in dayAnalysisResult.recurrence_data" :key="row.number"><td style="font-size:1.2rem;">{{ row.status_icon }}</td><td class="num-cell">{{ row.number }}</td><td style="color:#d32f2f;">{{ row.kanta }}</td><td>{{ row.best_companion }}</td><td>{{ row.best_trigger }}</td><td class="proph-cell">{{ row.best_prophet }}</td></tr></tbody></table></div></div>
        <div v-if="deepFavoriteResult" class="card result-spec-card" style="border-top:4px solid #fdd835;"><div class="spec-header"><h3>⭐ SCAN PROFOND : {{ deepFavoriteResult.favorite }}</h3><button @click="deepFavoriteResult=null" class="close-btn">×</button></div><div v-if="deepFavoriteResult.data===null"><p>Jamais sorti.</p></div><div v-else><div class="summary-grid"><div class="sum-card"><h5>Top Jours</h5><ul><li v-for="x in deepFavoriteResult.summary.top_days">{{ x.val }} ({{x.count}})</li></ul></div><div class="sum-card"><h5>Top Heures</h5><ul><li v-for="x in deepFavoriteResult.summary.top_hours">{{ x.val }} ({{x.count}})</li></ul></div><div class="sum-card"><h5>Top Déclencheurs</h5><ul><li v-for="x in deepFavoriteResult.summary.top_triggers">{{ x.val }} ({{x.count}})</li></ul></div><div class="sum-card"><h5>Top Compagnons</h5><ul><li v-for="x in deepFavoriteResult.summary.top_companions">{{ x.val }} ({{x.count}})</li></ul></div><div class="sum-card"><h5>Top Prophètes</h5><ul><li v-for="x in deepFavoriteResult.summary.top_prophets">{{ x.val }} ({{x.count}})</li></ul></div></div><div class="table-responsive"><table class="spec-table"><thead><tr><th>Date</th><th>Heure</th><th>Déclencheur</th><th>Compagnons</th><th>Prophète</th></tr></thead><tbody><tr v-for="(row, idx) in deepFavoriteResult.history_table" :key="idx"><td>{{ row.date }} {{row.day}}</td><td>{{ row.time }}</td><td>{{ row.trigger }}</td><td>{{ row.companion }}</td><td>{{ row.prophet }}</td></tr></tbody></table></div></div></div>
        <div v-if="profileResult" class="card result-spec-card" style="border-top:4px solid #ab47bc;"><div class="spec-header"><h3>👤 PROFIL COMPLET : {{ profileResult.profile_data.number }}</h3><button @click="profileResult=null" class="close-btn">×</button></div><div class="stats-grid"><div class="stat-item"><strong>Sorties</strong><br>{{ profileResult.profile_data.hits }}</div><div class="stat-item"><strong>Jour</strong><br>{{ profileResult.profile_data.best_day }}</div><div class="stat-item"><strong>Heure</strong><br>{{ profileResult.profile_data.best_time }}</div></div><div class="summary-grid"><div class="sum-card"><h5>Top Jours</h5><ul><li v-for="d in profileResult.profile_data.top_days" :key="d.val">{{ d.val }} ({{ d.count }})</li></ul></div><div class="sum-card"><h5>Top Heures</h5><ul><li v-for="h in profileResult.profile_data.top_hours" :key="h.val">{{ h.val }} ({{ h.count }})</li></ul></div><div class="sum-card"><h5>Top Compagnons</h5><ul><li v-for="c in profileResult.profile_data.top_companions" :key="c.val">{{ c.val }} ({{ c.count }})</li></ul></div></div><div class="summary-grid"><div class="sum-card"><h5>Top Déclencheurs (Avant)</h5><ul><li v-for="t in profileResult.profile_data.top_triggers" :key="t.val">{{ t.val }} ({{ t.count }})</li></ul></div><div class="sum-card"><h5>Top Prophètes (Après)</h5><ul><li v-for="p in profileResult.profile_data.top_prophets" :key="p.val">{{ p.val }} ({{ p.count }})</li></ul></div></div><div class="ai-analysis"><h4>🧠 Analyse Expert :</h4><p>{{ profileResult.ai_strategic_profile }}</p></div></div>
        <section v-if="standardResult && lastOperationType === 'simple'" class="card results-card fade-in"><div class="spec-header"><h2>Résultat Standard</h2><button @click="standardResult=null" class="close-btn">Fermer</button></div><div v-if="standardResult.message || standardResult.analysis_period" class="success-box large"><p>✅ {{ standardResult.message || `Analyse : ${standardResult.analysis_period}` }}</p></div><div v-if="isTableVisible && !lastOperationType.includes('visual')" class="view-controls"><button @click="viewMode = 'table'" :class="{ active: viewMode === 'table' }" class="toggle-btn">📋 Tableau</button><button @click="viewMode = 'chart'" :class="{ active: viewMode === 'chart' }" class="toggle-btn">📊 Graphique</button></div><div v-if="isTableVisible && viewMode === 'chart' && !lastOperationType.includes('visual')" class="chart-container"><Bar :data="chartData" :options="chartOptions" /></div><table v-else-if="isTableVisible" class="styled-table"><thead><tr><th v-for="h in tableHeaders" :key="h">{{ h }}</th></tr></thead><tbody><tr v-for="(row, index) in tableData" :key="index"><td v-if="lastOperationType.includes('kanta-rank')">{{ row.pair }}</td><td v-else>#{{ index + 1 }}</td><td v-if="!lastOperationType.includes('kanta-rank')">{{ row.number }}</td><td>{{ row.count }}</td></tr></tbody></table></section>

        <div v-if="!standardResult && !matrixResult && !isLoading" class="welcome-message">
            <h3>Bienvenue sur Le Guide</h3>
            <p v-if="!isVip">Vous êtes en mode <strong>GRATUIT</strong>. Utilisez la fonction "Fréquence Période" ci-dessus pour détecter les numéros forts et tester la puissance de l'outil.</p>
            <p v-else>Mode <strong>VIP ACTIF</strong>. Vous avez accès à l'Arsenal complet.</p>
        </div>
        <div v-if="isLoading" class="loader">Analyse en cours...</div><div v-if="error" class="error-box">{{ error }}</div>
      </div>
    </div>

    <!-- MODAL GUIDE EXPERT (NOUVEAU CONTENU) -->
    <div v-if="showGuide" class="modal-overlay">
      <div class="modal-box guide-box">
        <button @click="showGuide = false" class="close-modal-btn">×</button>
        <h2>📘 LA MÉTHODE DU GAGNANT</h2>
        <div class="guide-content">
          <p>Bienvenue dans l'élite. Ici, on ne joue pas au hasard, on joue avec des <strong>Données</strong>.</p>
          
          <div class="guide-section free-section">
            <h3>🚀 ÉTAPE 1 : LA PREUVE (Fonction Gratuite)</h3>
            <p>Avant de payer, <strong>testez la puissance</strong> avec la fonction "Fréquence Période".</p>
            <p><strong>LA STRATÉGIE DE TEST :</strong></p>
            <ol>
               <li>Mettez une période récente (ex: les 3 derniers mois).</li>
               <li>Lancez l'analyse. Regardez le <strong>TOP 3</strong> des numéros.</li>
               <li><strong>Action :</strong> Surveillez ces 3 numéros. Vous verrez qu'ils sortent presque tous les jours. C'est votre "Base".</li>
               <li><em>Mais attention : Savoir "Quoi" jouer ne suffit pas. Il faut savoir "Quand".</em></li>
            </ol>
          </div>

          <div class="guide-section vip-section">
            <h3>💎 ÉTAPE 2 : LA PRÉCISION CHIRURGICALE (VIP)</h3>
            <p>Pour gagner gros, il vous faut l'arsenal complet (10 000 FCFA/Mois).</p>
            
            <h4>1. 📅 L'ANALYSTE SPÉCIALISTE (Le Sniper)</h4>
            <p>Il ne vous donne pas un numéro au hasard. Il vous dit : <em>"Le Lundi à 10H00, le 14 sort toujours avec le 55"</em>. C'est la fonction reine pour les <strong>Two-Sure</strong>.</p>
            
            <h4>2. 🕰️ LA MATRICE TEMPORELLE (Le Décodeur)</h4>
            <p>C'est des mathématiques pures. Si on est le 27 du mois, la matrice calcule les numéros "obligatoires" (Renversé J+1, Kanta J-1...). C'est infaillible sur le long terme.</p>
            
            <h4>3. ⭐ LE SCAN PROFOND (L'Espion)</h4>
            <p>Vous aimez le numéro 10 ? Le Scan Profond vous dira : <em>"Attention, le 10 ne sort jamais le Mardi, mais il adore le Jeudi à 13H"</em>. Ne perdez plus votre argent aux mauvaises heures.</p>
            
            <h4>⚡ LA COMBINAISON GAGNANTE</h4>
            <p>Si la <strong>Matrice</strong> vous donne le <strong>82</strong> ET que le <strong>Spécialiste</strong> vous dit que le 82 est fort à 10H... <strong>C'EST LE JACKPOT.</strong></p>
          </div>

          <div class="guide-cta">
            <p>Ne restez pas spectateur.</p>
            <div class="price-tag-large">10 000 FCFA / MOIS</div>
            <button @click="showGuide = false; showPaywall = true" class="cta-btn">JE PASSE VIP MAINTENANT</button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL PAYWALL (NUMERO MIS A JOUR) -->
    <div v-if="showPaywall" class="modal-overlay paywall-overlay">
      <div class="modal-box paywall-box">
        <div class="lock-icon">🔒</div>
        <h2>ACCÈS VIP REQUIS</h2>
        <p>Débloquez la Matrice, le Spécialiste et les Prédictions IA.</p>
        
        <div class="pricing-card">
          <span class="price">10 000 FCFA</span>
          <span class="duration">/ Mois</span>
        </div>

        <div class="payment-steps">
          <p>1. Faites un dépôt <strong>Wave</strong> ou <strong>Orange Money</strong> au :</p>
          <div class="phone-number">+225 07 49 52 23 65</div>
          <p>2. Cliquez sur le bouton vert pour m'envoyer la preuve sur WhatsApp.</p>
        </div>

        <button @click="contactWhatsApp" class="whatsapp-btn">
          📞 ACTIVER MON COMPTE (WhatsApp)
        </button>
        
        <button @click="showPaywall = false" class="close-link">Fermer</button>
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
.vip-badge { background: #ffd700; color: #000; padding: 5px 10px; border-radius: 20px; font-weight: bold; }
.free-badge { background: #e0e0e0; color: #666; padding: 5px 10px; border-radius: 20px; font-weight: bold; }
.guide-btn-header { background: #fff; color: #4361ee; width: auto; margin: 0 10px; }
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; justify-content: center; align-items: center; }
.modal-box { background: white; width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto; padding: 30px; border-radius: 20px; text-align: left; }
.guide-content h3 { color: #1e293b; border-bottom: 2px solid #eee; padding-bottom: 5px; margin-top: 20px; }
.guide-section { padding: 15px; border-radius: 10px; margin-bottom: 15px; }
.free-section { background: #e3f2fd; border-left: 5px solid #2196f3; }
.vip-section { background: #f3e5f5; border-left: 5px solid #9c27b0; }
.guide-cta { text-align: center; margin-top: 30px; background: #1b263b; color: white; padding: 20px; border-radius: 15px; }
.price-tag-large { font-size: 2rem; font-weight: 800; color: #ffd700; margin: 10px 0; }
.cta-btn { background: #ffd700; color: #000; font-size: 1.1rem; padding: 15px 30px; border-radius: 30px; border: none; font-weight: bold; cursor: pointer; animation: pulse 2s infinite; }
@keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
.phone-number { font-size: 1.5rem; font-weight: bold; background: #eee; padding: 10px; text-align: center; margin: 10px 0; border-radius: 10px; }
.whatsapp-btn { background: #25D366; } .close-link { background: transparent; color: #999; text-decoration: underline; width: auto; display: block; margin: 10px auto; }
.teaser-box { margin-top: 20px; background: linear-gradient(135deg, #1e293b 0%, #000 100%); color: white; padding: 20px; border-radius: 10px; text-align: center; }
.teaser-btn { background: #f72585; border: none; color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold; margin-top: 10px; cursor: pointer; }
.close-modal-btn { float: right; background: transparent; color: #333; font-size: 2rem; width: auto; padding: 0; margin-top: -10px; }
/* GARDER LE RESTANT DU CSS D'ORIGINE */
.ranking-list { display: flex; flex-direction: column; gap: 15px; } .rank-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; display: flex; align-items: flex-start; gap: 15px; } .rank-badge { background: linear-gradient(135deg, #4361ee, #3a0ca3); color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; min-width: 40px; } .rank-main { display: flex; flex-direction: column; align-items: center; min-width: 80px; border-right: 1px solid #eee; padding-right: 15px; } .rank-num { font-size: 2rem; font-weight: 800; color: #0f172a; } .rank-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; width: 100%; } .detail-col { font-size: 0.8rem; color: #334155; } .detail-col strong { display: block; color: #64748b; text-transform: uppercase; font-size: 0.7rem; margin-bottom: 2px; } .detail-col.red span { color: #d32f2f; font-weight: bold; } .detail-col.blue span { color: #1976d2; font-weight: bold; } .detail-col.purple span { color: #7b1fa2; font-weight: bold; }
</style>