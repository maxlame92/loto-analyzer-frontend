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

// VARIABLES SPECIALISTE
const selectedDayName = ref('Mercredi');
const selectedHour = ref('Toute la journée'); 
// VARIABLES MATRICE TEMPORELLE
const matrixMode = ref('continuous'); // 'continuous' ou 'cyclic'
const cyclicDay = ref(1); // Pour le jour du mois (1-31)

// RESULTATS
const dayAnalysisResult = ref(null); 
const standardResult = ref(null);
const deepFavoriteResult = ref(null);
const profileResult = ref(null);
const matrixResult = ref(null);

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
  cyclicDay.value = today.getDate(); // Jour du mois par défaut
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

// NOUVEAU : APPEL MATRICE
async function runTimeMatrix() {
  matrixResult.value = null;
  let url = `/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}`;
  if (matrixMode.value === 'cyclic') url += `&target_cyclic_day=${cyclicDay.value}`;
  await callApi(url, 'matrix');
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
    else if (targetVar === 'matrix') matrixResult.value = data;
    else standardResult.value = data;

    if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
    viewMode.value = 'table';
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

async function runDataUpdate(endpoint) { lastOperationType.value = 'update'; await callApi(`/collection/${endpoint}`, 'standard'); }
async function runBatchVisualAnalysis(mode) { if (!startDate.value) return; lastOperationType.value = 'visual'; await callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${mode}`, 'standard'); }
async function runSingleDayVisual(mode) { if (!selectedDate.value) return; lastOperationType.value = 'visual'; await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`, 'standard'); }
async function runReport(reportType) { if (!selectedDate.value) return; let url = `/analysis/daily-frequency/${selectedDate.value}`; if (reportType === 'weekly-frequency') url = `/analysis/weekly-frequency/${selectedDate.value}`; else if (reportType === 'companions') url = `/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`; await callApi(url, 'standard'); }
async function runRangeAnalysis() { if (!startDate.value) return; lastOperationType.value = 'frequency'; await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard'); }
async function runProfileAnalysis() { if (!profileNumber.value) return; lastOperationType.value = 'profile'; profileResult.value = null; await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile'); }
async function runSequenceAnalysis() { if (!startDate.value) return; lastOperationType.value = 'sequence'; await callApi(`/analysis/sequence-detection?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard'); }
async function runTriggerAnalysis() { if (!triggerTargetNumber.value) return; lastOperationType.value = 'trigger'; let url = `/analysis/trigger-numbers?target_number=${triggerTargetNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`; if (triggerCompanionNumber.value) url += `&companion_number=${triggerCompanionNumber.value}`; await callApi(url, 'standard'); }
async function runPredictionAnalysis() { if (!predictionNumber.value) return; lastOperationType.value = 'prediction'; let url = `/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`; if (predictionCompanion.value) url += `&observed_companion=${predictionCompanion.value}`; await callApi(url, 'standard'); }
async function runMultiPrediction() { if (!multiPredictionInput.value) return; lastOperationType.value = 'prediction'; await callApi(`/analysis/multi-prediction?numbers_str=${multiPredictionInput.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'standard'); }
async function runKantaReport(reportType) { if (!selectedDate.value) return; lastOperationType.value = 'kanta-rank'; await callApi(`/analysis/kanta-${reportType}/${selectedDate.value}`, 'standard'); }
async function runDayAnalysis() { if (!startDate.value) return; await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist'); }
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
      <h1>LE GUIDE DES FOURCASTER <span class="version-tag">V57</span></h1>
      <div class="user-info">
        <span>Connecté : <strong>{{ user.email }}</strong></span>
        <button @click="logout" class="logout-button">Déconnexion</button>
      </div>
    </header>

    <div class="main-layout">
      <!-- COLONNE GAUCHE AVEC SCROLLBAR -->
      <div class="controls-column">
        
        <!-- NOUVEAU BLOC : MATRICE TEMPORELLE -->
        <section class="card matrix-card">
          <div class="boss-header">
             <h2>🕰️ MATRICE TEMPORELLE</h2>
             <span class="badge-spec" style="background:#ff9800;">NEW</span>
          </div>
          <p class="small-text">Analyse basée sur la Date, Renversé et Kanta (+/- 2).</p>
          <div class="tabs">
             <button @click="matrixMode = 'continuous'" :class="{ active: matrixMode === 'continuous' }">CONTINU (Séquence)</button>
             <button @click="matrixMode = 'cyclic'" :class="{ active: matrixMode === 'cyclic' }">CYCLIQUE (Le 14 du mois)</button>
          </div>
          <div v-if="matrixMode === 'cyclic'" style="margin-bottom:10px;">
             <label>Jour du Mois (1-31) :</label>
             <input type="number" v-model="cyclicDay" min="1" max="31" />
          </div>
          <div class="date-picker-row">
             <input type="date" v-model="startDate" />
             <input type="date" v-model="endDate" />
          </div>
          <button @click="runTimeMatrix" :disabled="isLoading" class="spec-btn" style="background:#ff9800;">LANCER MATRICE</button>
        </section>

        <!-- AUTRES CARTES -->
        <section class="card spec-card">
          <div class="boss-header"><h2>📅 ANALYSTE SPÉCIALISTE</h2><span class="badge-spec">360°</span></div>
          <p class="small-text">Trouvez les Habitués de chaque jour.</p>
          <label>Jour :</label>
          <select v-model="selectedDayName" class="day-select">
            <option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option>
          </select>
          <label>Heure :</label>
          <select v-model="selectedHour" class="day-select">
            <option>Toute la journée</option><option>01H</option><option>03H</option><option>07H</option><option>08H</option><option>10H</option><option>13H</option><option>16H</option><option>19H</option><option>21H</option><option>22H</option><option>23H</option>
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

        <!-- NOUVEAU RESULTAT : MATRICE TEMPORELLE -->
        <div v-if="matrixResult" class="card result-spec-card" style="border-top:4px solid #ff9800;">
           <div class="spec-header">
              <h3>🕰️ MATRICE TEMPORELLE ({{ matrixResult.mode }})</h3>
              <button @click="matrixResult = null" class="close-btn">×</button>
           </div>
           <div class="ai-analysis"><h4>🧠 Analyse Matrice :</h4><p>{{ matrixResult.ai_analysis }}</p></div>
           <div class="table-responsive">
             <table class="spec-table">
               <thead><tr><th>Date</th><th>Base</th><th>Lot Théorique</th><th>Sorties Réelles</th></tr></thead>
               <tbody>
                 <tr v-for="(row, idx) in matrixResult.matrix_data" :key="idx">
                   <td>{{ row.date }}<br><small>{{ row.day_name }}</small></td>
                   <td class="num-cell">{{ row.base_number }}</td>
                   <td style="font-size:0.8rem; color:#666;">{{ row.matrix_lot.join(', ') }}</td>
                   <td>
                      <span v-if="row.hit_count > 0" class="badge-hit">{{ row.hits.join(', ') }} ({{ row.hit_count }})</span>
                      <span v-else style="color:#ccc;">-</span>
                   </td>
                 </tr>
               </tbody>
             </table>
           </div>
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

        <!-- RESULTAT DEEP FAVORITE (TABLEAU HISTORIQUE) -->
        <div v-if="deepFavoriteResult" class="card result-spec-card" style="border-top:4px solid #fdd835;">
          <div class="spec-header">
            <h3>⭐ SCAN PROFOND : {{ deepFavoriteResult.favorite }}</h3>
            <button @click="deepFavoriteResult = null" class="close-btn">×</button>
          </div>
          
          <div v-if="deepFavoriteResult.data === null">
             <p>Ce favori n'est jamais sorti sur la période.</p>
          </div>
          <div v-else>
             <div class="stats-row">
                <span class="badge-stat">Sorties : {{ deepFavoriteResult.total_hits }}</span>
                <span class="badge-stat">Meilleur Jour : {{ deepFavoriteResult.best_day }}</span>
                <span class="badge-stat">Meilleure Heure : {{ deepFavoriteResult.best_time }}</span>
             </div>

             <div class="table-responsive">
               <table class="spec-table">
                 <thead>
                   <tr>
                     <th>Date</th>
                     <th>Jour</th>
                     <th>Heure</th>
                     <th>Déclencheur (Avant)</th>
                     <th>Compagnons (Avec)</th>
                     <th>Prophète (Après)</th>
                   </tr>
                 </thead>
                 <tbody>
                   <tr v-for="(row, idx) in deepFavoriteResult.history_table" :key="idx">
                     <td>{{ row.date }}</td>
                     <td>{{ row.day }}</td>
                     <td>{{ row.time }}</td>
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
            <a v-if="standardResult.worksheet_gid" :href="sheetDirectLink" target="_blank" class="button-link">Voir l'Onglet ↗</a>
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
          <div v-if="standardResult.ai_sequence_analysis" class="ai-analysis"><h3>🧠 Suites</h3><p>{{ standardResult.ai_sequence_analysis }}</p></div>
          <div v-if="standardResult.ai_trigger_analysis" class="ai-analysis"><h3>🧠 Déclencheurs</h3><p>{{ standardResult.ai_trigger_analysis }}</p></div>
          <div v-if="standardResult.ai_prediction_analysis" class="ai-analysis prophet-analysis"><h3>🔮 Prédiction</h3><p>{{ standardResult.ai_prediction_analysis }}</p></div>
        </section>

        <div v-if="!dayAnalysisResult && !standardResult && !deepFavoriteResult && !profileResult && !matrixResult && !isLoading" class="welcome-message">
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
  /* STYLES CLEAN & PRO (DESIGN CLASSIQUE) */
  .loading-screen { display: flex; align-items: center; justify-content: center; min-height: 100vh; font-size: 1.5rem; color: #666; }
  .login-wrapper { display: flex; align-items: center; justify-content: center; min-height: 100vh; background-color: #f0f2f5; }
  .login-box { background: white; padding: 2.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
  .input-group { margin-bottom: 1rem; }
  .input-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
  input, select { width: 100%; padding: 0.8rem; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
  button { padding: 0.8rem; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold; }
  button:disabled { background-color: #ccc; }
  .dashboard { max-width: 95%; margin: 1rem auto; font-family: sans-serif; }
  header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid #eee; margin-bottom: 2rem; }
  .user-info { display: flex; gap: 1rem; align-items: center; }
  .logout-button { background-color: #6c757d; padding: 0.5rem 1rem; width: auto; }
  .main-layout { display: grid; grid-template-columns: 350px 1fr; gap: 2rem; }
  .card { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-bottom: 1.5rem; }
  .card h2 { margin-top: 0; font-size: 1.2rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; margin-bottom: 1rem; }
  .button-group-vertical { display: flex; flex-direction: column; gap: 0.5rem; }
  .button-group-horizontal { display: flex; gap: 1rem; }
  .danger { background-color: #dc3545; }
  .styled-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  .styled-table th, .styled-table td { border: 1px solid #ddd; padding: 8px; text-align: center; }
  .styled-table th { background-color: #f2f2f2; }
  .ai-analysis { background-color: #fffbe6; border-left: 5px solid #ffc107; padding: 1rem; margin-top: 1rem; border-radius: 4px; }
  .success-box { background-color: #e8f5e9; color: #2e7d32; padding: 1rem; border-radius: 4px; text-align: center; }
  .button-link { display: inline-block; padding: 0.5rem 1rem; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; margin-top: 0.5rem; }
  .view-controls { display: flex; justify-content: center; gap: 1rem; margin: 1rem 0; }
  .toggle-btn { background: #e0e0e0; color: #333; width: auto; padding: 0.5rem 1.5rem; }
  .toggle-btn.active { background: #007bff; color: white; }
  .chart-container { height: 400px; width: 100%; }
  .favorites-input-group { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .btn-small { width: auto; padding: 0.5rem 1rem; }
  .favorites-list { display: flex; flex-wrap: wrap; gap: 0.8rem; }
  .favorite-chip { display: flex; align-items: center; background: #e3f2fd; border: 1px solid #90caf9; border-radius: 20px; padding: 0.3rem 0.5rem 0.3rem 1rem; }
  .fav-label { font-weight: bold; color: #1565c0; margin-right: 0.5rem; }
  .fav-actions { display: flex; gap: 0.2rem; margin-right: 0.5rem; }
  .icon-btn { background: white; border: 1px solid #bbdefb; color: #333; border-radius: 50%; width: 28px; height: 28px; padding: 0; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
  .icon-btn:hover { background: #bbdefb; transform: scale(1.1); }
  .fav-delete { cursor: pointer; color: #ef5350; font-weight: bold; font-size: 1.2rem; padding: 0 5px; }
  .empty-msg { font-style: italic; color: #999; font-size: 0.9rem; }
  .small-text { font-size: 0.8rem; color: #666; margin-top: -0.5rem; margin-bottom: 1rem; }
  hr { border: none; border-top: 1px solid #eee; margin: 1.5rem 0; }
  .prophet-card { border: 1px solid #d1c4e9; background: linear-gradient(to bottom right, #ffffff, #f3e5f5); }
  .prophet-btn { background-color: #7b1fa2; }
  .prophet-btn:hover { background-color: #4a148c; }
  .prophet-analysis { background-color: #f3e5f5; border-left: 5px solid #7b1fa2; }
  .multi-prophet-card { border: 2px solid #6f42c1; background-color: #f8f0fc; }
  .multi-btn { background: linear-gradient(45deg, #6f42c1, #007bff); border: none; }
  .multi-btn:hover { opacity: 0.9; transform: scale(1.02); }

  /* STYLE MATRICE & AUTRES */
  .matrix-card { border: 2px solid #673ab7; background-color: #ede7f6; }
  .badge-hit { background: #4caf50; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
  
  .spec-card { border: 1px solid #009688; border-top: 4px solid #009688; background-color: #e0f2f1; }
  .boss-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
  .badge-spec { background: #009688; color: white; font-weight: bold; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; }
  .day-select { margin-bottom: 10px; font-weight: bold; color: #00796b; }
  .spec-btn { background: #00796b; color: white; margin-top: 10px; }
  .spec-btn:hover { background: #004d40; }
  
  .result-spec-card { border-top: 4px solid #009688; margin-bottom: 2rem; }
  .spec-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
  .total-badge { background: #eee; padding: 4px 8px; border-radius: 10px; font-size: 0.8rem; color: #555; }
  .best-duo-box { background: linear-gradient(90deg, #ffc107, #ff9800); color: #000; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
  .duo-label { text-transform: uppercase; font-size: 0.9rem; }
  .duo-val { font-size: 1.5rem; color: #d32f2f; }
  
  .table-responsive { overflow-x: auto; }
  .spec-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.9rem; }
  .spec-table th { background: #009688; color: white; padding: 10px; white-space: nowrap; }
  .spec-table td { border-bottom: 1px solid #eee; padding: 8px; text-align: center; }
  .num-cell { font-weight: bold; color: #00796b; font-size: 1.2rem; }
  .comp-cell { color: #0277bd; font-weight: 500; }
  .trig-cell { color: #e65100; font-weight: 500; }
  .proph-cell { color: #7b1fa2; font-weight: bold; background: #f3e5f5; border-radius: 4px; padding: 2px; }
  .stats-row { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
  .badge-stat { background: #eee; padding: 5px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; color: #333; border: 1px solid #ccc; }
  .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center; margin-bottom: 15px; }
  .stat-item { background: #fff; padding: 10px; border-radius: 8px; border: 1px solid #eee; }
  .close-btn { background: transparent; border: none; color: #999; font-size: 1.5rem; cursor: pointer; width: auto; padding: 0 10px; }
  .close-btn:hover { color: #333; }
  .fade-in { animation: fadeIn 0.5s ease-in; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  .controls-column { max-height: 90vh; overflow-y: auto; padding-right: 10px; }
  .controls-column::-webkit-scrollbar { width: 8px; }
  .controls-column::-webkit-scrollbar-thumb { background-color: #ccc; border-radius: 4px; }
  
  .quick-link-box { text-align: center; margin-bottom: 20px; }
  .gsheet-btn { background: #0f9d58; color: white; padding: 10px 20px; border-radius: 30px; text-decoration: none; font-weight: bold; display: inline-block; box-shadow: 0 4px 10px rgba(15, 157, 88, 0.3); }
  .gsheet-btn:hover { background: #0b8043; transform: scale(1.05); transition: 0.2s; }
  .period-label { font-size: 0.85rem; color: #666; font-weight: 500; margin-bottom: 2px; }
  .date-picker-row { display: flex; gap: 10px; margin-bottom: 10px; }
  .date-picker-row input { flex: 1; padding: 5px; font-size: 0.9rem; border: 1px solid #ccc; border-radius: 4px; }
  .tabs { display: flex; gap: 5px; margin-bottom: 10px; }
  .tabs button { flex: 1; padding: 8px; font-size: 0.8rem; background: #673ab7; opacity: 0.6; border: none; color: white; border-radius: 4px 4px 0 0; }
  .tabs button.active { opacity: 1; font-weight: bold; border-bottom: 2px solid white; }
</style>