import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// TU firebaseConfig REAL
const firebaseConfig = {
  apiKey: "AIzaSyDLSUgajTAG3aPEir4J7sBraZfLMHnDMU4",
  authDomain: "votacion-fondeica.firebaseapp.com",
  projectId: "votacion-fondeica",
  storageBucket: "votacion-fondeica.firebasestorage.app",
  messagingSenderId: "150233243736",
  appId: "1:150233243736:web:2be9dd6e4c050561c9ea2d"
};

// CAMBIA ESTO: WhatsApp destino (sin +, sin espacios)
const WHATSAPP_DESTINO = "57XXXXXXXXXX";

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

// 1 voto por cédula (sin leer). Si ya existe, será UPDATE y Rules lo bloquea.
async function registrarVoto({ nombre, cedula, candidato }) {
  const ref = doc(db, "votos", cedula);

  await setDoc(ref, {
    nombre,
    cedula,
    candidato,
    createdAt: serverTimestamp()
  });
}

function abrirWhatsApp(nombre, candidato) {
  const texto = encodeURIComponent(`Yo ${nombre}, voto por el señor ${candidato}.`);
  window.open(`https://wa.me/${WHATSAPP_DESTINO}?text=${texto}`, "_blank");
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

// Votar
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-vote");
  if (!btn) return;

  const candidato = btn.getAttribute("data-candidato");

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

    abrirWhatsApp(usuario.nombre, candidato);
    panel.classList.add("hidden");
  } catch (err) {
    // Cuando ya votó, el segundo intento es UPDATE y Rules lo bloquea -> permission denied
    msg.textContent = "❌ Esta cédula ya registró un voto (o permisos bloqueados).";
    msg.style.color = "#b42318";
  } finally {
    btn.disabled = false;
    btn.textContent = "Votar";
  }
});
