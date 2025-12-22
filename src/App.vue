<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const GOOGLE_SHEET_ID = "1HepqMzKcshKbRsLWwpEOOy5oO9ntK2CgdV7F_ijmjIo";

// --- ÉTATS ---
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
const selectedDate = ref('');
const startDate = ref('');
const endDate = ref('');
const isLoading = ref(false);
const error = ref(null);
const viewMode = ref('table');
const lastOperationType = ref('');

const isAdmin = computed(() => userRole.value === 'admin');
const sheetDirectLink = computed(() => `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/edit`);

// --- CONFIGURATION HEADERS ---
const tableHeaders = computed(() => {
  if (!lastOperationType.value) return [];
  if (lastOperationType.value.includes('frequency')) return ['#', 'N°', 'Sorties', 'SYNTHÈSE STRATÉGIQUE (Top 3)'];
  if (lastOperationType.value === 'prediction') return ['#', 'Suivant Probable', 'Force'];
  if (lastOperationType.value === 'trigger') return ['#', 'Déclencheur', 'Force'];
  if (lastOperationType.value.includes('kanta')) return ['Paire Kanta', 'Vu'];
  return ['Donnée', 'Valeur'];
});

const tableData = computed(() => {
  if (standardResult.value?.frequency_ranking) return standardResult.value.frequency_ranking;
  if (standardResult.value?.prediction_ranking) return standardResult.value.prediction_ranking;
  if (standardResult.value?.trigger_numbers_ranking) return standardResult.value.trigger_numbers_ranking;
  if (standardResult.value?.kanta_pairs) return standardResult.value.kanta_pairs;
  return [];
});

const chartData = computed(() => {
  const data = tableData.value;
  if (!data || data.length === 0) return null;
  return {
    labels: data.slice(0, 10).map(r => (r.number || r.pair || r.companion || '?').toString()),
    datasets: [{ label: 'Occurrences', backgroundColor: '#007bff', data: data.slice(0, 10).map(r => r.count) }]
  };
});

// --- ACTIONS API ---
async function callApi(url, targetVar = 'standard') {
  isLoading.value = true; error.value = null;
  try {
    const token = await user.value.getIdToken();
    const response = await fetch(`${API_BASE_URL}${url}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Erreur serveur");
    if (targetVar === 'specialist') dayAnalysisResult.value = data;
    else if (targetVar === 'deep') deepFavoriteResult.value = data;
    else if (targetVar === 'profile') profileResult.value = data;
    else if (targetVar === 'matrix') matrixResult.value = data;
    else standardResult.value = data;
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

onMounted(() => {
  const today = new Date().toISOString().split('T')[0];
  selectedDate.value = today; endDate.value = today;
  const start = new Date(); start.setMonth(start.getMonth() - 1);
  startDate.value = start.toISOString().split('T')[0];

  onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      user.value = fbUser;
      const snap = await getDoc(doc(db, "users", fbUser.uid));
      if (snap.exists()) {
        userRole.value = snap.data().role || 'user';
        userFavorites.value = snap.data().favorites || [];
      }
    }
    isAuthReady.value = true;
  });
});

const login = async () => { try { await signInWithEmailAndPassword(auth, email.value, password.value); } catch(e) { authError.value = "Erreur login."; } };
const logout = async () => { await signOut(auth); user.value = null; };

async function addFavorite() { 
  if (!newFavoriteInput.value) return;
  const userRef = doc(db, "users", user.value.uid);
  await updateDoc(userRef, { favorites: arrayUnion(newFavoriteInput.value) });
  userFavorites.value.push(newFavoriteInput.value); newFavoriteInput.value = '';
}
async function removeFavorite(it) {
  const userRef = doc(db, "users", user.value.uid);
  await updateDoc(userRef, { favorites: arrayRemove(it) });
  userFavorites.value = userFavorites.value.filter(n => n !== it);
}
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen">Chargement...</div>
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2>GUIDE DES FOURCASTER</h2>
      <input type="email" v-model="email" placeholder="Email" />
      <input type="password" v-model="password" placeholder="Pass" />
      <button @click="login">Connexion</button>
    </div>
  </div>

  <main v-else class="dashboard">
    <header>
      <h1>LE GUIDE DES FOURCASTER <span class="version-tag">V79</span></h1>
      <div class="user-info"><strong>{{ user.email }}</strong> <button @click="logout" class="logout-btn">Déconnexion</button></div>
    </header>

    <div class="main-layout">
      <!-- SIDEBAR AVEC TOUTES LES FONCTIONS D'ORIGINE -->
      <div class="controls-column">
        
        <!-- 🕰️ MATRICE TEMPORELLE -->
        <section class="card matrix-card">
          <div class="boss-header"><h2>🕰️ MATRICE TEMPORELLE</h2><span class="badge-spec" style="background:#ff9800;">PREDICTOR</span></div>
          <p class="small-text">Apprentissage sur la formule Date/Renversé/Kanta.</p>
          <div class="tabs">
             <button @click="matrixMode = 'continuous'" :class="{ active: matrixMode === 'continuous' }">CONTINU</button>
             <button @click="matrixMode = 'cyclic'" :class="{ active: matrixMode === 'cyclic' }">CYCLIQUE</button>
          </div>
          <input v-if="matrixMode === 'cyclic'" type="number" v-model="cyclicDay" placeholder="Jour (1-31)" />
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="callApi(`/analysis/time-matrix?start_date=${startDate}&end_date=${endDate}&mode=${matrixMode}${matrixMode==='cyclic'?'&target_cyclic_day='+cyclicDay:''}`, 'matrix')" class="spec-btn" style="background:#ff9800;">ANALYSER & PRÉDIRE</button>
        </section>

        <!-- 📅 ANALYSTE SPÉCIALISTE -->
        <section class="card spec-card">
          <div class="boss-header"><h2>📅 ANALYSTE SPÉCIALISTE</h2><span class="badge-spec">360°</span></div>
          <p class="small-text">Trouvez les Habitués de chaque jour.</p>
          <label>Jour :</label>
          <select v-model="selectedDayName"><option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option></select>
          <label>Heure :</label>
          <select v-model="selectedHour"><option>Toute la journée</option><option>10H</option><option>13H</option><option>16H</option><option>19H</option></select>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName}&target_hour=${selectedHour}&start_date=${startDate}&end_date=${endDate}`, 'specialist')" class="spec-btn">SCANNER LE JOUR</button>
        </section>

        <!-- ADMIN -->
        <section v-if="isAdmin" class="card">
          <h2>Maintenance (Admin)</h2>
          <div class="button-group-horizontal">
            <button @click="callApi('/collection/update-recent-weeks')">Mise à Jour Rapide</button>
            <button @click="callApi('/collection/start-full-rebuild')" class="danger">Reconstruction</button>
          </div>
        </section>

        <!-- ⭐ MES FAVORIS -->
        <section class="card">
          <h2>⭐ Mes Numéros Favoris</h2>
          <div class="favorites-input-group"><input type="text" v-model="newFavoriteInput" placeholder="Ex: 7 ou 12-45" /><button @click="addFavorite">Ajouter</button></div>
          <div class="favorites-list">
            <div v-for="it in userFavorites" class="favorite-chip">
              <span @click="callApi(`/analysis/deep-favorite?target=${it}&start_date=${startDate}&end_date=${endDate}`, 'deep')" class="fav-label">{{ it }}</span>
              <span @click="callApi(`/analysis/multi-prediction?numbers_str=${it}&start_date=${startDate}&end_date=${endDate}`)" style="cursor:pointer">⚡</span>
              <span @click="removeFavorite(it)" class="fav-delete">×</span>
            </div>
          </div>
        </section>

        <!-- ANALYSE VISUELLE (BATCH) -->
        <section class="card">
          <h2>Analyse Visuelle (Batch)</h2>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <div class="button-group-vertical">
            <button @click="callApi(`/analysis/highlight-range?start_date=${startDate}&end_date=${endDate}&mode=frequency`)" style="background:#ef5350;">Surlignage Rouge/Bleu</button>
            <button @click="callApi(`/analysis/highlight-range?start_date=${startDate}&end_date=${endDate}&mode=kanta`)" style="background:#66bb6a;">Surlignage Kanta</button>
          </div>
        </section>

        <!-- RAPPORTS PONCTUELS -->
        <section class="card">
          <h2>Rapports Ponctuels</h2>
          <input type="date" v-model="selectedDate" />
          <div class="button-group-vertical" style="margin-top:10px;">
            <button @click="lastOperationType='daily-frequency'; callApi(`/analysis/daily-frequency/${selectedDate}`)">Classement Jour (Top 10)</button>
            <button @click="lastOperationType='weekly-frequency'; callApi(`/analysis/weekly-frequency/${selectedDate}`)">Classement Semaine (Top 10)</button>
          </div>
        </section>

        <!-- PÉRIODE & PROFILAGE -->
        <section class="card">
          <h2>Période & Profilage</h2>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="lastOperationType='frequency-range'; callApi(`/analysis/frequency-by-range?start_date=${startDate}&end_date=${endDate}`)">Fréquence sur Période</button>
          <hr />
          <input type="number" v-model="profileNumber" placeholder="Numéro profil" style="margin-top:10px;" />
          <button @click="profileResult=null; callApi(`/analysis/number-profile?target_number=${profileNumber}&start_date=${startDate}&end_date=${endDate}`, 'profile')">Générer Profil</button>
        </section>

        <!-- 🔮 LE PROPHÈTE -->
        <section class="card prophet-card">
          <h2>🔮 Le Prophète</h2>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <input type="number" v-model="predictionNumber" placeholder="Numéro vu" />
          <button @click="lastOperationType='prediction'; callApi(`/analysis/predict-next?observed_number=${predictionNumber}&start_date=${startDate}&end_date=${endDate}`)" class="spec-btn" style="background:#7b1fa2;">Voir Futur Probable</button>
        </section>

        <!-- 🔮 ANALYSE CROISÉE -->
        <section class="card" style="border: 2px solid #6f42c1;">
          <h2>🔮 Analyse Croisée</h2>
          <input type="text" v-model="multiPredictionInput" placeholder="Ex: 5 12 34" />
          <button @click="lastOperationType='prediction'; callApi(`/analysis/multi-prediction?numbers_str=${multiPredictionInput}&start_date=${startDate}&end_date=${endDate}`)" class="spec-btn" style="background:#6f42c1;">Lancer Projection</button>
        </section>

        <!-- IA AVANCÉE & KANTA -->
        <section class="card">
          <h2>IA Avancée & Kanta</h2>
          <button @click="callApi(`/analysis/sequence-detection?start_date=${startDate}&end_date=${endDate}`)">Détecter Suites</button>
          <hr />
          <input type="number" v-model="triggerTargetNumber" placeholder="Numéro cible" style="margin-top:10px;" />
          <button @click="lastOperationType='trigger'; callApi(`/analysis/trigger-numbers?target_number=${triggerTargetNumber}&start_date=${startDate}&end_date=${endDate}`)">Trouver Déclencheurs ⚡</button>
          <hr />
          <div class="button-group-horizontal">
            <button @click="lastOperationType='kanta'; callApi(`/analysis/kanta-daily-rank/${selectedDate}`)">Rank Kanta J</button>
          </div>
        </section>
      </div>

      <!-- ZONE RÉSULTATS -->
      <div class="results-column">
        <div class="quick-link-box"><a :href="sheetDirectLink" target="_blank" class="gsheet-btn">📂 OUVRIR GOOGLE SHEETS</a></div>

        <!-- AFFICHAGE MATRICE -->
        <div v-if="matrixResult" class="card result-spec-card" style="border-top:4px solid #ff9800;">
           <h3>🕰️ MATRICE TEMPORELLE</h3>
           <div class="tabs"><button @click="matrixTab='analysis'" :class="{active: matrixTab==='analysis'}">ANALYSE</button><button @click="matrixTab='prediction'" :class="{active: matrixTab==='prediction'}">PRÉDICTION</button></div>
           <div v-if="matrixTab==='analysis'" class="table-responsive">
             <table class="spec-table">
               <thead><tr><th>Date</th><th>Base</th><th>Résultats</th></tr></thead>
               <tbody><tr v-for="row in matrixResult.matrix_data"><td>{{row.date}}</td><td class="num-cell">{{row.base_number}}</td><td><div v-for="h in row.detailed_hits" class="mini-hit"><span class="badge-hit">{{h.num}}</span> ({{h.reason}})</div></td></tr></tbody>
             </table>
           </div>
           <div v-else class="prediction-tab">
             <div class="best-duo-box"><span>🔮 TWO SHORT :</span><span class="duo-val">{{ matrixResult.prediction?.two_short }}</span></div>
             <p>Cible : {{ matrixResult.prediction?.target_date_label }}</p>
           </div>
        </div>

        <!-- AFFICHAGE RAPPORT DÉTAILLÉ (SCAN / PROFIL) -->
        <div v-if="deepFavoriteResult || profileResult" class="card result-spec-card" :style="{borderTopColor: profileResult ? '#ab47bc' : '#fdd835'}">
          <div class="spec-header"><h3>⭐ RAPPORT DÉTAILLÉ : {{ deepFavoriteResult?.favorite || profileResult?.profile_data.number }}</h3><button @click="deepFavoriteResult=null;profileResult=null">×</button></div>
          <div class="summary-grid">
            <div class="sum-card"><h5>Top Jours</h5><div class="mini-list">{{ (deepFavoriteResult?.summary.top_days || profileResult?.profile_data.summary.top_days).map(d=>d.val).join(', ') }}</div></div>
            <div class="sum-card"><h5>Top Heures</h5><div class="mini-list">{{ (deepFavoriteResult?.summary.top_hours || profileResult?.profile_data.summary.top_hours).map(h=>h.val).join(', ') }}</div></div>
            <div class="sum-card"><h5>Déclencheurs</h5><div class="mini-list" style="color:#e65100;">{{ (deepFavoriteResult?.summary.top_triggers || profileResult?.profile_data.summary.top_triggers).map(t=>t.val).join(' - ') }}</div></div>
            <div class="sum-card"><h5>Compagnons</h5><div class="mini-list" style="color:#0277bd;">{{ (deepFavoriteResult?.summary.top_companions || profileResult?.profile_data.summary.top_companions).map(c=>c.val).join(' - ') }}</div></div>
            <div class="sum-card"><h5>Prophètes</h5><div class="mini-list" style="color:#7b1fa2;">{{ (deepFavoriteResult?.summary.top_prophets || profileResult?.profile_data.summary.top_prophets).map(p=>p.val).join(' - ') }}</div></div>
          </div>
          <div class="table-responsive">
            <table class="spec-table">
              <thead><tr><th>Date</th><th>Heure/Jour</th><th>Déclencheur</th><th>Compagnons</th><th>Prophète</th></tr></thead>
              <tbody><tr v-for="row in (deepFavoriteResult?.history_table || profileResult?.profile_data.history_table)"><td>{{row.date}}</td><td>{{row.time || row.day}}</td><td>{{row.trigger}}</td><td>{{row.companion}}</td><td>{{row.prophet}}</td></tr></tbody>
            </table>
          </div>
        </div>

        <!-- CLASSEMENTS STANDARDS AVEC TOP 3 -->
        <section v-if="standardResult" class="card results-card fade-in">
          <div class="spec-header"><h2>CLASSEMENTS STRATÉGIQUES</h2><button @click="standardResult=null">×</button></div>
          <div class="view-controls"><button @click="viewMode='table'" :class="{active: viewMode==='table'}">📋 Tableau</button><button @click="viewMode='chart'" :class="{active: viewMode==='chart'}">📊 Graphe</button></div>
          <div v-if="viewMode==='chart'" class="chart-container"><Bar :data="chartData" /></div>
          <table v-else class="styled-table">
            <thead><tr><th v-for="h in tableHeaders">{{ h }}</th></tr></thead>
            <tbody>
              <tr v-for="row in tableData">
                <td class="num-cell">{{ row.number || row.pair }}</td><td><strong>{{ row.count }}</strong></td>
                <td>
                  <div v-if="row.synthesis" class="summary-grid mini">
                    <div v-if="row.synthesis.top_days" class="sum-card"><h5>Top Jours</h5><div class="mini-list">{{ row.synthesis.top_days.join(', ') }}</div></div>
                    <div class="sum-card"><h5>Top Heures</h5><div class="mini-list">{{ row.synthesis.top_hours.join(', ') }}</div></div>
                    <div class="sum-card"><h5>Déclencheurs</h5><div class="mini-list" style="color:#e65100;">{{ row.synthesis.top_triggers.join(' - ') }}</div></div>
                    <div class="sum-card"><h5>Compagnons</h5><div class="mini-list" style="color:#0277bd;">{{ row.synthesis.top_companions.join(' - ') }}</div></div>
                    <div class="sum-card"><h5>Prophètes</h5><div class="mini-list" style="color:#7b1fa2;">{{ row.synthesis.top_prophets.join(' - ') }}</div></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <div v-if="isLoading" class="loader">Analyse IA en cours...</div>
        <div v-if="error" class="error-box">{{ error }}</div>
        <div v-if="!standardResult && !matrixResult && !deepFavoriteResult && !profileResult && !isLoading" class="welcome-message"><h3>PRÊT</h3><p>Sélectionnez une fonction à gauche.</p></div>
      </div>
    </div>
  </main>
</template>

<style scoped>
  .dashboard { max-width: 1450px; margin: auto; padding: 20px; font-family: sans-serif; background: #fdfdfd; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; margin-bottom: 20px; }
  .main-layout { display: grid; grid-template-columns: 320px 1fr; gap: 20px; }
  .controls-column { max-height: 90vh; overflow-y: auto; padding-right: 10px; }
  .card { background: white; padding: 15px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin-bottom: 15px; border: 1px solid #f0f0f0; }
  .tabs { display: flex; gap: 5px; margin: 10px 0; }
  .tabs button { flex: 1; padding: 8px; border: none; cursor: pointer; background: #eee; border-radius: 4px; font-size: 0.8rem; font-weight: bold; }
  .tabs button.active { background: #673ab7; color: white; }
  .spec-btn { width: 100%; padding: 10px; border-radius: 8px; color: white; cursor: pointer; font-weight: bold; margin-top: 10px; border: none; }
  .date-picker-row { display: flex; gap: 5px; margin: 10px 0; }
  .date-picker-row input { flex: 1; padding: 5px; }
  .favorite-chip { background: #e3f2fd; padding: 5px 12px; border-radius: 20px; margin: 3px; display: inline-flex; gap: 8px; border: 1px solid #bbdefb; font-weight: bold; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin: 15px 0; }
  .summary-grid.mini { grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 4px; }
  .sum-card { background: #f8f9fa; border: 1px solid #eee; padding: 6px; border-radius: 6px; }
  .sum-card h5 { margin: 0 0 4px; font-size: 0.6rem; text-transform: uppercase; color: #777; border-bottom: 1px solid #eee; }
  .mini-list { font-size: 0.75rem; font-weight: bold; }
  .num-cell { font-size: 1.4rem; font-weight: 900; color: #00796b; background: #f0f4f8; }
  .gsheet-btn { background: #0f9d58; color: white; padding: 10px 20px; border-radius: 30px; text-decoration: none; font-weight: bold; }
  .styled-table { width: 100%; border-collapse: collapse; }
  .styled-table th { background: #f8f9fa; padding: 12px; border-bottom: 2px solid #dee2e6; }
  .styled-table td { padding: 12px; border-bottom: 1px solid #eee; vertical-align: middle; }
  .prophet-card { border: 2px solid #7b1fa2; background-color: #f3e5f5; }
  .danger { background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; }
  .loader { text-align: center; padding: 20px; font-weight: bold; color: #007bff; }
</style>