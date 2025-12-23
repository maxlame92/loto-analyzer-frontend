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
const activeSheetGid = ref(null);
const showWelcomeMessage = ref(true);

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
        }
      } catch (e) { console.error("Firebase Error"); }
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
  try {
    const userRef = doc(db, "users", user.value.uid);
    userFavorites.value.push(input); 
    await setDoc(userRef, { favorites: arrayUnion(input) }, { merge: true }); 
    newFavoriteInput.value = '';
  } catch (e) { alert("Erreur favoris."); }
}

async function removeFavorite(item) {
  try {
    const userRef = doc(db, "users", user.value.uid);
    userFavorites.value = userFavorites.value.filter(n => n !== item);
    await updateDoc(userRef, { favorites: arrayRemove(item) });
  } catch (e) { console.error(e); }
}

async function callApi(url, targetVar = 'standard') {
  showWelcomeMessage.value = false; isLoading.value = true; error.value = null;
  if (targetVar === 'standard') standardResult.value = null;
  try {
    const token = await user.value.getIdToken();
    const response = await fetch(`${API_BASE_URL}${url}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Erreur");
    
    if (targetVar === 'specialist') dayAnalysisResult.value = data;
    else if (targetVar === 'deep') deepFavoriteResult.value = data;
    else if (targetVar === 'profile') profileResult.value = data;
    else if (targetVar === 'matrix') matrixResult.value = data;
    else standardResult.value = data;
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

async function runReport(reportType) { await callApi(`/analysis/${reportType}/${selectedDate.value}`); }
async function runRangeAnalysis() { await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`); }
async function runDayAnalysis() { await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist'); }
async function runTriggerAnalysis() { await callApi(`/analysis/trigger-numbers?target_number=${triggerTargetNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}${triggerCompanionNumber.value ? '&companion_number='+triggerCompanionNumber.value : ''}`); }
async function runPredictionAnalysis() { await callApi(`/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`); }
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen"><p>Chargement...</p></div>
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2>LE GUIDE DES FOURCASTER</h2>
      <form @submit.prevent="login">
        <input type="email" v-model="email" placeholder="Email" required />
        <input type="password" v-model="password" placeholder="Mot de passe" required />
        <button type="submit">Connexion</button>
      </form>
    </div>
  </div>

  <main v-else class="dashboard">
    <header>
      <h1>LE GUIDE DES FOURCASTER <span class="version-tag">V73 DEEP INTEL</span></h1>
      <div class="user-info"><span>{{ user.email }}</span><button @click="logout" class="logout-btn">Quitter</button></div>
    </header>

    <div class="main-layout">
      <!-- SIDEBAR GAUCHE (RESTAURÉE) -->
      <aside class="controls-column">
        <section class="card matrix-card">
          <h3>🕰️ MATRICE TEMPORELLE</h3>
          <div class="tabs"><button @click="matrixMode='continuous'">Continu</button><button @click="matrixMode='cyclic'">Cyclique</button></div>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="callApi('/analysis/time-matrix?start_date='+startDate+'&end_date='+endDate+'&mode='+matrixMode, 'matrix')" class="btn-orange">ANALYSER & PRÉDIRE</button>
        </section>

        <section class="card spec-card">
          <h3>📅 ANALYSTE SPÉCIALISTE</h3>
          <select v-model="selectedDayName"><option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option></select>
          <div class="date-picker-row"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runDayAnalysis" class="btn-teal">SCANNER {{ selectedDayName.toUpperCase() }}</button>
        </section>

        <section class="card">
          <h3>⭐ Favoris</h3>
          <div class="fav-input"><input type="text" v-model="newFavoriteInput" placeholder="Ex: 7"/><button @click="addFavorite">ADD</button></div>
          <div class="favorites-list"><div v-for="item in userFavorites" :key="item" class="fav-chip"><span>{{ item }}</span><button @click="callApi('/analysis/deep-favorite?target='+item+'&start_date='+startDate+'&end_date='+endDate, 'deep')">⚡</button><span @click="removeFavorite(item)">×</span></div></div>
        </section>

        <section class="card">
          <h3>📊 RAPPORTS & PÉRIODES</h3>
          <input type="date" v-model="selectedDate" />
          <div class="btn-grid">
            <button @click="runReport('daily-frequency')">Top 10 Jour</button>
            <button @click="runReport('weekly-frequency')">Top 10 Semaine</button>
            <button @click="runRangeAnalysis" class="btn-full">Fréquence Période</button>
          </div>
        </section>

        <section class="card">
          <h3>IA AVANCÉE & DÉCLENCHEURS</h3>
          <input type="number" v-model="triggerTargetNumber" placeholder="Cible ⚡" />
          <button @click="runTriggerAnalysis" class="btn-blue">VOIR DÉCLENCHEURS</button>
          <input type="number" v-model="predictionNumber" placeholder="Numéro Vu 🔮" />
          <button @click="runPredictionAnalysis" class="btn-purple">PRÉDIRE FUTUR</button>
        </section>
      </aside>

      <!-- RÉSULTATS -->
      <div class="results-column">
        <div class="gsheet-box"><a :href="sheetDirectLink" target="_blank" class="gsheet-btn">📂 OUVRIR GOOGLE SHEETS</a></div>

        <!-- SNIPER RESULT -->
        <div v-if="dayAnalysisResult" class="card res-card">
          <h3>🎯 SCAN SNIPER : {{ dayAnalysisResult.day_analyzed.toUpperCase() }}</h3>
          <div class="duo-box">DUO EN OR : {{ dayAnalysisResult.best_duo }}</div>
          <table>
            <thead><tr><th>N°</th><th>KANTA</th><th>FRÉQ.</th><th>COMPAGNONS</th><th>PROPHÈTE</th></tr></thead>
            <tbody><tr v-for="r in dayAnalysisResult.recurrence_data" :key="r.number"><td class="num">{{r.number}}</td><td class="kanta">{{r.kanta}}</td><td>{{r.count}}</td><td>{{r.top_companions}}</td><td class="proph">{{r.top_prophets}}</td></tr></tbody>
          </table>
        </div>

        <!-- DEEP FAVORITE RESULT -->
        <div v-if="deepFavoriteResult" class="card res-card">
          <h3>⭐ SCAN PROFOND : {{ deepFavoriteResult.favorite }}</h3>
          <div class="summary-grid">
             <div class="sum-card"><h5>Top Jours</h5><p>{{ deepFavoriteResult.summary.top_days.map(x=>x.val).join(', ') }}</p></div>
             <div class="sum-card"><h5>Déclencheurs</h5><p>{{ deepFavoriteResult.summary.top_triggers.map(x=>x.val).join(', ') }}</p></div>
             <div class="sum-card"><h5>Compagnons</h5><p>{{ deepFavoriteResult.summary.top_companions.map(x=>x.val).join(', ') }}</p></div>
          </div>
        </div>

        <!-- CLASSEMENTS STANDARDS -->
        <div v-if="standardResult && standardResult.results" class="card res-card">
          <h3>📊 CLASSEMENT {{ standardResult.mode }}</h3>
          <table>
            <thead><tr><th>N°</th><th>FREQ.</th><th>SYNTHÈSE TOP 3</th></tr></thead>
            <tbody><tr v-for="r in standardResult.results" :key="r.number">
              <td class="num">{{r.number}}<br><small class="kanta">K:{{r.kanta}}</small></td><td>{{r.count}}</td>
              <td>
                <div class="mini-grid">
                  <div>⚡ Passé : {{ r.top_triggers }}</div>
                  <div>& Présent : {{ r.top_companions }}</div>
                  <div>🔮 Futur : {{ r.top_prophets }}</div>
                </div>
              </td>
            </tr></tbody>
          </table>
        </div>

        <div v-if="isLoading" class="loader">ALGORITHMES EN COURS...</div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.dashboard { max-width: 95%; margin: auto; padding: 20px; font-family: 'Segoe UI', sans-serif; background: #f4f7f6; min-height: 100vh; }
header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ddd; padding-bottom: 10px; margin-bottom: 20px; }
.main-layout { display: grid; grid-template-columns: 350px 1fr; gap: 20px; }
.card { background: white; padding: 15px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin-bottom: 15px; }
.card h3 { font-size: 0.9rem; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px; }
input, select, button { width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
button { font-weight: bold; cursor: pointer; color: white; background: #007bff; border: none; }
.btn-orange { background: #ff9800; }
.btn-teal { background: #009688; }
.btn-blue { background: #2196f3; }
.btn-purple { background: #9c27b0; }
.btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.btn-full { grid-column: span 2; }
.res-card { border-top: 4px solid #009688; }
.duo-box { background: #ffc107; padding: 15px; border-radius: 8px; margin-bottom: 15px; text-align: center; font-weight: bold; color: #000; font-size: 1.2rem; }
table { width: 100%; border-collapse: collapse; margin-top: 15px; }
th { background: #eee; padding: 8px; font-size: 0.8rem; }
td { padding: 10px; border-bottom: 1px solid #eee; text-align: center; }
.num { font-weight: bold; font-size: 1.2rem; color: #00796b; }
.kanta { color: #d32f2f; font-weight: bold; }
.proph { background: #f3e5f5; font-weight: bold; color: #7b1fa2; }
.mini-grid { display: grid; gap: 3px; font-size: 0.75rem; text-align: left; }
.summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.sum-card { background: #f8f9fa; padding: 10px; border: 1px solid #dee2e6; border-radius: 4px; text-align: center; }
.sum-card h5 { margin: 0 0 5px 0; font-size: 0.7rem; color: #888; text-transform: uppercase; }
.loader { text-align: center; margin-top: 50px; font-size: 1.5rem; font-weight: bold; color: #999; }
</style>