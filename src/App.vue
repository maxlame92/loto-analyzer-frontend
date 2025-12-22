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
const viewMode = ref('table');
const lastOperationType = ref('');

const isAdmin = computed(() => userRole.value === 'admin');
const sheetDirectLink = computed(() => {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
  return activeSheetGid.value ? `${base}/edit#gid=${activeSheetGid.value}` : `${base}/edit`;
});

// --- HEADERS DYNAMIQUES ---
const tableHeaders = computed(() => {
  if (!lastOperationType.value) return [];
  if (lastOperationType.value.includes('frequency')) return ['#', 'N°', 'Sorties', 'SYNTHÈSE STRATÉGIQUE (Top 3)'];
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
async function runReport(reportType) { if (!selectedDate.value) return; lastOperationType.value = reportType; let url = `/analysis/daily-frequency/${selectedDate.value}`; if (reportType === 'weekly-frequency') url = `/analysis/weekly-frequency/${selectedDate.value}`; else if (reportType === 'companions') url = `/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`; await callApi(url, 'standard'); }
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
      <h1>LE GUIDE DES FOURCASTER <span class="version-tag">V76</span></h1>
      <div class="user-info">
        <span>Connecté : <strong>{{ user.email }}</strong></span>
        <button @click="logout" class="logout-button">Déconnexion</button>
      </div>
    </header>

    <div class="main-layout">
      <!-- COLONNE GAUCHE (CONTRÔLES) -->
      <div class="controls-column">
        
        <!-- MATRICE -->
        <section class="card matrix-card">
          <div class="boss-header"><h2>🕰️ MATRICE TEMPORELLE</h2><span class="badge-spec" style="background:#ff9800;">PREDICTOR</span></div>
          <div class="tabs">
             <button @click="matrixMode = 'continuous'" :class="{ active: matrixMode === 'continuous' }">Séquence</button>
             <button @click="matrixMode = 'cyclic'" :class="{ active: matrixMode === 'cyclic' }">Cyclique</button>
          </div>
          <div v-if="matrixMode === 'cyclic'" style="margin-bottom:10px;">
             <label>Jour cible :</label><input type="number" v-model="cyclicDay" min="1" max="31" />
          </div>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runTimeMatrix" :disabled="isLoading" class="spec-btn" style="background:#ff9800;">ANALYSER & PRÉDIRE</button>
        </section>

        <!-- SPECIALISTE JOUR -->
        <section class="card spec-card">
          <div class="boss-header"><h2>📅 ANALYSTE SPÉCIALISTE</h2><span class="badge-spec">360°</span></div>
          <select v-model="selectedDayName" class="day-select">
            <option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option>
          </select>
          <select v-model="selectedHour" class="day-select">
            <option>Toute la journée</option><option>01H</option><option>03H</option><option>07H</option><option>08H</option><option>10H</option><option>13H</option><option>16H</option><option>19H</option><option>21H</option><option>22H</option><option>23H</option>
          </select>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runDayAnalysis" :disabled="isLoading" class="spec-btn">SCANNER {{ selectedDayName.toUpperCase() }}</button>
        </section>

        <!-- FAVORIS -->
        <section class="card">
          <h2>⭐ Mes Numéros Favoris</h2>
          <div class="favorites-input-group">
            <input type="text" v-model="newFavoriteInput" placeholder="Ex: 7 ou 12-45" @keyup.enter="addFavorite"/>
            <button @click="addFavorite" :disabled="!newFavoriteInput" class="btn-small">Ajouter</button>
          </div>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <div v-if="userFavorites.length > 0" class="favorites-list">
            <div v-for="item in userFavorites" :key="item" class="favorite-chip">
              <span class="fav-label">{{ item }}</span>
              <button @click="analyzeDeepFavorite(item)" class="icon-btn">⚡</button>
              <span @click="removeFavorite(item)" class="fav-delete">×</span>
            </div>
          </div>
        </section>

        <!-- PÉRIODE & PROFILAGE -->
        <section class="card">
          <div class="boss-header"><h2>📊 PÉRIODE & PROFILAGE</h2></div>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runRangeAnalysis" :disabled="isLoading">Fréquence sur Période</button>
          <hr />
          <input type="number" v-model="profileNumber" placeholder="N° pour profil complet" />
          <button @click="runProfileAnalysis" :disabled="isLoading || !profileNumber" class="prophet-btn">Générer Profil du Numéro</button>
        </section>

        <!-- RAPPORTS PONCTUELS -->
        <section class="card">
          <h2>Rapports Ponctuels (1 Semaine)</h2>
          <input type="date" v-model="selectedDate" />
          <div class="button-group-vertical" style="margin-top:10px;">
            <button @click="runReport('daily-frequency')">Classement Jour (Top 10)</button>
            <button @click="runReport('weekly-frequency')">Classement Semaine (Top 10)</button>
          </div>
        </section>

        <!-- LE PROPHÈTE -->
        <section class="card prophet-card">
          <h2>🔮 Le Prophète</h2>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <input type="number" v-model="predictionNumber" placeholder="Numéro vu" />
          <button @click="runPredictionAnalysis" :disabled="isLoading" class="prophet-btn">Voir Futur Probable</button>
        </section>

      </div>

      <!-- COLONNE DROITE (RÉSULTATS) -->
      <div class="results-column">
        
        <div class="quick-link-box">
           <a :href="sheetDirectLink" target="_blank" class="gsheet-btn">📂 OUVRIR GOOGLE SHEETS</a>
        </div>

        <!-- RÉSULTAT MATRICE -->
        <div v-if="matrixResult" class="card result-spec-card" style="border-top:4px solid #ff9800;">
           <div class="spec-header"><h3>🕰️ MATRICE TEMPORELLE</h3><button @click="matrixResult = null" class="close-btn">×</button></div>
           <div class="tabs"><button @click="matrixTab = 'analysis'" :class="{active: matrixTab === 'analysis'}">ANALYSE</button><button @click="matrixTab = 'prediction'" :class="{active: matrixTab === 'prediction'}">PRÉDICTION</button></div>
           
           <div v-if="matrixTab === 'analysis'" class="table-responsive">
              <table class="spec-table">
                <thead><tr><th>Date</th><th>Base</th><th>PREUVES (Numéro + Origine)</th></tr></thead>
                <tbody>
                  <tr v-for="(row, idx) in matrixResult.matrix_data" :key="idx">
                    <td>{{ row.date }}<br><small>{{ row.day_name }}</small></td>
                    <td class="num-cell">{{ row.base_number }}</td>
                    <td>
                       <div v-for="h in row.detailed_hits" :key="h.num">
                          <span class="badge-hit">{{ h.num }}</span> <small>({{ h.time }} - {{ h.reason }})</small>
                       </div>
                    </td>
                  </tr>
                </tbody>
              </table>
           </div>

           <div v-else class="prediction-tab">
               <div class="best-duo-box" style="background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);">
                  <span class="duo-label">🔮 TWO SHORT CIBLE :</span><span class="duo-val">{{ matrixResult.prediction.two_short }}</span>
               </div>
               <div class="ai-analysis"><h4>💡 Apprentissage IA :</h4><ul><li v-for="f in matrixResult.prediction.top_formulas_rich" :key="f.name"><strong>{{ f.name }}</strong> ({{ f.count }} Hits)</li></ul></div>
           </div>
        </div>

        <!-- PROFIL COMPLET NUMÉRO -->
        <div v-if="profileResult" class="card result-spec-card" style="border-top:4px solid #ab47bc;">
          <div class="spec-header"><h3>👤 PROFIL COMPLET : {{ profileResult.profile_data.number }}</h3><button @click="profileResult = null" class="close-btn">×</button></div>
          <div class="stats-grid">
             <div class="stat-item"><strong>Sorties</strong><br>{{ profileResult.profile_data.hits }}</div>
             <div class="stat-item"><strong>Meilleur Jour</strong><br>{{ profileResult.profile_data.best_day }}</div>
             <div class="stat-item"><strong>Heure Cible</strong><br>{{ profileResult.profile_data.best_time }}</div>
          </div>
          <div class="summary-grid">
             <div class="sum-card"><h5>Top Jours</h5><ul><li v-for="d in profileResult.profile_data.top_days" :key="d.val">{{ d.val }}</li></ul></div>
             <div class="sum-card"><h5>Top Déclencheurs</h5><ul><li v-for="t in profileResult.profile_data.top_triggers" :key="t.val">{{ t.val }}</li></ul></div>
             <div class="sum-card"><h5>Top Compagnons</h5><ul><li v-for="c in profileResult.profile_data.top_companions" :key="c.val">{{ c.val }}</li></ul></div>
             <div class="sum-card"><h5>Top Prophètes</h5><ul><li v-for="p in profileResult.profile_data.top_prophets" :key="p.val">{{ p.val }}</li></ul></div>
          </div>
        </div>

        <!-- RÉSULTATS STANDARDS (TOP 10 JOUR / SEMAINE / PÉRIODE) -->
        <section v-if="standardResult" class="card results-card fade-in">
          <div class="spec-header"><h2>ANALYSE STRATÉGIQUE DES NUMÉROS</h2><button @click="standardResult = null" class="close-btn">×</button></div>
          
          <table v-if="isTableVisible" class="styled-table">
            <thead>
              <tr>
                <th style="width: 50px;">N°</th>
                <th style="width: 80px;">Srt.</th>
                <th>SYNTHÈSE STRATÉGIQUE (Top 3)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in tableData" :key="index">
                <td class="num-cell">{{ row.number }}</td>
                <td style="font-weight:bold; font-size:1.2rem;">{{ row.count }}</td>
                <td>
                  <div v-if="row.synthesis" class="summary-grid mini">
                    <div v-if="row.synthesis.top_days" class="sum-card"><h5>Top Jours</h5><div class="mini-list">{{ row.synthesis.top_days.join(', ') }}</div></div>
                    <div class="sum-card"><h5>Top Heures</h5><div class="mini-list">{{ row.synthesis.top_hours.join(', ') }}</div></div>
                    <div class="sum-card"><h5>Déclencheurs</h5><div class="mini-list" style="color:#e65100;">{{ row.synthesis.top_triggers.join(' - ') }}</div></div>
                    <div class="sum-card"><h5>Compagnons</h5><div class="mini-list" style="color:#0277bd;">{{ row.synthesis.top_companions.join(' - ') }}</div></div>
                    <div class="sum-card"><h5>Prophètes</h5><div class="mini-list" style="color:#7b1fa2;">{{ row.synthesis.top_prophets.join(' - ') }}</div></div>
                  </div>
                  <span v-else>{{ row.details }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <div v-if="isLoading" class="loader">Analyse en cours...</div>
        <div v-if="!standardResult && !matrixResult && !profileResult && !isLoading" class="welcome-message">
            <h3>Prêt à analyser</h3><p>Sélectionnez une fonction à gauche.</p>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
  .loading-screen { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .login-wrapper { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f0f2f5; }
  .login-box { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); width: 350px; }
  .dashboard { max-width: 98%; margin: 1rem auto; font-family: sans-serif; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
  .main-layout { display: grid; grid-template-columns: 320px 1fr; gap: 20px; }
  .card { background: white; padding: 1.2rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 15px; }
  .card h2 { font-size: 1.1rem; margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 5px; }
  input, select, button { width: 100%; padding: 8px; margin-bottom: 8px; border-radius: 4px; border: 1px solid #ccc; }
  button { background: #007bff; color: white; border: none; font-weight: bold; cursor: pointer; }
  .prophet-btn { background: #7b1fa2; }
  .spec-btn { background: #00796b; }
  .main-layout .controls-column { max-height: 85vh; overflow-y: auto; padding-right: 5px; }
  
  /* TABLEAUX & RÉSULTATS */
  .styled-table { width: 100%; border-collapse: collapse; }
  .styled-table th { background: #f8f9fa; padding: 12px; border-bottom: 2px solid #dee2e6; }
  .styled-table td { padding: 10px; border-bottom: 1px solid #eee; text-align: center; vertical-align: middle; }
  .num-cell { font-size: 1.5rem; font-weight: 900; color: #2c3e50; background: #f8f9fa; }
  
  /* MINI GRILLES */
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin: 10px 0; }
  .summary-grid.mini { grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 5px; }
  .sum-card { background: #fdfdfd; border: 1px solid #eee; padding: 6px; border-radius: 4px; }
  .sum-card h5 { margin: 0 0 4px 0; font-size: 0.65rem; color: #888; text-transform: uppercase; }
  .mini-list { font-size: 0.85rem; font-weight: bold; color: #333; }
  
  .best-duo-box { padding: 15px; border-radius: 8px; color: white; display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
  .duo-val { font-size: 2rem; font-weight: bold; }
  .badge-hit { background: #4caf50; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-right: 5px; }
  .close-btn { background: none; color: #aaa; font-size: 1.5rem; width: auto; }
  .loader { text-align: center; padding: 20px; font-weight: bold; color: #007bff; }
  
  .favorite-chip { display: flex; align-items: center; background: #e3f2fd; border-radius: 20px; padding: 4px 10px; margin-bottom: 5px; }
  .fav-label { flex-grow: 1; font-weight: bold; }
  .icon-btn { width: 30px; height: 30px; padding: 0; border-radius: 50%; background: white; color: #007bff; border: 1px solid #007bff; }
</style>