<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// --- AUTH ---
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
const multiPredictionInput = ref('');
const predictionNumber = ref('');

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

const login = async () => { try { isLoading.value = true; await signInWithEmailAndPassword(auth, email.value, password.value); } catch (e) { authError.value = "Erreur Clé"; } finally { isLoading.value = false; } };
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
    if (!res.ok) throw new Error(data.detail || "Erreur");
    if (target === 'standard') standardResult.value = data;
    else if (target === 'specialist') dayAnalysisResult.value = data;
    else if (target === 'matrix') matrixResult.value = data;
    else if (target === 'profile') profileResult.value = data;
    else if (target === 'deep') deepFavoriteResult.value = data;
  } catch (err) { error.value = err.message; } finally { isLoading.value = false; }
}

const runReport = (type) => { lastOperationType.value = type; callApi(`/analysis/${type}/${selectedDate.value}`); };
const runRangeAnalysis = () => { lastOperationType.value = 'frequency'; callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`); };
</script>

<template>
  <div v-if="!isAuthReady" class="splash"><h1 class="orbitron gold">SYSTÈME FOURCASTER PRO EN CHARGEMENT...</h1></div>
  
  <div v-else-if="!user" class="login-screen">
    <div class="glass-box">
      <h1 class="orbitron gold">LE GUIDE DES FOURCASTER</h1>
      <p class="subtitle">PLATEFORME D'ANALYSE EXPERTE</p>
      <input type="email" v-model="email" placeholder="Email" />
      <input type="password" v-model="password" placeholder="Clé d'accès" />
      <button @click="login" class="btn-gold" :disabled="isLoading">DÉVERROUILLER L'ACCÈS</button>
      <p v-if="authError" class="err">{{ authError }}</p>
    </div>
  </div>

  <main v-else class="dashboard">
    <header class="top-nav">
      <h1 class="orbitron logo">FOURCASTER <span class="v-tag">V80.0 PRO</span></h1>
      <div class="user-control"><span class="u-mail">{{ user.email }}</span><button @click="logout" class="btn-out">DÉCONNEXION</button></div>
    </header>

    <div class="layout">
      <!-- SIDEBAR CONTROLS -->
      <aside class="sidebar-controls">
        
        <!-- MATRICE -->
        <section class="card matrix">
          <div class="flex-h"><h3>🕰️ MATRICE TEMPORELLE</h3><span class="badge gold">PREDICTOR</span></div>
          <p class="tiny">Apprentissage Date/Renversé/Kanta</p>
          <div class="tabs-mini">
            <button @click="matrixMode='continuous'" :class="{active: matrixMode==='continuous'}">CONTINU</button>
            <button @click="matrixMode='cyclic'" :class="{active: matrixMode==='cyclic'}">CYCLIQUE</button>
          </div>
          <div v-if="matrixMode==='cyclic'" class="row-input">
            <label>Jour du mois :</label><input type="number" v-model="cyclicDay" />
          </div>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="callApi(`/analysis/time-matrix?start_date=${startDate}&end_date=${endDate}&mode=${matrixMode}&target_cyclic_day=${cyclicDay}`, 'matrix')" class="btn-matrix">ANALYSER & PRÉDIRE</button>
        </section>

        <!-- SPECIALISTE -->
        <section class="card specialist">
          <div class="flex-h"><h3>📅 ANALYSTE SPÉCIALISTE</h3><span class="badge teal">360°</span></div>
          <p class="tiny">Trouvez les Habitués de chaque jour.</p>
          <div class="row">
            <select v-model="selectedDayName"><option v-for="d in ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']" :key="d">{{d}}</option></select>
            <select v-model="selectedHour"><option v-for="h in hoursList" :key="h">{{h}}</option></select>
          </div>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName}&target_hour=${selectedHour}&start_date=${startDate}&end_date=${endDate}`, 'specialist')" class="btn-spec">SCANNER {{ selectedDayName.toUpperCase() }}</button>
        </section>

        <!-- ADMIN -->
        <section v-if="isAdmin" class="card admin">
          <h3>Maintenance (Admin)</h3>
          <div class="grid-2">
            <button @click="callApi('/collection/update-recent-weeks')" class="btn-green">MàJ Rapide</button>
            <button @click="callApi('/collection/start-full-rebuild')" class="btn-red">Reconstruction</button>
          </div>
        </section>

        <!-- FAVORIS -->
        <section class="card">
          <h3>⭐ Mes Numéros Favoris</h3>
          <div class="flex-h"><input type="text" v-model="newFavoriteInput" placeholder="N°" /><button @click="addFavorite" class="btn-add">Ajouter</button></div>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <div class="fav-list">
             <div v-for="f in userFavorites" :key="f" class="f-chip">
                <span>{{f}}</span> 
                <button @click="callApi(`/analysis/deep-favorite?target=${f}&start_date=${startDate}&end_date=${endDate}`, 'deep')" class="btn-bolt">⚡</button>
                <button @click="removeFavorite(f)" class="btn-del">×</button>
             </div>
          </div>
        </section>

        <!-- BATCH -->
        <section class="card">
          <h3>Analyse Visuelle (Batch)</h3>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <div class="grid-2">
            <button @click="callApi(`/analysis/highlight-range?start_date=${startDate}&end_date=${endDate}&mode=frequency`)" class="btn-red-outline">Surlignage Rouge/Bleu</button>
            <button @click="callApi(`/analysis/highlight-range?start_date=${startDate}&end_date=${endDate}&mode=kanta`)" class="btn-green-outline">Surlignage Kanta</button>
          </div>
        </section>

        <!-- RAPPORTS -->
        <section class="card">
          <h3>Rapports Ponctuels (1 Sem.)</h3>
          <input type="date" v-model="selectedDate" class="full-input" />
          <div class="grid-2">
            <button @click="runReport('daily-frequency')">Classement Jour</button>
            <button @click="runReport('weekly-frequency')">Classement Sem.</button>
          </div>
        </section>

        <!-- PERIODE -->
        <section class="card period-card">
          <h3>📊 Période & Profilage</h3>
          <div class="date-range"><input type="date" v-model="startDate" /><input type="date" v-model="endDate" /></div>
          <button @click="runRangeAnalysis" class="btn-blue">Fréquence sur Période</button>
          <div class="flex-h mt-5"><input type="number" v-model="profileNumber" placeholder="N° profil" /><button @click="callApi(`/analysis/number-profile?target_number=${profileNumber}&start_date=${startDate}&end_date=${endDate}`, 'profile')" class="btn-purple">GO</button></div>
        </section>

        <!-- PROPHETE -->
        <section class="card">
          <h3>🔮 Le Prophète</h3>
          <input type="number" v-model="predictionNumber" placeholder="Numéro vu" class="full-input" />
          <button @click="callApi(`/analysis/predict-next?observed_number=${predictionNumber}&start_date=${startDate}&end_date=${endDate}`)" class="btn-purple-full">Voir Futur Probable</button>
        </section>

        <!-- ANALYSE CROISEE -->
        <section class="card">
          <h3>🔮 Analyse Croisée</h3>
          <input type="text" v-model="multiPredictionInput" placeholder="Ex: 5 12 34" class="full-input" />
          <button @click="callApi(`/analysis/multi-prediction?numbers_str=${multiPredictionInput}&start_date=${startDate}&end_date=${endDate}`)" class="btn-blue-full">Lancer Projection</button>
        </section>

        <!-- IA AVANCEE -->
        <section class="card">
          <h3>🧠 IA AVANCÉE & KANTA</h3>
          <button @click="callApi(`/analysis/sequence-detection?start_date=${startDate}&end_date=${endDate}`)" class="btn-black">DÉTECTER SUITES</button>
          <div class="flex-h mt-5">
            <input type="number" v-model="triggerTargetNumber" placeholder="Cible" />
            <button @click="callApi(`/analysis/trigger-numbers?target_number=${triggerTargetNumber}&start_date=${startDate}&end_date=${endDate}`)" class="btn-gold-bolt">⚡</button>
          </div>
          <div class="grid-2 mt-5">
              <button @click="callApi('/analysis/kanta-rank?mode=daily')" class="btn-mini">Class. Kanta J</button>
              <button @click="callApi('/analysis/kanta-rank?mode=weekly')" class="btn-mini">Class. Kanta S</button>
          </div>
        </section>
      </aside>

      <!-- RESULTS AREA -->
      <section class="results-display">
        <div class="top-bar"><a :href="'https://docs.google.com/spreadsheets/d/1HepqMzKcshKbRsLWwpEOOy5oO9ntK2CgdV7F_ijmjIo'" target="_blank" class="btn-gsheet">📂 OUVRIR GOOGLE SHEETS</a></div>

        <div v-if="isLoading" class="pulse-loader">ALGORITHMES EN COURS D'EXTRACTION...</div>
        <div v-if="error" class="error-msg">⚠️ {{ error }}</div>

        <!-- TABLEAU SNIPER (CAPTURE 1) -->
        <div v-if="dayAnalysisResult" class="res-box sniper fade-in">
          <div class="res-header"><h2>📊 TOP 5 : {{ dayAnalysisResult.day_analyzed.toUpperCase() }}</h2><span class="badge-count">{{ dayAnalysisResult.total_draws }} Tirages</span><button @click="dayAnalysisResult=null" class="btn-close">×</button></div>
          <div class="gold-bar orbitron">🔥 LE DUO EN OR : <span>{{ dayAnalysisResult.best_duo }}</span> <small>(Vu {{dayAnalysisResult.best_duo_count}} fois)</small></div>
          <div class="table-wrap">
              <table class="res-table">
                  <thead><tr><th>Status</th><th>N°</th><th>Kanta</th><th>2 Compagnons (Présent)</th><th>2 Déclencheurs (Passé)</th><th>Prophète (Futur)</th></tr></thead>
                  <tbody>
                      <tr v-for="r in dayAnalysisResult.recurrence_data" :key="r.number">
                          <td class="status-cell">🔥</td>
                          <td class="num-gold orbitron">{{ r.number }}</td>
                          <td class="k-red">{{ r.kanta }}</td>
                          <td class="small">{{ r.best_companion }}</td>
                          <td class="small">{{ r.best_trigger }}</td>
                          <td class="proph-v">{{ r.best_prophet }}</td>
                      </tr>
                  </tbody>
              </table>
          </div>
        </div>

        <!-- SCAN PROFOND (CAPTURE 2) -->
        <div v-if="deepFavoriteResult" class="res-box deep fade-in">
           <div class="res-header"><h2>⭐ SCAN PROFOND : {{ deepFavoriteResult.favorite }}</h2><button @click="deepFavoriteResult=null" class="btn-close">×</button></div>
           <div class="grid-synth-top">
                <div class="s-card"><span>Top Jours</span><p>{{ deepFavoriteResult.summary.top_days.map(x=>x.val).join(', ') }}</p></div>
                <div class="s-card"><span>Top Heures</span><p>{{ deepFavoriteResult.summary.top_hours.map(x=>x.val).join(', ') }}</p></div>
                <div class="s-card"><span>Top Déclencheurs</span><p>{{ deepFavoriteResult.summary.top_triggers.map(x=>x.val).join(', ') }}</p></div>
                <div class="s-card"><span>Top Compagnons</span><p>{{ deepFavoriteResult.summary.top_companions.map(x=>x.val).join(', ') }}</p></div>
                <div class="s-card"><span>Top Prophètes</span><p>{{ deepFavoriteResult.summary.top_prophets.map(x=>x.val).join(', ') }}</p></div>
           </div>
           <div class="stats-badges">
                <span class="badge-b">Sorties Totales : {{ deepFavoriteResult.total_hits }}</span>
                <span class="badge-b">Meilleur Jour : {{ deepFavoriteResult.best_day }}</span>
                <span class="badge-b">Meilleure Heure : {{ deepFavoriteResult.best_time }}</span>
           </div>
           <div class="table-wrap">
               <table class="res-table-history">
                   <thead><tr><th>Date</th><th>Jour</th><th>Heure</th><th>Déclencheur</th><th>Compagnons</th><th>Prophète</th></tr></thead>
                   <tbody>
                       <tr v-for="(row, idx) in deepFavoriteResult.history_table" :key="idx">
                           <td>{{ row.date }}</td><td>{{ row.day }}</td><td>{{ row.time }}</td>
                           <td class="trig-c">{{ row.trigger }}</td><td class="comp-c">{{ row.companion }}</td><td class="proph-c">{{ row.prophet }}</td>
                       </tr>
                   </tbody>
               </table>
           </div>
        </div>

        <!-- TABLEAU STRATÉGIQUE (RÉSULTATS STANDARDS) -->
        <div v-if="standardResult" class="res-box standard fade-in">
          <div class="res-header"><h2>ANALYSE STRATÉGIQUE DES FLUX</h2><button @click="standardResult=null" class="btn-close">×</button></div>
          <table class="main-table">
            <thead><tr><th>N°</th><th>SORTIES</th><th>SYNTHÈSE STRATÉGIQUE (TOP 3)</th></tr></thead>
            <tbody>
              <tr v-for="r in standardResult.frequency_ranking" :key="r.number">
                <td class="td-num orbitron">{{ r.number }}</td>
                <td class="td-count">{{ r.count }}</td>
                <td>
                  <div v-if="r.synthesis" class="grid-synth-cell">
                    <div v-if="r.synthesis.top_days" class="mini-s"><span>Jours</span><p>{{ r.synthesis.top_days.join(', ') }}</p></div>
                    <div class="mini-s"><span>Heures</span><p>{{ r.synthesis.top_hours.join(', ') }}</p></div>
                    <div class="mini-s trig"><span>Déclencheurs</span><p>{{ r.synthesis.top_triggers.join(' - ') }}</p></div>
                    <div class="mini-s comp"><span>Compagnons</span><p>{{ r.synthesis.top_companions.join(' - ') }}</p></div>
                    <div class="mini-s proph"><span>Prophètes</span><p>{{ r.synthesis.top_prophets.join(' - ') }}</p></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- PROFIL EXPERT -->
        <div v-if="profileResult" class="res-box profile fade-in">
           <div class="res-header"><h2>👤 PROFIL EXPERT : {{ profileResult.profile_data.number }}</h2><button @click="profileResult=null" class="btn-close">×</button></div>
           <div class="profile-stats">
              <div class="p-item"><span>Sorties</span><p>{{ profileResult.profile_data.hits }}</p></div>
              <div class="p-item"><span>Meilleur Jour</span><p>{{ profileResult.profile_data.best_day }}</p></div>
              <div class="p-item"><span>Heure Cible</span><p>{{ profileResult.profile_data.best_time }}</p></div>
           </div>
           <div class="grid-synth-top mt-5">
                <div class="s-card orange"><span>Déclencheurs</span><p>{{ profileResult.profile_data.top_triggers.map(t=>t.val).join(' - ') }}</p></div>
                <div class="s-card blue"><span>Compagnons</span><p>{{ profileResult.profile_data.top_companions.map(t=>t.val).join(' - ') }}</p></div>
                <div class="s-card purple"><span>Prophètes</span><p>{{ profileResult.profile_data.top_prophets.map(t=>t.val).join(' - ') }}</p></div>
           </div>
        </div>

        <div v-if="!isLoading && !standardResult && !dayAnalysisResult && !profileResult && !deepFavoriteResult" class="empty-state">
          <h2 class="orbitron">FOURCASTER ANALYZER</h2>
          <p>Choisissez un module de calcul à gauche pour lancer l'extraction algorithmique.</p>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Roboto:wght@300;400;700;900&display=swap');

/* GLOBAL & DESIGN GOLD */
.dashboard { font-family: 'Roboto', sans-serif; background: #0f172a; color: #f8fafc; min-height: 100vh; padding: 20px; }
.orbitron { font-family: 'Orbitron', sans-serif; }
.gold { color: #fbbf24; }
.v-tag { background: #fbbf24; color: #000; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; vertical-align: middle; }

/* LAYOUT */
.layout { display: grid; grid-template-columns: 320px 1fr; gap: 25px; margin-top: 20px; }
.sidebar-controls { max-height: 85vh; overflow-y: auto; padding-right: 10px; }
.sidebar-controls::-webkit-scrollbar { width: 5px; }
.sidebar-controls::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }

/* CARDS EXPERT */
.card { background: #1e293b; border-radius: 15px; padding: 15px; margin-bottom: 20px; border: 1px solid #334155; }
.card h3 { font-size: 0.9rem; font-weight: 900; border-left: 3px solid #fbbf24; padding-left: 10px; margin-bottom: 12px; text-transform: uppercase; }
.flex-h { display: flex; justify-content: space-between; align-items: center; }
.badge { font-size: 0.6rem; padding: 2px 8px; border-radius: 10px; color: #fff; font-weight: bold; }
.badge.gold { background: #d97706; }
.badge.teal { background: #14b8a6; }

/* FORM ELEMENTS */
input, select, button { width: 100%; padding: 12px; margin-bottom: 8px; border-radius: 8px; border: none; font-weight: bold; background: #0f172a; color: white; border: 1px solid #334155; font-size: 0.85rem; }
button { cursor: pointer; transition: 0.3s; }
.date-range { display: flex; gap: 5px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

/* BUTTONS THEME */
.btn-gold { background: linear-gradient(to right, #fbbf24, #d97706); color: #000; padding: 15px; font-size: 1rem; }
.btn-matrix { background: #f59e0b; padding: 15px; font-size: 1rem; }
.btn-spec { background: #14b8a6; padding: 15px; }
.btn-blue { background: #3b82f6; }
.btn-purple { background: #a855f7; }
.btn-green { background: #22c55e; }
.btn-red { background: #ef4444; }
.btn-black { background: #000; border: 1px solid #333; }
.btn-red-outline { border: 1px solid #ef4444; color: #ef4444; background: none; }
.btn-green-outline { border: 1px solid #22c55e; color: #22c55e; background: none; }

/* FAVORIS */
.fav-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.f-chip { display: flex; align-items: center; background: #0f172a; border: 1px solid #334155; padding: 5px 12px; border-radius: 20px; }
.f-chip span { color: #fbbf24; font-weight: 900; margin-right: 8px; }
.btn-bolt { color: #fbbf24; font-size: 1.1rem; background: none; width: auto; padding: 0; margin: 0; }
.btn-del { color: #ef4444; font-size: 1.2rem; background: none; width: auto; padding: 0; margin-left: 5px; }

/* RESULTS DISPLAY */
.results-display { background: #1e293b; border-radius: 15px; padding: 25px; border: 1px solid #334155; position: relative; }
.btn-gsheet { background: #1b5e20; color: white; text-decoration: none; padding: 12px 25px; border-radius: 30px; font-weight: bold; float: right; }

/* TABLES & SNIPER */
.main-table { width: 100%; border-collapse: collapse; background: #0f172a; border-radius: 15px; overflow: hidden; }
.main-table th { background: #334155; color: #94a3b8; padding: 15px; font-size: 0.75rem; text-transform: uppercase; }
.main-table td { padding: 15px; border-bottom: 1px solid #1e293b; text-align: center; }
.td-num { font-size: 2rem; font-weight: 900; color: #fbbf24; }
.td-count { font-size: 1.4rem; font-weight: 900; }

.gold-bar { background: #fbbf24; color: #000; padding: 15px; font-weight: 900; font-size: 1.5rem; text-align: center; border-radius: 10px; margin-bottom: 20px; }
.num-gold { color: #fbbf24; font-size: 1.8rem; font-weight: 900; }
.k-red { color: #ef4444; font-weight: 900; font-size: 1.1rem; }

/* GRILLES DE SYNTHESE */
.grid-synth-top { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 20px; }
.grid-synth-cell { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; }
.s-card, .mini-s { background: #1e293b; border: 1px solid #334155; padding: 8px; border-radius: 8px; text-align: center; }
.s-card span, .mini-s span { font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; display: block; margin-bottom: 4px; }
.s-card p, .mini-s p { margin: 0; font-size: 0.9rem; font-weight: 900; }

.trig p { color: #f97316; }
.comp p { color: #3b82f6; }
.proph p { color: #a855f7; }

/* PROFILS & HISTORIQUE */
.profile-stats { display: flex; gap: 20px; justify-content: center; margin-bottom: 20px; }
.p-item { background: #0f172a; padding: 15px; border-radius: 12px; border: 1px solid #fbbf24; width: 120px; text-align: center; }
.p-item p { font-size: 1.3rem; font-weight: 900; color: #fbbf24; margin: 0; }

.res-table-history { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.res-table-history th { color: #14b8a6; padding: 10px; border-bottom: 1px solid #334155; }
.res-table-history td { padding: 10px; border-bottom: 1px solid #334155; }
.trig-c { color: #f97316; font-weight: bold; }
.comp-c { color: #3b82f6; font-weight: bold; }
.proph-c { color: #a855f7; font-weight: bold; }

/* LOADING */
.pulse-loader { text-align: center; padding: 50px; font-weight: 900; color: #fbbf24; animation: pulse 1.5s infinite; font-family: 'Orbitron'; }
@keyframes pulse { 50% { opacity: 0.3; } }
.fade-in { animation: fadeIn 0.5s ease-in; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>