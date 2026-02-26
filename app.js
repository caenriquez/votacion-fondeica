import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLSUgajTAG3aPEir4J7sBraZfLMHnDMU4",
  authDomain: "votacion-fondeica.firebaseapp.com",
  projectId: "votacion-fondeica",
  storageBucket: "votacion-fondeica.firebasestorage.app",
  messagingSenderId: "150233243736",
  appId: "1:150233243736:web:2be9dd6e4c050561c9ea2d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

// Panels
const panelIngreso = $("panelIngreso");
const panelCandidatos = $("panelCandidatos");
const panelTicket = $("panelTicket");

// Inputs / mensajes
const msg = $("msg");
const btnIngresar = $("btnIngresar");

// Ticket elements
const tTicket = $("tTicket");
const tFecha = $("tFecha");
const tTexto = $("tTexto");
const tCedulaMask = $("tCedulaMask");

const btnCompartirWhats = $("btnCompartirWhats");
const btnDescargarPDF = $("btnDescargarPDF");
const btnNuevo = $("btnNuevo");

let usuario = { nombre: "", cedula: "" };
let ticketActual = { id: "", fecha: "", candidato: "" };

function normalizarCedula(value) {
  return String(value || "").replace(/\D/g, "").trim();
}
function normalizarNombre(value) {
  return String(value || "").trim();
}

function maskCedula(cedula) {
  if (cedula.length <= 4) return "Cédula: ****";
  const last4 = cedula.slice(-4);
  return `Cédula: ****${last4}`;
}

function generarTicketId() {
  // Ej: FND-20260301-8K2Q9A
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FND-${y}${m}${day}-${rand}`;
}

function fechaBonita() {
  const d = new Date();
  return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

// Guarda voto (1 voto por cédula: si repite, Firestore lo considera update y reglas lo bloquean)
async function registrarVoto({ nombre, cedula, candidato, ticketId, fecha }) {
  const ref = doc(db, "votos", cedula);
  await setDoc(ref, {
    nombre,
    cedula,
    candidato,
    ticketId,
    fechaTexto: fecha,
    createdAt: serverTimestamp()
  });
}

function mostrarTicket({ nombre, cedula, candidato, ticketId, fecha }) {
  tTicket.textContent = ticketId;
  tFecha.textContent = fecha;
  tTexto.textContent = `Yo ${nombre}, voté por ${candidato}.`;
  tCedulaMask.textContent = maskCedula(cedula);

  panelIngreso.classList.add("hidden");
  panelCandidatos.classList.add("hidden");
  panelTicket.classList.remove("hidden");
}

function compartirWhatsApp(nombre, candidato, ticketId, fecha) {
  const mensaje = `✅ Ticket ${ticketId}\nFecha: ${fecha}\nYo ${nombre}, voté por ${candidato}.`;
  const texto = encodeURIComponent(mensaje);

  // Abre WhatsApp (celular) o WhatsApp Web (PC)
  window.open(`https://api.whatsapp.com/send?text=${texto}`, "_blank");
}

function descargarPDF() {
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF();

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(16);
  docPdf.text("VOTACIÓN FONDEICA - TICKET", 14, 20);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(12);
  docPdf.text(`Ticket: ${ticketActual.id}`, 14, 35);
  docPdf.text(`Fecha: ${ticketActual.fecha}`, 14, 43);

  docPdf.setFont("helvetica", "bold");
  docPdf.text(`Yo ${usuario.nombre}, voté por ${ticketActual.candidato}.`, 14, 60);

  docPdf.setFont("helvetica", "normal");
  docPdf.text(maskCedula(usuario.cedula), 14, 70);

  docPdf.save(`ticket_${ticketActual.id}.pdf`);
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

  panelIngreso.classList.add("hidden");
  panelCandidatos.classList.remove("hidden");
});

// Votar
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-vote[data-candidato]");
  if (!btn) return;

  const candidato = btn.getAttribute("data-candidato");

  try {
    btn.disabled = true;
    btn.textContent = "Registrando...";

    const ticketId = generarTicketId();
    const fecha = fechaBonita();

    await registrarVoto({
      nombre: usuario.nombre,
      cedula: usuario.cedula,
      candidato,
      ticketId,
      fecha
    });

    ticketActual = { id: ticketId, fecha, candidato };

    mostrarTicket({
      nombre: usuario.nombre,
      cedula: usuario.cedula,
      candidato,
      ticketId,
      fecha
    });
 } catch (err) {
  console.error(err);

  // Cuando ya existe el documento, Firestore bloquea por reglas -> permission-denied
  msg.textContent = "❌ Esta cédula ya registró un voto. No es posible votar de nuevo.";
  msg.style.color = "#b42318";

  panelIngreso.classList.remove("hidden");
  panelCandidatos.classList.add("hidden");
  panelTicket.classList.add("hidden");
}

    panelIngreso.classList.remove("hidden");
    panelCandidatos.classList.add("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Votar";
  }
});

// Compartir WhatsApp
btnCompartirWhats.addEventListener("click", () => {
  compartirWhatsApp(usuario.nombre, ticketActual.candidato, ticketActual.id, ticketActual.fecha);
});

// Descargar PDF
btnDescargarPDF.addEventListener("click", () => {
  descargarPDF();
});

// Nuevo voto
btnNuevo.addEventListener("click", () => {
  // reset
  usuario = { nombre: "", cedula: "" };
  ticketActual = { id: "", fecha: "", candidato: "" };

  $("nombre").value = "";
  $("cedula").value = "";
  msg.textContent = "";

  panelTicket.classList.add("hidden");
  panelIngreso.classList.remove("hidden");
});
