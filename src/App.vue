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
const bossResult = ref(null); // RESULTAT DU BOSS

// --- INITIALISATION ---
onMounted(() => {
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  selectedDate.value = `${year}-${month}-${day}`;
  endDate.value = `${year}-${month}-${day}`;
  
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const startYear = oneMonthAgo.getFullYear();
  const startMonth = (oneMonthAgo.getMonth() + 1).toString().padStart(2, '0');
  const startDay = oneMonthAgo.getDate().toString().padStart(2, '0');
  startDate.value = `${startYear}-${startMonth}-${startDay}`;

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
    } else {
      user.value = null; userRole.value = ''; userFavorites.value = [];
    }
    isAuthReady.value = true;
  });
});

const login = async () => {
  try { authError.value = ''; isLoading.value = true; await signInWithEmailAndPassword(auth, email.value, password.value); } 
  catch (error) { authError.value = "Email ou mot de passe incorrect."; } finally { isLoading.value = false; }
};
const logout = async () => { await signOut(auth); };

// --- GESTION FAVORIS ---
async function addFavorite() {
  const input = newFavoriteInput.value.trim();
  if (!input) return;
  const isSingleNumber = /^[0-9]{1,2}$/.test(input);
  const isPair = /^[0-9]{1,2}-[0-9]{1,2}$/.test(input);
  if (!isSingleNumber && !isPair) { alert("Format invalide."); return; }
  if (userFavorites.value.includes(input)) { newFavoriteInput.value = ''; return; }

  try {
    const userRef = doc(db, "users", user.value.uid);
    userFavorites.value.push(input); 
    await setDoc(userRef, { favorites: arrayUnion(input) }, { merge: true }); 
    newFavoriteInput.value = '';
  } catch (e) {
    alert("Erreur sauvegarde favoris.");
    userFavorites.value = userFavorites.value.filter(item => item !== input);
  }
}

async function removeFavorite(item) {
  if (!confirm(`Retirer ${item} ?`)) return;
  try {
    const userRef = doc(db, "users", user.value.uid);
    userFavorites.value = userFavorites.value.filter(n => n !== item);
    await updateDoc(userRef, { favorites: arrayRemove(item) });
  } catch (e) { console.error(e); }
}

function analyzeFavorite(item, mode) {
  if (item.includes('-')) {
    const parts = item.split('-');
    triggerTargetNumber.value = parts[0]; triggerCompanionNumber.value = parts[1];
    runTriggerAnalysis(); 
  } else {
    if (mode === 'companion') {
      selectedNumber.value = item;
      runReport('companions');
    } else if (mode === 'trigger') {
      triggerTargetNumber.value = item; triggerCompanionNumber.value = ''; 
      runTriggerAnalysis();
    }
  }
}

// --- VARIABLES ---
const selectedDate = ref('');
const startDate = ref('');
const endDate = ref('');
const selectedNumber = ref('');
const profileNumber = ref('');
const triggerTargetNumber = ref('');
const triggerCompanionNumber = ref('');
const apiResponse = ref(null);
const isLoading = ref(false);
const error = ref(null);
const lastOperationType = ref('');
const activeSheetGid = ref(null);
const showWelcomeMessage = ref(true);
const viewMode = ref('table');

const isAdmin = computed(() => userRole.value === 'admin');
const sheetDirectLink = computed(() => {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
  return activeSheetGid.value ? `${base}/edit#gid=${activeSheetGid.value}` : `${base}/edit`;
});

const tableHeaders = computed(() => {
  if (lastOperationType.value.includes('frequency')) return ['#', 'Numéro', 'Apparitions'];
  if (lastOperationType.value === 'companions') return ['#', 'Compagnon', 'Apparu avec'];
  if (lastOperationType.value === 'trigger') return ['#', 'N° Déclencheur', 'Fréquence'];
  if (lastOperationType.value === 'prediction') return ['#', 'Numéro Suivant (Probable)', 'Fréquence']; 
  if (lastOperationType.value.includes('kanta-rank')) return ['Paire Kanta', 'Apparitions'];
  return [];
});

const tableData = computed(() => {
  if (apiResponse.value?.frequency_ranking) return apiResponse.value.frequency_ranking;
  if (apiResponse.value?.companion_ranking) return apiResponse.value.companion_ranking;
  if (apiResponse.value?.trigger_numbers_ranking) return apiResponse.value.trigger_numbers_ranking;
  if (apiResponse.value?.prediction_ranking) return apiResponse.value.prediction_ranking;
  if (apiResponse.value?.kanta_pairs) return apiResponse.value.kanta_pairs;
  if (apiResponse.value?.kanta_pairs_ranking) return apiResponse.value.kanta_pairs_ranking;
  return [];
});
const isTableVisible = computed(() => tableData.value.length > 0);

const chartOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, title: { display: true, text: 'Analyse Visuelle (Top 20)' } },
  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
};
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

// --- API CALLS ---
async function callApi(url, method = 'GET') {
  showWelcomeMessage.value = false; isLoading.value = true; error.value = null; apiResponse.value = null;
  try {
    const token = await user.value.getIdToken();
    const headers = { 'Authorization': `Bearer ${token}` };
    const fullUrl = `${API_BASE_URL}${url}`;
    const response = await fetch(fullUrl, { method, headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || `Erreur ${response.status}`);
    apiResponse.value = data;
    if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
    viewMode.value = 'table';
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

async function runDataUpdate(endpoint) { lastOperationType.value = 'update'; await callApi(`/collection/${endpoint}`, 'POST'); }
async function runVisualAnalysis(endpoint) {
  if (!selectedDate.value) { error.value = "Selectionnez une date."; return; }
  lastOperationType.value = 'visual'; await callApi(`/analysis/${endpoint}/${selectedDate.value}`, 'POST');
}
async function runReport(reportType) {
  if (!selectedDate.value) { error.value = "Selectionnez une date."; return; }
  let url = '';
  if (reportType === 'weekly-frequency') { lastOperationType.value = 'weekly-frequency'; url = `/analysis/weekly-frequency/${selectedDate.value}`; }
  else if (reportType === 'daily-frequency') { lastOperationType.value = 'daily-frequency'; url = `/analysis/daily-frequency/${selectedDate.value}`; }
  else if (reportType === 'companions') {
    if (!selectedNumber.value) { error.value = "Entrez un numéro."; return; }
    lastOperationType.value = 'companions'; url = `/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`;
  }
  await callApi(url);
}

// FONCTIONS STANDARD
async function runRangeAnalysis() {
  if (!startDate.value || !endDate.value) { error.value = "Dates requises."; return; }
  lastOperationType.value = 'frequency';
  await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`);
}
async function runProfileAnalysis() {
  if (!startDate.value || !endDate.value || !profileNumber.value) { error.value = "Période ET numéro requis."; return; }
  lastOperationType.value = 'profile';
  await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`);
}
async function runSequenceAnalysis() {
  if (!startDate.value || !endDate.value) { error.value = "Période requise."; return; }
  lastOperationType.value = 'sequence'; await callApi(`/analysis/sequence-detection?start_date=${startDate.value}&end_date=${endDate.value}`);
}
async function runTriggerAnalysis() {
  if (!startDate.value || !endDate.value || !triggerTargetNumber.value) { error.value = "Période et cible requises."; return; }
  lastOperationType.value = 'trigger';
  let url = `/analysis/trigger-numbers?target_number=${triggerTargetNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  if (triggerCompanionNumber.value) url += `&companion_number=${triggerCompanionNumber.value}`;
  await callApi(url);
}
async function runPredictionAnalysis() {
  if (!startDate.value || !endDate.value || !predictionNumber.value) { error.value = "Période et numéro vus requis."; return; }
  lastOperationType.value = 'prediction';
  let url = `/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  if (predictionCompanion.value) url += `&observed_companion=${predictionCompanion.value}`;
  await callApi(url);
}
async function runMultiPrediction() {
  if (!startDate.value || !endDate.value || !multiPredictionInput.value) { error.value = "Période et numéros requis."; return; }
  const cleanInput = multiPredictionInput.value.replace(/[\s-]+/g, ',');
  lastOperationType.value = 'prediction';
  await callApi(`/analysis/multi-prediction?numbers_str=${cleanInput}&start_date=${startDate.value}&end_date=${endDate.value}`);
}
async function runKantaAnalysis(endpoint) {
  if (!selectedDate.value) { error.value = "Date requise."; return; }
  lastOperationType.value = 'visual'; await callApi(`/analysis/${endpoint}/${selectedDate.value}`, 'POST');
}
async function runKantaReport(reportType) {
  if (!selectedDate.value) { error.value = "Date requise."; return; }
  lastOperationType.value = 'kanta-rank'; await callApi(`/analysis/kanta-${reportType}/${selectedDate.value}`);
}

// --- FONCTIONS BOSS ---
async function runUltraLearning() {
  if (!startDate.value || !endDate.value) { error.value = "Dates requises."; return; }
  lastOperationType.value = 'boss';
  bossResult.value = null;
  await callApi(`/analysis/boss-ultra-learning?start_date=${startDate.value}&end_date=${endDate.value}`);
  if (apiResponse.value && apiResponse.value.two_short) {
    bossResult.value = apiResponse.value;
  }
}

function addBossToFavorites() {
    if(bossResult.value) {
        newFavoriteInput.value = bossResult.value.two_short;
        addFavorite();
    }
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
      <h1>LE GUIDE DES FOURCASTER</h1>
      <div class="user-info">
        <span>Connecté : <strong>{{ user.email }}</strong></span>
        <button @click="logout" class="logout-button">Déconnexion</button>
      </div>
    </header>

    <div class="main-layout">
      <div class="controls-column">
        
        <!-- SECTION BOSS ULTRA NEURAL (PRIORITAIRE) -->
        <section class="card ultra-card">
          <div class="boss-header">
            <h2>🧠 BOSS NEURAL (MÉMOIRE ACTIVE)</h2>
            <span class="badge-ai">IA VIVE</span>
          </div>
          <p class="small-text" style="color:#b0bec5">L'IA analyse ses erreurs passées pour calibrer le tirage.</p>
          <button @click="runUltraLearning" :disabled="isLoading" class="ultra-btn">
            <span v-if="isLoading">SYNCHRONISATION NEURALE...</span>
            <span v-else>🔮 GÉNÉRER LE TWO SHORT OPTIMISÉ</span>
          </button>
          <div v-if="bossResult" class="ultra-result">
            <div class="memory-bar"><span class="mem-icon">💾</span> {{ bossResult.memory_status }}</div>
            <div class="big-numbers">
              <div class="number-circle">{{ bossResult.two_short.split('-')[0] }}</div>
              <div class="link-line"></div>
              <div class="number-circle">{{ bossResult.two_short.split('-')[1] }}</div>
            </div>
            <div class="ai-speech">
              <div class="ai-avatar">🤖</div>
              <div class="ai-text">{{ bossResult.ai_justification }}</div>
            </div>
            <div class="strategies-used">
              <h4>🔍 Preuves Techniques :</h4>
              <div v-for="det in bossResult.details" :key="det.number" style="margin-bottom:5px; font-size:0.8rem; color:#ccc;">
                 <strong>{{ det.number }}</strong> : <span v-for="s in det.sources" :key="s" class="w-tag">{{ s }}</span>
              </div>
            </div>
            <button @click="addBossToFavorites" class="save-btn">Enregistrer ce Couple</button>
          </div>
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
          <div v-if="userFavorites.length > 0" class="favorites-list">
            <div v-for="item in userFavorites" :key="item" class="favorite-chip">
              <span class="fav-label">{{ item }}</span>
              <div class="fav-actions">
                <button v-if="!item.includes('-')" @click="analyzeFavorite(item, 'companion')" class="icon-btn" title="Compagnons">👥</button>
                <button @click="analyzeFavorite(item, 'trigger')" class="icon-btn" title="Déclencheurs">⚡</button>
              </div>
              <span @click="removeFavorite(item)" class="fav-delete">×</span>
            </div>
          </div>
          <p v-else class="empty-msg">Ajoutez vos numéros fétiches.</p>
        </section>

        <section class="card">
          <h2>Analyse par Semaine</h2>
          <input type="date" v-model="selectedDate" />
          <div class="button-group-vertical">
            <button @click="runVisualAnalysis('highlight-day')" :disabled="isLoading || !selectedDate">Surlignage (Jour)</button>
            <button @click="runVisualAnalysis('process-entire-week')" :disabled="isLoading || !selectedDate">Surlignage (Semaine)</button>
            <hr />
            <button @click="runReport('daily-frequency')" :disabled="isLoading || !selectedDate">Classement Jour</button>
            <button @click="runReport('weekly-frequency')" :disabled="isLoading || !selectedDate">Classement Semaine</button>
            <hr />
            <input type="number" v-model="selectedNumber" placeholder="N° pour analyse compagnons" />
            <button @click="runReport('companions')" :disabled="isLoading || !selectedDate || !selectedNumber">Analyser Compagnons</button>
          </div>
        </section>

        <section class="card">
          <h2>Période & Profilage</h2>
          <label>Début :</label><input type="date" v-model="startDate" />
          <label>Fin :</label><input type="date" v-model="endDate" />
          <button @click="runRangeAnalysis" :disabled="isLoading || !startDate || !endDate">Fréquence sur Période</button>
          <hr />
          <input type="number" v-model="profileNumber" placeholder="N° pour profil complet" />
          <button @click="runProfileAnalysis" :disabled="isLoading || !startDate || !endDate || !profileNumber">Générer Profil du Numéro</button>
        </section>

        <section class="card prophet-card">
          <h2>🔮 Le Prophète</h2>
          <p class="small-text">Ce numéro vient de sortir. La suite ?</p>
          <input type="number" v-model="predictionNumber" placeholder="Numéro vu (Ex: 42)" />
          <input type="number" v-model="predictionCompanion" placeholder="Compagnon vu (Optionnel)" />
          <button @click="runPredictionAnalysis" :disabled="isLoading || !startDate || !endDate || !predictionNumber" class="prophet-btn">Voir Futur Probable</button>
        </section>

        <section class="card multi-prophet-card">
          <h2>🔮 Analyse Croisée</h2>
          <p class="small-text">Dernier tirage complet (ou sélection).</p>
          <input type="text" v-model="multiPredictionInput" placeholder="Ex: 5 12 34 56 78" @keyup.enter="runMultiPrediction"/>
          <button @click="runMultiPrediction" :disabled="isLoading || !startDate || !endDate || !multiPredictionInput" class="multi-btn">Lancer Projection</button>
        </section>

        <section class="card">
          <h2>IA Avancée & Kanta</h2>
          <button @click="runSequenceAnalysis" :disabled="isLoading || !startDate || !endDate">Détecter Suites</button>
          <hr />
          <input type="number" v-model="triggerTargetNumber" placeholder="Cible (ex: 18)" />
          <input type="number" v-model="triggerCompanionNumber" placeholder="Compagnon (Optionnel)" />
          <button @click="runTriggerAnalysis" :disabled="isLoading || !startDate || !endDate || !triggerTargetNumber">Trouver Déclencheurs ⚡</button>
          <hr />
          <div class="button-group-horizontal">
             <button @click="runKantaAnalysis('kanta-highlight-day')">Surlign. Kanta J</button>
             <button @click="runKantaAnalysis('kanta-highlight-week')">Surlign. Kanta S</button>
          </div>
          <div class="button-group-horizontal" style="margin-top:5px;">
             <button @click="runKantaReport('daily-rank')">Class. Kanta J</button>
             <button @click="runKantaReport('weekly-rank')">Class. Kanta S</button>
          </div>
        </section>
      </div>

      <div class="results-column">
        <section class="card results-card">
          <h2>Résultats</h2>
          <div v-if="showWelcomeMessage" class="welcome-message">
            <h3>Bienvenue !</h3>
            <p>Utilisez les ⭐ Favoris pour lancer des analyses rapides.</p>
            <button @click="showWelcomeMessage = false" class="close-welcome">OK</button>
          </div>
          <div v-else>
            <div v-if="isLoading" class="loader">Chargement...</div>
            <div v-if="error" class="error-box">{{ error }}</div>
            
            <div v-if="apiResponse">
              <div v-if="apiResponse.message || apiResponse.analysis_period" class="success-box large">
                <p>✅ {{ apiResponse.message || `Analyse : ${apiResponse.analysis_period}` }}</p>
                <a v-if="apiResponse.worksheet_gid" :href="sheetDirectLink" target="_blank" class="button-link">Voir l'Onglet ↗</a>
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

              <div v-if="apiResponse.ai_strategic_analysis" class="ai-analysis"><h3>🧠 Stratégie</h3><p>{{ apiResponse.ai_strategic_analysis }}</p></div>
              <div v-if="apiResponse.ai_strategic_profile" class="ai-analysis"><h3>🧠 Profil Numéro</h3><p>{{ apiResponse.ai_strategic_profile }}</p></div>
              <div v-if="apiResponse.ai_sequence_analysis" class="ai-analysis"><h3>🧠 Suites</h3><p>{{ apiResponse.ai_sequence_analysis }}</p></div>
              <div v-if="apiResponse.ai_trigger_analysis" class="ai-analysis"><h3>🧠 Déclencheurs</h3><p>{{ apiResponse.ai_trigger_analysis }}</p></div>
              <div v-if="apiResponse.ai_prediction_analysis" class="ai-analysis prophet-analysis"><h3>🔮 Prédiction</h3><p>{{ apiResponse.ai_prediction_analysis }}</p></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
  /* STYLES CLEAN & FUTURISTE */
  .loading-screen { display: flex; align-items: center; justify-content: center; min-height: 100vh; font-size: 1.5rem; color: #666; }
  .login-wrapper { display: flex; align-items: center; justify-content: center; min-height: 100vh; background-color: #f0f2f5; }
  .login-box { background: white; padding: 2.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
  .input-group { margin-bottom: 1rem; }
  .input-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
  input { width: 100%; padding: 0.8rem; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
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

  /* ULTRA BOSS NEURAL */
  .ultra-card {
    background: #1a1a2e; color: #fff; border: 1px solid #16213e;
    box-shadow: 0 0 20px rgba(0, 168, 255, 0.2);
  }
  .badge-ai { background: #00d2d3; color: #000; font-weight: 900; padding: 2px 8px; border-radius: 4px; animation: pulse 2s infinite; font-size: 0.7rem; }
  .ultra-btn {
    background: linear-gradient(90deg, #0f2027, #203a43, #2c5364);
    border: 1px solid #00d2d3; color: #00d2d3; font-family: monospace; letter-spacing: 2px;
    padding: 1rem; width: 100%; cursor: pointer; margin-top: 10px; font-weight: bold;
  }
  .ultra-btn:hover { background: #00d2d3; color: #000; box-shadow: 0 0 15px #00d2d3; }

  .memory-bar { background: #16213e; padding: 8px; font-size: 0.75rem; color: #a4b0be; border-radius: 4px; margin-top: 15px; border-left: 3px solid #ff9f43; }
  .big-numbers { display: flex; align-items: center; justify-content: center; margin: 20px 0; }
  .number-circle {
    width: 60px; height: 60px; border-radius: 50%; background: #fff; color: #000;
    font-weight: 900; font-size: 1.8rem; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 15px rgba(255,255,255,0.5);
  }
  .link-line { width: 30px; height: 4px; background: #fff; margin: 0 10px; }
  .ai-speech { display: flex; gap: 10px; background: #0f2027; padding: 15px; border-radius: 8px; border: 1px solid #2c5364; margin-bottom: 15px; }
  .ai-text { font-size: 0.9rem; line-height: 1.4; color: #e0f7fa; font-style: italic; text-align: left; }
  .w-tag { background: #333; font-size: 0.7rem; padding: 2px 6px; border-radius: 3px; color: #81d4fa; margin-right: 4px; border: 1px solid #444; }
  .save-btn { width: 100%; background: transparent; border: 1px solid #fff; color: #fff; padding: 8px; margin-top: 10px; cursor: pointer; }
  .save-btn:hover { background: #fff; color: #000; }

  @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
</style>