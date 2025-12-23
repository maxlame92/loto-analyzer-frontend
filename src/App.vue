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
const deepFavoriteResult = ref(null);
const profileResult = ref(null);
const matrixResult = ref(null);
const generalResult = ref(null); // Pour les classements standards (maintenant enrichis)

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

// INITIALISATION
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

// API CALL GENÉRIQUE
async function callApi(url, targetVar = 'general') {
  showWelcomeMessage.value = false; isLoading.value = true; error.value = null;
  if (targetVar === 'general') generalResult.value = null;
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
    else generalResult.value = data; // Stocke les résultats enrichis

    if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
    viewMode.value = 'cards'; // Mode par défaut pour les résultats riches
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

// WRAPPERS API
async function runDataUpdate(endpoint) { lastOperationType.value = 'update'; await callApi(`/collection/${endpoint}`, 'general'); }
async function runBatchVisualAnalysis(mode) { if (!startDate.value) return; lastOperationType.value = 'visual'; await callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${mode}`, 'general'); }
async function runSingleDayVisual(mode) { if (!selectedDate.value) return; lastOperationType.value = 'visual'; await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`, 'general'); }

// CLASSEMENTS ENRICHIS (Utilise generalResult)
async function runReport(reportType) {
  if (!selectedDate.value) return;
  lastOperationType.value = 'ranking_rich';
  let url = `/analysis/daily-frequency/${selectedDate.value}`;
  if (reportType === 'weekly-frequency') url = `/analysis/weekly-frequency/${selectedDate.value}`;
  else if (reportType === 'companions') { lastOperationType.value='simple'; url = `/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`; }
  await callApi(url, 'general');
}
async function runRangeAnalysis() {
  if (!startDate.value) return;
  lastOperationType.value = 'ranking_rich';
  await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`, 'general');
}

// PROFIL
async function runProfileAnalysis() {
  if (!profileNumber.value) return;
  lastOperationType.value = 'profile';
  profileResult.value = null;
  await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile');
}
async function analyzeDeepFavorite(item) {
  if (!startDate.value) { alert("Vérifiez les dates."); return; }
  deepFavoriteResult.value = null;
  await callApi(`/analysis/deep-favorite?target=${item}&start_date=${startDate.value}&end_date=${endDate.value}&context_day=${favDayName.value}&context_hour=${favHour.value}`, 'deep');
}
async function runDayAnalysis() { if (!startDate.value) return; await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist'); }
async function runTimeMatrix() { matrixResult.value = null; let url = `/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}`; if (matrixMode.value === 'cyclic') url += `&target_cyclic_day=${cyclicDay.value}`; await callApi(url, 'matrix'); }

// FONCTIONS SIMPLES (GARDENT L'ANCIEN AFFICHAGE)
async function runSequenceAnalysis() { if (!startDate.value) return; lastOperationType.value = 'simple'; await callApi(`/analysis/sequence-detection?start_date=${startDate.value}&end_date=${endDate.value}`, 'general'); }
async function runTriggerAnalysis() { if (!triggerTargetNumber.value) return; lastOperationType.value = 'simple'; let url = `/analysis/trigger-numbers?target_number=${triggerTargetNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`; if (triggerCompanionNumber.value) url += `&companion_number=${triggerCompanionNumber.value}`; await callApi(url, 'general'); }
async function runPredictionAnalysis() { if (!predictionNumber.value) return; lastOperationType.value = 'simple'; let url = `/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`; if (predictionCompanion.value) url += `&observed_companion=${predictionCompanion.value}`; await callApi(url, 'general'); }
async function runMultiPrediction() { if (!multiPredictionInput.value) return; lastOperationType.value = 'simple'; await callApi(`/analysis/multi-prediction?numbers_str=${multiPredictionInput.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'general'); }
async function runKantaReport(reportType) { if (!selectedDate.value) return; lastOperationType.value = 'simple'; await callApi(`/analysis/kanta-${reportType}/${selectedDate.value}`, 'general'); }
</script>

<template>
  <!-- ... HEADER ET LOGIN IDENTIQUES ... -->
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
    <header><h1>LE GUIDE DES FOURCASTER <span class="version-tag">V75</span></h1><div class="user-info"><span>{{ user.email }}</span><button @click="logout" class="logout-button">Déconnexion</button></div></header>

    <div class="main-layout">
      <!-- COLONNE GAUCHE (CONTROLS) IDENTIQUE V67 -->
      <div class="controls-column">
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

        <!-- Autres cartes (Prophet, Multi...) conservées -->
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

        <!-- 3. DEEP FAVORITE (TABLEAU HISTORIQUE) -->
        <div v-if="deepFavoriteResult" class="card result-spec-card" style="border-top:4px solid #fdd835;">
          <div class="spec-header"><h3>⭐ SCAN PROFOND : {{ deepFavoriteResult.favorite }}</h3><button @click="deepFavoriteResult=null" class="close-btn">×</button></div>
          <div v-if="deepFavoriteResult.data===null"><p>Jamais sorti.</p></div>
          <div v-else>
             <div class="summary-grid"><div class="sum-card"><h5>Top Jours</h5><ul><li v-for="x in deepFavoriteResult.summary.top_days">{{ x.val }} ({{x.count}})</li></ul></div><div class="sum-card"><h5>Top Heures</h5><ul><li v-for="x in deepFavoriteResult.summary.top_hours">{{ x.val }} ({{x.count}})</li></ul></div><div class="sum-card"><h5>Top Déclencheurs</h5><ul><li v-for="x in deepFavoriteResult.summary.top_triggers">{{ x.val }} ({{x.count}})</li></ul></div></div>
             <div class="table-responsive"><table class="spec-table"><thead><tr><th>Date</th><th>Heure</th><th>Déclencheur</th><th>Compagnons</th><th>Prophète</th></tr></thead><tbody><tr v-for="(row, idx) in deepFavoriteResult.history_table" :key="idx"><td>{{ row.date }} {{row.day}}</td><td>{{ row.time }}</td><td>{{ row.trigger }}</td><td>{{ row.companion }}</td><td>{{ row.prophet }}</td></tr></tbody></table></div>
          </div>
        </div>

        <!-- 4. PROFIL NUMERO (TABLEAU) -->
        <div v-if="profileResult" class="card result-spec-card" style="border-top:4px solid #ab47bc;">
          <div class="spec-header"><h3>👤 PROFIL : {{ profileResult.profile_data.number }}</h3><button @click="profileResult=null" class="close-btn">×</button></div>
          <div class="stats-grid"><div class="stat-item"><strong>Sorties</strong><br>{{ profileResult.profile_data.hits }}</div><div class="stat-item"><strong>Jour</strong><br>{{ profileResult.profile_data.best_day }}</div><div class="stat-item"><strong>Heure</strong><br>{{ profileResult.profile_data.best_time }}</div></div>
          
          <div class="summary-grid">
             <div class="sum-card"><h5>Top Déclencheurs (Avant)</h5><ul><li v-for="t in profileResult.profile_data.top_triggers" :key="t.val">{{ t.val }} ({{ t.count }})</li></ul></div>
             <div class="sum-card"><h5>Top Compagnons (Avec)</h5><ul><li v-for="c in profileResult.profile_data.top_companions" :key="c.val">{{ c.val }} ({{ c.count }})</li></ul></div>
             <div class="sum-card"><h5>Top Prophètes (Après)</h5><ul><li v-for="p in profileResult.profile_data.top_prophets" :key="p.val">{{ p.val }} ({{ p.count }})</li></ul></div>
          </div>
          <div class="ai-analysis"><h4>🧠 Analyse :</h4><p>{{ profileResult.ai_strategic_profile }}</p></div>
        </div>

        <!-- 5. RESULTATS STANDARDS ENRICHIS (LISTE DE CARTES) -->
        <section v-if="generalResult && lastOperationType === 'ranking_rich'" class="card results-card fade-in">
          <div class="spec-header"><h2>Classement Top 10 (Deep Scan)</h2><button @click="generalResult=null" class="close-btn">Fermer</button></div>
          
          <div class="ranking-list">
             <div v-for="(item, index) in generalResult.data" :key="item.number" class="rank-card">
                <div class="rank-badge">#{{ index + 1 }}</div>
                <div class="rank-main">
                   <span class="rank-num">{{ item.number }}</span>
                   <span class="rank-hits">{{ item.total_hits }} Sorties</span>
                </div>
                <div class="rank-details">
                   <div class="detail-col"><strong>Top Jours:</strong> <span v-for="d in item.top_days" :key="d.val">{{d.val}} </span></div>
                   <div class="detail-col"><strong>Top Heures:</strong> <span v-for="h in item.top_hours" :key="h.val">{{h.val}} </span></div>
                   <div class="detail-col red"><strong>Déclencheurs:</strong> <span v-for="t in item.top_triggers" :key="t.val">{{t.val}} </span></div>
                   <div class="detail-col blue"><strong>Compagnons:</strong> <span v-for="c in item.top_companions" :key="c.val">{{c.val}} </span></div>
                   <div class="detail-col purple"><strong>Prophètes:</strong> <span v-for="p in item.top_prophets" :key="p.val">{{p.val}} </span></div>
                </div>
             </div>
          </div>
        </section>

        <!-- RESULTATS STANDARDS SIMPLES (ANCIEN TABLEAU) -->
        <section v-if="generalResult && lastOperationType === 'simple'" class="card results-card fade-in">
          <div class="spec-header"><h2>Résultat Standard</h2><button @click="generalResult=null" class="close-btn">Fermer</button></div>
          <table class="styled-table">
            <thead><tr><th>#</th><th>Résultat</th></tr></thead>
            <tbody>
               <tr v-if="generalResult.prediction_ranking" v-for="r in generalResult.prediction_ranking"><td>{{r.number}}</td><td>{{r.count}}</td></tr>
               <tr v-else-if="generalResult.trigger_numbers_ranking" v-for="r in generalResult.trigger_numbers_ranking"><td>{{r.number}}</td><td>{{r.count}}</td></tr>
               <tr v-else-if="generalResult.kanta_pairs_ranking" v-for="r in generalResult.kanta_pairs_ranking"><td>{{r.pair}}</td><td>{{r.count}}</td></tr>
            </tbody>
          </table>
        </section>

        <div v-if="!dayAnalysisResult && !generalResult && !deepFavoriteResult && !profileResult && !matrixResult && !isLoading" class="welcome-message">
            <h3>Prêt à analyser</h3><p>Sélectionnez une fonction à gauche.</p>
        </div>
        <div v-if="isLoading" class="loader">Analyse en cours...</div>
        <div v-if="error" class="error-box">{{ error }}</div>

      </div>
    </div>
  </main>
</template>

<style scoped>
  /* ... (Gardez le style précédent, j'ajoute juste le style des cartes de classement) ... */
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
  body { font-family: 'Inter', sans-serif; background-color: #f8f9fa; color: #1e293b; }
  /* ... Copiez tout le CSS précédent ici ... */

  /* STYLE CARTES CLASSEMENT */
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
  
  /* ... (Reste du CSS : summary-grid, spec-card, etc.) ... */
  /* Assurez-vous d'avoir tout le CSS de la V67 pour que le reste soit beau */
</style>