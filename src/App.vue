<!-- app.vue (Version Corrigée - Syntaxe Validée) -->
<template>
  <div id="app" class="app-container">
    
    <!-- ECRAN DE CHARGEMENT -->
    <div v-if="loadingGlobal" class="loading-overlay">
      <div class="loader"></div>
      <p>Chargement...</p>
    </div>

    <!-- ECRAN DE CONNEXION -->
    <div v-if="!user" class="auth-container">
      <div class="login-card">
        <h1>LE GUIDE DES FOURCASTER</h1>
        <input type="email" v-model="email" placeholder="Email" class="auth-input" />
        <input type="password" v-model="password" placeholder="Mot de passe" class="auth-input" />
        <button @click="login" class="auth-btn" :disabled="isLoading">
          {{ isLoading ? '...' : 'Connexion' }}
        </button>
        <p v-if="authError" class="error-msg">{{ authError }}</p>
      </div>
    </div>

    <!-- APPLICATION PRINCIPALE -->
    <div v-else class="main-layout">
      <!-- Header -->
      <header class="top-bar">
        <h2>LE GUIDE DES FOURCASTER</h2>
        <div class="user-info">
          <span>Connecté : {{ user.email }}</span>
          <button @click="logout" class="logout-btn">Déconnexion</button>
        </div>
      </header>

      <div class="content-wrapper">
        <!-- COLONNE GAUCHE (Contrôles) -->
        <aside class="sidebar">
          
          <div class="tabs">
            <button :class="{ active: currentTab === 'dashboard' }" @click="currentTab = 'dashboard'">🏠 Mon Tableau de Bord</button>
            <button :class="{ active: currentTab === 'analysis' }" @click="currentTab = 'analysis'">📊 Résultats d'Analyse</button>
          </div>

          <!-- ADMIN -->
          <div v-if="isAdmin" class="admin-panel">
            <h3>Maintenance (Admin)</h3>
            <div class="btn-row">
              <button @click="triggerUpdate" class="action-btn blue-btn">Mise à Jour Rapide</button>
              <button @click="triggerRebuild" class="action-btn red-btn">Reconstruction</button>
            </div>
          </div>

          <!-- FAVORIS -->
          <div class="control-group favorites-group">
            <h3>⭐ Mes Numéros Favoris</h3>
            <div class="add-fav-row">
              <input v-model="newFavorite" placeholder="Ex: 7 ou 12-45" @keyup.enter="addFavorite">
              <button @click="addFavorite">Ajouter</button>
            </div>
            <div class="favorites-list">
              <div v-for="(item, index) in favoritesList" :key="index" class="fav-tag">
                <span class="fav-num">{{ item }}</span>
                <span class="fav-icon" v-if="!item.includes('-')">👥</span>
                <span class="fav-icon" v-if="!item.includes('-')">⚡</span>
                <button @click="removeFavorite(index)" class="del-fav">×</button>
              </div>
            </div>
            <p class="help-text">Ajoutez vos numéros fétiches pour voir leurs stats en temps réel.</p>
          </div>

          <!-- ANALYSE SEMAINE -->
          <div class="control-group">
            <h3>Analyse par Semaine</h3>
            <input type="date" v-model="selectedDate" class="date-picker" />
            <div class="btn-row">
              <button @click="highlightDay" class="action-btn blue-btn">Surlignage (Jour)</button>
              <button @click="highlightWeek" class="action-btn blue-btn">Surlignage (Semaine)</button>
            </div>
            <div class="separator">________________</div>
            <div class="btn-col">
              <button @click="getDailyRank" class="action-btn blue-btn">Classement Jour</button>
              <button @click="getWeeklyRank" class="action-btn blue-btn">Classement Semaine</button>
            </div>
            <div class="separator">________________</div>
            <input v-model="companionNumber" placeholder="N° pour analyse compagnons" class="num-input" />
            <button @click="analyzeCompanions" class="action-btn grey-btn">Analyser Compagnons</button>
          </div>

          <!-- ANALYSE PERIODE -->
          <div class="control-group">
            <h3>Période & Profilage</h3>
            <label>Début :</label> <input type="date" v-model="startDate" />
            <label>Fin :</label> <input type="date" v-model="endDate" />
            <button @click="getFrequencyRange" class="action-btn blue-btn">Fréquence sur Période</button>
            <div class="separator">________________</div>
            <input v-model="profileNumber" placeholder="N° pour profil complet" class="num-input" />
            <button @click="getNumberProfile" class="action-btn grey-btn">Générer Profil du Numéro</button>
          </div>

          <!-- NOUVEAU BLOC : HABITUDES & TENDANCES -->
          <div class="control-group" style="background-color: #f0f4f8; border: 1px solid #d1d9e6;">
            <h3 style="color: #2c3e50;">📅 Habitudes & Tendances</h3>
            <div class="help-text" style="font-size: 0.8em; color: #666; margin-bottom: 5px;">
              Trouvez les numéros qui dominent ce jour-là sur une période.
            </div>
            
            <div class="input-group">
              <label>Date cible (Jour) :</label>
              <input type="date" v-model="habitDate">
            </div>

            <div class="input-group">
              <label>Heure (Optionnelle) :</label>
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
            </div>

            <div class="input-group">
              <label>Profondeur :</label>
              <select v-model="habitPeriod">
                <option value="7">1 Semaine (Forme)</option>
                <option value="30">1 Mois (Court terme)</option>
                <option value="90">3 Mois (Trimestre)</option>
                <option value="365">1 An (Historique)</option>
                <option value="730">2 Ans (Fond)</option>
              </select>
            </div>

            <button @click="analyzeHabitsAndAdd" class="action-btn purple-btn">
              🕵️ Analyser & Ajouter
            </button>
          </div>

          <!-- PROPHETE -->
          <div class="control-group prophete-box">
            <h3>🔮 Le Prophète</h3>
            <p>Ce numéro vient de sortir. La suite ?</p>
            <input v-model="prophetObserved" placeholder="Numéro vu (Ex: 42)" class="num-input" />
            <input v-model="prophetCompanion" placeholder="Compagnon vu (Optionnel)" class="num-input" />
            <button @click="launchProphet" class="action-btn purple-btn">Voir Futur Probable</button>
          </div>

          <!-- ANALYSE CROISÉE -->
          <div class="control-group prophete-box">
            <h3>🔮 Analyse Croisée</h3>
            <p>Dernier tirage complet (ou sélection).</p>
            <input v-model="multiProphetInput" placeholder="Ex: 5 12 34 56 78" class="num-input" />
            <button @click="launchMultiProphet" class="action-btn purple-btn">Lancer Projection</button>
          </div>

          <!-- IA & KANTA -->
          <div class="control-group">
            <h3>IA Avancée & Kanta</h3>
            <button @click="detectSequences" class="action-btn blue-btn">Détecter Suites</button>
            <div class="separator">________________</div>
            <input v-model="triggerTarget" placeholder="Cible (ex: 18)" class="num-input small" />
            <input v-model="triggerCompanion" placeholder="Compagnon (Optionnel)" class="num-input small" />
            <button @click="findTriggers" class="action-btn grey-btn">Trouver Déclencheurs ⚡</button>
            <div class="separator">________________</div>
            <div class="btn-row">
              <button @click="kantaHighlightDay" class="action-btn blue-btn">Surlign. Kanta J</button>
              <button @click="kantaHighlightWeek" class="action-btn blue-btn">Surlign. Kanta S</button>
            </div>
            <div class="btn-row">
              <button @click="getKantaDailyRank" class="action-btn blue-btn">Class. Kanta J</button>
              <button @click="getKantaWeeklyRank" class="action-btn blue-btn">Class. Kanta S</button>
            </div>
          </div>

        </aside>

        <!-- ZONE PRINCIPALE (Dashboard & Résultats) -->
        <main class="main-content">
          
          <!-- VUE DASHBOARD -->
          <div v-if="currentTab === 'dashboard'" class="dashboard-view">
            <div class="dashboard-header">
              <h2>👋 Tableau de Bord Personnalisé</h2>
              <div class="dash-dates">
                <input type="date" v-model="dashStart" /> à <input type="date" v-model="dashEnd" />
                <button @click="getDashboard" class="refresh-btn">🔄 Actualiser</button>
              </div>
            </div>

            <div v-if="favoritesList.length === 0" class="empty-dash">
              <p>👈 Ajoutez des numéros "Favoris" pour activer votre tableau de bord.</p>
            </div>

            <div v-else-if="dashboardLoading" class="loading-dash">
              Analyse de vos favoris en cours...
            </div>

            <div v-else class="cards-grid">
              <div v-for="(stat, idx) in dashboardData.dashboard_data" :key="idx" class="stat-card">
                <div class="card-header">
                  <span class="card-num">{{ stat.item }}</span>
                  <span class="card-status">{{ stat.status }}</span>
                </div>
                <div class="card-body">
                  <div class="stat-row"><span>Sorties ({{ dashboardData.analysis_period }}):</span> <strong>{{ stat.frequency }} fois</strong></div>
                  <div class="stat-row"><span>Meilleur Ami (Sort avec):</span> <strong>{{ stat.best_companion }}</strong></div>
                  <div class="stat-row"><span>⚡ Déclencheur (Appelé par):</span> <strong>{{ stat.best_trigger }}</strong></div>
                  <div class="stat-row"><span>🔮 Prophète (A suivre):</span> <strong>{{ stat.prophet_prediction }}</strong></div>
                </div>
                <div class="card-footer">
                  <button @click="analyzeFavorite(stat.item)" class="mini-analyze-btn">⚡ Analyse Complète</button>
                </div>
              </div>
            </div>
          </div>

          <!-- VUE RESULTATS -->
          <div v-if="currentTab === 'analysis'" class="results-view">
            <h2>Résultats d'Analyse</h2>
            
            <div v-if="loading" class="loading-box">Chargement...</div>
            <div v-else-if="error" class="error-box">{{ error }}</div>
            
            <div v-else-if="!apiResponse.message && !apiResponse.rankings" class="empty-state">
              Sélectionnez une analyse à gauche pour voir les résultats ici.
            </div>

            <div v-else class="results-content">
              <div class="result-header">
                <h3>✅ {{ apiResponse.message || `Analyse : ${apiResponse.analysis_period}` }}</h3>
                <a v-if="apiResponse.worksheet_gid" 
                   :href="`https://docs.google.com/spreadsheets/d/1HepqMzkcshKbrsLWwpEOOy5oO9ntK2CgdV7F_ijmjlo/edit#gid=${apiResponse.worksheet_gid}`" 
                   target="_blank" class="sheet-link">Voir l'Onglet ↗</a>
              </div>

              <!-- Switch Tableau / Graphique -->
              <div class="view-switch" v-if="apiResponse.rankings || apiResponse.frequency_ranking || apiResponse.prediction_ranking">
                <button :class="{active: viewMode==='table'}" @click="viewMode='table'">📋 Tableau</button>
                <button :class="{active: viewMode==='chart'}" @click="viewMode='chart'">📊 Graphique</button>
              </div>

              <!-- TABLEAU -->
              <div v-if="viewMode === 'table'" class="data-table-wrapper">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{{ getHeaderLabel(1) }}</th>
                      <th>{{ getHeaderLabel(2) }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, index) in getTableData()" :key="index">
                      <td>#{{ index + 1 }}</td>
                      <td>{{ row.col1 }}</td>
                      <td>{{ row.col2 }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- BLOCS IA -->
              <div class="ai-insights">
                <div v-if="apiResponse.ai_strategic_analysis" class="ai-box strategy">
                  <h4>🧠 Stratégie</h4>
                  <p>{{ apiResponse.ai_strategic_analysis }}</p>
                </div>
                <div v-if="apiResponse.ai_strategic_profile" class="ai-box profile">
                  <h4>🧠 Profil Numéro</h4>
                  <p>{{ apiResponse.ai_strategic_profile }}</p>
                </div>
                <div v-if="apiResponse.ai_sequence_analysis" class="ai-box sequence">
                  <h4>🧠 Suites</h4>
                  <p>{{ apiResponse.ai_sequence_analysis }}</p>
                </div>
                <div v-if="apiResponse.ai_trigger_analysis" class="ai-box trigger">
                  <h4>🧠 Déclencheurs</h4>
                  <p>{{ apiResponse.ai_trigger_analysis }}</p>
                </div>
                <div v-if="apiResponse.ai_prediction_analysis" class="ai-box prediction">
                  <h4>🔮 Prédiction</h4>
                  <p>{{ apiResponse.ai_prediction_analysis }}</p>
                </div>
              </div>

            </div>
          </div>

        </main>
      </div>
    </div>
  </div>
</template>

<script>
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { firebaseConfig } from "./firebase";

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export default {
  data() {
    return {
      // Auth
      user: null,
      email: "",
      password: "",
      authError: null,
      isLoading: false,
      isAdmin: false,
      loadingGlobal: true,

      // Navigation
      currentTab: 'dashboard',
      viewMode: 'table',

      // API
      API_URL: "https://loto-analyzer-backend.onrender.com", 
      loading: false,
      error: null,
      apiResponse: {},

      // Inputs
      selectedDate: new Date().toISOString().substr(0, 10),
      startDate: "2025-01-01",
      endDate: new Date().toISOString().substr(0, 10),
      companionNumber: "",
      profileNumber: "",
      triggerTarget: "",
      triggerCompanion: "",
      prophetObserved: "",
      prophetCompanion: "",
      multiProphetInput: "",
      
      // NOUVEAU : Habitudes
      habitDate: new Date().toISOString().substr(0, 10),
      habitTime: "",
      habitPeriod: "365",

      // Dashboard & Favoris
      newFavorite: "",
      favoritesList: [],
      dashboardData: {},
      dashboardLoading: false,
      dashStart: "2025-11-10", 
      dashEnd: new Date().toISOString().substr(0, 10) 
    };
  },
  created() {
    onAuthStateChanged(auth, async (currentUser) => {
      this.user = currentUser;
      this.loadingGlobal = false;
      if (this.user) {
        // Chargement favoris (Local Storage pour demo)
        const savedFavs = localStorage.getItem('lotoFavorites');
        if (savedFavs) this.favoritesList = JSON.parse(savedFavs);
        this.getDashboard(); // Auto-load
        // Check Admin (Simulation)
        if (this.user.email === 'aboucho92@gmail.com') this.isAdmin = true;
      }
    });
  },
  methods: {
    // --- AUTH ---
    async login() {
      this.isLoading = true; this.authError = null;
      try { await signInWithEmailAndPassword(auth, this.email, this.password); }
      catch (error) { this.authError = "Erreur de connexion. Vérifiez vos identifiants."; }
      finally { this.isLoading = false; }
    },
    async logout() { await signOut(auth); },

    // --- FAVORIS ---
    addFavorite() {
      if (this.newFavorite && !this.favoritesList.includes(this.newFavorite)) {
        this.favoritesList.push(this.newFavorite);
        this.newFavorite = "";
        this.saveFavorites();
        this.getDashboard();
      }
    },
    removeFavorite(index) {
      this.favoritesList.splice(index, 1);
      this.saveFavorites();
      this.getDashboard();
    },
    saveFavorites() { localStorage.setItem('lotoFavorites', JSON.stringify(this.favoritesList)); },

    // --- DASHBOARD ---
    async getDashboard() {
      if (this.favoritesList.length === 0) return;
      this.dashboardLoading = true;
      try {
        const token = await this.user.getIdToken();
        const response = await fetch(`${this.API_URL}/analysis/favorites-dashboard?start_date=${this.dashStart}&end_date=${this.dashEnd}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(this.favoritesList)
        });
        this.dashboardData = await response.json();
      } catch (e) { console.error(e); }
      finally { this.dashboardLoading = false; }
    },
    analyzeFavorite(item) {
      // Pré-remplit les champs et change d'onglet
      this.currentTab = 'analysis';
      if (item.includes('-')) {
        this.triggerTarget = item.split('-')[0];
        this.triggerCompanion = item.split('-')[1];
        this.findTriggers();
      } else {
        this.profileNumber = item;
        this.getNumberProfile();
      }
    },

    // --- ADMIN ---
    async triggerUpdate() { await this.callApi('/collection/update-recent-weeks', 'POST'); },
    async triggerRebuild() { if(confirm("Sûr ?")) await this.callApi('/collection/start-full-rebuild', 'POST'); },

    // --- ANALYSES ---
    async highlightDay() { await this.callApi(`/analysis/highlight-day/${this.selectedDate}`, 'POST'); },
    async highlightWeek() { await this.callApi(`/analysis/process-entire-week/${this.selectedDate}`, 'POST'); },
    async getDailyRank() { await this.callApi(`/analysis/daily-frequency/${this.selectedDate}`); },
    async getWeeklyRank() { await this.callApi(`/analysis/weekly-frequency/${this.selectedDate}`); },
    async analyzeCompanions() { if(this.companionNumber) await this.callApi(`/analysis/companions/${this.companionNumber}?week_date_str=${this.selectedDate}`); },
    
    async getFrequencyRange() { await this.callApi(`/analysis/frequency-by-range?start_date=${this.startDate}&end_date=${this.endDate}`); },
    async getNumberProfile() { if(this.profileNumber) await this.callApi(`/analysis/number-profile?target_number=${this.profileNumber}&start_date=${this.startDate}&end_date=${this.endDate}`); },
    
    // --- NOUVEAU : HABITUDES & AJOUT ---
    async analyzeHabitsAndAdd() {
      if (!this.habitDate) return alert("Date requise.");
      this.loading = true; this.apiResponse = {};
      try {
        const token = await this.user.getIdToken();
        let url = `${this.API_URL}/analysis/day-specific-profile?target_date=${this.habitDate}&days_count=${this.habitPeriod}`;
        if (this.habitTime) url += `&time_slot=${this.habitTime}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if(!res.ok) { const err=await res.json(); throw new Error(err.detail); }
        const data = await res.json();

        // 1. Affichage
        this.apiResponse = {
          message: `Habitudes : ${data.context}`,
          ai_strategic_analysis: data.ai_analysis,
          rankings: data.habits.map(h => ({ number: h.number, count: `${h.count} sorties`, pair: `Ami:${h.companion}` }))
        };
        this.currentTab = 'analysis';

        // 2. Ajout Favoris
        let added = 0;
        data.habits.forEach(h => {
          const s = h.number.toString();
          if(!this.favoritesList.includes(s)) { this.favoritesList.push(s); added++; }
        });
        if(added > 0) {
          this.saveFavorites();
          this.getDashboard();
          alert(`✅ ${added} numéros ajoutés aux favoris.`);
        }
      } catch(e) { this.error = e.message; }
      finally { this.loading = false; }
    },

    async detectSequences() { await this.callApi(`/analysis/sequence-detection?start_date=${this.startDate}&end_date=${this.endDate}`); },
    async findTriggers() { if(this.triggerTarget) {
      let url = `/analysis/trigger-numbers?target_number=${this.triggerTarget}&start_date=${this.startDate}&end_date=${this.endDate}`;
      if(this.triggerCompanion) url += `&companion_number=${this.triggerCompanion}`;
      await this.callApi(url);
    }},
    
    async kantaHighlightDay() { await this.callApi(`/analysis/kanta-highlight-day/${this.selectedDate}`, 'POST'); },
    async kantaHighlightWeek() { await this.callApi(`/analysis/kanta-highlight-week/${this.selectedDate}`, 'POST'); },
    async getKantaDailyRank() { await this.callApi(`/analysis/kanta-daily-rank/${this.selectedDate}`); },
    async getKantaWeeklyRank() { await this.callApi(`/analysis/kanta-weekly-rank/${this.selectedDate}`); },

    async launchProphet() { if(this.prophetObserved) {
      let url = `/analysis/predict-next?observed_number=${this.prophetObserved}&start_date=${this.startDate}&end_date=${this.endDate}`;
      if(this.prophetCompanion) url += `&observed_companion=${this.prophetCompanion}`;
      await this.callApi(url);
    }},
    async launchMultiProphet() { if(this.multiProphetInput) await this.callApi(`/analysis/multi-prediction?numbers_str=${this.multiProphetInput}&start_date=${this.startDate}&end_date=${this.endDate}`); },

    // --- GENERIQUE API CALL ---
    async callApi(endpoint, method = 'GET') {
      this.loading = true; this.error = null; this.apiResponse = {};
      this.currentTab = 'analysis';
      try {
        const token = await this.user.getIdToken();
        const res = await fetch(`${this.API_URL}${endpoint}`, {
          method: method,
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || "Erreur serveur");
        }
        this.apiResponse = await res.json();
      } catch (e) { this.error = e.message; }
      finally { this.loading = false; }
    },

    // --- HELPER TABLEAU ---
    getHeaderLabel(colIndex) {
      const r = this.apiResponse;
      if (r.frequency_ranking) return colIndex === 1 ? "Numéro" : "Sorties";
      if (r.companion_ranking) return colIndex === 1 ? "Compagnon" : "Fréquence";
      if (r.trigger_numbers_ranking) return colIndex === 1 ? "N° Déclencheur" : "Fréquence";
      if (r.prediction_ranking) return colIndex === 1 ? "Numéro Suivant (Probable)" : "Fréquence";
      if (r.kanta_pairs_ranking) return colIndex === 1 ? "Paire Kanta" : "Fréquence";
      if (r.kanta_pairs) return colIndex === 1 ? "Paire Présente" : "-";
      if (r.rankings) return colIndex === 1 ? "Numéro" : "Détails";
      return "Donnée";
    },
    getTableData() {
      const r = this.apiResponse;
      const list = r.frequency_ranking || r.companion_ranking || r.trigger_numbers_ranking || r.prediction_ranking || r.kanta_pairs_ranking || r.kanta_pairs || r.rankings || [];
      return list.map(item => {
        if (item.pair && item.count) return { col1: item.pair, col2: item.count }; 
        if (Array.isArray(item)) return { col1: `${item[0]}-${item[1]}`, col2: "Présent" };
        if (item.number !== undefined) return { col1: item.number, col2: item.count };
        return { col1: "?", col2: "?" };
      });
    }
  }
};
</script>