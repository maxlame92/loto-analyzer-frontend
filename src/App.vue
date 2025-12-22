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
const hoursList = ['Toute la journée', '01H00', '03H00', '07H00', '08H00', '10H00', '13H00', '16H00', '19H00', '21H00', '22H00', '23H00'];

const dayAnalysisResult = ref(null); 
const standardResult = ref(null);
const deepFavoriteResult = ref(null);
const profileResult = ref(null);
const matrixResult = ref(null);

const matrixMode = ref('continuous'); 
const matrixTab = ref('analysis');
const cyclicDay = ref(1);

const selectedDate = ref('');
const startDate = ref('');
const endDate = ref('');
const selectedNumber = ref('');
const isLoading = ref(false);
const error = ref(null);
const activeSheetGid = ref(null);
const viewMode = ref('table');
const lastOperationType = ref('');

const isAdmin = computed(() => userRole.value === 'admin');
const sheetDirectLink = computed(() => {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
  return activeSheetGid.value ? `${base}/edit#gid=${activeSheetGid.value}` : `${base}/edit`;
});

const tableHeaders = computed(() => {
  if (!lastOperationType.value) return [];
  if (lastOperationType.value.includes('frequency')) return ['#', 'N°', 'Srt.', 'SYNTHÈSE STRATÉGIQUE (Top 3)'];
  if (lastOperationType.value === 'companions') return ['#', 'Compagnon', 'Apparu avec'];
  if (lastOperationType.value === 'trigger') return ['#', 'N° Déclencheur', 'Fréquence'];
  if (lastOperationType.value === 'prediction') return ['#', 'Suivant', 'Fréquence']; 
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

const chartData = computed(() => {
  const data = tableData.value;
  if (!data || data.length === 0) return null;
  const limitedData = data.slice(0, 20);
  let labels = [], counts = [];
  limitedData.forEach(row => {
    labels.push(row.number ? row.number.toString() : (row.pair || '?'));
    counts.push(row.count);
  });
  return { labels, datasets: [{ label: 'Occurrences', backgroundColor: '#007bff', data: counts }] };
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
          userRole.value = docSnap.data().role || 'user';
          userFavorites.value = docSnap.data().favorites || []; 
        }
      } catch (e) { console.error(e); }
    } else { user.value = null; }
    isAuthReady.value = true;
  });
});

const login = async () => { try { await signInWithEmailAndPassword(auth, email.value, password.value); } catch (e) { authError.value = "Erreur de connexion"; } };
const logout = async () => { await signOut(auth); };

async function addFavorite() {
  const input = newFavoriteInput.value.trim();
  if (!input) return;
  try {
    const userRef = doc(db, "users", user.value.uid);
    await updateDoc(userRef, { favorites: arrayUnion(input) });
    userFavorites.value.push(input);
    newFavoriteInput.value = '';
  } catch (e) { alert("Erreur favoris"); }
}

async function removeFavorite(item) {
  try {
    const userRef = doc(db, "users", user.value.uid);
    await updateDoc(userRef, { favorites: arrayRemove(item) });
    userFavorites.value = userFavorites.value.filter(n => n !== item);
  } catch (e) { console.error(e); }
}

async function callApi(url, targetVar = 'standard') {
  isLoading.value = true; error.value = null;
  try {
    const token = await user.value.getIdToken();
    const response = await fetch(`${API_BASE_URL}${url}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Erreur API");
    if (targetVar === 'specialist') dayAnalysisResult.value = data;
    else if (targetVar === 'deep') deepFavoriteResult.value = data;
    else if (targetVar === 'profile') profileResult.value = data;
    else if (targetVar === 'matrix') matrixResult.value = data;
    else standardResult.value = data;
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

const runTimeMatrix = () => callApi(`/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}&target_cyclic_day=${cyclicDay.value}`, 'matrix');
const runDayAnalysis = () => callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist');
const analyzeDeepFavorite = (item) => callApi(`/analysis/deep-favorite?target=${item}&start_date=${startDate.value}&end_date=${endDate.value}`, 'deep');
const runDataUpdate = (ep) => callApi(`/collection/${ep}`);
const runBatchVisual = (m) => callApi(`/analysis/highlight-range?start_date=${startDate.value}&end_date=${endDate.value}&mode=${m}`);
const runReport = (t) => { lastOperationType.value = t; callApi(t === 'companions' ? `/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}` : `/analysis/${t}/${selectedDate.value}`); };
const runKantaReport = (t) => { lastOperationType.value = 'kanta-rank'; callApi(`/analysis/kanta-${t}/${selectedDate.value}`); };
const runRangeAnalysis = () => { lastOperationType.value = 'frequency'; callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`); };
const runProfileAnalysis = () => callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile');
const runTriggerAnalysis = () => { lastOperationType.value = 'trigger'; callApi(`/analysis/trigger-numbers?target_number=${triggerTargetNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`); };
const runPredictionAnalysis = () => { lastOperationType.value = 'prediction'; callApi(`/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`); };
const runMultiPrediction = () => { lastOperationType.value = 'prediction'; callApi(`/analysis/multi-prediction?numbers_str=${multiPredictionInput.value}&start_date=${startDate.value}&end_date=${endDate.value}`); };
const runSequenceAnalysis = () => callApi(`/analysis/sequence-detection?start_date=${startDate.value}&end_date=${endDate.value}`);
</script>

<template>
  <div v-if="!isAuthReady" class="loader-full"><p>Synchronisation avec Firebase...</p></div>
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2 class="title-gold">FOURCASTER PREDICTOR</h2>
      <form @submit.prevent="login">
        <input type="email" v-model="email" placeholder="Email" required />
        <input type="password" v-model="password" placeholder="Mot de passe" required />
        <button type="submit" class="btn-login" :disabled="isLoading">ENTRER DANS L'ANALYSEUR</button>
        <p v-if="authError" class="error-text">{{ authError }}</p>
      </form>
    </div>
  </div>

  <main v-else class="dashboard">
    <header class="main-header">
      <h1 class="logo-text">LE GUIDE DES FOURCASTER <span class="version">V77.0</span></h1>
      <div class="header-right">
        <span class="user-badge">{{ user.email }}</span>
        <button @click="logout" class="btn-logout">Quitter</button>
      </div>
    </header>

    <div class="main-layout">
      <!-- COLONNE GAUCHE (CONTROLES) -->
      <aside class="sidebar-controls">
        
        <!-- ADMIN -->
        <section v-if="isAdmin" class="card admin-card">
          <h2 class="section-title">🛡️ GESTION ADMIN</h2>
          <div class="btn-row">
            <button @click="runDataUpdate('update-recent-weeks')" class="btn-maj">MàJ Rapide</button>
            <button @click="runDataUpdate('start-full-rebuild')" class="btn-rebuild">Reconstruction</button>
          </div>
        </section>

        <!-- MATRICE -->
        <section class="card matrix-card">
          <div class="flex-title"><h2>🕰️ MATRICE TEMPORELLE</h2><span class="badge">PREDICTOR</span></div>
          <div class="tab-btns">
            <button @click="matrixMode = 'continuous'" :class="{active: matrixMode === 'continuous'}">Séquence</button>
            <button @click="matrixMode = 'cyclic'" :class="{active: matrixMode === 'cyclic'}">Cyclique</button>
          </div>
          <div v-if="matrixMode === 'cyclic'" class="input-inline">
             <label>Jour cible :</label><input type="number" v-model="cyclicDay" min="1" max="31" />
          </div>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runTimeMatrix" class="btn-matrix">ANALYSER & PRÉDIRE</button>
        </section>

        <!-- SPECIALISTE -->
        <section class="card spec-card">
          <div class="flex-title"><h2>📅 ANALYSTE SPÉCIALISTE</h2><span class="badge teal">360°</span></div>
          <p class="desc">Trouvez les Habitués d'un créneau.</p>
          <div class="row">
            <select v-model="selectedDayName">
              <option v-for="d in ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']" :key="d">{{d}}</option>
            </select>
            <select v-model="selectedHour">
              <option v-for="h in hoursList" :key="h">{{h}}</option>
            </select>
          </div>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runDayAnalysis" class="btn-spec">SCANNER {{ selectedDayName.toUpperCase() }}</button>
        </section>

        <!-- FAVORIS -->
        <section class="card fav-card">
          <h2 class="section-title">⭐ MES NUMÉROS FAVORIS</h2>
          <div class="fav-input"><input type="text" v-model="newFavoriteInput" placeholder="Ex: 7 ou 12-45" /><button @click="addFavorite">OK</button></div>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <div class="chips-list">
            <div v-for="item in userFavorites" :key="item" class="chip">
              <span class="val">{{ item }}</span>
              <button @click="analyzeDeepFavorite(item)" class="btn-bolt">⚡</button>
              <button @click="removeFavorite(item)" class="btn-del">×</button>
            </div>
          </div>
        </section>

        <!-- VISUEL BATCH -->
        <section class="card batch-card">
          <h2 class="section-title">🎨 ANALYSE VISUELLE (BATCH)</h2>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <div class="btn-row">
            <button @click="runBatchVisual('frequency')" class="btn-red">Rouge/Bleu</button>
            <button @click="runBatchVisual('kanta')" class="btn-green">Kanta</button>
          </div>
        </section>

        <!-- RAPPORTS -->
        <section class="card">
          <h2 class="section-title">📅 RAPPORTS PONCTUELS</h2>
          <input type="date" v-model="selectedDate" class="full-input" />
          <div class="btn-row">
            <button @click="runReport('daily-frequency')">Top Jour</button>
            <button @click="runReport('weekly-frequency')">Top Semaine</button>
          </div>
          <div class="btn-row-mini">
            <button @click="runKantaReport('daily-rank')">Kanta J</button>
            <button @click="runKantaReport('weekly-rank')">Kanta S</button>
          </div>
        </section>

        <!-- PERIODE -->
        <section class="card">
          <h2 class="section-title">📊 PÉRIODE & PROFILAGE</h2>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runRangeAnalysis" class="btn-primary">Fréquence sur Période</button>
          <div class="input-with-btn">
            <input type="number" v-model="profileNumber" placeholder="N° profil" />
            <button @click="runProfileAnalysis">GO</button>
          </div>
        </section>

        <!-- PROPHETE -->
        <section class="card prophet-card">
          <h2 class="section-title">🔮 LE PROPHÈTE</h2>
          <input type="number" v-model="predictionNumber" placeholder="Numéro vu" class="full-input" />
          <button @click="runPredictionAnalysis" class="btn-prophet">VOIR FUTUR PROBABLE</button>
        </section>

        <!-- IA AVANCEE -->
        <section class="card">
          <h2 class="section-title">🧠 IA AVANCÉE & KANTA</h2>
          <button @click="runSequenceAnalysis" class="btn-dark">DÉTECTER SUITES</button>
          <div class="input-with-btn">
            <input type="number" v-model="triggerTargetNumber" placeholder="Cible" />
            <button @click="runTriggerAnalysis">⚡</button>
          </div>
        </section>
      </aside>

      <!-- COLONNE DROITE (RÉSULTATS) -->
      <section class="results-display">
        <div class="top-bar"><a :href="sheetDirectLink" target="_blank" class="btn-gsheet">📂 OUVRIR GOOGLE SHEETS</a></div>

        <div v-if="isLoading" class="loader">Analyse des algorithmes en cours...</div>
        <div v-if="error" class="error-msg">{{ error }}</div>

        <!-- RÉSULTAT SPÉCIALISTE -->
        <div v-if="dayAnalysisResult" class="res-card specialist">
           <div class="res-header"><h3>📊 TOP {{ dayAnalysisResult.day_analyzed }} ({{ dayAnalysisResult.hour_analyzed }})</h3><button @click="dayAnalysisResult=null">×</button></div>
           <div class="duo-gold">DUO EN OR : <span>{{ dayAnalysisResult.best_duo }}</span></div>
           <div class="table-wrap">
             <table class="res-table">
               <thead><tr><th>N°</th><th>Kanta</th><th>Sorties</th><th>Compagnons</th><th>Futur</th></tr></thead>
               <tbody>
                 <tr v-for="r in dayAnalysisResult.recurrence_data" :key="r.number">
                   <td class="num-gold">{{ r.number }}</td>
                   <td class="kanta-red">{{ r.kanta }}</td>
                   <td class="bold">{{ r.count }}</td>
                   <td class="small">{{ r.best_companion }}</td>
                   <td class="proph">{{ r.best_prophet }}</td>
                 </tr>
               </tbody>
             </table>
           </div>
        </div>

        <!-- RÉSULTAT MATRICE -->
        <div v-if="matrixResult" class="res-card matrix">
           <div class="res-header"><h3>🕰️ ANALYSE MATRICIELLE</h3><button @click="matrixResult=null">×</button></div>
           <div class="matrix-tabs">
             <button @click="matrixTab='analysis'" :class="{active: matrixTab==='analysis'}">Historique</button>
             <button @click="matrixTab='prediction'" :class="{active: matrixTab==='prediction'}">Prédiction</button>
           </div>
           <div v-if="matrixTab==='analysis'" class="table-wrap">
             <table class="res-table">
               <thead><tr><th>Date</th><th>Base</th><th>Preuves</th></tr></thead>
               <tbody>
                 <tr v-for="r in matrixResult.matrix_data" :key="r.date">
                   <td>{{ r.date }}</td><td class="num">{{ r.base_number }}</td>
                   <td><span v-for="h in r.detailed_hits" :key="h.num" class="hit-tag">{{ h.num }}</span></td>
                 </tr>
               </tbody>
             </table>
           </div>
           <div v-else class="pred-zone">
              <div class="two-short">TWO SHORT : <span>{{ matrixResult.prediction.two_short }}</span></div>
              <div class="ai-box"><h4>Logique IA :</h4><p>{{ matrixResult.ai_analysis }}</p></div>
           </div>
        </div>

        <!-- RÉSULTATS STANDARDS (SYNTHÈSE TOP 3) -->
        <div v-if="standardResult" class="res-card standard">
          <div class="res-header"><h2>ANALYSE STRATÉGIQUE</h2><button @click="standardResult=null">×</button></div>
          <table v-if="isTableVisible" class="styled-table">
            <thead><tr><th style="width:60px">N°</th><th style="width:60px">Srt.</th><th>SYNTHÈSE (Top 3)</th></tr></thead>
            <tbody>
              <tr v-for="row in tableData" :key="row.number">
                <td class="num-cell">{{ row.number }}</td>
                <td class="count-cell">{{ row.count }}</td>
                <td>
                  <div v-if="row.synthesis" class="synth-grid">
                    <div v-if="row.synthesis.top_days" class="s-box"><h5>Jours</h5><p>{{ row.synthesis.top_days.join(', ') }}</p></div>
                    <div class="s-box"><h5>Heures</h5><p>{{ row.synthesis.top_hours.join(', ') }}</p></div>
                    <div class="s-box trig"><h5>Déclencheur</h5><p>{{ row.synthesis.top_triggers.join(' - ') }}</p></div>
                    <div class="s-box comp"><h5>Compagnons</h5><p>{{ row.synthesis.top_companions.join(' - ') }}</p></div>
                    <div class="s-box proph"><h5>Prophètes</h5><p>{{ row.synthesis.top_prophets.join(' - ') }}</p></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="!isLoading && !standardResult && !dayAnalysisResult && !matrixResult" class="empty-state">
           <img src="https://cdn-icons-png.flaticon.com/512/1541/1541413.png" width="100" />
           <h3>Système prêt pour l'analyse</h3>
           <p>Sélectionnez un outil à gauche pour lancer les algorithmes.</p>
        </div>

      </section>
    </div>
  </main>
</template>

<style scoped>
/* POLICES & BASE */
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Roboto:wght@300;500;900&display=swap');

.dashboard { font-family: 'Roboto', sans-serif; background: #f4f7f9; min-height: 100vh; padding: 15px; }
.logo-text { font-family: 'Orbitron', sans-serif; font-weight: 700; color: #1a237e; font-size: 1.5rem; }
.version { font-size: 0.8rem; background: #ffd600; color: #000; padding: 2px 6px; border-radius: 4px; vertical-align: middle; }

/* LAYOUT */
.main-layout { display: grid; grid-template-columns: 320px 1fr; gap: 20px; margin-top: 20px; }
.sidebar-controls { max-height: 88vh; overflow-y: auto; padding-right: 8px; }

/* STYLISATION SCROLLBAR */
.sidebar-controls::-webkit-scrollbar { width: 6px; }
.sidebar-controls::-webkit-scrollbar-thumb { background: #bbb; border-radius: 10px; }

/* CARDS DESIGN */
.card { background: white; border-radius: 12px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-left: 5px solid #007bff; }
.section-title { font-size: 0.95rem; font-weight: 900; margin-bottom: 12px; color: #333; text-transform: uppercase; }
.flex-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.flex-title h2 { font-size: 1rem; margin: 0; }
.badge { background: #673ab7; color: white; font-size: 0.65rem; padding: 2px 8px; border-radius: 10px; }
.badge.teal { background: #009688; }

/* FORM ELEMENTS */
input, select { width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.9rem; }
.date-range { display: flex; gap: 5px; }
.btn-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.tab-btns { display: flex; background: #eee; border-radius: 6px; padding: 3px; margin-bottom: 10px; }
.tab-btns button { flex: 1; border: none; padding: 6px; font-size: 0.8rem; cursor: pointer; border-radius: 4px; }
.tab-btns button.active { background: white; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }

/* BUTTONS COLORÉS */
button { cursor: pointer; transition: 0.3s; border: none; font-weight: bold; }
.btn-matrix { background: #ff9800; color: white; width: 100%; padding: 12px; border-radius: 6px; font-size: 1rem; }
.btn-spec { background: #00796b; color: white; width: 100%; padding: 12px; border-radius: 6px; }
.btn-maj { background: #4caf50; color: white; padding: 8px; border-radius: 4px; }
.btn-rebuild { background: #f44336; color: white; padding: 8px; border-radius: 4px; }
.btn-primary { background: #007bff; color: white; width: 100%; padding: 10px; border-radius: 6px; }
.btn-prophet { background: #673ab7; color: white; width: 100%; padding: 12px; border-radius: 6px; }
.btn-dark { background: #333; color: white; width: 100%; padding: 10px; border-radius: 6px; margin-bottom: 10px; }

/* FAVORIS CHIPS */
.chips-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.chip { display: flex; align-items: center; background: #e3f2fd; padding: 4px 10px; border-radius: 20px; border: 1px solid #bbdefb; }
.chip .val { font-weight: 900; color: #1565c0; margin-right: 8px; }
.btn-bolt { background: none; color: #fbc02d; font-size: 1rem; }
.btn-del { background: none; color: #f44336; font-size: 1.2rem; }

/* RESULTS DISPLAY */
.results-display { background: white; border-radius: 15px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); position: relative; }
.top-bar { display: flex; justify-content: flex-end; margin-bottom: 20px; }
.btn-gsheet { background: #1b5e20; color: white; text-decoration: none; padding: 12px 25px; border-radius: 30px; font-weight: bold; }

/* TABLES RÉSULTATS */
.styled-table { width: 100%; border-collapse: collapse; }
.styled-table th { text-align: center; padding: 15px; background: #f8f9fa; border-bottom: 2px solid #dee2e6; color: #666; font-size: 0.8rem; text-transform: uppercase; }
.styled-table td { padding: 12px; border-bottom: 1px solid #eee; text-align: center; vertical-align: middle; }
.num-cell { font-size: 1.8rem; font-weight: 900; color: #1a237e; background: #f0f4f8; border-radius: 8px; }
.count-cell { font-size: 1.3rem; font-weight: bold; color: #d32f2f; }

/* GRILLE DE SYNTHÈSE */
.synth-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.s-box { background: #fafafa; border: 1px solid #eee; padding: 6px; border-radius: 6px; }
.s-box h5 { margin: 0 0 4px 0; font-size: 0.6rem; color: #888; text-transform: uppercase; }
.s-box p { margin: 0; font-size: 0.85rem; font-weight: 900; color: #333; }
.s-box.trig p { color: #e65100; }
.s-box.comp p { color: #0277bd; }
.s-box.proph p { color: #7b1fa2; }

/* SPECIALIST & MATRIX RESULTS */
.res-card { border: 1px solid #ddd; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.specialist { border-top: 5px solid #009688; }
.matrix { border-top: 5px solid #ff9800; }
.res-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.duo-gold { background: #fffde7; padding: 15px; border-radius: 8px; text-align: center; font-weight: bold; border: 1px gold solid; margin-bottom: 15px; }
.duo-gold span { font-size: 2rem; color: #f57f17; }
.hit-tag { background: #4caf50; color: white; padding: 2px 6px; border-radius: 4px; margin-right: 4px; font-size: 0.8rem; font-weight: bold; }

.loader { text-align: center; padding: 50px; font-weight: bold; color: #007bff; animation: blink 1s infinite; }
@keyframes blink { 50% { opacity: 0.5; } }
.empty-state { text-align: center; padding: 100px 20px; color: #aaa; }
</style>