<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

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
const selectedNumber = ref('');
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
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
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

const login = async () => { try { await signInWithEmailAndPassword(auth, email.value, password.value); } catch (e) { authError.value = "Identifiants invalides"; } };
const logout = async () => { await signOut(auth); };

async function callApi(url, target = 'standard') {
  isLoading.value = true; error.value = null;
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
  <div v-if="!isAuthReady" class="splash"><h1>CHARGEMENT DU SYSTÈME...</h1></div>
  
  <div v-else-if="!user" class="login-screen">
    <div class="glass-box">
      <h1 class="orbitron gold">LE GUIDE DES FOURCASTER</h1>
      <input type="email" v-model="email" placeholder="Email Expert" />
      <input type="password" v-model="password" placeholder="Clé d'accès" />
      <button @click="login" class="btn-gold">ACTIVER L'ANALYSEUR</button>
      <p v-if="authError" class="err">{{ authError }}</p>
    </div>
  </div>

  <main v-else class="dashboard">
    <header class="top-nav">
      <h1 class="orbitron">FOURCASTER <span class="v-tag">V78.0 PRO</span></h1>
      <div class="user-control">
        <span class="u-mail">{{ user.email }}</span>
        <button @click="logout" class="btn-out">DÉCONNEXION</button>
      </div>
    </header>

    <div class="layout">
      <!-- SIDEBAR CONTROLS -->
      <aside class="controls">
        
        <!-- ADMIN -->
        <section v-if="isAdmin" class="card admin">
          <h3>🛡️ ADMINISTRATION</h3>
          <div class="grid-2">
            <button @click="callApi('/collection/update-recent-weeks')" class="btn-green">MàJ RAPIDE</button>
            <button @click="callApi('/collection/start-full-rebuild')" class="btn-red">RECONSTRUIRE</button>
          </div>
        </section>

        <!-- MATRICE -->
        <section class="card matrix">
          <div class="flex-h"><h3>🕰️ MATRICE</h3><span class="badge gold">PREDICTOR</span></div>
          <div class="tabs-mini">
            <button @click="matrixMode='continuous'" :class="{active: matrixMode==='continuous'}">Séquence</button>
            <button @click="matrixMode='cyclic'" :class="{active: matrixMode==='cyclic'}">Cyclique</button>
          </div>
          <div v-if="matrixMode==='cyclic'" class="row-input">
            <label>Jour du mois :</label><input type="number" v-model="cyclicDay" min="1" max="31" />
          </div>
          <div class="row-input"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="callApi(`/analysis/time-matrix?start_date=${startDate}&end_date=${endDate}&mode=${matrixMode}&target_cyclic_day=${cyclicDay}`, 'matrix')" class="btn-matrix">ANALYSER & PRÉDIRE</button>
        </section>

        <!-- SPECIALISTE -->
        <section class="card specialist">
          <div class="flex-h"><h3>📅 SPÉCIALISTE</h3><span class="badge teal">360°</span></div>
          <select v-model="selectedDayName">
            <option v-for="d in ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']" :key="d">{{d}}</option>
          </select>
          <select v-model="selectedHour">
            <option v-for="h in hoursList" :key="h">{{h}}</option>
          </select>
          <div class="row-input"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName}&target_hour=${selectedHour}&start_date=${startDate}&end_date=${endDate}`, 'specialist')" class="btn-spec">LANCER LE SCAN</button>
        </section>

        <!-- FAVORIS -->
        <section class="card">
          <h3>⭐ MES FAVORIS</h3>
          <div class="flex-h"><input type="text" v-model="newFavoriteInput" placeholder="N°" /><button class="btn-add">ADD</button></div>
          <div class="row-input"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <div class="fav-list">
            <div v-for="f in userFavorites" :key="f" class="f-chip">
              <b>{{f}}</b> <button @click="callApi(`/analysis/deep-favorite?target=${f}&start_date=${startDate}&end_date=${endDate}`, 'deep')">⚡</button>
            </div>
          </div>
        </section>

        <!-- BATCH -->
        <section class="card">
          <h3>🎨 ANALYSE VISUELLE</h3>
          <div class="row-input"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <div class="grid-2">
            <button @click="callApi(`/analysis/highlight-range?start_date=${startDate}&end_date=${endDate}&mode=frequency`)" class="btn-red-outline">ROUGE/BLEU</button>
            <button @click="callApi(`/analysis/highlight-range?start_date=${startDate}&end_date=${endDate}&mode=kanta`)" class="btn-green-outline">KANTA</button>
          </div>
        </section>

        <!-- RAPPORTS -->
        <section class="card">
          <h3>📅 RAPPORTS</h3>
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

        <!-- PERIODE -->
        <section class="card">
          <h3>📊 PÉRIODE & PROFIL</h3>
          <div class="row-input"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runRangeAnalysis" class="btn-blue">ANALYSE PÉRIODE</button>
          <div class="flex-h mt-5"><input type="number" v-model="profileNumber" placeholder="N°" /><button @click="callApi(`/analysis/number-profile?target_number=${profileNumber}&start_date=${startDate}&end_date=${endDate}`, 'profile')" class="btn-purple">PROFIL</button></div>
        </section>

        <!-- IA -->
        <section class="card">
          <h3>🧠 IA & SUITES</h3>
          <button @click="callApi(`/analysis/sequence-detection?start_date=${startDate}&end_date=${endDate}`)" class="btn-black">DÉTECTER SUITES</button>
          <div class="flex-h mt-5"><input type="number" v-model="triggerTargetNumber" placeholder="Cible" /><button @click="callApi(`/analysis/trigger-numbers?target_number=${triggerTargetNumber}&start_date=${startDate}&end_date=${endDate}`)" class="btn-gold-bolt">⚡</button></div>
        </section>
      </aside>

      <!-- RESULTS AREA -->
      <section class="results">
        <div v-if="isLoading" class="pulse-loader">CALCUL DES ALGORITHMES...</div>
        <div v-if="error" class="error-msg">⚠️ {{ error }}</div>

        <!-- TABLEAU STRATÉGIQUE (RÉSULTATS STANDARDS) -->
        <div v-if="standardResult" class="res-box">
          <div class="res-header"><h2>ANALYSE DES FLUX</h2><button @click="standardResult=null">×</button></div>
          <table class="main-table">
            <thead><tr><th>N°</th><th>SORTIES</th><th>SYNTHÈSE STRATÉGIQUE (TOP 3)</th></tr></thead>
            <tbody>
              <tr v-for="r in (standardResult.frequency_ranking || standardResult.kanta_pairs_ranking)" :key="r.number">
                <td class="td-num">{{ r.number || r.pair }}</td>
                <td class="td-count">{{ r.count }}</td>
                <td>
                  <div v-if="r.synthesis" class="grid-synth">
                    <div v-if="r.synthesis.top_days" class="s-card"><span>Jours</span><p>{{ r.synthesis.top_days.join(', ') }}</p></div>
                    <div class="s-card"><span>Heures</span><p>{{ r.synthesis.top_hours.join(', ') }}</p></div>
                    <div class="s-card orange"><span>Déclencheurs</span><p>{{ r.synthesis.top_triggers.join(' - ') }}</p></div>
                    <div class="s-card blue"><span>Compagnons</span><p>{{ r.synthesis.top_companions.join(' - ') }}</p></div>
                    <div class="s-card purple"><span>Prophètes</span><p>{{ r.synthesis.top_prophets.join(' - ') }}</p></div>
                  </div>
                  <span v-else class="ai-text">{{ standardResult.ai_strategic_analysis }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- SPECIALISTE RESULT -->
        <div v-if="dayAnalysisResult" class="res-box sniper">
          <div class="res-header"><h2>SCAN SNIPER : {{ dayAnalysisResult.day_analyzed }}</h2><button @click="dayAnalysisResult=null">×</button></div>
          <div class="gold-bar">DUO EN OR : {{ dayAnalysisResult.best_duo }}</div>
          <p class="ai-comment">{{ dayAnalysisResult.ai_analysis }}</p>
        </div>

        <div v-if="!isLoading && !standardResult && !dayAnalysisResult" class="empty-state">
          <h2 class="orbitron">SYSTÈME EN ATTENTE</h2>
          <p>Choisissez un module de calcul pour commencer l'extraction.</p>
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
.v-tag { background: #fbbf24; color: #000; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; }

.layout { display: grid; grid-template-columns: 320px 1fr; gap: 25px; margin-top: 20px; }
.controls { max-height: 85vh; overflow-y: auto; padding-right: 10px; }
.controls::-webkit-scrollbar { width: 5px; }
.controls::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }

.card { background: #1e293b; border-radius: 15px; padding: 15px; margin-bottom: 20px; border: 1px solid #334155; }
.card h3 { font-size: 0.9rem; margin-bottom: 10px; border-left: 3px solid #fbbf24; padding-left: 10px; }

input, select, button { width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 8px; border: none; font-weight: bold; }
input, select { background: #0f172a; color: white; border: 1px solid #334155; }

.btn-gold { background: linear-gradient(to right, #fbbf24, #d97706); color: #000; }
.btn-matrix { background: #f59e0b; color: white; padding: 15px; font-size: 1rem; }
.btn-spec { background: #14b8a6; color: white; }
.btn-red { background: #ef4444; color: white; }
.btn-green { background: #22c55e; color: white; }
.btn-blue { background: #3b82f6; color: white; }

.main-table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 15px; overflow: hidden; }
.main-table th { background: #334155; color: #94a3b8; padding: 15px; font-size: 0.8rem; }
.main-table td { padding: 15px; border-bottom: 1px solid #334155; text-align: center; }

.td-num { font-size: 2.2rem; font-weight: 900; font-family: 'Orbitron'; color: #fbbf24; }
.td-count { font-size: 1.5rem; font-weight: 900; }

.grid-synth { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
.s-card { background: #0f172a; border: 1px solid #334155; padding: 8px; border-radius: 8px; }
.s-card span { font-size: 0.6rem; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 5px; }
.s-card p { margin: 0; font-size: 0.9rem; font-weight: 900; }

.s-card.orange p { color: #f97316; }
.s-card.blue p { color: #3b82f6; }
.s-card.purple p { color: #a855f7; }

.pulse-loader { text-align: center; padding: 50px; font-weight: 900; font-family: 'Orbitron'; color: #fbbf24; animation: pulse 1.5s infinite; }
@keyframes pulse { 50% { opacity: 0.3; } }

.gold-bar { background: #fbbf24; color: #000; padding: 15px; font-weight: 900; font-size: 1.5rem; text-align: center; border-radius: 10px; }
</style>