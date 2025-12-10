<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// --- CONFIGURATION ---
// Mettez ici l'URL de votre Backend Render
const API_URL = "https://loto-analyzer-backend.onrender.com"; 
const GOOGLE_SHEET_ID = "1HepqMzKcsbKbRsLWwpEOoy5oO9ntK2CgdV7F_ijmjlo";

// --- AUTHENTIFICATION ---
const user = ref(null);
const userRole = ref('');
const email = ref('');
const password = ref('');
const authError = ref('');
const isAuthReady = ref(false);
const isLoading = ref(false);

// --- NAVIGATION & ETAT ---
const currentTab = ref('dashboard'); // 'dashboard' ou 'analysis'
const error = ref(null);
const apiResponse = ref({});
const activeSheetGid = ref(null);

// --- DONNEES FAVORIS & DASHBOARD ---
const favoritesList = ref([]);
const newFavorite = ref("");
const dashboardData = ref({ dashboard_data: [] });
const dashboardLoading = ref(false);
const dashStart = ref("2025-01-01");
const dashEnd = ref(new Date().toISOString().substr(0, 10));

// --- INPUTS ANALYSES ---
const selectedDate = ref(new Date().toISOString().substr(0, 10));
const startDate = ref("2025-01-01");
const endDate = ref(new Date().toISOString().substr(0, 10));
const companionNumber = ref('');
const profileNumber = ref('');
const triggerTarget = ref('');
const triggerCompanion = ref('');
const prophetObserved = ref('');
const prophetCompanion = ref('');
const multiProphetInput = ref('');

// --- INPUTS HABITUDES ---
const habitDate = ref(new Date().toISOString().substr(0, 10));
const habitTime = ref('');
const habitPeriod = ref('365');

// --- INITIALISATION ---
onMounted(() => {
  // Chargement des favoris locaux
  const savedFavs = localStorage.getItem('lotoFavorites');
  if (savedFavs) favoritesList.value = JSON.parse(savedFavs);

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      user.value = firebaseUser;
      const docRef = doc(db, "users", firebaseUser.uid);
      try {
        const docSnap = await getDoc(docRef);
        userRole.value = docSnap.exists() ? docSnap.data().role : 'user';
      } catch (e) { console.log("Erreur role", e); }
      
      // Charger le dashboard dès la connexion
      if (favoritesList.value.length > 0) getDashboard();
    } else {
      user.value = null; userRole.value = '';
    }
    isAuthReady.value = true;
  });
});

const isAdmin = computed(() => userRole.value === 'admin' || user.value?.email === 'aboucho92@gmail.com');

// --- ACTIONS AUTH ---
const login = async () => {
  try {
    authError.value = ''; isLoading.value = true;
    await signInWithEmailAndPassword(auth, email.value, password.value);
  } catch (err) { authError.value = "Email ou mot de passe incorrect."; }
  finally { isLoading.value = false; }
};
const logout = async () => { await signOut(auth); };

// --- GESTION FAVORIS ---
const addFavorite = () => {
  if (newFavorite.value && !favoritesList.value.includes(newFavorite.value)) {
    favoritesList.value.push(newFavorite.value);
    newFavorite.value = "";
    saveFavorites();
    getDashboard();
  }
};
const removeFavorite = (index) => {
  favoritesList.value.splice(index, 1);
  saveFavorites();
  getDashboard();
};
const saveFavorites = () => localStorage.setItem('lotoFavorites', JSON.stringify(favoritesList.value));

// --- API CALL GENERIQUE ---
async function callApi(endpoint, method = 'GET', body = null) {
  if (!user.value) return;
  isLoading.value = true; error.value = null; apiResponse.value = {};
  
  // Si ce n'est pas le dashboard, on switch sur l'onglet résultats
  if (!endpoint.includes('favorites-dashboard')) currentTab.value = 'analysis';

  try {
    const token = await user.value.getIdToken();
    const headers = { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${API_URL}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) throw new Error(data.detail || `Erreur ${response.status}`);
    
    // Gestion spécifique Dashboard
    if (endpoint.includes('favorites-dashboard')) {
      dashboardData.value = data;
    } else {
      apiResponse.value = data;
      if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    isLoading.value = false;
    dashboardLoading.value = false;
  }
}

// --- FONCTIONS ANALYSE ---
const getDashboard = () => {
  if (favoritesList.value.length === 0) return;
  dashboardLoading.value = true;
  callApi(`/analysis/favorites-dashboard?start_date=${dashStart.value}&end_date=${dashEnd.value}`, 'POST', favoritesList.value);
};

const runHabitAnalysis = async () => {
  if (!habitDate.value) return;
  let url = `/analysis/day-specific-profile?target_date=${habitDate.value}&days_count=${habitPeriod.value}`;
  if (habitTime.value) url += `&time_slot=${habitTime.value}`;
  
  await callApi(url);
  
  // Ajout automatique aux favoris
  if (apiResponse.value.habits) {
    let added = 0;
    apiResponse.value.habits.forEach(h => {
      const s = h.number.toString();
      if (!favoritesList.value.includes(s)) {
        favoritesList.value.push(s);
        added++;
      }
    });
    if (added > 0) {
      saveFavorites();
      getDashboard();
      alert(`✅ ${added} numéros ajoutés aux favoris !`);
    }
  }
};

// Wrappers simples
const triggerUpdate = () => callApi('/collection/update-recent-weeks', 'POST');
const triggerRebuild = () => { if(confirm('Sûr ?')) callApi('/collection/start-full-rebuild', 'POST'); };
const highlightDay = () => callApi(`/analysis/highlight-day/${selectedDate.value}`, 'POST');
const highlightWeek = () => callApi(`/analysis/process-entire-week/${selectedDate.value}`, 'POST');
const getDailyRank = () => callApi(`/analysis/daily-frequency/${selectedDate.value}`);
const getWeeklyRank = () => callApi(`/analysis/weekly-frequency/${selectedDate.value}`);
const analyzeCompanions = () => { if(companionNumber.value) callApi(`/analysis/companions/${companionNumber.value}?week_date_str=${selectedDate.value}`); };
const getNumberProfile = () => { if(profileNumber.value) callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`); };
const detectSequences = () => callApi(`/analysis/sequence-detection?start_date=${startDate.value}&end_date=${endDate.value}`);
const findTriggers = () => {
  if(!triggerTarget.value) return;
  let url = `/analysis/trigger-numbers?target_number=${triggerTarget.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  if(triggerCompanion.value) url += `&companion_number=${triggerCompanion.value}`;
  callApi(url);
};
const launchProphet = () => {
  if(!prophetObserved.value) return;
  let url = `/analysis/predict-next?observed_number=${prophetObserved.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  if(prophetCompanion.value) url += `&observed_companion=${prophetCompanion.value}`;
  callApi(url);
};
const launchMultiProphet = () => { if(multiProphetInput.value) callApi(`/analysis/multi-prediction?numbers_str=${multiProphetInput.value}&start_date=${startDate.value}&end_date=${endDate.value}`); };

// Kanta
const kantaHighlightDay = () => callApi(`/analysis/kanta-highlight-day/${selectedDate.value}`, 'POST');
const kantaHighlightWeek = () => callApi(`/analysis/kanta-highlight-week/${selectedDate.value}`, 'POST');
const getKantaDailyRank = () => callApi(`/analysis/kanta-daily-rank/${selectedDate.value}`);
const getKantaWeeklyRank = () => callApi(`/analysis/kanta-weekly-rank/${selectedDate.value}`);

const analyzeFavorite = (item) => {
  // Raccourci depuis le dashboard
  currentTab.value = 'analysis';
  if (item.includes('-')) {
    triggerTarget.value = item.split('-')[0];
    triggerCompanion.value = item.split('-')[1];
    findTriggers();
  } else {
    profileNumber.value = item;
    getNumberProfile();
  }
};

// --- COMPUTED POUR AFFICHAGE ---
const tableData = computed(() => {
  const r = apiResponse.value;
  if (!r) return [];
  // Fusion de toutes les listes possibles en un format unique pour le tableau
  const list = r.frequency_ranking || r.companion_ranking || r.trigger_numbers_ranking || r.prediction_ranking || r.kanta_pairs_ranking || r.habits || [];
  
  return list.map(item => {
    // Adapter selon le type de réponse
    if (item.pair && item.count) return { col1: item.pair, col2: item.count };
    if (item.number !== undefined) return { col1: item.number, col2: item.count };
    return { col1: '?', col2: '?' };
  });
});

const tableHeaders = computed(() => {
  const r = apiResponse.value;
  if (r?.companion_ranking) return ['#', 'Compagnon', 'Fréquence'];
  if (r?.trigger_numbers_ranking) return ['#', 'Déclencheur', 'Fréquence'];
  if (r?.prediction_ranking) return ['#', 'Suivant Probable', 'Score'];
  if (r?.habits) return ['#', 'Habitué', 'Sorties'];
  return ['#', 'Numéro', 'Fréquence'];
});

const sheetEmbedUrl = computed(() => {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
  let url = activeSheetGid.value 
    ? `${base}/htmlembed?gid=${activeSheetGid.value}&widget=true&headers=false`
    : `${base}/htmlembed?widget=true&headers=false`;
  return url;
});
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen">Chargement...</div>

  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2>LE GUIDE DES FOURCASTER</h2>
      <input type="email" v-model="email" placeholder="Email" class="input-field" />
      <input type="password" v-model="password" placeholder="Mot de passe" class="input-field" />
      <button @click="login" class="btn-primary" :disabled="isLoading">Connexion</button>
      <p v-if="authError" class="error-text">{{ authError }}</p>
    </div>
  </div>

  <div v-else class="app-layout">
    <!-- HEADER -->
    <header class="top-header">
      <div class="logo">LE GUIDE DES FOURCASTER</div>
      <div class="user-menu">
        <span>{{ user.email }}</span>
        <button @click="logout" class="btn-logout">Déconnexion</button>
      </div>
    </header>

    <div class="main-container">
      
      <!-- SIDEBAR (CONTROLES) -->
      <aside class="sidebar">
        
        <!-- NAVIGATION -->
        <div class="nav-tabs">
          <button :class="{ active: currentTab === 'dashboard' }" @click="currentTab = 'dashboard'">🏠 Tableau de Bord</button>
          <button :class="{ active: currentTab === 'analysis' }" @click="currentTab = 'analysis'">📊 Analyses</button>
        </div>

        <div class="scrollable-content">
          
          <!-- ADMIN -->
          <div v-if="isAdmin" class="control-box admin">
            <h3>Maintenance</h3>
            <div class="btn-group">
              <button @click="triggerUpdate">Mise à Jour Rapide</button>
              <button @click="triggerRebuild" class="danger">Reconstruction</button>
            </div>
          </div>

          <!-- FAVORIS -->
          <div class="control-box">
            <h3>⭐ Mes Favoris</h3>
            <div class="input-row">
              <input v-model="newFavorite" placeholder="Ex: 7 ou 12-45" @keyup.enter="addFavorite">
              <button @click="addFavorite" class="btn-small">OK</button>
            </div>
            <div class="fav-tags">
              <span v-for="(fav, i) in favoritesList" :key="i" class="tag">
                {{ fav }} <span @click="removeFavorite(i)" class="close">×</span>
              </span>
            </div>
          </div>

          <!-- HABITUDES (NOUVEAU) -->
          <div class="control-box highlight">
            <h3>📅 Habitudes & Tendances</h3>
            <label>Date Cible</label>
            <input type="date" v-model="habitDate">
            
            <label>Heure</label>
            <select v-model="habitTime">
              <option value="">Toute la journée</option>
              <option value="07H00">07H00</option>
              <option value="10H00">10H00</option>
              <option value="13H00">13H00</option>
              <option value="16H00">16H00</option>
              <option value="19H00">19H00</option>
              <option value="21H00">21H00</option>
              <option value="22H00">22H00</option>
              <option value="23H00">23H00</option>
            </select>

            <label>Période</label>
            <select v-model="habitPeriod">
              <option value="7">1 Semaine</option>
              <option value="30">1 Mois</option>
              <option value="90">3 Mois</option>
              <option value="365">1 An</option>
            </select>

            <button @click="runHabitAnalysis" class="btn-primary">🕵️ Analyser & Ajouter</button>
          </div>

          <!-- ANALYSE SEMAINE -->
          <div class="control-box">
            <h3>Semaine & Fréquence</h3>
            <input type="date" v-model="selectedDate">
            <div class="btn-group">
              <button @click="highlightDay">Surlign. Jour</button>
              <button @click="highlightWeek">Surlign. Sem.</button>
            </div>
            <div class="btn-group">
              <button @click="getDailyRank">Top Jour</button>
              <button @click="getWeeklyRank">Top Semaine</button>
            </div>
            <input v-model="companionNumber" placeholder="N° Compagnon" class="mt-1">
            <button @click="analyzeCompanions" class="btn-secondary">Analyser</button>
          </div>

          <!-- PROFIL & PERIODE -->
          <div class="control-box">
            <h3>Profilage</h3>
            <div class="date-row">
              <input type="date" v-model="startDate">
              <input type="date" v-model="endDate">
            </div>
            <input v-model="profileNumber" placeholder="Numéro à profiler" class="mt-1">
            <button @click="getNumberProfile" class="btn-secondary">Voir Profil</button>
          </div>

          <!-- PROPHETE -->
          <div class="control-box">
            <h3>🔮 Le Prophète</h3>
            <input v-model="prophetObserved" placeholder="Numéro sorti (Ex: 42)">
            <button @click="launchProphet" class="btn-purple">Voir le Futur</button>
            <hr>
            <input v-model="multiProphetInput" placeholder="Tirage complet (Ex: 5 12 34)">
            <button @click="launchMultiProphet" class="btn-purple">Projection</button>
          </div>

          <!-- KANTA -->
          <div class="control-box">
            <h3>⚡ Kanta & IA</h3>
            <div class="btn-group">
              <button @click="kantaHighlightDay">Kanta Jour</button>
              <button @click="kantaHighlightWeek">Kanta Sem.</button>
            </div>
            <input v-model="triggerTarget" placeholder="Cible (ex: 18)" class="mt-1">
            <button @click="findTriggers" class="btn-secondary">Trouver Déclencheurs</button>
          </div>

        </div>
      </aside>

      <!-- CONTENU CENTRAL -->
      <main class="content-area">
        
        <!-- ONGLET DASHBOARD -->
        <div v-if="currentTab === 'dashboard'" class="dashboard-view">
          <div class="dash-header">
            <h2>Tableau de Bord</h2>
            <button @click="getDashboard" class="btn-refresh">🔄 Actualiser</button>
          </div>

          <div v-if="dashboardLoading" class="loading-msg">Analyse en cours...</div>
          <div v-else-if="favoritesList.length === 0" class="empty-msg">Ajoutez des favoris à gauche pour commencer.</div>
          
          <div v-else class="cards-grid">
            <div v-for="(stat, i) in dashboardData.dashboard_data" :key="i" class="stat-card">
              <div class="card-top">
                <span class="num">{{ stat.item }}</span>
                <span class="status">{{ stat.status }}</span>
              </div>
              <div class="card-details">
                <p>Sorties: <b>{{ stat.frequency }}</b></p>
                <p>Ami: <b>{{ stat.best_companion }}</b></p>
                <p>Décl: <b>{{ stat.best_trigger }}</b></p>
                <p>Préd: <b>{{ stat.prophet_prediction }}</b></p>
              </div>
              <button @click="analyzeFavorite(stat.item)" class="btn-card">Analyser</button>
            </div>
          </div>
        </div>

        <!-- ONGLET RESULTATS -->
        <div v-if="currentTab === 'analysis'" class="analysis-view">
          <div v-if="isLoading" class="loader">Chargement...</div>
          <div v-if="error" class="error-msg">{{ error }}</div>

          <div v-if="!isLoading && apiResponse.message" class="result-box">
            <div class="res-header">
              <h3>{{ apiResponse.message }}</h3>
              <a v-if="activeSheetGid" :href="`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/edit#gid=${activeSheetGid}`" target="_blank" class="link-sheet">Ouvrir Sheet ↗</a>
            </div>

            <!-- BLOCS IA -->
            <div class="ai-container">
              <div v-if="apiResponse.ai_strategic_analysis" class="ai-box">🧠 {{ apiResponse.ai_strategic_analysis }}</div>
              <div v-if="apiResponse.ai_strategic_profile" class="ai-box">👤 {{ apiResponse.ai_strategic_profile }}</div>
              <div v-if="apiResponse.ai_trigger_analysis" class="ai-box">⚡ {{ apiResponse.ai_trigger_analysis }}</div>
              <div v-if="apiResponse.ai_prediction_analysis" class="ai-box">🔮 {{ apiResponse.ai_prediction_analysis }}</div>
            </div>

            <!-- TABLEAU DONNEES -->
            <div class="table-container" v-if="tableData.length > 0">
              <table>
                <thead>
                  <tr>
                    <th>{{ tableHeaders[0] }}</th>
                    <th>{{ tableHeaders[1] }}</th>
                    <th>{{ tableHeaders[2] }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in tableData" :key="idx">
                    <td>#{{ idx + 1 }}</td>
                    <td>{{ row.col1 }}</td>
                    <td>{{ row.col2 }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- SHEET EMBED -->
            <div class="sheet-embed">
              <iframe :src="sheetEmbedUrl"></iframe>
            </div>
          </div>
        </div>

      </main>
    </div>
  </div>
</template>

<style scoped>
/* RESET & BASE */
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', sans-serif; margin: 0; background: #f4f6f9; color: #333; }
.loading-screen { display: flex; justify-content: center; align-items: center; height: 100vh; font-size: 1.2rem; color: #666; }

/* AUTH */
.login-wrapper { display: flex; justify-content: center; align-items: center; height: 100vh; background: #e9ecef; }
.login-box { background: white; padding: 2rem; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 350px; text-align: center; }
.input-field { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
.btn-primary { width: 100%; padding: 10px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
.btn-primary:hover { background: #2980b9; }
.error-text { color: red; margin-top: 10px; font-size: 0.9rem; }

/* LAYOUT */
.app-layout { display: flex; flex-direction: column; height: 100vh; }
.top-header { background: #2c3e50; color: white; padding: 0 20px; height: 60px; display: flex; align-items: center; justify-content: space-between; }
.logo { font-weight: bold; font-size: 1.2rem; }
.btn-logout { background: #e74c3c; color: white; border: none; padding: 5px 15px; border-radius: 4px; cursor: pointer; margin-left: 10px; }

.main-container { display: flex; flex: 1; overflow: hidden; }

/* SIDEBAR */
.sidebar { width: 320px; background: white; border-right: 1px solid #ddd; display: flex; flex-direction: column; }
.nav-tabs { display: flex; border-bottom: 1px solid #eee; }
.nav-tabs button { flex: 1; padding: 15px; border: none; background: #f8f9fa; cursor: pointer; font-weight: bold; }
.nav-tabs button.active { background: white; color: #3498db; border-bottom: 3px solid #3498db; }
.scrollable-content { overflow-y: auto; padding: 15px; flex: 1; }

.control-box { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #eee; }
.control-box.highlight { background: #eef2f7; border-color: #dbeafe; }
.control-box h3 { margin: 0 0 10px 0; font-size: 1rem; color: #2c3e50; border-bottom: 2px solid #ddd; padding-bottom: 5px; }
.control-box label { display: block; font-size: 0.85rem; margin-top: 8px; color: #666; }
.control-box input, .control-box select { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 2px; }
.btn-group { display: flex; gap: 5px; margin-top: 10px; }
.btn-group button { flex: 1; padding: 8px; border: none; border-radius: 4px; cursor: pointer; background: #bdc3c7; color: #333; font-size: 0.85rem; }
.btn-group button:hover { background: #95a5a6; }
.danger { background: #e74c3c !important; color: white !important; }
.mt-1 { margin-top: 10px; }
.btn-secondary { width: 100%; padding: 8px; margin-top: 10px; background: #95a5a6; color: white; border: none; border-radius: 4px; cursor: pointer; }
.btn-purple { width: 100%; padding: 8px; margin-top: 10px; background: #9b59b6; color: white; border: none; border-radius: 4px; cursor: pointer; }
.date-row { display: flex; gap: 5px; }

/* FAVORIS TAGS */
.input-row { display: flex; gap: 5px; }
.btn-small { padding: 0 15px; background: #2ecc71; color: white; border: none; border-radius: 4px; cursor: pointer; }
.fav-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.tag { background: #34495e; color: white; padding: 3px 8px; border-radius: 12px; font-size: 0.9rem; display: flex; align-items: center; }
.close { margin-left: 5px; cursor: pointer; color: #e74c3c; font-weight: bold; }

/* MAIN CONTENT */
.content-area { flex: 1; padding: 20px; overflow-y: auto; background: #ecf0f1; }

/* DASHBOARD */
.dash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.btn-refresh { padding: 8px 15px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px; }
.stat-card { background: white; border-radius: 8px; padding: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); transition: transform 0.2s; }
.stat-card:hover { transform: translateY(-3px); }
.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
.num { font-size: 1.5rem; font-weight: bold; color: #2c3e50; }
.status { font-size: 0.9rem; font-weight: bold; }
.card-details p { margin: 5px 0; font-size: 0.9rem; color: #555; }
.btn-card { width: 100%; margin-top: 10px; padding: 6px; background: #f1c40f; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; color: #333; }

/* RESULTS */
.result-box { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
.res-header { display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 2px solid #f1f1f1; padding-bottom: 10px; }
.link-sheet { color: #27ae60; text-decoration: none; font-weight: bold; border: 1px solid #27ae60; padding: 5px 10px; border-radius: 4px; }
.ai-container { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
.ai-box { background: #fffbe6; border-left: 4px solid #f1c40f; padding: 10px; border-radius: 0 4px 4px 0; font-size: 0.95rem; line-height: 1.5; }
.table-container { overflow-x: auto; margin-bottom: 20px; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px; border: 1px solid #eee; text-align: center; }
th { background: #f8f9fa; color: #666; font-weight: 600; }
.sheet-embed iframe { width: 100%; height: 500px; border: none; border-radius: 4px; border: 1px solid #ddd; }
.loader { text-align: center; font-style: italic; color: #999; margin: 20px 0; }
.error-msg { background: #ff7675; color: white; padding: 10px; border-radius: 4px; text-align: center; }
</style>