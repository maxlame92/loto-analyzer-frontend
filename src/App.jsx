import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = 'https://analyzer-oxxt.onrender.com';

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false); // <-- NOUVEAU : pour changer la couleur du message

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMessage('Création du compte en cours...');
    setIsError(false);

    // Validation simple côté client
    if (password.length < 6) {
      setMessage('Erreur: Le mot de passe doit contenir au moins 6 caractères.');
      setIsError(true);
      return; // On arrête le processus ici
    }

    try {
      const response = await axios.post(`${API_URL}/auth/create-user`, {
        email: email,
        password: password,
      });
      setMessage(response.data.message);
      setIsError(false);
    } catch (error) {
      setIsError(true);
      if (error.response) {
        // On essaie de donner une erreur plus claire
        const firebaseError = error.response.data.detail;
        if (firebaseError.includes("EMAIL_EXISTS")) {
          setMessage("Erreur: Cette adresse e-mail est déjà utilisée.");
        } else if (firebaseError.includes("INVALID_EMAIL")) {
          setMessage("Erreur: Le format de l'adresse e-mail est invalide.");
        } else {
          setMessage(`Erreur: ${firebaseError}`);
        }
      } else {
        setMessage('Erreur: Impossible de contacter le serveur.');
      }
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Loto Bonheur AI Analyzer</h1>
        <div className="form-container">
          <h2>Créer un compte</h2>
          <form onSubmit={handleCreateUser}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="votre.email@example.com"
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Mot de passe</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {/* // <-- NOUVEAU : Indication pour l'utilisateur --> */}
              <small className="password-hint">6 caractères minimum</small>
            </div>
            <button type="submit">S'inscrire</button>
          </form>
          {/* // <-- NOUVEAU : La classe du message change si c'est une erreur --> */}
          {message && <p className={`message ${isError ? 'error' : 'success'}`}>{message}</p>}
        </div>
      </header>
    </div>
  );
}

export default App;