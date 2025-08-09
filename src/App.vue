<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// --- CONFIGURATION ---
const GOOGLE_SHEET_ID = "1HepqMzKcshKbRsLWwpEOOy5oO9ntK2CgdV7F_ijmjIo";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// --- SECTION AUTHENTIFICATION ---
const user = ref(null);
const userRole = ref('');
const email = ref('');
const password = ref('');
const authError = ref('');
const isAuthReady = ref(false);

onMounted(() => {
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  selectedDate.value = `${year}-${month}-${day}`;
  endDate.value = `${year}-${month}-${day}`;
  
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const startYear = oneMonthAgo.getFullYear();
  const startMonth = (oneMonthAgo.getMonth() + 1).toString().padStart(2, '0');
  const startDay = oneMonthAgo.getDate().toString().padStart(2, '0');
  startDate.value = `${startYear}-${startMonth}-${startDay}`;

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      user.value = firebaseUser;
      const docRef = doc(db, "users", firebaseUser.uid);
      const docSnap = await getDoc(docRef);
      userRole.value = docSnap.exists() ? docSnap.data().role : 'user';
    } else {
      user.value = null; userRole.value = '';
    }
    isAuthReady.value = true;
  });
});

const login = async () => {
  try {
    authError.value = '';
    isLoading.value = true;
    await signInWithEmailAndPassword(auth, email.value, password.value);
  } catch (error) { authError.value = "Email ou mot de passe incorrect."; }
  finally { isLoading.value = false; }
};
const logout = async () => { await signOut(auth); };

// --- SECTION TABLEAU DE BORD ---
const selectedDate = ref('');
const startDate = ref('');
const endDate = ref('');
const selectedNumber = ref('');
const profileNumber = ref('');
const triggerTargetNumber = ref('');
const triggerCompanionNumber = ref('');
const apiResponse = ref(null);
const isLoading = ref(false);
const error = ref(null);
const lastOperationType = ref('');
const activeSheetGid = ref(null);
const showWelcomeMessage = ref(true);

const isAdmin = computed(() => userRole.value === 'admin');
const sheetDirectLink = computed(() => {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}`;
  return activeSheetGid.value ? `${base}/edit#gid=${activeSheetGid.value}` : `${base}/edit`;
});

const tableHeaders = computed(() => {
  if (lastOperationType.value.includes('frequency')) return ['#', 'Numéro', 'Apparitions'];
  if (lastOperationType.value === 'companions') return ['#', 'Compagnon', 'Apparu avec'];
  if (lastOperationType.value === 'trigger') return ['#', 'N° Déclencheur', 'Fréquence'];
  return [];
});
const tableData = computed(() => {
  if (apiResponse.value?.frequency_ranking) return apiResponse.value.frequency_ranking;
  if (apiResponse.value?.companion_ranking) return apiResponse.value.companion_ranking;
  if (apiResponse.value?.trigger_numbers_ranking) return apiResponse.value.trigger_numbers_ranking;
  return [];
});
const isTableVisible = computed(() => tableData.value.length > 0);

async function callApi(url, method = 'GET') {
  showWelcomeMessage.value = false;
  isLoading.value = true;
  error.value = null;
  apiResponse.value = null;
  try {
    const token = await user.value.getIdToken();
    const headers = { 'Authorization': `Bearer ${token}` };
    const fullUrl = `${API_BASE_URL}${url}`;
    const response = await fetch(fullUrl, { method, headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || `Erreur ${response.status}`);
    apiResponse.value = data;
    if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
  } catch (err) {
    error.value = err.message;
  } finally {
    isLoading.value = false;
  }
}

async function runDataUpdate(endpoint) { lastOperationType.value = 'update'; await callApi(`/collection/${endpoint}`, 'POST'); }
async function runVisualAnalysis(endpoint) {
  if (!selectedDate.value) { error.value = "Veuillez sélectionner une date."; return; }
  lastOperationType.value = 'visual';
  await callApi(`/analysis/${endpoint}/${selectedDate.value}`, 'POST');
}
async function runReport(reportType) {
  if (!selectedDate.value) { error.value = "Veuillez sélectionner une date."; return; }
  let url = '';
  if (reportType === 'weekly-frequency') {
    lastOperationType.value = 'weekly-frequency';
    url = `/analysis/weekly-frequency/${selectedDate.value}`;
  } else if (reportType === 'daily-frequency') {
    lastOperationType.value = 'daily-frequency';
    url = `/analysis/daily-frequency/${selectedDate.value}`;
  } else if (reportType === 'companions') {
    if (!selectedNumber.value) { error.value = "Veuillez entrer un numéro."; return; }
    lastOperationType.value = 'companions';
    url = `/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`;
  }
  await callApi(url);
}

async function runRangeAnalysis() {
  if (!startDate.value || !endDate.value) {
    error.value = "Veuillez sélectionner une date de début ET de fin.";
    return;
  }
  lastOperationType.value = 'frequency';
  const url = `/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`;
  await callApi(url);
}

async function runProfileAnalysis() {
  if (!startDate.value || !endDate.value || !profileNumber.value) {
    error.value = "Veuillez sélectionner une période ET un numéro pour le profilage.";
    return;
  }
  lastOperationType.value = 'profile';
  const url = `/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  await callApi(url);
}

async function runSequenceAnalysis() {
  if (!startDate.value || !endDate.value) {
    error.value = "Veuillez sélectionner une période pour la détection de suites.";
    return;
  }
  lastOperationType.value = 'sequence';
  const url = `/analysis/sequence-detection?start_date=${startDate.value}&end_date=${endDate.value}`;
  await callApi(url);
}

async function runTriggerAnalysis() {
  if (!startDate.value || !endDate.value || !triggerTargetNumber.value || !triggerCompanionNumber.value) {
    error.value = "Veuillez sélectionner une période et les deux numéros de votre paire.";
    return;
  }
  lastOperationType.value = 'trigger';
  const url = `/analysis/trigger-numbers?target_number=${triggerTargetNumber.value}&companion_number=${triggerCompanionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  await callApi(url);
}

// --- NOUVELLE FONCTION ---
async function runKantaAnalysis(endpoint) {
  if (!selectedDate.value) { error.value = "Veuillez sélectionner une date."; return; }
  lastOperationType.value = 'visual';
  await callApi(`/analysis/${endpoint}/${selectedDate.value}`, 'POST');
}
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen">
    <p>Chargement de l'application...</p>
  </div>

  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2>LE GUIDE DES FOURCASTER</h2>
      <form @submit.prevent="login">
        <div class="input-group">
          <label for="email">Email</label>
          <input type="email" id="email" v-model="email" required />
        </div>
        <div class="input-group">
          <label for="password">Mot de passe</label>
          <input type="password" id="password" v-model="password" required />
        </div>
        <button type="submit" class="login-button" :disabled="isLoading">{{ isLoading ? 'Connexion...' : 'Se connecter' }}</button>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
      </form>
    </div>
  </div>

  <main v-else class="dashboard">
    <header>
      <h1>LE GUIDE DES FOURCASTER</h1>
      <div class="user-info">
        <span>Connecté : <strong>{{ user.email }}</strong> (Rôle: {{ userRole }})</span>
        <button @click="logout" class="logout-button">Déconnexion</button>
      </div>
    </header>

    <div class="main-layout">
      <div class="controls-column">
        <section v-if="isAdmin" class="card data-update">
          <h2>Maintenance (Admin)</h2>
          <div class="button-group-horizontal">
            <button @click="runDataUpdate('update-recent-weeks')" :disabled="isLoading">Mise à Jour Rapide</button>
            <button @click="runDataUpdate('start-full-rebuild')" :disabled="isLoading" class="danger">Reconstruction Complète</button>
          </div>
        </section>

        <section class="card">
          <h2>Analyse par Semaine</h2>
          <label>Sélectionnez un jour dans la semaine :</label>
          <input type="date" v-model="selectedDate" />
          <div class="button-group-vertical">
            <button @click="runVisualAnalysis('highlight-day')" :disabled="isLoading || !selectedDate">Surlignage Standard</button>
            <button @click="runVisualAnalysis('process-entire-week')" :disabled="isLoading || !selectedDate">Surlignage Standard (Semaine)</button>
            <hr />
            <button @click="runReport('daily-frequency')" :disabled="isLoading || !selectedDate">Classement du Jour</button>
            <button @click="runReport('weekly-frequency')" :disabled="isLoading || !selectedDate">Classement de la Semaine</button>
            <hr />
            <input type="number" v-model="selectedNumber" placeholder="N° pour analyse compagnons" />
            <button @click="runReport('companions')" :disabled="isLoading || !selectedDate || !selectedNumber">Analyser Compagnons</button>
          </div>
        </section>

        <!-- NOUVELLE CARTE KANTA TRACKER -->
        <section class="card">
          <h2>Kanta Tracker (Visuel)</h2>
          <p>Utilise la date sélectionnée ci-dessus.</p>
          <div class="button-group-vertical">
            <button @click="runKantaAnalysis('kanta-highlight-day')" :disabled="isLoading || !selectedDate">
              Surligner Kanta du Jour
            </button>
            <button @click="runKantaAnalysis('kanta-highlight-week')" :disabled="isLoading || !selectedDate">
              Surligner Kanta (Semaine)
            </button>
          </div>
        </section>

        <section class="card">
          <h2>Analyse sur Période Étendue</h2>
          <label>Date de début :</label>
          <input type="date" v-model="startDate" />
          <label>Date de fin :</label>
          <input type="date" v-model="endDate" />
          <button @click="runRangeAnalysis" :disabled="isLoading || !startDate || !endDate">Fréquence sur Période</button>
          <hr />
          <input type="number" v-model="profileNumber" placeholder="N° pour profilage" />
          <button @click="runProfileAnalysis" :disabled="isLoading || !startDate || !endDate || !profileNumber">Générer Profil du Numéro</button>
        </section>

        <section class="card">
          <h2>Analyse IA Avancée</h2>
          <p>Utilisera la période sélectionnée ci-dessus.</p>
          <button @click="runSequenceAnalysis" :disabled="isLoading || !startDate || !endDate">Détection de Suites</button>
          <hr />
          <label>Numéro Principal :</label>
          <input type="number" v-model="triggerTargetNumber" placeholder="Ex: 18" />
          <label>Numéro Compagnon :</label>
          <input type="number" v-model="triggerCompanionNumber" placeholder="Ex: 73" />
          <button @click="runTriggerAnalysis" :disabled="isLoading || !startDate || !endDate || !triggerTargetNumber || !triggerCompanionNumber">
            Trouver les Déclencheurs
          </button>
        </section>
      </div>

      <div class="results-column">
        <section class="card results-card">
          <h2>Résultats d'Analyse</h2>
          <div v-if="showWelcomeMessage" class="welcome-message">
            <h3>Bienvenue sur Le Guide des Fourcaster !</h3>
            <p>Cet outil est votre assistant personnel pour analyser les tendances du Loto Bonheur.</p>
            <button @click="showWelcomeMessage = false" class="close-welcome">Commencer</button>
          </div>
          <div v-else>
            <div v-if="isLoading" class="loader">Chargement...</div>
            <div v-if="error" class="error-box">{{ error }}</div>
            <div v-if="apiResponse">
              <div v-if="apiResponse.message || apiResponse.analysis_period" class="success-box large">
                <div>
                  <p>✅ {{ apiResponse.message || `Rapport généré pour la période : ${apiResponse.analysis_period}` }}</p>
                  <small v-if="lastOperationType === 'visual'">Les couleurs ont été mises à jour.</small>
                </div>
                <a v-if="apiResponse.worksheet_gid" :href="sheetDirectLink" target="_blank" class="button-link">Voir l'Onglet ↗</a>
              </div>
              <table v-if="isTableVisible" class="styled-table">
                <thead>
                  <tr><th v-for="h in tableHeaders" :key="h">{{ h }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in tableData" :key="index">
                    <td>#{{ index + 1 }}</td>
                    <td>{{ row.number }}</td>
                    <td>{{ row.count }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="apiResponse.ai_strategic_analysis" class="ai-analysis">
                <h3>🧠 Analyse Stratégique des Compagnons</h3>
                <p>{{ apiResponse.ai_strategic_analysis }}</p>
              </div>
              <div v-if="apiResponse.ai_strategic_profile" class="ai-analysis">
                <h3>🧠 Profil Stratégique du Numéro {{ apiResponse.profile_for_number }}</h3>
                <p>{{ apiResponse.ai_strategic_profile }}</p>
              </div>
              <div v-if="apiResponse.ai_sequence_analysis" class="ai-analysis">
                <h3>🧠 Analyse des Suites par l'IA</h3>
                <p>{{ apiResponse.ai_sequence_analysis }}</p>
              </div>
              <div v-if="apiResponse.ai_trigger_analysis" class="ai-analysis">
                <h3>🧠 Analyse des Numéros Déclencheurs pour la paire {{ apiResponse.analysis_for_pair }}</h3>
                <p>{{ apiResponse.ai_trigger_analysis }}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
  .loading-screen { display: flex; align-items: center; justify-content: center; min-height: 100vh; font-size: 1.5rem; font-style: italic; color: #666; }
  .login-wrapper { display: flex; align-items: center; justify-content: center; min-height: 100vh; background-color: #f0f2f5; }
  .login-box { background: white; padding: 2.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
  .login-box h2 { text-align: center; margin-bottom: 2rem; }
  .input-group { margin-bottom: 1.5rem; }
  .input-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
  .input-group input { width: 100%; padding: 0.8rem; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;}
  .login-button { width: 100%; padding: 0.8rem; background-color: #007bff; color: white; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
  .auth-error { color: #dc3545; text-align: center; margin-top: 1rem; }
  .dashboard { max-width: 95%; margin: 1rem auto; font-family: sans-serif; }
  header { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #e0e0e0; text-align: center; }
  .user-info { margin-top: 1rem; padding: 0.8rem; background-color: #f8f9fa; border-radius: 8px; display: inline-flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .logout-button { background-color: #6c757d; color: white; border: none; padding: 0.5rem 1rem; border-radius: 5px; cursor: pointer;}
  .main-layout { display: grid; grid-template-columns: 380px 1fr; gap: 2rem; }
  .card { background: white; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
  .data-update { background-color: #fff9c4; border: 1px solid #fbc02d; }
  .card h2 { font-size: 1.2rem; margin-top: 0; margin-bottom: 1rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
  input { width: 100%; padding: 0.75rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box; margin-bottom: 1rem; }
  .button-group-vertical { display: flex; flex-direction: column; gap: 0.5rem; }
  .button-group-horizontal { display: flex; flex-direction: row; gap: 1rem; }
  button { padding: 0.8rem; font-size: 1rem; font-weight: bold; color: white; background-color: #007bff; border: none; border-radius: 5px; cursor: pointer; width: 100%;}
  button.danger { background-color: #e53545; }
  button:disabled { background-color: #ccc; cursor: not-allowed; }
  .results-card { min-height: 80vh; }
  .error-box, .loader, .success-box { padding: 1rem; border-radius: 4px; text-align: center; margin-bottom: 1rem; }
  .error-box { background-color: #ffebee; color: #c62828; }
  .success-box { background-color: #e8f5e9; color: #2e7d32; font-weight: bold; }
  .external-link { font-weight: bold; text-decoration: none; }
  .styled-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  .styled-table th, .styled-table td { border: 1px solid #ddd; padding: 8px; text-align: center; }
  .styled-table th { background-color: #f2f2f2; }
  .ai-analysis { background-color: #fffbe6; border-left: 5px solid #ffc107; padding: 1rem; margin-top: 1rem; border-radius: 4px; text-align: left; }
  .ai-analysis h3 { margin-top: 0; }
  .ai-analysis p { line-height: 1.6; white-space: pre-wrap; }
  .success-box.large { padding: 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 1rem; }
  .success-box.large p { margin: 0; font-size: 1.1rem; }
  .success-box.large small { color: #555; }
  .button-link { display: inline-block; padding: 0.8rem 2rem; background-color: #28a745; color: white; font-weight: bold; text-decoration: none; border-radius: 5px; transition: background-color 0.2s; }
  .button-link:hover { background-color: #218838; }
  .welcome-message { background-color: #e3f2fd; color: #1e88e5; border: 1px solid #90caf9; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; }
  .welcome-message h3 { margin-top: 0; }
  .welcome-message ul { padding-left: 20px; }
  .welcome-message li { margin-bottom: 0.5rem; }
  .close-welcome { display: block; width: auto; margin-top: 1rem; padding: 0.6rem 1.2rem; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
  label { display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.9rem; color: #555; margin-top: 1rem; }
  .card p { font-size: 0.8rem; color: #777; margin-top: 0.5rem; text-align: center; }
  hr { border: none; border-top: 1px solid #eee; margin: 1rem 0; }
</style>