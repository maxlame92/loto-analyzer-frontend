<!-- app.vue (Version 33.2 - Corrigée & Validée) -->
<template>
  <div id="app" class="app-container">
    <div v-if="loadingGlobal" class="loading-overlay"><div class="loader"></div><p>Chargement...</p></div>
    <div v-if="!user" class="auth-container">
      <div class="login-card">
        <h1>LE GUIDE DES FOURCASTER</h1>
        <input type="email" v-model="email" placeholder="Email" class="auth-input" />
        <input type="password" v-model="password" placeholder="Mot de passe" class="auth-input" />
        <button @click="login" class="auth-btn" :disabled="isLoading">{{ isLoading ? '...' : 'Connexion' }}</button>
        <p v-if="authError" class="error-msg">{{ authError }}</p>
      </div>
    </div>
    <div v-else class="main-layout">
      <header class="top-bar">
        <h2>LE GUIDE DES FOURCASTER</h2>
        <div class="user-info"><span>{{ user.email }}</span><button @click="logout" class="logout-btn">Déconnexion</button></div>
      </header>
      <div class="content-wrapper">
        <aside class="sidebar">
          <div class="tabs">
            <button :class="{ active: currentTab === 'dashboard' }" @click="currentTab = 'dashboard'">🏠 Tableau de Bord</button>
            <button :class="{ active: currentTab === 'analysis' }" @click="currentTab = 'analysis'">📊 Résultats</button>
          </div>
          <div v-if="isAdmin" class="admin-panel">
            <h3>Maintenance</h3>
            <div class="btn-row"><button @click="triggerUpdate" class="action-btn blue-btn">Mise à Jour</button><button @click="triggerRebuild" class="action-btn red-btn">Reconstruction</button></div>
          </div>
          <div class="control-group favorites-group">
            <h3>⭐ Mes Favoris</h3>
            <div class="add-fav-row"><input v-model="newFavorite" placeholder="Ex: 7 ou 12-45" @keyup.enter="addFavorite"><button @click="addFavorite">Ajouter</button></div>
            <div class="favorites-list">
              <div v-for="(item, index) in favoritesList" :key="index" class="fav-tag">
                <span class="fav-num">{{ item }}</span>
                <button @click="removeFavorite(index)" class="del-fav">×</button>
              </div>
            </div>
          </div>
          <!-- PROFIL JOUR -->
          <div class="control-group" style="background-color: #e8f5e9; border: 1px solid #c8e6c9;">
            <h3 style="color: #2e7d32;">📅 Profil du Jour</h3>
            <div class="input-group">
              <label>Jour :</label>
              <select v-model="habitDayIndex">
                <option value="0">Lundi</option><option value="1">Mardi</option><option value="2">Mercredi</option><option value="3">Jeudi</option><option value="4">Vendredi</option><option value="5">Samedi</option><option value="6">Dimanche</option>
              </select>
            </div>
            <div class="input-group">
              <label>Heure :</label>
              <select v-model="habitTime">
                <option value="">Toute la journée</option><option value="07H00">07H00</option><option value="10H00">10H00</option><option value="13H00">13H00</option><option value="16H00">16H00</option><option value="19H00">19H00</option><option value="21H00">21H00</option><option value="22H00">22H00</option><option value="23H00">23H00</option>
              </select>
            </div>
            <div class="input-group">
              <label>Période :</label>
              <div class="date-row" style="display:flex; gap:5px;">
                <input type="date" v-model="habitStart" title="Début">
                <input type="date" v-model="habitEnd" title="Fin">
              </div>
            </div>
            <button @click="analyzeHabits" class="action-btn purple-btn">Générer le Profil</button>
          </div>
          <!-- AUTRES -->
          <div class="control-group">
            <h3>Semaine & Fréquence</h3>
            <input type="date" v-model="selectedDate" class="date-picker" />
            <div class="btn-row"><button @click="highlightDay" class="action-btn blue-btn">Surlign. Jour</button><button @click="highlightWeek" class="action-btn blue-btn">Surlign. Sem.</button></div>
            <div class="btn-col"><button @click="getDailyRank" class="action-btn blue-btn">Top Jour</button><button @click="getWeeklyRank" class="action-btn blue-btn">Top Semaine</button></div>
            <input v-model="companionNumber" placeholder="N° Compagnon" class="num-input" /><button @click="analyzeCompanions" class="action-btn grey-btn">Analyser</button>
          </div>
          <div class="control-group">
            <h3>Prophète & IA</h3>
            <input v-model="prophetObserved" placeholder="Numéro vu (Ex: 42)" class="num-input" /><button @click="launchProphet" class="action-btn purple-btn">Futur Probable</button>
            <input v-model="multiProphetInput" placeholder="Tirage complet" class="num-input" /><button @click="launchMultiProphet" class="action-btn purple-btn">Projection</button>
            <div class="separator">___</div>
            <div class="btn-row"><button @click="kantaHighlightDay" class="action-btn blue-btn">Kanta J</button><button @click="kantaHighlightWeek" class="action-btn blue-btn">Kanta S</button></div>
          </div>
        </aside>
        <main class="main-content">
          <div v-if="currentTab === 'dashboard'" class="dashboard-view">
            <div class="dashboard-header"><h2>Tableau de Bord</h2><button @click="getDashboard" class="refresh-btn">🔄</button></div>
            <div v-if="favoritesList.length===0" class="empty-dash">Ajoutez des favoris.</div>
            <div v-else-if="dashboardLoading" class="loading-dash">Analyse...</div>
            <div v-else class="cards-grid">
              <div v-for="(stat, idx) in dashboardData.dashboard_data" :key="idx" class="stat-card">
                <div class="card-header"><span class="card-num">{{ stat.item }}</span><span class="card-status">{{ stat.status }}</span></div>
                <div class="card-body">
                  <div class="stat-row"><span>Sorties:</span><strong>{{ stat.frequency }}</strong></div>
                  <div class="stat-row"><span>Ami:</span><strong>{{ stat.best_companion }}</strong></div>
                  <div class="stat-row"><span>Décl:</span><strong>{{ stat.best_trigger }}</strong></div>
                  <div class="stat-row"><span>Préd:</span><strong>{{ stat.prophet_prediction }}</strong></div>
                </div>
                <button @click="analyzeFavorite(stat.item)" class="mini-analyze-btn">Analyser</button>
              </div>
            </div>
          </div>
          <div v-if="currentTab === 'analysis'" class="results-view">
            <h2>Résultats</h2>
            <div v-if="loading" class="loading-box">Chargement...</div>
            <div v-else-if="error" class="error-box">{{ error }}</div>
            <div v-else-if="!apiResponse.message && !apiResponse.rankings" class="empty-state">Sélectionnez une analyse.</div>
            <div v-else class="results-content">
              <div class="result-header"><h3>{{ apiResponse.message }}</h3><a v-if="apiResponse.worksheet_gid" :href="`https://docs.google.com/spreadsheets/d/1HepqMzkcshKbrsLWwpEOOy5oO9ntK2CgdV7F_ijmjlo/edit#gid=${apiResponse.worksheet_gid}`" target="_blank" class="sheet-link">Sheet ↗</a></div>
              <div v-if="viewMode === 'table'" class="data-table-wrapper">
                <table class="data-table">
                  <thead><tr><th>#</th><th>{{ getHeaderLabel(1) }}</th><th>{{ getHeaderLabel(2) }}</th><th>{{ getHeaderLabel(3) }}</th></tr></thead>
                  <tbody>
                    <tr v-for="(row, index) in getTableData()" :key="index">
                      <td>#{{ index + 1 }}</td>
                      <td class="main-cell">{{ row.col1 }}</td>
                      <td>{{ row.col2 }}</td>
                      <td>{{ row.col3 }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="ai-insights">
                <div v-if="apiResponse.ai_strategic_analysis" class="ai-box strategy"><h4>🧠 Analyse Expert</h4><p>{{ apiResponse.ai_strategic_analysis }}</p></div>
                <div v-if="apiResponse.ai_strategic_profile" class="ai-box profile"><h4>🧠 Profil</h4><p>{{ apiResponse.ai_strategic_profile }}</p></div>
                <div v-if="apiResponse.ai_sequence_analysis" class="ai-box sequence"><h4>🧬 Suites</h4><p>{{ apiResponse.ai_sequence_analysis }}</p></div>
                <div v-if="apiResponse.ai_trigger_analysis" class="ai-box trigger"><h4>⚡ Déclencheurs</h4><p>{{ apiResponse.ai_trigger_analysis }}</p></div>
                <div v-if="apiResponse.ai_prediction_analysis" class="ai-box prediction"><h4>🔮 Prédiction</h4><p>{{ apiResponse.ai_prediction_analysis }}</p></div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const API_URL = "https://loto-analyzer-backend.onrender.com"; 
const GOOGLE_SHEET_ID = "1HepqMzKcsbKbRsLWwpEOoy5oO9ntK2CgdV7F_ijmjlo";

const user = ref(null); const userRole = ref(''); const email = ref(''); const password = ref(''); const authError = ref(''); const isAuthReady = ref(false); const isLoading = ref(false);
const currentTab = ref('dashboard'); const error = ref(null); const apiResponse = ref({}); const activeSheetGid = ref(null); const loadingGlobal = ref(true); const viewMode = ref('table');
const favoritesList = ref([]); const newFavorite = ref(""); const dashboardData = ref({ dashboard_data: [] }); const dashboardLoading = ref(false); const dashStart = ref("2025-01-01"); const dashEnd = ref(new Date().toISOString().substr(0, 10));
const selectedDate = ref(new Date().toISOString().substr(0, 10)); const startDate = ref("2025-01-01"); const endDate = ref(new Date().toISOString().substr(0, 10));
const companionNumber = ref(''); const profileNumber = ref(''); const triggerTarget = ref(''); const triggerCompanion = ref(''); const prophetObserved = ref(''); const prophetCompanion = ref(''); const multiProphetInput = ref('');
const habitDayIndex = ref('0'); const habitTime = ref(''); 
const habitStart = ref("2025-01-01"); const habitEnd = ref(new Date().toISOString().substr(0, 10));

onMounted(() => {
  const savedFavs = localStorage.getItem('lotoFavorites'); if (savedFavs) favoritesList.value = JSON.parse(savedFavs);
  onAuthStateChanged(auth, async (u) => {
    user.value = u; loadingGlobal.value = false;
    if (u) {
      const s = await getDoc(doc(db, "users", u.uid)); userRole.value = s.exists() ? s.data().role : 'user';
      if (favoritesList.value.length > 0) getDashboard();
    }
    isAuthReady.value = true;
  });
});
const isAdmin = computed(() => userRole.value === 'admin' || user.value?.email === 'aboucho92@gmail.com');
const login = async () => { try { isLoading.value=true; await signInWithEmailAndPassword(auth, email.value, password.value); } catch { authError.value="Erreur"; } finally { isLoading.value=false; } };
const logout = async () => signOut(auth);
const addFavorite = () => { if (newFavorite.value && !favoritesList.value.includes(newFavorite.value)) { favoritesList.value.push(newFavorite.value); newFavorite.value=""; localStorage.setItem('lotoFavorites', JSON.stringify(favoritesList.value)); getDashboard(); } };
const removeFavorite = (i) => { favoritesList.value.splice(i, 1); localStorage.setItem('lotoFavorites', JSON.stringify(favoritesList.value)); getDashboard(); };

async function callApi(ep, m='GET', b=null) {
  if (!user.value) return;
  isLoading.value=true; error.value=null; apiResponse.value={}; if(!ep.includes('dashboard')) currentTab.value='analysis';
  try {
    const res = await fetch(`${API_URL}${ep}`, { method:m, headers:{'Authorization':`Bearer ${await user.value.getIdToken()}`, 'Content-Type':'application/json'}, body:b?JSON.stringify(b):null });
    const d = await res.json();
    if(!res.ok) throw new Error(d.detail);
    if(ep.includes('dashboard')) dashboardData.value=d; else { apiResponse.value=d; if(d.worksheet_gid) activeSheetGid.value=d.worksheet_gid; }
  } catch(e) { error.value=e.message; } finally { isLoading.value=false; dashboardLoading.value=false; }
}

const getDashboard = () => callApi(`/analysis/favorites-dashboard?start_date=${dashStart.value}&end_date=${dashEnd.value}`, 'POST', favoritesList.value);
const analyzeHabits = () => callApi(`/analysis/day-specific-profile?day_index=${habitDayIndex.value}&start_date=${habitStart.value}&end_date=${habitEnd.value}${habitTime.value?'&time_slot='+habitTime.value:''}`);
const triggerUpdate = () => callApi('/collection/update-recent-weeks', 'POST');
const triggerRebuild = () => { if(confirm('Sûr?')) callApi('/collection/start-full-rebuild', 'POST'); };
const highlightDay = () => callApi(`/analysis/highlight-day/${selectedDate.value}`, 'POST');
const highlightWeek = () => callApi(`/analysis/process-entire-week/${selectedDate.value}`, 'POST');
const getDailyRank = () => callApi(`/analysis/daily-frequency/${selectedDate.value}`);
const getWeeklyRank = () => callApi(`/analysis/weekly-frequency/${selectedDate.value}`);
const analyzeCompanions = () => { if(companionNumber.value) callApi(`/analysis/companions/${companionNumber.value}?week_date_str=${selectedDate.value}`); };
const getNumberProfile = () => { if(profileNumber.value) callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`); };
const detectSequences = () => callApi(`/analysis/sequence-detection?start_date=${startDate.value}&end_date=${endDate.value}`);
const findTriggers = () => { if(triggerTarget.value) callApi(`/analysis/trigger-numbers?target_number=${triggerTarget.value}&start_date=${startDate.value}&end_date=${endDate.value}${triggerCompanion.value?'&companion_number='+triggerCompanion.value:''}`); };
const kantaHighlightDay = () => callApi(`/analysis/kanta-highlight-day/${selectedDate.value}`, 'POST');
const kantaHighlightWeek = () => callApi(`/analysis/kanta-highlight-week/${selectedDate.value}`, 'POST');
const getKantaDailyRank = () => callApi(`/analysis/kanta-daily-rank/${selectedDate.value}`);
const getKantaWeeklyRank = () => callApi(`/analysis/kanta-weekly-rank/${selectedDate.value}`);
const launchProphet = () => { if(prophetObserved.value) callApi(`/analysis/predict-next?observed_number=${prophetObserved.value}&start_date=${startDate.value}&end_date=${endDate.value}${prophetCompanion.value?'&observed_companion='+prophetCompanion.value:''}`); };
const launchMultiProphet = () => { if(multiProphetInput.value) callApi(`/analysis/multi-prediction?numbers_str=${multiProphetInput.value}&start_date=${startDate.value}&end_date=${endDate.value}`); };
const analyzeFavorite = (i) => { currentTab.value='analysis'; if(i.includes('-')) { triggerTarget.value=i.split('-')[0]; findTriggers(); } else { profileNumber.value=i; getNumberProfile(); } };

const getHeaderLabel = (i) => {
  const r = apiResponse.value;
  if(r.habits) {
    if(i===1) return "Numéro";
    if(i===2) return "Déclencheur";
    if(i===3) return "Compagnon";
    return "";
  }
  if(r.prediction_ranking) {
    if(i===1) return "Suivant Probable";
    if(i===2) return "Score";
    return "";
  }
  // CAS PAR DEFAUT (Ajouté pour corriger l'erreur de syntaxe)
  if(i===1) return "Numéro";
  if(i===2) return "Fréquence";
  return "";
}

const getTableData = () => {
  const r = apiResponse.value;
  const l = r.frequency_ranking||r.companion_ranking||r.trigger_numbers_ranking||r.prediction_ranking||r.kanta_pairs_ranking||r.habits||[];
  return l.map(x => {
    if(x.trigger) return { col1:x.number, col2:`Décl: ${x.trigger}`, col3:`Ami: ${x.companion}` };
    if(x.number!==undefined) return { col1:x.number, col2:x.count, col3:"" };
    if(x.pair) return { col1:x.pair, col2:x.count, col3:"" };
    return { col1:"?", col2:"?", col3:"" };
  });
}
</script>

<style scoped>
* { box-sizing: border-box; } body { font-family: 'Segoe UI', sans-serif; margin: 0; background: #f4f6f9; color: #333; }
.loading-screen, .login-wrapper { display: flex; justify-content: center; align-items: center; height: 100vh; }
.login-box { background: white; padding: 2rem; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; width: 350px; }
.auth-input, .input-group input, .input-group select, .num-input { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 5px; }
.auth-btn, .btn-primary, .btn-secondary, .btn-purple, .action-btn { width: 100%; padding: 10px; border: none; border-radius: 5px; cursor: pointer; color: white; margin-top: 5px; font-weight: bold; }
.auth-btn { background: #3498db; } .btn-primary { background: #8e44ad; } .btn-secondary { background: #95a5a6; } .btn-purple { background: #9b59b6; }
.blue-btn { background: #3498db; } .red-btn { background: #e74c3c; } .grey-btn { background: #7f8c8d; }
.app-layout { display: flex; flex-direction: column; height: 100vh; }
.top-bar { background: #2c3e50; color: white; padding: 0 20px; height: 60px; display: flex; justify-content: space-between; align-items: center; }
.sidebar { width: 300px; background: white; border-right: 1px solid #ddd; overflow-y: auto; display: flex; flex-direction: column; }
.tabs { display: flex; } .tabs button { flex: 1; padding: 15px; border: none; background: #f8f9fa; cursor: pointer; } .tabs button.active { background: white; color: #3498db; border-bottom: 3px solid #3498db; }
.control-group { padding: 15px; border-bottom: 1px solid #eee; } .control-group h3 { margin: 0 0 10px 0; font-size: 1rem; color: #2c3e50; }
.main-content { flex: 1; padding: 20px; overflow-y: auto; background: #ecf0f1; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }
.stat-card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
.card-header { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; font-weight: bold; }
.stat-row { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 5px; }
.mini-analyze-btn { width: 100%; padding: 5px; background: #f39c12; border: none; border-radius: 4px; cursor: pointer; margin-top: 5px; }
.data-table { width: 100%; border-collapse: collapse; background: white; } .data-table th, .data-table td { padding: 10px; border: 1px solid #eee; text-align: center; } .data-table th { background: #f8f9fa; }
.main-cell { font-weight: bold; color: #2c3e50; font-size: 1.1em; }
.ai-box { background: white; border-left: 4px solid #f1c40f; padding: 15px; margin-bottom: 15px; border-radius: 4px; line-height: 1.6; white-space: pre-wrap; }
.ai-box h4 { margin: 0 0 5px 0; color: #f39c12; }
.loader { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.loading-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.9); display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 999; }
</style>