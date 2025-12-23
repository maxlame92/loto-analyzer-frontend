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
const cyclicDay = ref(1);
const selectedDate = ref('');
const startDate = ref('');
const endDate = ref('');
const profileNumber = ref('');

// --- DÉCLENCHEURS ---
const triggerTarget = ref('');
const triggerCompanion = ref('');

const isLoading = ref(false);
const error = ref(null);
const standardResult = ref(null);
const dayAnalysisResult = ref(null);
const profileResult = ref(null);

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

const login = async () => { try { isLoading.value = true; await signInWithEmailAndPassword(auth, email.value, password.value); } catch (e) { authError.value = "Erreur."; } finally { isLoading.value = false; } };
const logout = async () => { await signOut(auth); };

async function callApi(url, target = 'standard') {
  isLoading.value = true; error.value = null;
  if (target === 'standard') standardResult.value = null;
  try {
    const token = await user.value.getIdToken();
    const res = await fetch(`${API_BASE_URL}${url}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Erreur API");
    if (target === 'standard') standardResult.value = data;
    else if (target === 'specialist') dayAnalysisResult.value = data;
    else if (target === 'profile') profileResult.value = data;
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

const runTriggers = () => {
    let url = `/analysis/trigger-numbers?target_number=${triggerTarget.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
    if (triggerCompanion.value) url += `&companion_number=${triggerCompanion.value}`;
    callApi(url);
};
</script>

<template>
  <div v-if="!isAuthReady" class="splash"><h1>SYNCHRONISATION FOURCASTER...</h1></div>
  
  <div v-else-if="!user" class="login-screen">
    <div class="glass-box">
      <h1 class="orbitron gold">LE GUIDE DES FOURCASTER</h1>
      <input type="email" v-model="email" placeholder="Email Expert" />
      <input type="password" v-model="password" placeholder="Clé d'accès" />
      <button @click="login" class="btn-gold">ACTIVER L'ANALYSEUR</button>
    </div>
  </div>

  <main v-else class="dashboard">
    <header class="top-nav">
      <h1 class="orbitron">FOURCASTER <span class="v-tag">V82.0 PRO</span></h1>
      <div class="user-control"><span>{{ user.email }}</span><button @click="logout" class="btn-out">SORTIR</button></div>
    </header>

    <div class="layout">
      <!-- SIDEBAR (GRIS CLAIR) -->
      <aside class="sidebar">
        
        <section v-if="userRole === 'admin'" class="card">
          <h3>🛡️ ADMINISTRATION</h3>
          <button @click="callApi('/collection/update-recent-weeks')" class="btn-green">MàJ RAPIDE</button>
        </section>

        <!-- SPECIALISTE -->
        <section class="card">
          <div class="flex-h"><h3>📅 ANALYSTE SNIPER</h3><span class="badge teal">360°</span></div>
          <div class="row">
            <select v-model="selectedDayName"><option v-for="d in ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']" :key="d">{{d}}</option></select>
            <select v-model="selectedHour"><option v-for="h in hoursList" :key="h">{{h}}</option></select>
          </div>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName}&target_hour=${selectedHour}&start_date=${startDate}&end_date=${endDate}`, 'specialist')" class="btn-spec">LANCER LE SCAN</button>
        </section>

        <!-- DÉCLENCHEURS (1 ou 2 N°) -->
        <section class="card">
          <h3 style="color:#d97706">⚡ DÉCLENCHEURS (1 ou 2 N°)</h3>
          <input type="number" v-model="triggerTarget" placeholder="Numéro Cible" />
          <input type="number" v-model="triggerCompanion" placeholder="Accompagnant (Optionnel)" />
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runTriggers" class="btn-gold">TROUVER DÉCLENCHEURS</button>
        </section>

        <!-- CLASSEMENTS -->
        <section class="card">
          <h3>📅 CLASSEMENTS</h3>
          <input type="date" v-model="selectedDate" class="full-input" />
          <div class="grid-2">
            <button @click="callApi(`/analysis/daily-frequency/${selectedDate}`)" class="btn-blue">TOP JOUR</button>
            <button @click="callApi(`/analysis/weekly-frequency/${selectedDate}`)" class="btn-blue">TOP SEM.</button>
          </div>
        </section>

        <!-- PERIODE & PROFIL -->
        <section class="card">
          <h3>📊 PÉRIODE & PROFILAGE</h3>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="callApi(`/analysis/frequency-by-range?start_date=${startDate}&end_date=${endDate}`)" class="btn-blue">FRÉQUENCE PÉRIODE</button>
          <div class="flex-h mt-10"><input type="number" v-model="profileNumber" placeholder="N°" /><button @click="callApi(`/analysis/number-profile?target_number=${profileNumber}&start_date=${startDate}&end_date=${endDate}`, 'profile')" class="btn-purple">PROFIL</button></div>
        </section>
      </aside>

      <!-- RESULTS (BLANC PUR) -->
      <section class="results">
        <div class="top-bar"><a :href="'https://docs.google.com/spreadsheets/d/1HepqMzKcshKbRsLWwpEOOy5oO9ntK2CgdV7F_ijmjIo'" target="_blank" class="btn-gsheet">📂 OUVRIR GOOGLE SHEETS</a></div>

        <div v-if="isLoading" class="loader">ALGORITHMES EN COURS...</div>

        <!-- TABLEAU RÉSULTATS STANDARDS -->
        <div v-if="standardResult" class="res-box fade-in">
          <h2 v-if="standardResult.trigger_numbers_ranking">⚡ NUMÉROS DÉCLENCHEURS</h2>
          <h2 v-else>📊 CLASSEMENT DES FLUX</h2>
          <table class="main-table">
            <thead><tr><th>N°</th><th>{{ standardResult.trigger_numbers_ranking ? 'OCCURRENCES' : 'SORTIES' }}</th><th v-if="!standardResult.trigger_numbers_ranking">SYNTHÈSE STRATÉGIQUE (TOP 3)</th></tr></thead>
            <tbody>
              <tr v-for="r in (standardResult.frequency_ranking || standardResult.trigger_numbers_ranking)" :key="r.number">
                <td class="td-num orbitron">{{ r.number }}</td>
                <td class="td-count">{{ r.count }}</td>
                <td v-if="r.synthesis">
                  <div class="grid-synth">
                    <div v-if="r.synthesis.top_days" class="s-card"><span>Jours</span><p>{{ r.synthesis.top_days.join(', ') }}</p></div>
                    <div class="s-card"><span>Heures</span><p>{{ r.synthesis.top_hours.join(', ') }}</p></div>
                    <div class="s-card orange"><span>DÉCL.</span><p>{{ r.synthesis.top_triggers.join('-') }}</p></div>
                    <div class="s-card blue"><span>COMP.</span><p>{{ r.synthesis.top_companions.join('-') }}</p></div>
                    <div class="s-card purple"><span>PROPH.</span><p>{{ r.synthesis.top_prophets.join('-') }}</p></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- SNIPER -->
        <div v-if="dayAnalysisResult" class="res-box fade-in">
           <div class="gold-bar orbitron">🎯 SNIPER : {{ dayAnalysisResult.best_duo }} (DUO EN OR)</div>
           <table class="main-table mt-10">
               <thead><tr><th>N°</th><th>Kanta</th><th>Fréq</th><th>Compagnons</th><th>Prophètes</th></tr></thead>
               <tbody>
                   <tr v-for="r in dayAnalysisResult.recurrence_data" :key="r.number">
                       <td class="td-num" style="font-size:1.6rem">{{ r.number }}</td>
                       <td style="color:red; font-weight:900">{{ r.kanta }}</td>
                       <td><b>{{ r.count }}</b></td>
                       <td class="small">{{ r.best_companion }}</td>
                       <td class="small" style="color:purple; font-weight:bold;">{{ r.best_prophet }}</td>
                   </tr>
               </tbody>
           </table>
        </div>

        <!-- PROFIL -->
        <div v-if="profileResult" class="res-box fade-in">
            <h2>👤 PROFIL COMPLET : {{ profileResult.profile_data.number }}</h2>
            <div class="profile-summary">
                <div class="p-item"><span>Sorties</span><p>{{ profileResult.profile_data.hits }}</p></div>
                <div class="p-item"><span>Top Jour</span><p>{{ profileResult.profile_data.best_day }}</p></div>
                <div class="p-item"><span>Top Heure</span><p>{{ profileResult.profile_data.best_time }}</p></div>
            </div>
            <div class="grid-synth mt-10">
                <div class="s-card orange"><span>DÉCLENCHEURS</span><p>{{ profileResult.profile_data.top_triggers.map(t=>t.val).join(' - ') }}</p></div>
                <div class="s-card blue"><span>COMPAGNONS</span><p>{{ profileResult.profile_data.top_companions.map(t=>t.val).join(' - ') }}</p></div>
                <div class="s-card purple"><span>PROPHÈTES</span><p>{{ profileResult.profile_data.top_prophets.map(t=>t.val).join(' - ') }}</p></div>
            </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Roboto:wght@400;700;900&display=swap');

/* THEME BLANC PUR */
.dashboard { font-family: 'Roboto', sans-serif; background: #ffffff; color: #1e293b; min-height: 100vh; padding: 20px; }
.top-nav { display: flex; justify-content: space-between; background: #1e293b; color: white; padding: 15px 25px; border-radius: 12px; margin-bottom: 20px; }
.orbitron { font-family: 'Orbitron', sans-serif; }
.gold { color: #fbbf24; }
.v-tag { background: #fbbf24; color: black; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; vertical-align: middle; }

.layout { display: grid; grid-template-columns: 320px 1fr; gap: 20px; }
.sidebar { background: #f3f4f6; padding: 20px; border-radius: 15px; border: 1px solid #e5e7eb; height: fit-content; }

.card { background: white; border: 1px solid #e5e7eb; padding: 15px; border-radius: 12px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
.card h3 { font-size: 0.85rem; margin-bottom: 10px; color: #111827; border-left: 4px solid #3b82f6; padding-left: 10px; font-weight: 900; }

input, select, button { width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 8px; border: 1px solid #d1d5db; font-weight: bold; background: white; }
button { cursor: pointer; color: white; border: none; }
.btn-gold { background: #d97706; }
.btn-blue { background: #3b82f6; }
.btn-purple { background: #a855f7; }
.btn-spec { background: #059669; }
.btn-green { background: #10b981; }

/* RESULTS AREA */
.results { padding: 10px; }
.res-box { background: white; border: 1px solid #e5e7eb; border-radius: 15px; padding: 25px; box-shadow: 0 10px 20px rgba(0,0,0,0.05); margin-bottom: 20px; }
.main-table { width: 100%; border-collapse: collapse; }
.main-table th { background: #f9fafb; padding: 15px; color: #4b5563; font-size: 0.75rem; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
.main-table td { padding: 12px; border-bottom: 1px solid #f3f4f6; text-align: center; vertical-align: middle; }

.td-num { font-size: 1.8rem; font-weight: 900; color: #111827; }
.td-count { font-size: 1.4rem; font-weight: bold; color: #d97706; }

/* MINI GRILLES SYNTHESE */
.grid-synth { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; }
.s-card { background: #f9fafb; border: 1px solid #e5e7eb; padding: 8px; border-radius: 8px; text-align: center; }
.s-card span { font-size: 0.6rem; color: #6b7280; display: block; text-transform: uppercase; }
.s-card p { margin: 0; font-size: 0.85rem; font-weight: 900; color: #111827; }
.orange p { color: #ea580c; }
.blue p { color: #2563eb; }
.purple p { color: #9333ea; }

.gold-bar { background: #fbbf24; color: black; padding: 15px; border-radius: 10px; font-weight: 900; font-size: 1.6rem; text-align: center; border: 2px solid #d97706; }
.profile-summary { display: flex; gap: 15px; justify-content: center; margin-bottom: 20px; }
.p-item { background: #f3f4f6; padding: 15px; border-radius: 12px; text-align: center; width: 120px; border: 1px solid #e5e7eb; }
.p-item p { font-size: 1.2rem; font-weight: 900; margin: 0; color: #111827; }

.btn-gsheet { background: #15803d; color: white; text-decoration: none; padding: 12px 25px; border-radius: 30px; font-weight: bold; float: right; }
.fade-in { animation: fadeIn 0.4s ease-in; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
</style>