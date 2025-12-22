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

onMounted(() => {
  const today = new Date();
  cyclicDay.value = today.getDate();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  selectedDate.value = `${year}-${month}-${day}`;
  endDate.value = `${year}-${month}-${day}`;
  
  // Par défaut, on met la date de début à 6 mois en arrière pour les analyses
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  startDate.value = `${sixMonthsAgo.getFullYear()}-${(sixMonthsAgo.getMonth()+1).toString().padStart(2,'0')}-${sixMonthsAgo.getDate().toString().padStart(2,'0')}`;

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
  deepFavoriteResult.value = null;
  await callApi(`/analysis/deep-favorite?target=${item}&start_date=${startDate.value}&end_date=${endDate.value}`, 'deep');
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
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

async function runDataUpdate(endpoint) { await callApi(`/collection/${endpoint}`, 'standard'); }
async function runBatchVisualAnalysis(mode) { await callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${mode}`, 'standard'); }
async function runSingleDayVisual(mode) { await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`, 'standard'); }

async function runReport(reportType) { 
  let url = `/analysis/${reportType}/${selectedDate.value}`; 
  await callApi(url, 'standard'); 
}

async function runRangeAnalysis() { 
  await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard'); 
}

async function runProfileAnalysis() { 
  profileResult.value = null; 
  await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile'); 
}

async function runDayAnalysis() { 
  await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist'); 
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
      <h1>LE GUIDE DES FOURCASTER <span class="version-tag">V73 DEEP INTEL</span></h1>
      <div class="user-info">
        <span>Connecté : <strong>{{ user.email }}</strong></span>
        <button @click="logout" class="logout-button">Déconnexion</button>
      </div>
    </header>

    <div class="main-layout">
      <!-- COLONNE GAUCHE -->
      <div class="controls-column">
        
        <!-- MATRICE TEMPORELLE -->
        <section class="card matrix-card">
          <div class="boss-header"><h2>🕰️ MATRICE TEMPORELLE</h2><span class="badge-spec" style="background:#ff9800;">PREDICTOR</span></div>
          <div class="tabs">
             <button @click="matrixMode = 'continuous'" :class="{ active: matrixMode === 'continuous' }">CONTINU</button>
             <button @click="matrixMode = 'cyclic'" :class="{ active: matrixMode === 'cyclic' }">CYCLIQUE</button>
          </div>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runTimeMatrix" :disabled="isLoading" class="spec-btn" style="background:#ff9800;">ANALYSER & PRÉDIRE</button>
        </section>

        <!-- SPECIALISTE JOUR -->
        <section class="card spec-card">
          <div class="boss-header"><h2>📅 ANALYSTE SPÉCIALISTE</h2><span class="badge-spec">360°</span></div>
          <label>Jour :</label>
          <select v-model="selectedDayName" class="day-select">
            <option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option>
          </select>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runDayAnalysis" :disabled="isLoading" class="spec-btn">SCANNER {{ selectedDayName.toUpperCase() }}</button>
        </section>

        <!-- FAVORIS -->
        <section class="card">
          <h2>⭐ Mes Numéros Favoris</h2>
          <div class="favorites-input-group">
            <input type="text" v-model="newFavoriteInput" placeholder="Ex: 7" @keyup.enter="addFavorite"/>
            <button @click="addFavorite" class="btn-small">Ajouter</button>
          </div>
          <div v-if="userFavorites.length > 0" class="favorites-list">
            <div v-for="item in userFavorites" :key="item" class="favorite-chip">
              <span class="fav-label">{{ item }}</span>
              <button @click="analyzeDeepFavorite(item)" class="icon-btn">⚡</button>
              <span @click="removeFavorite(item)" class="fav-delete">×</span>
            </div>
          </div>
        </section>

        <!-- RAPPORTS ET PERIODE -->
        <section class="card">
          <h2>Rapports & Périodes (Deep)</h2>
          <p class="small-text">Sélecteur pour classements Jour/Semaine :</p>
          <input type="date" v-model="selectedDate" style="margin-bottom:10px;" />
          <div class="button-group-vertical">
            <button @click="runReport('daily-frequency')" :disabled="isLoading">Top 10 du Jour</button>
            <button @click="runReport('weekly-frequency')" :disabled="isLoading">Top 10 de la Semaine</button>
          </div>
          <hr />
          <p class="small-text">Analyses sur période (jusqu'à 2 ans) :</p>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runRangeAnalysis" :disabled="isLoading" style="margin-bottom:10px;">Classement Période</button>
          <input type="number" v-model="profileNumber" placeholder="N° pour profil complet" />
          <button @click="runProfileAnalysis" :disabled="isLoading">Générer Profil Expert</button>
        </section>

        <section class="card">
          <h2>Visuel & Maintenance</h2>
          <div class="button-group-vertical">
            <button @click="runBatchVisualAnalysis('frequency')" style="background:#ef5350;">Surlignage Rouge/Bleu</button>
            <button @click="runBatchVisualAnalysis('kanta')" style="background:#66bb6a;">Surlignage Kanta</button>
          </div>
          <div v-if="isAdmin" style="margin-top:15px;">
            <button @click="runDataUpdate('update-recent-weeks')" class="btn-small">Update Sheets</button>
          </div>
        </section>
      </div>

      <!-- COLONNE RESULTATS -->
      <div class="results-column">
        
        <div class="quick-link-box">
           <a :href="sheetDirectLink" target="_blank" class="gsheet-btn">📂 OUVRIR GOOGLE SHEETS</a>
        </div>

        <!-- RESULTAT CLASSEMENTS (JOUR, SEMAINE, PERIODE) -->
        <div v-if="standardResult && standardResult.results" class="card result-spec-card">
          <div class="spec-header">
            <h3>📊 CLASSEMENT {{ standardResult.mode }}</h3>
            <span class="total-badge">{{ standardResult.period }}</span>
            <button @click="standardResult = null" class="close-btn">×</button>
          </div>
          
          <div class="table-responsive">
            <table class="spec-table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Freq.</th>
                  <th>Synthèse Stratégique (Top 3)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in standardResult.results" :key="row.number">
                  <td class="num-cell">
                    {{ row.number }}<br>
                    <small style="color:#d32f2f">K: {{ row.kanta }}</small>
                  </td>
                  <td style="font-weight:bold; font-size:1.2rem;">{{ row.count }}</td>
                  <td>
                    <div class="summary-grid">
                      <div class="sum-card"><h5>Jours</h5><p>{{ row.top_days }}</p></div>
                      <div class="sum-card"><h5>Heures</h5><p>{{ row.top_hours }}</p></div>
                      <div class="sum-card"><h5>Passé (⚡)</h5><p>{{ row.top_triggers }}</p></div>
                      <div class="sum-card"><h5>Présent (&)</h5><p>{{ row.top_companions }}</p></div>
                      <div class="sum-card"><h5>Futur (🔮)</h5><p>{{ row.top_prophets }}</p></div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="ai-analysis"><h4>🧠 Conseil IA :</h4><p>{{ standardResult.ai_analysis }}</p></div>
        </div>

        <!-- RESULTAT SPECIALISTE SNIPER -->
        <div v-if="dayAnalysisResult" class="card result-spec-card">
          <div class="spec-header">
            <h3>🎯 SNIPER : {{ dayAnalysisResult.day_analyzed.toUpperCase() }}</h3>
            <button @click="dayAnalysisResult = null" class="close-btn">×</button>
          </div>
          <div class="best-duo-box">
             <span class="duo-label">🔥 DUO EN OR :</span>
             <span class="duo-val">{{ dayAnalysisResult.best_duo }}</span>
             <span class="duo-count">(Vu {{ dayAnalysisResult.best_duo_count }} fois)</span>
          </div>
          <div class="table-responsive">
            <table class="spec-table">
              <thead><tr><th>N°</th><th>Kanta</th><th>Présent</th><th>Passé</th><th>Futur</th></tr></thead>
              <tbody>
                <tr v-for="row in dayAnalysisResult.recurrence_data" :key="row.number">
                  <td class="num-cell">{{ row.number }}</td>
                  <td style="color:#d32f2f; font-weight:bold;">{{ row.kanta }}</td>
                  <td class="comp-cell">{{ row.top_companions }}</td>
                  <td class="trig-cell">{{ row.top_triggers }}</td>
                  <td class="proph-cell">{{ row.top_prophets }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="ai-analysis"><h4>🧠 Analyse Stratégique :</h4><p>{{ dayAnalysisResult.ai_analysis }}</p></div>
        </div>

        <!-- PROFIL NUMERO EXPERT -->
        <div v-if="profileResult" class="card result-spec-card" style="border-top:4px solid #ab47bc;">
          <div class="spec-header">
            <h3>👤 PROFIL COMPLET : {{ profileResult.profile_data.number }}</h3>
            <button @click="profileResult = null" class="close-btn">×</button>
          </div>
          <div class="summary-grid">
              <div class="sum-card"><h5>Top Jours</h5><p>{{ profileResult.profile_data.top_days }}</p></div>
              <div class="sum-card"><h5>Top Heures</h5><p>{{ profileResult.profile_data.top_hours }}</p></div>
              <div class="sum-card"><h5>Déclencheurs</h5><p>{{ profileResult.profile_data.top_triggers }}</p></div>
              <div class="sum-card"><h5>Compagnons</h5><p>{{ profileResult.profile_data.top_companions }}</p></div>
              <div class="sum-card"><h5>Prophètes</h5><p>{{ profileResult.profile_data.top_prophets }}</p></div>
          </div>
          <div class="table-responsive">
            <table class="spec-table">
              <thead><tr><th>Date</th><th>Heure</th><th>⚡ Passé</th><th>& Présent</th><th>🔮 Futur</th></tr></thead>
              <tbody>
                <tr v-for="(h, i) in profileResult.history_table" :key="i">
                  <td>{{ h.date }}<br><small>{{ h.day }}</small></td>
                  <td>{{ h.time }}</td>
                  <td class="trig-cell">{{ h.trigger }}</td>
                  <td class="comp-cell">{{ h.companion }}</td>
                  <td class="proph-cell">{{ h.prophet }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="ai-analysis"><h4>🧠 Expertise IA :</h4><p>{{ profileResult.ai_strategic_profile }}</p></div>
        </div>

        <!-- MATRICE -->
        <div v-if="matrixResult" class="card result-spec-card" style="border-top:4px solid #ff9800;">
           <div class="spec-header"><h3>🕰️ MATRICE TEMPORELLE</h3><button @click="matrixResult = null" class="close-btn">×</button></div>
           <div v-if="matrixResult.prediction" class="best-duo-box" style="background:#ff9800;">
              <span class="duo-label">🔮 PREDICTION POUR LE : {{ matrixResult.prediction.target_date_label }}</span>
              <span class="duo-val" style="color:white;">{{ matrixResult.prediction.two_short }}</span>
           </div>
           <div class="table-responsive">
             <table class="spec-table">
               <thead><tr><th>Date</th><th>Base</th><th>Preuves (N° - Origine)</th></tr></thead>
               <tbody>
                 <tr v-for="(row, idx) in matrixResult.matrix_data.slice(0, 15)" :key="idx">
                   <td>{{ row.date }}</td><td>{{ row.base_number }}</td>
                   <td><span v-for="h in row.detailed_hits" :key="h.num" class="badge-hit">{{ h.num }} <small>({{ h.reason }})</small></span></td>
                 </tr>
               </tbody>
             </table>
           </div>
        </div>

        <div v-if="!standardResult && !dayAnalysisResult && !profileResult && !matrixResult && !isLoading" class="welcome-message">
            <h3>Prêt à analyser</h3><p>Choisissez un mode à gauche (Période jusqu'à 2 ans supportée).</p>
        </div>
        <div v-if="isLoading" class="loader">Traitement profond en cours...</div>
        <div v-if="error" class="error-box">{{ error }}</div>
      </div>
    </div>
  </main>
</template>

<style scoped>
  .dashboard { max-width: 98%; margin: 10px auto; font-family: 'Segoe UI', sans-serif; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
  .version-tag { font-size: 0.8rem; background: #333; color: white; padding: 2px 8px; border-radius: 10px; }
  .main-layout { display: grid; grid-template-columns: 320px 1fr; gap: 20px; }
  .card { background: white; padding: 15px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin-bottom: 15px; }
  .controls-column { max-height: 90vh; overflow-y: auto; padding-right: 10px; }
  
  .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
  .sum-card { background: #f8f9fa; padding: 5px; border: 1px solid #eee; border-radius: 4px; text-align: center; }
  .sum-card h5 { margin: 0; font-size: 0.65rem; color: #888; text-transform: uppercase; }
  .sum-card p { margin: 2px 0 0 0; font-size: 0.85rem; font-weight: bold; color: #333; }

  .spec-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  .spec-table th { background: #009688; color: white; padding: 8px; font-size: 0.85rem; }
  .spec-table td { border-bottom: 1px solid #f0f0f0; padding: 8px; text-align: center; vertical-align: middle; }
  
  .num-cell { font-size: 1.4rem; font-weight: bold; color: #00796b; }
  .trig-cell { color: #e65100; font-size: 0.9rem; }
  .comp-cell { color: #0277bd; font-size: 0.9rem; }
  .proph-cell { color: #7b1fa2; font-weight: bold; background: #f3e5f5; }

  .best-duo-box { background: linear-gradient(90deg, #ffc107, #ff9800); padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; font-weight: bold; }
  .duo-val { font-size: 1.8rem; color: #d32f2f; }
  
  .ai-analysis { background: #fffbe6; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px; margin-top: 15px; }
  .badge-hit { background: #4caf50; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; margin: 2px; display: inline-block; }
  
  .spec-btn { width: 100%; padding: 10px; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; }
  .spec-card { border-top: 4px solid #009688; }
  .badge-spec { font-size: 0.7rem; color: white; padding: 2px 6px; border-radius: 4px; }
  
  .favorite-chip { display: flex; align-items: center; background: #e3f2fd; padding: 5px 10px; border-radius: 20px; margin: 5px; }
  .icon-btn { background: white; border: 1px solid #90caf9; border-radius: 50%; cursor: pointer; margin: 0 5px; }
  .fav-delete { color: red; cursor: pointer; font-weight: bold; }

  .loader { text-align: center; padding: 20px; color: #00796b; font-weight: bold; animation: pulse 1.5s infinite; }
  @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
  
  .gsheet-btn { background: #0f9d58; color: white; padding: 10px 20px; border-radius: 30px; text-decoration: none; font-weight: bold; display: inline-block; }
  .close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #ccc; }
</style>