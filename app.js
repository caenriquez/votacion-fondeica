import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * ========= PASO 1: PEGA AQUÍ TU firebaseConfig REAL (CAMBIAR) =========
 * Firebase Console -> Project settings -> Your apps -> Web app -> firebaseConfig
 */
const firebaseConfig = {
  apiKey: "CAMBIAR",
  authDomain: "CAMBIAR",
  projectId: "CAMBIAR",
  storageBucket: "CAMBIAR",
  messagingSenderId: "CAMBIAR",
  appId: "CAMBIAR"
};

/**
 * ========= PASO 2: PON AQUÍ EL WHATSAPP DESTINO (CAMBIAR) =========
 * Ej: "57XXXXXXXXXX" (sin +, sin espacios)
 */
const WHATSAPP_DESTINO = "57XXXXXXXXXX"; // CAMBIAR

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

const msg = $("msg");
const panel = $("panelCandidatos");
const btnIngresar = $("btnIngresar");

let usuario = { nombre: "", cedula: "" };

function normalizarCedula(value) {
  return String(value || "").replace(/\D/g, "").trim();
}

function normalizarNombre(value) {
  return String(value || "").trim();
}

/**
 * Guardar 1 voto por cédula en Firestore usando el docId = cedula
 * Esto evita duplicados (si intenta votar de nuevo, se bloquea).
 */
async function registrarVoto({ nombre, cedula, candidato }) {
  const ref = doc(db, "votos", cedula);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    if (snap.exists()) {
      throw new Error("Esta cédula ya registró un voto.");
    }

    tx.set(ref, {
      nombre,
      cedula,
      candidato,
      createdAt: serverTimestamp()
    });
  });
}

function abrirWhatsApp(nombre, candidato) {
  // Mensaje ejemplo: "Yo Carlos Caicedo, voto por el señor Luis Enrique Sinisterra."
  const texto = encodeURIComponent(`Yo ${nombre}, voto por el señor ${candidato}.`);
  const url = `https://wa.me/${WHATSAPP_DESTINO}?text=${texto}`;
  window.open(url, "_blank");
}

// Ingresar
btnIngresar.addEventListener("click", () => {
  const nombre = normalizarNombre($("nombre").value);
  const cedula = normalizarCedula($("cedula").value);

  if (!nombre || !cedula) {
    msg.textContent = "Por favor complete Nombre y Cédula.";
    msg.style.color = "#b42318";
    return;
  }

  usuario = { nombre, cedula };
  msg.textContent = "Listo. Ahora seleccione su candidato.";
  msg.style.color = "#111";
  panel.classList.remove("hidden");
});

// Votar (botones)
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-vote");
  if (!btn) return;

  const candidato = btn.getAttribute("data-candidato");

  if (!usuario.nombre || !usuario.cedula) {
    msg.textContent = "Primero ingrese Nombre y Cédula.";
    msg.style.color = "#b42318";
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = "Registrando...";

    await registrarVoto({
      nombre: usuario.nombre,
      cedula: usuario.cedula,
      candidato
    });

    msg.textContent = "✅ Voto registrado correctamente.";
    msg.style.color = "#067647";

    // Abre WhatsApp con mensaje prellenado (usuario confirma Enviar)
    abrirWhatsApp(usuario.nombre, candidato);

    panel.classList.add("hidden");
  } catch (err) {
    msg.textContent = `❌ ${err.message || "No se pudo registrar el voto."}`;
    msg.style.color = "#b42318";
  } finally {
    btn.disabled = false;
    btn.textContent = "Votar";
  }
});
