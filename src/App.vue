<script setup>
import { ref, onMounted, computed } from 'vue';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// ETAT UTILISATEUR
const user = ref(null);
const userRole = ref('free'); // 'free' ou 'vip'
const subscriptionEnd = ref(null);
const showPaywall = ref(false);
const showGuide = ref(false); 
const isRegistering = ref(false); 

// FORMULAIRES
const email = ref('');
const password = ref('');
const authError = ref('');
const isAuthReady = ref(false);
const userFavorites = ref([]); 
const newFavoriteInput = ref('');

// INPUTS ANALYSE
const predictionNumber = ref('');
const predictionCompanion = ref('');
const profileNumber = ref('');
const triggerInput = ref(''); 
const selectedDayName = ref('Mercredi');
const selectedHour = ref('Toute la journée'); 
const matrixMode = ref('continuous'); 
const cyclicDay = ref(1);
const favDayName = ref('Tous');
const favHour = ref('Toutes');

// DATES
const selectedDate = ref('');
const startDate = ref('');
const endDate = ref('');
const spotStartDate = ref('');
const spotEndDate = ref('');

// RESULTATS
const standardResult = ref(null);
const dayAnalysisResult = ref(null); 
const deepFavoriteResult = ref(null);
const profileResult = ref(null);
const matrixResult = ref(null);
const isLoading = ref(false);
const error = ref(null);
const viewMode = ref('table');
const lastOperationType = ref('');
const selectedNumber = ref(''); // Pour compagnons

// --- COMPUTED ---
const isVip = computed(() => {
  if (userRole.value === 'admin') return true;
  if (!subscriptionEnd.value) return false;
  const today = new Date();
  const expiry = new Date(subscriptionEnd.value);
  return today <= expiry;
});

const tableHeaders = computed(() => {
  if (!lastOperationType.value) return [];
  if (lastOperationType.value.includes('frequency')) return ['#', 'Numéro', 'Sorties', 'Détails'];
  if (lastOperationType.value === 'companions') return ['#', 'Compagnon', 'Apparu avec'];
  if (lastOperationType.value === 'trigger') return ['#', 'N° Déclencheur', 'Fréquence'];
  if (lastOperationType.value === 'prediction') return ['#', 'Numéro Suivant (Probable)', 'Fréquence']; 
  if (lastOperationType.value.includes('kanta-rank')) return ['Paire Kanta', 'Apparitions'];
  return [];
});

const tableData = computed(() => {
  if (standardResult.value?.frequency_ranking) return standardResult.value.frequency_ranking;
  if (standardResult.value?.companion_ranking) return standardResult.value.companion_ranking;
  if (standardResult.value?.trigger_numbers_ranking) return standardResult.value.trigger_numbers_ranking;
  if (standardResult.value?.prediction_ranking) return standardResult.value.prediction_ranking;
  if (standardResult.value?.kanta_pairs) return standardResult.value.kanta_pairs;
  if (standardResult.value?.data) return standardResult.value.data;
  return [];
});
const isTableVisible = computed(() => tableData.value.length > 0);

const chartData = computed(() => {
  const data = tableData.value;
  if (!data || data.length === 0) return null;
  const limitedData = data.slice(0, 20);
  let labels = [], counts = [];
  limitedData.forEach(row => {
    if (row.pair) labels.push(row.pair);
    else if (row.number) labels.push(row.number.toString());
    else if (row.companion) labels.push(row.companion.toString());
    else labels.push('?');
    counts.push(row.count || row.total_hits);
  });
  return { labels, datasets: [{ label: 'Occurrences', backgroundColor: '#4361ee', borderRadius: 4, data: counts }] };
});

const chartOptions = { responsive: true, maintainAspectRatio: false };

// --- INITIALISATION ---
onMounted(() => {
  const today = new Date();
  cyclicDay.value = today.getDate();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  selectedDate.value = `${year}-${month}-${day}`;
  endDate.value = `${year}-${month}-${day}`;
  spotEndDate.value = `${year}-${month}-${day}`;
  
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const startStr = `${oneMonthAgo.getFullYear()}-${(oneMonthAgo.getMonth()+1).toString().padStart(2,'0')}-${oneMonthAgo.getDate().toString().padStart(2,'0')}`;
  startDate.value = startStr;
  spotStartDate.value = startStr;

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      user.value = firebaseUser;
      const docRef = doc(db, "users", firebaseUser.uid);
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          userRole.value = data.role || 'free';
          subscriptionEnd.value = data.subscription_end || null;
          userFavorites.value = data.favorites || []; 
        } else {
          await setDoc(docRef, { role: 'free', subscription_end: null, favorites: [] }, { merge: true });
          userRole.value = 'free';
        }
      } catch (e) { console.error(e); }
    } else { user.value = null; userRole.value = ''; }
    isAuthReady.value = true;
  });
});

// --- AUTH ---
const handleAuth = async () => {
  isLoading.value = true; authError.value = '';
  try {
    if (isRegistering.value) {
      const cred = await createUserWithEmailAndPassword(auth, email.value, password.value);
      await setDoc(doc(db, "users", cred.user.uid), { role: 'free', subscription_end: null, favorites: [] });
      showGuide.value = true; 
    } else {
      await signInWithEmailAndPassword(auth, email.value, password.value);
    }
  } catch (error) { authError.value = "Erreur d'authentification. Vérifiez vos infos."; } 
  finally { isLoading.value = false; }
};
const logout = async () => { await signOut(auth); };

// --- API ---
async function callApi(url, targetVar = 'standard') {
  isLoading.value = true; error.value = null;
  if (targetVar === 'standard') standardResult.value = null;
  try {
    const token = await user.value.getIdToken();
    const headers = { 'Authorization': `Bearer ${token}` };
    const response = await fetch(`${API_BASE_URL}${url}`, { method: 'GET', headers });
    
    // GESTION ERREUR 403 (PAYWALL)
    if (response.status === 403) {
       showPaywall.value = true;
       throw new Error("🔒 ACCÈS VIP REQUIS");
    }
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || `Erreur ${response.status}`);
    
    if (targetVar === 'specialist') dayAnalysisResult.value = data;
    else if (targetVar === 'deep') deepFavoriteResult.value = data;
    else if (targetVar === 'profile') profileResult.value = data;
    else if (targetVar === 'matrix') matrixResult.value = data;
    else standardResult.value = data;

    viewMode.value = 'table';
  } catch (err) { error.value = err.message; } 
  finally { isLoading.value = false; }
}

// --- HELPERS ---
function requireVip(callback) {
  if (isVip.value) { callback(); } else { showPaywall.value = true; }
}

// --- ACTIONS ---
async function runRangeAnalysis() {
  if (!startDate.value) return;
  lastOperationType.value = 'ranking_rich';
  await callApi(`/analysis/frequency-by-range?start_date=${startDate.value}&end_date=${endDate.value}`, 'standard');
}

async function runTimeMatrix() { requireVip(async () => {
  matrixResult.value = null;
  let url = `/analysis/time-matrix?start_date=${startDate.value}&end_date=${endDate.value}&mode=${matrixMode.value}`;
  if (matrixMode.value === 'cyclic') url += `&target_cyclic_day=${cyclicDay.value}`;
  await callApi(url, 'matrix');
});}

async function runDayAnalysis() { requireVip(async () => {
  await callApi(`/analysis/specific-day-recurrence?day_name=${selectedDayName.value}&target_hour=${selectedHour.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'specialist');
});}

async function analyzeDeepFavorite(item) { requireVip(async () => {
  deepFavoriteResult.value = null;
  await callApi(`/analysis/deep-favorite?target=${item}&start_date=${startDate.value}&end_date=${endDate.value}`, 'deep');
});}

async function runProfileAnalysis() { requireVip(async () => {
  profileResult.value = null;
  await callApi(`/analysis/number-profile?target_number=${profileNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`, 'profile');
});}

async function runPredictionAnalysis() { requireVip(async () => {
  lastOperationType.value = 'simple';
  let url = `/analysis/predict-next?observed_number=${predictionNumber.value}&start_date=${startDate.value}&end_date=${endDate.value}`;
  if (predictionCompanion.value) url += `&observed_companion=${predictionCompanion.value}`;
  await callApi(url, 'standard');
});}

async function runTriggerAnalysis() { requireVip(async () => {
  lastOperationType.value = 'simple'; 
  const parts = triggerInput.value.replace(/[^0-9]/g, ' ').trim().split(/\s+/);
  let url = `/analysis/trigger-numbers?target_number=${parts[0]}&start_date=${startDate.value}&end_date=${endDate.value}`; 
  if (parts.length > 1) url += `&companion_number=${parts[1]}`; 
  await callApi(url, 'standard'); 
});}

async function runSingleDayVisual(mode) { requireVip(async () => {
  lastOperationType.value = 'visual'; 
  await callApi(`/analysis/highlight-range?start_date=${selectedDate.value}&end_date=${selectedDate.value}&mode=${mode}`, 'standard'); 
});}

async function runReport(reportType) { requireVip(async () => {
  if (reportType === 'daily-frequency') {
      lastOperationType.value = 'ranking_rich';
      await callApi(`/analysis/daily-frequency/${selectedDate.value}`, 'standard');
  }
  else if (reportType === 'weekly-frequency') {
      lastOperationType.value = 'ranking_rich';
      await callApi(`/analysis/weekly-frequency/${selectedDate.value}`, 'standard');
  }
  else if (reportType === 'companions') { 
      lastOperationType.value = 'simple'; 
      await callApi(`/analysis/companions/${selectedNumber.value}?week_date_str=${selectedDate.value}`, 'standard'); 
  }
});}

async function runKantaReport() { requireVip(async () => {
  lastOperationType.value = 'simple'; 
  await callApi(`/analysis/kanta-daily-rank/${selectedDate.value}`, 'standard'); 
});}

// Favoris (Ajout local possible, mais analyse payante)
async function addFavorite() {
  const input = newFavoriteInput.value.trim(); if(!input) return;
  const userRef = doc(db, "users", user.value.uid);
  userFavorites.value.push(input);
  await setDoc(userRef, { favorites: arrayUnion(input) }, { merge: true });
  newFavoriteInput.value = '';
}
async function removeFavorite(item) {
  const userRef = doc(db, "users", user.value.uid);
  userFavorites.value = userFavorites.value.filter(n => n !== item);
  await updateDoc(userRef, { favorites: arrayRemove(item) });
}

function contactWhatsApp() {
  window.open("https://wa.me/22507XXXXXXXX?text=Bonjour, je veux activer mon compte VIP Le Guide.", "_blank");
}
</script>

<template>
  <div v-if="!isAuthReady" class="loading-screen"><p>Chargement...</p></div>
  
  <div v-else-if="!user" class="login-wrapper">
    <div class="login-box">
      <h2>{{ isRegistering ? 'INSCRIPTION GRATUITE' : 'CONNEXION' }}</h2>
      <p style="text-align:center; color:#666; font-size:0.9rem; margin-bottom:20px;">
        Accédez à la puissance de l'IA pour vos jeux.
      </p>
      <form @submit.prevent="handleAuth">
        <div class="input-group"><label>Email</label><input type="email" v-model="email" required /></div>
        <div class="input-group"><label>Mot de passe</label><input type="password" v-model="password" required /></div>
        <button type="submit" class="login-button" :disabled="isLoading">{{ isLoading ? '...' : (isRegistering ? "S'inscrire" : 'Se Connecter') }}</button>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
        <p class="switch-auth">
          <span v-if="!isRegistering">Pas de compte ? <a @click="isRegistering = true">Créer un compte</a></span>
          <span v-else>Déjà inscrit ? <a @click="isRegistering = false">Se connecter</a></span>
        </p>
      </form>
    </div>
  </div>

  <main v-else class="dashboard">
    <header>
      <h1>LE GUIDE <span class="version-tag">V90</span></h1>
      <div class="user-info">
        <span v-if="isVip" class="vip-badge">👑 VIP ACTIF</span>
        <span v-else class="free-badge">GRATUIT</span>
        <button @click="showGuide = true" class="guide-btn-header">📘 GUIDE & STRATÉGIES</button>
        <button @click="logout" class="logout-button">Sortir</button>
      </div>
    </header>

    <div class="main-layout">
      <!-- CONTROLS -->
      <div class="controls-column">
        
        <!-- GRATUIT -->
        <section class="card free-card">
          <div class="boss-header">
             <h2>📊 FRÉQUENCE PÉRIODE (Top 10)</h2>
             <span class="badge-free">GRATUIT</span>
          </div>
          <p class="small-text">Détectez les numéros en forme sur une période.</p>
          <div class="date-picker-row"><input type="date" v-model="startDate"/><input type="date" v-model="endDate"/></div>
          <button @click="runRangeAnalysis" :disabled="isLoading||!startDate" class="free-btn">LANCER L'ANALYSE GRATUITE</button>
        </section>

        <!-- VIP -->
        <section class="card matrix-card">
          <div class="boss-header"><h2>🕰️ MATRICE TEMPORELLE</h2><span class="badge-spec">VIP</span></div>
          <div class="tabs"><button @click="matrixMode='continuous'" :class="{active: matrixMode==='continuous'}">CONTINU</button><button @click="matrixMode='cyclic'" :class="{active: matrixMode==='cyclic'}">CYCLIQUE</button></div>
          <div v-if="matrixMode==='cyclic'" style="margin-bottom:10px;"><label>Jour (1-31):</label><input type="number" v-model="cyclicDay" min="1" max="31"/></div>
          <button @click="runTimeMatrix" :disabled="isLoading" class="spec-btn"><span v-if="!isVip">🔒 </span>ANALYSER & PRÉDIRE</button>
        </section>
        
        <section class="card spec-card">
          <div class="boss-header"><h2>📅 ANALYSTE SPÉCIALISTE</h2><span class="badge-spec">VIP</span></div>
          <label>Jour :</label><select v-model="selectedDayName"><option>Lundi</option><option>Mardi</option><option>Mercredi</option><option>Jeudi</option><option>Vendredi</option><option>Samedi</option><option>Dimanche</option></select>
          <label>Heure :</label><select v-model="selectedHour"><option>Toute la journée</option><option>01H</option><option>03H</option><option>07H</option><option>08H</option><option>10H</option><option>13H</option><option>16H</option><option>19H</option><option>21H</option><option>22H</option><option>23H</option></select>
          <button @click="runDayAnalysis" :disabled="isLoading" class="spec-btn"><span v-if="!isVip">🔒 </span>SCANNER JOUR</button>
        </section>
        
        <section class="card">
          <h2>⭐ Mes Numéros Favoris</h2>
          <div class="favorites-input-group"><input type="text" v-model="newFavoriteInput" placeholder="Ex: 7" @keyup.enter="addFavorite"/><button @click="addFavorite" :disabled="!newFavoriteInput" class="btn-small">Ajouter</button></div>
          <div v-if="userFavorites.length>0" class="favorites-list"><div v-for="item in userFavorites" :key="item" class="favorite-chip"><span class="fav-label">{{ item }}</span><div class="fav-actions"><button @click="analyzeDeepFavorite(item)" class="icon-btn">⚡</button></div><span @click="removeFavorite(item)" class="fav-delete">×</span></div></div>
          <p v-if="!isVip" class="lock-msg">🔒 Analyse réservée aux VIP</p>
        </section>
        
        <section class="card">
          <h2>Rapports Ponctuels</h2>
          <input type="date" v-model="selectedDate"/>
          <div class="button-group-vertical" style="margin-top:10px;">
             <button @click="runSingleDayVisual('frequency')" :disabled="isLoading||!selectedDate"><span v-if="!isVip">🔒 </span>🎨 Surlignage Jour</button>
             <button @click="runSingleDayVisual('kanta')" :disabled="isLoading||!selectedDate"><span v-if="!isVip">🔒 </span>🎨 Surlignage Kanta</button>
          </div>
          <hr>
          <div class="button-group-vertical">
            <button @click="runReport('daily-frequency')" :disabled="isLoading||!selectedDate"><span v-if="!isVip">🔒 </span>Classement Jour</button>
            <button @click="runReport('weekly-frequency')" :disabled="isLoading||!selectedDate"><span v-if="!isVip">🔒 </span>Classement Semaine</button>
            <hr>
            <button @click="runKantaReport" :disabled="isLoading||!selectedDate"><span v-if="!isVip">🔒 </span>Kanta Rank</button>
            <div class="input-group" style="margin-top:10px;">
                <input type="number" v-model="selectedNumber" placeholder="N° Compagnons"/>
                <button @click="runReport('companions')" :disabled="isLoading||!selectedDate||!selectedNumber"><span v-if="!isVip">🔒 </span>Analyser</button>
            </div>
          </div>
        </section>
        
        <section class="card"><h2>Période & Profilage</h2><input type="number" v-model="profileNumber" placeholder="N° Profil"/><button @click="runProfileAnalysis" :disabled="isLoading||!startDate||!profileNumber"><span v-if="!isVip">🔒 </span>Générer Profil</button></section>
        <section class="card prophet-card"><h2>🔮 Le Prophète</h2><input type="number" v-model="predictionNumber" placeholder="N° vu"/><button @click="runPredictionAnalysis" :disabled="isLoading||!startDate||!predictionNumber" class="prophet-btn"><span v-if="!isVip">🔒 </span>Voir Futur</button></section>
        <section class="card"><h2>IA Avancée</h2><input type="text" v-model="triggerInput" placeholder="Cible"/><button @click="runTriggerAnalysis" :disabled="isLoading||!triggerInput"><span v-if="!isVip">🔒 </span>Déclencheurs ⚡</button></section>
      </div>

      <!-- RESULTATS -->
      <div class="results-column">
        
        <section v-if="standardResult && lastOperationType === 'ranking_rich'" class="card results-card fade-in">
          <div class="spec-header"><h2>Classement Top 10</h2><button @click="standardResult=null" class="close-btn">Fermer</button></div>
          <div class="ranking-list"><div v-for="(item, index) in standardResult.data" :key="item.number" class="rank-card"><div class="rank-badge">#{{ index + 1 }}</div><div class="rank-main"><span class="rank-num">{{ item.number }}</span><span class="rank-hits">{{ item.total_hits }} Sorties</span></div><div class="rank-details"><div class="detail-col"><strong>Top Jours</strong> <span v-for="(d, i) in item.top_days">{{d.val}} ({{d.count}}){{ i < item.top_days.length - 1 ? ', ' : '' }}</span></div><div class="detail-col"><strong>Top Heures</strong> <span v-for="(h, i) in item.top_hours">{{h.val}} ({{h.count}}){{ i < item.top_hours.length - 1 ? ', ' : '' }}</span></div><div class="detail-col red"><strong>Déclencheurs</strong> <span v-for="(t, i) in item.top_triggers">{{t.val}} ({{t.count}}){{ i < item.top_triggers.length - 1 ? ', ' : '' }}</span></div><div class="detail-col blue"><strong>Compagnons</strong> <span v-for="(c, i) in item.top_companions">{{c.val}} ({{c.count}}){{ i < item.top_companions.length - 1 ? ', ' : '' }}</span></div><div class="detail-col purple"><strong>Prophètes</strong> <span v-for="(p, i) in item.top_prophets">{{p.val}} ({{p.count}}){{ i < item.top_prophets.length - 1 ? ', ' : '' }}</span></div></div></div></div>
          <div v-if="!isVip" class="teaser-box">
             <h3>🚀 VOUS VOULEZ ALLER PLUS LOIN ?</h3>
             <p>Les VIP savent QUAND jouer ces numéros (Heure exacte, Duo en Or...).</p>
             <button @click="showPaywall = true" class="teaser-btn">DÉBLOQUER TOUT</button>
          </div>
        </section>

        <!-- (Autres blocs résultats standards... gardez les blocs affichage Matrice/Profil de la V86) -->
        <div v-if="matrixResult" class="card result-spec-card" style="border-top:4px solid #ff9800;">
           <div class="spec-header"><h3>🕰️ MATRICE TEMPORELLE</h3><button @click="matrixResult=null" class="close-btn">×</button></div>
           <div v-if="matrixResult.prediction" class="prediction-tab"><div class="best-duo-box" style="background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);"><span class="duo-label">🔮 PRÉDICTION :</span><span class="duo-val">{{ matrixResult.prediction.two_short }}</span></div></div>
           <div class="table-responsive"><table class="spec-table"><thead><tr><th>Date</th><th>Base</th><th>Hits</th></tr></thead><tbody><tr v-for="(row, idx) in matrixResult.matrix_data" :key="idx"><td>{{ row.date }}</td><td class="num-cell">{{ row.base_number }}</td><td><div v-for="h in row.detailed_hits" :key="h.num"><span class="badge-hit">{{ h.num }}</span> ({{ h.time }} - {{ h.reason }})</div></td></tr></tbody></table></div>
        </div>

        <div v-if="!standardResult && !matrixResult && !isLoading" class="welcome-message">
            <h3>Bienvenue sur Le Guide</h3>
            <p v-if="!isVip">Mode <strong>GRATUIT</strong>. Testez "Fréquence Période".</p>
            <p v-else>Mode <strong>VIP ACTIF</strong>. Bon gain !</p>
        </div>
        <div v-if="isLoading" class="loader">Analyse en cours...</div><div v-if="error" class="error-box">{{ error }}</div>
      </div>
    </div>

    <!-- MODAL GUIDE -->
    <div v-if="showGuide" class="modal-overlay">
      <div class="modal-box guide-box">
        <button @click="showGuide = false" class="close-modal-btn">×</button>
        <h2>📘 LE GUIDE DU GAGNANT</h2>
        <div class="guide-content">
          <p>Le Loto est une science. Voici comment gagner :</p>
          <div class="guide-section free-section">
            <h3>GRATUIT : FRÉQUENCE PÉRIODE</h3>
            <p>Utilisez-la pour trouver les numéros "Chauds".</p>
          </div>
          <div class="guide-section vip-section">
            <h3>VIP : L'ARSENAL COMPLET</h3>
            <p><strong>Matrice :</strong> Le calcul mathématique pur.</p>
            <p><strong>Spécialiste :</strong> L'analyse par Heure.</p>
            <div class="price-tag-large">10 000 FCFA / MOIS</div>
            <button @click="showGuide = false; showPaywall = true" class="cta-btn">S'ABONNER</button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL PAYWALL -->
    <div v-if="showPaywall" class="modal-overlay paywall-overlay">
      <div class="modal-box paywall-box">
        <div class="lock-icon">🔒</div>
        <h2>ACCÈS VIP REQUIS</h2>
        <p>Débloquez la puissance totale pour 10 000 FCFA.</p>
        <div class="phone-number">Dépôt Wave : 07 XX XX XX XX</div>
        <button @click="contactWhatsApp" class="whatsapp-btn">📞 ACTIVER MON COMPTE</button>
        <button @click="showPaywall = false" class="close-link">Fermer</button>
      </div>
    </div>

  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&family=Roboto:wght@400;500;700&display=swap');
:root { --primary: #4361ee; --secondary: #3f37c9; --success: #4cc9f0; --danger: #f72585; --dark: #1b263b; --light: #f8f9fa; }
body { font-family: 'Poppins', sans-serif; background-color: #f0f2f5; color: #2c3e50; margin: 0; }
.dashboard { max-width: 98%; margin: 0 auto; padding-top: 10px; }
header { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: white; padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center; }
h1 { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.8rem; margin: 0; }
.version-tag { background: #f72585; padding: 5px 10px; border-radius: 20px; font-size: 0.8rem; }
.main-layout { display: grid; grid-template-columns: 380px 1fr; gap: 25px; padding-bottom: 50px; }
.card { background: white; border-radius: 16px; padding: 1.5rem; box-shadow: 0 10px 30px rgba(0,0,0,0.05); margin-bottom: 20px; }
.matrix-card { border-top: 5px solid #7209b7; } .spec-card { border-top: 5px solid #00b4d8; } .prophet-card { border-top: 5px solid #f72585; }
button { font-family: 'Poppins', sans-serif; font-weight: 600; border-radius: 10px; padding: 12px; cursor: pointer; color: white; background-color: #4361ee; border: none; width: 100%; margin-top: 10px; }
.spec-btn { background: linear-gradient(45deg, #00b4d8, #0077b6); } .prophet-btn { background: linear-gradient(45deg, #f72585, #b5179e); }
.vip-badge { background: #ffd700; color: #000; padding: 5px 10px; border-radius: 20px; font-weight: bold; }
.free-badge { background: #e0e0e0; color: #666; padding: 5px 10px; border-radius: 20px; font-weight: bold; }
.guide-btn-header { background: #fff; color: #4361ee; width: auto; margin: 0 10px; }
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; justify-content: center; align-items: center; }
.modal-box { background: white; width: 90%; max-width: 600px; padding: 30px; border-radius: 20px; text-align: center; }
.price-tag-large { font-size: 2rem; font-weight: 800; color: #ffd700; margin: 10px 0; background: #1b263b; padding: 10px; border-radius: 10px; }
.whatsapp-btn { background: #25D366; } .close-link { background: transparent; color: #999; text-decoration: underline; width: auto; }
</style>