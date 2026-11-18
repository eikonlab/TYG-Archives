/*
 * main.jsx — POINT D'ENTRÉE
 * ------------------------------------------------------------
 * Rôle : premier fichier exécuté (appelé par index.html).
 *        Il "branche" React sur la <div id="root"> de la page
 *        et y affiche le composant <App />.
 * Utilise : App.jsx (toute l'application) et App.css (les styles).
 *
 * StrictMode : mode de développement de React qui exécute certains
 * effets deux fois pour détecter les bugs. N'a aucun effet en production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./App.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
