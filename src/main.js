import './assets/main.css'
import { createApp } from 'vue'
import App from './App.vue'

// Si vous avez un dossier router, importez-le. Sinon, supprimez cette ligne.
// import router from './router' 

const app = createApp(App)

// Si vous avez un dossier router, utilisez-le. Sinon, supprimez cette ligne.
// app.use(router)

app.mount('#app')