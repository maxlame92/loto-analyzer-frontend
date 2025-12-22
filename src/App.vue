<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// --- AUTH STATE ---
const user = ref(null);
const userRole = ref('');
const email = ref('');
const password = ref('');
const authError = ref('');
const isAuthReady = ref(false);

// --- APP STATE ---
const userFavorites = ref([]); 
const newFavoriteInput = ref('');
const selectedDayName = ref('Mercredi');
const selectedHour = ref('Toute la journée'); 
const hoursList = ['Toute la journée', '01H00', '03H00', '07H00', '08H00', '10H00', '13H00', '16H00', '19H00', '21H00', '22H00', '23H00'];

const matrixMode = ref('continuous'); 
const matrixTab = ref('analysis');
const cyclicDay = ref(1);

const selectedDate = ref('');
const startDate = ref('');
const endDate = ref('');
const profileNumber = ref('');
const triggerTargetNumber = ref('');

const isLoading = ref(false);
const error = ref(null);
const standardResult = ref(null);
const dayAnalysisResult = ref(null);
const matrixResult = ref(null);
const profileResult = ref(null);
const deepFavoriteResult = ref(null);

const lastOperationType = ref('');
const isAdmin = computed(() => userRole.value === 'admin');

onMounted(() => {
  const today = new Date();
  selectedDate.value = today.toISOString().split('T')[0];
  endDate.value = today.toISOString().split('T')[0];
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
  startDate.value = lastMonth.toISOString().split('T')[0];

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      user.value = firebaseUser;
      const docSnap = await getDoc(doc(db, "users", firebaseUser.uid));
      if (docSnap.exists()) {
        userRole.value = docSnap.data().role || 'user';
        userFavorites.value = docSnap.data().favorites || [];
      }
    } else { user.value = null; }
    isAuthReady.value = true;
  });
});

const login = async () => { try { isLoading.value = true; await signInWithEmailAndPassword(auth, email.value, password.value); } catch (e) { authError.value = "Clé d'accès refusée."; } finally { isLoading.value = false; } };
const logout = async () => { await signOut(auth); };

async function addFavorite() {
  if (!newFavoriteInput.value) return;
  try {
    const userRef = doc(db, "users", user.value.uid);
    await updateDoc(userRef, { favorites: arrayUnion(newFavoriteInput.value) });
    userFavorites.value.push(newFavoriteInput.value);
    newFavoriteInput.value = '';
  } catch (e) { console.error(e); }
}

async function removeFavorite(item) {
  try {
    const userRef = doc(db, "users", user.value.uid);
    await updateDoc(userRef, { favorites: arrayRemove(item) });
    userFavorites.value = userFavorites.value.filter(n => n !== item);
  } catch (e) { console.error(e); }
}

async function callApi(url, target = 'standard') {
  isLoading.value = true; error.value = null;
  if (target === 'standard') standardResult.value = null;
  try {
    const token = await user.value.getIdToken();
    const res = await fetch(`${API_BASE_URL}${url}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Erreur Algorithme");
    if (target === 'standard') standardResult.value = data;
    else if (target === 'specialist') dayAnalysisResult.value = data;
    else if (target === 'matrix') matrixResult.value = data;
    else if (target === 'profile') profileResult.value = data;
    else if (target === 'deep') deepFavoriteResult.value = data;
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

const runReport = (type) => { lastOperationType.value = type; callApi(`/analysis/${type}/${selectedDate.value}`); };
const runKantaReport = (type) => { lastOperationType.value = 'kanta-rank'; callApi(`/analysis/kanta-${type}/${selectedDate.value}`); };
const runRangeAnalysis = () => { lastOperationType.value = 'frequency'; callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`); };
</script>

<template>
  <div v-if="!isAuthReady" class="splash"><h1 class="orbitron gold">FOURCASTER ENGINE INITIALISATION...</h1></div>
  
  <div v-else-if="!user" class="login-screen">
    <div class="glass-box">
      <h1 class="orbitron gold">LE GUIDE DES FOURCASTER</h1>
      <p class="subtitle">ANALYSEUR DE PRÉCISION PRO</p>
      <input type="email" v-model="email" placeholder="Email Expert" />
      <input type="password" v-model="password" placeholder="Clé d'accès" />
      <button @click="login" class="btn-gold" :disabled="isLoading">ENTRER DANS L'ANALYSEUR</button>
      <p v-if="authError" class="err">{{ authError }}</p>
    </div>
  </div>

  <main v-else class="dashboard">
    <header class="top-nav">
      <h1 class="orbitron">FOURCASTER <span class="v-tag">V78.0 PRO</span></h1>
      <div class="user-control"><span class="u-mail">{{ user.email }}</span><button @click="logout" class="btn-out">QUITTER</button></div>
    </header>

    <div class="layout">
      <!-- SIDEBAR CONTROLS -->
      <aside class="sidebar-controls">
        
        <section v-if="isAdmin" class="card admin">
          <h3 class="section-title">🛡️ ADMINISTRATION</h3>
          <div class="grid-2">
            <button @click="callApi('/collection/update-recent-weeks')" class="btn-green">MàJ RAPIDE</button>
            <button @click="callApi('/collection/start-full-rebuild')" class="btn-red">RECONSTRUIRE</button>
          </div>
        </section>

        <section class="card matrix">
          <div class="flex-h"><h3>🕰️ MATRICE TEMPORELLE</h3><span class="badge gold">PREDICTOR</span></div>
          <div class="tabs-mini">
            <button @click="matrixMode='continuous'" :class="{active: matrixMode==='continuous'}">Séquence</button>
            <button @click="matrixMode='cyclic'" :class="{active: matrixMode==='cyclic'}">Cyclique</button>
          </div>
          <div v-if="matrixMode==='cyclic'" class="row-input">
            <label>Jour cible :</label><input type="number" v-model="cyclicDay" min="1" max="31" />
          </div>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="callApi(`/analysis/time-matrix?start_date=${startDate}&end_date=${endDate}&mode=${matrixMode}&target_cyclic_day=${cyclicDay}`, 'matrix')" class="btn-matrix">ANALYSER & PRÉDIRE</button>
        </section>

        <section class="card specialist">
          <div class="flex-h"><h3>📅 ANALYSTE SPÉCIALISTE</h3><span class="badge teal">360°</span></div>
          <div class="row">
            <select v-model="selectedDayName"><option v-for="d in ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']" :key="d">{{d}}</option></select>
            <select v-model="selectedHour"><option v-for="h in hoursList" :key="h">{{h}}</option></select>
          </div>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName}&target_hour=${selectedHour}&start_date=${startDate}&end_date=${endDate}`, 'specialist')" class="btn-spec">LANCER SCAN SNIPER</button>
        </section>

        <section class="card">
          <h3>⭐ MES NUMÉROS FAVORIS</h3>
          <div class="flex-h"><input type="text" v-model="newFavoriteInput" placeholder="N°" /><button @click="addFavorite" class="btn-add">ADD</button></div>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <div class="fav-list">
             <div v-for="f in userFavorites" :key="f" class="f-chip">
                <span>{{f}}</span> <button @click="callApi(`/analysis/deep-favorite?target=${f}&start_date=${startDate}&end_date=${endDate}`, 'deep')" class="btn-bolt">⚡</button>
                <button @click="removeFavorite(f)" class="btn-del">×</button>
             </div>
          </div>
        </section>

        <section class="card">
          <h3>🎨 ANALYSE VISUELLE (BATCH)</h3>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <div class="grid-2">
            <button @click="callApi(`/analysis/highlight-range?start_date=${startDate}&end_date=${endDate}&mode=frequency`)" class="btn-red-outline">ROUGE/BLEU</button>
            <button @click="callApi(`/analysis/highlight-range?start_date=${startDate}&end_date=${endDate}&mode=kanta`)" class="btn-green-outline">KANTA</button>
          </div>
        </section>

        <section class="card">
          <h3>📅 RAPPORTS PONCTUELS</h3>
          <input type="date" v-model="selectedDate" class="full-input" />
          <div class="grid-2">
            <button @click="runReport('daily-frequency')">TOP JOUR</button>
            <button @click="runReport('weekly-frequency')">TOP SEMAINE</button>
          </div>
          <div class="grid-2 mt-5">
            <button @click="runKantaReport('daily-rank')">KANTA J</button>
            <button @click="runKantaReport('weekly-rank')">KANTA S</button>
          </div>
        </section>

        <section class="card period-card">
          <h3>📊 PÉRIODE & PROFILAGE</h3>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runRangeAnalysis" class="btn-blue">FRÉQUENCE SUR PÉRIODE</button>
          <div class="flex-h mt-5"><input type="number" v-model="profileNumber" placeholder="N°" /><button @click="callApi(`/analysis/number-profile?target_number=${profileNumber}&start_date=${startDate}&end_date=${endDate}`, 'profile')" class="btn-purple">PROFIL</button></div>
        </section>

        <section class="card">
          <h3>🧠 IA & SUITES</h3>
          <button @click="callApi(`/analysis/sequence-detection?start_date=${startDate}&end_date=${endDate}`)" class="btn-black">DÉTECTER SUITES</button>
          <div class="flex-h mt-5"><input type="number" v-model="triggerTargetNumber" placeholder="Cible" /><button @click="callApi(`/analysis/trigger-numbers?target_number=${triggerTargetNumber}&start_date=${startDate}&end_date=${endDate}`)" class="btn-gold-bolt">⚡</button></div>
        </section>
      </aside>

      <!-- RESULTS AREA -->
      <section class="results-display">
        <div class="top-bar"><a :href="'https://docs.google.com/spreadsheets/d/1HepqMzKcshKbRsLWwpEOOy5oO9ntK2CgdV7F_ijmjIo'" target="_blank" class="btn-gsheet">📂 OUVRIR GOOGLE SHEETS</a></div>

        <div v-if="isLoading" class="pulse-loader">ALGORITHMES EN COURS...</div>
        <div v-if="error" class="error-msg">⚠️ {{ error }}</div>

        <!-- TABLEAU STRATÉGIQUE AVEC GRILLE SYNTHESE -->
        <div v-if="standardResult" class="res-box fade-in">
          <div class="res-header"><h2>ANALYSE STRATÉGIQUE DES FLUX</h2><button @click="standardResult=null">×</button></div>
          <table class="main-table">
            <thead><tr><th>N°</th><th>SORTIES</th><th>SYNTHÈSE STRATÉGIQUE (TOP 3)</th></tr></thead>
            <tbody>
              <tr v-for="r in (standardResult.frequency_ranking || standardResult.kanta_pairs_ranking)" :key="r.number || r.pair">
                <td class="td-num orbitron">{{ r.number || r.pair }}</td>
                <td class="td-count">{{ r.count }}</td>
                <td>
                  <div v-if="r.synthesis" class="grid-synth">
                    <div v-if="r.synthesis.top_days" class="s-card"><span>Jours</span><p>{{ r.synthesis.top_days.join(', ') }}</p></div>
                    <div class="s-card"><span>Heures</span><p>{{ r.synthesis.top_hours.join(', ') }}</p></div>
                    <div class="s-card orange"><span>Déclencheur</span><p>{{ r.synthesis.top_triggers.join(' - ') }}</p></div>
                    <div class="s-card blue"><span>Compagnons</span><p>{{ r.synthesis.top_companions.join(' - ') }}</p></div>
                    <div class="s-card purple"><span>Prophètes</span><p>{{ r.synthesis.top_prophets.join(' - ') }}</p></div>
                  </div>
                  <span v-else class="ai-text">{{ standardResult.ai_strategic_analysis }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- SPECIALISTE SNIPER -->
        <div v-if="dayAnalysisResult" class="res-box sniper fade-in">
           <div class="res-header"><h2>🎯 SCAN SNIPER : {{ dayAnalysisResult.day_analyzed.toUpperCase() }}</h2><button @click="dayAnalysisResult=null">×</button></div>
           <div class="gold-bar orbitron">DUO EN OR : {{ dayAnalysisResult.best_duo }}</div>
           <table class="main-table">
               <thead><tr><th>N°</th><th>Kanta</th><th>Fréq.</th><th>Compagnons</th><th>Prophète</th></tr></thead>
               <tbody>
                   <tr v-for="r in dayAnalysisResult.recurrence_data" :key="r.number">
                       <td class="num-gold orbitron">{{ r.number }}</td>
                       <td class="k-red">{{ r.kanta }}</td>
                       <td>{{ r.count }}</td>
                       <td class="small">{{ r.best_companion }}</td>
                       <td class="proph-v">{{ r.best_prophet }}</td>
                   </tr>
               </tbody>
           </table>
        </div>

        <!-- PROFIL EXPERT -->
        <div v-if="profileResult" class="res-box profile fade-in">
           <div class="res-header"><h2>👤 PROFIL EXPERT : {{ profileResult.profile_data.number }}</h2><button @click="profileResult=null">×</button></div>
           <div class="profile-stats">
              <div class="p-item"><span>Sorties</span><p>{{ profileResult.profile_data.hits }}</p></div>
              <div class="p-item"><span>Meilleur Jour</span><p>{{ profileResult.profile_data.best_day }}</p></div>
              <div class="p-item"><span>Heure Cible</span><p>{{ profileResult.profile_data.best_time }}</p></div>
           </div>
           <div class="grid-synth mt-5">
                <div class="s-card"><span>Jours</span><p>{{ profileResult.profile_data.top_days.join(', ') }}</p></div>
                <div class="s-card"><span>Heures</span><p>{{ profileResult.profile_data.top_hours.join(', ') }}</p></div>
                <div class="s-card orange"><span>Déclencheurs</span><p>{{ profileResult.profile_data.top_triggers.join(' - ') }}</p></div>
                <div class="s-card blue"><span>Compagnons</span><p>{{ profileResult.profile_data.top_companions.join(' - ') }}</p></div>
                <div class="s-card purple"><span>Prophètes</span><p>{{ profileResult.profile_data.top_prophets.join(' - ') }}</p></div>
           </div>
           <div class="ai-box mt-5"><p>{{ profileResult.ai_strategic_profile }}</p></div>
        </div>

        <div v-if="!isLoading && !standardResult && !dayAnalysisResult && !profileResult && !matrixResult" class="empty-state">
          <h2 class="orbitron">DASHBOARD EN ATTENTE</h2>
          <p>Activez les algorithmes dans la barre latérale pour extraire les données.</p>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Roboto:wght@300;400;700;900&display=swap');

.dashboard { font-family: 'Roboto', sans-serif; background: #0f172a; color: #f8fafc; min-height: 100vh; padding: 20px; }
.orbitron { font-family: 'Orbitron', sans-serif; }
.gold { color: #fbbf24; }
.v-tag { background: #fbbf24; color: #000; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; vertical-align: middle; }

.layout { display: grid; grid-template-columns: 320px 1fr; gap: 25px; margin-top: 20px; }
.sidebar-controls { max-height: 85vh; overflow-y: auto; padding-right: 10px; }
.sidebar-controls::-webkit-scrollbar { width: 5px; }
.sidebar-controls::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }

.card { background: #1e293b; border-radius: 15px; padding: 15px; margin-bottom: 20px; border: 1px solid #334155; }
.card h3 { font-size: 0.9rem; font-weight: 900; border-left: 3px solid #fbbf24; padding-left: 10px; margin-bottom: 15px; }

input, select, button { width: 100%; padding: 12px; margin-bottom: 10px; border-radius: 8px; border: none; font-weight: bold; background: #0f172a; color: white; border: 1px solid #334155; }
button { cursor: pointer; transition: 0.3s; }
.btn-gold { background: linear-gradient(to right, #fbbf24, #d97706); color: #000; }
.btn-matrix { background: #f59e0b; color: white; padding: 15px; }
.btn-spec { background: #14b8a6; }
.btn-blue { background: #3b82f6; }
.btn-purple { background: #a855f7; }
.btn-green { background: #22c55e; }
.btn-red { background: #ef4444; }

.results-display { background: #1e293b; border-radius: 15px; padding: 25px; border: 1px solid #334155; }
.main-table { width: 100%; border-collapse: collapse; background: #0f172a; border-radius: 15px; overflow: hidden; }
.main-table th { background: #334155; color: #94a3b8; padding: 15px; font-size: 0.8rem; text-transform: uppercase; }
.main-table td { padding: 15px; border-bottom: 1px solid #1e293b; text-align: center; }

.td-num { font-size: 2.2rem; font-weight: 900; color: #fbbf24; }
.td-count { font-size: 1.5rem; font-weight: 900; }

.grid-synth { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
.s-card { background: #1e293b; border: 1px solid #334155; padding: 8px; border-radius: 8px; text-align: center; }
.s-card span { font-size: 0.6rem; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 5px; }
.s-card p { margin: 0; font-size: 0.95rem; font-weight: 900; }
.orange p { color: #f97316; }
.blue p { color: #3b82f6; }
.purple p { color: #a855f7; }

.gold-bar { background: #fbbf24; color: #000; padding: 15px; font-weight: 900; font-size: 1.5rem; text-align: center; border-radius: 10px; margin-bottom: 20px; }
.profile-stats { display: flex; gap: 20px; justify-content: center; }
.p-item { background: #0f172a; padding: 15px; border-radius: 12px; border: 1px solid #fbbf24; width: 120px; text-align: center; }
.num-gold { color: #fbbf24; font-size: 1.8rem; font-weight: 900; }
.k-red { color: #ef4444; font-weight: 900; }

.pulse-loader { text-align: center; padding: 50px; font-weight: 900; color: #fbbf24; animation: pulse 1.5s infinite; font-family: 'Orbitron'; }
@keyframes pulse { 50% { opacity: 0.3; } }
.btn-gsheet { background: #1b5e20; color: white; text-decoration: none; padding: 12px 25px; border-radius: 30px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
</style>