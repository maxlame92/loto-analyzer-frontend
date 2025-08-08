<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// --- CONFIGURATION ---
const GOOGLE_SHEET_ID = "1HepqMzKcsbKbRsLWwpEOoy5oO9ntK2CgdV7F_ijmjlo";
// --- URL du backend dynamique ---
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

const login = async () => { /* ... */ };
const logout = async () => { await signOut(auth); };

// --- SECTION TABLEAU DE BORD ---
const selectedDate = ref('');
const selectedNumber = ref('');
const apiResponse = ref(null);
const isLoading = ref(false);
const error = ref(null);
const lastOperationType = ref('');
const activeSheetGid = ref(null);
const showWelcomeMessage = ref(true);

const isAdmin = computed(() => userRole.value === 'admin');
const sheetEmbedUrl = computed(() => { /* ... */ });
const sheetDirectLink = computed(() => { /* ... */ });
const tableHeaders = computed(() => { /* ... */ });
const tableData = computed(() => { /* ... */ });
const isTableVisible = computed(() => tableData.value.length > 0);

// --- MODIFIÉ : Gestion d'erreur améliorée ---
async function callApi(url, method = 'GET') {
  if (!user.value) { error.value = "Vous devez être connecté."; return; }
  showWelcomeMessage.value = false;
  isLoading.value = true; error.value = null; apiResponse.value = null;
  try {
    const token = await user.value.getIdToken();
    const headers = { 'Authorization': `Bearer ${token}` };
    const fullUrl = `${API_BASE_URL}${url}`;
    const response = await fetch(fullUrl, { method, headers });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || `Le serveur a répondu avec une erreur ${response.status}`);
    }
    apiResponse.value = data;
    if (data.worksheet_gid) activeSheetGid.value = data.worksheet_gid;
  } catch (err) {
    error.value = err.message;
    activeSheetGid.value = null; 
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
  if (reportType === 'weekly-frequency') url = `/analysis/weekly-frequency/${selectedDate.value}`;
  else if (reportType === 'daily-frequency') url = `/analysis/daily-frequency/${selectedDate.value}`;
  else if (reportType === 'companions') {
    if (!selectedNumber.value) { error.value = "Veuillez entrer un numéro."; return; }
    url = `/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`;
  }
  lastOperationType.value = reportType;
  await callApi(url);
}
</script>
<template>
  <div v-if="!isAuthReady" class="loading-screen">
    <p>Chargement de l'application...</p>
  </div>

  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2>Connexion - LE GUIDE DES FOURCASTER</h2>
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
          <h2>Paramètres d'Analyse</h2>
          <input type="date" v-model="selectedDate" />
          <input type="number" v-model="selectedNumber" placeholder="N° pour analyse compagnons" />
        </section>

        <section class="card">
          <h2>Analyse Visuelle (Modifie le Sheet)</h2>
          <div class="button-group-vertical">
            <button @click="runVisualAnalysis('highlight-day')" :disabled="isLoading || !selectedDate">Surligner ce Jour</button>
            <button @click="runVisualAnalysis('process-entire-week')" :disabled="isLoading || !selectedDate">Traiter Toute la Semaine</button>
          </div>
        </section>
        
        <section class="card">
          <h2>Rapports Analytiques (Lecture)</h2>
          <div class="button-group-vertical">
            <button @click="runReport('daily-frequency')" :disabled="isLoading || !selectedDate">Classement Journalier</button>
            <button @click="runReport('weekly-frequency')" :disabled="isLoading || !selectedDate">Classement Semaine</button>
            <button @click="runReport('companions')" :disabled="isLoading || !selectedDate || !selectedNumber">Analyser Compagnons</button>
          </div>
        </section>
      </div>

      <div class="results-column">
        <section class="card results-card">
          <h2>Visualisation & Rapports</h2>
          <div v-if="isLoading" class="loader">Chargement...</div>
          <div v-if="error" class="error-box">{{ error }}</div>
          
          <div v-if="apiResponse && apiResponse.message" class="success-box">
             ✅ {{ apiResponse.message }}
             <a :href="sheetDirectLink" target="_blank" class="external-link">Ouvrir l'onglet ↗</a>
          </div>

          <div class="sheet-container">
            <iframe :key="sheetEmbedUrl" :src="sheetEmbedUrl">Chargement...</iframe>
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

          <div v-if="apiResponse && apiResponse.ai_strategic_analysis" class="ai-analysis">
            <h3>🧠 Analyse Stratégique de l'IA</h3>
            <p>{{ apiResponse.ai_strategic_analysis }}</p>
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
  input { width: 100%; padding: 0.75rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box; }
  input[type="number"] { margin-top: 1rem; }
  .button-group-vertical { display: flex; flex-direction: column; gap: 0.5rem; }
  .button-group-horizontal { display: flex; flex-direction: row; gap: 1rem; }
  button { padding: 0.8rem; font-size: 1rem; font-weight: bold; color: white; background-color: #007bff; border: none; border-radius: 5px; cursor: pointer; width: 100%;}
  button.danger { background-color: #e53545; }
  button:disabled { background-color: #ccc; cursor: not-allowed; }
  .results-card { min-height: 80vh; }
  .error-box, .loader, .success-box { padding: 1rem; border-radius: 4px; text-align: center; margin-bottom: 1rem; }
  .error-box { background-color: #ffebee; color: #c62828; }
  .success-box { background-color: #e8f5e9; color: #2e7d32; font-weight: bold; display: flex; align-items: center; justify-content: space-between; }
  .external-link { font-weight: bold; text-decoration: none; }
  .styled-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  .styled-table th, .styled-table td { border: 1px solid #ddd; padding: 8px; text-align: center; }
  .styled-table th { background-color: #f2f2f2; }
  .ai-analysis { background-color: #fffbe6; border-left: 5px solid #ffc107; padding: 1rem; margin-top: 1rem; border-radius: 4px; }
  .ai-analysis h3 { margin-top: 0; }
  .ai-analysis p { line-height: 1.6; white-space: pre-wrap; }
  .sheet-container { width: 100%; height: 65vh; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-top: 1rem; }
  iframe { width: 100%; height: 100%; border: 0; }
</style>