import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase config (tuyo)
const firebaseConfig = {
  apiKey: "AIzaSyDLSUgajTAG3aPEir4J7sBraZfLMHnDMU4",
  authDomain: "votacion-fondeica.firebaseapp.com",
  projectId: "votacion-fondeica",
  storageBucket: "votacion-fondeica.firebasestorage.app",
  messagingSenderId: "150233243736",
  appId: "1:150233243736:web:2be9dd6e4c050561c9ea2d"
};

// WhatsApp destino fijo
const WHATSAPP_DESTINO = "573116403643";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const $ = (id) => document.getElementById(id);

// Panels
const panelIngreso = $("panelIngreso");
const panelCandidatos = $("panelCandidatos");
const panelTicket = $("panelTicket");
const panelAdminLogin = $("panelAdminLogin");
const panelAdmin = $("panelAdmin");

// Afiliado
const cedulaInput = $("cedula");
const btnBuscar = $("btnBuscar");
const msg = $("msg");
const boxNombre = $("boxNombre");
const nombreEncontrado = $("nombreEncontrado");
const btnVolver = $("btnVolver");

// Ticket
const tTicket = $("tTicket");
const tFecha = $("tFecha");
const tTexto = $("tTexto");
const tCedulaMask = $("tCedulaMask");
const previewMsg = $("previewMsg");
const btnNuevo = $("btnNuevo");

// Admin login
const adminEmail = $("adminEmail");
const adminPass = $("adminPass");
const btnAdminLogin = $("btnAdminLogin");
const adminMsg = $("adminMsg");

// Admin panel
const adminUid = $("adminUid");
const btnCargarVotos = $("btnCargarVotos");
const btnDescargarVotosCSV = $("btnDescargarVotosCSV");
const btnAdminSalir = $("btnAdminSalir");
const tablaVotosBody = $("tablaVotos").querySelector("tbody");

// Import afiliados
const fileAfiliados = $("fileAfiliados");
const btnImportarAfiliados = $("btnImportarAfiliados");
const importMsg = $("importMsg");

let usuario = { cedula: "", nombre: "" };
let ticketActual = { id: "", fecha: "", candidato: "" };
let votosCache = [];

function normalizarCedula(v) { return String(v || "").replace(/\D/g, "").trim(); }

function maskCedula(cedula) {
  if (cedula.length <= 4) return "Cédula: ****";
  return `Cédula: ****${cedula.slice(-4)}`;
}

function generarTicketId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FND-${y}${m}${day}-${rand}`;
}

function fechaBonita() {
  return new Date().toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

// Mensaje WhatsApp (SIN ticket)
function construirMensajeWhats(nombre, cedula, candidato, fecha) {
  return `Cordial saludo.\n` +
    `Yo ${nombre}, identificado(a) con cédula de ciudadanía ${cedula}, ` +
    `voto por ${candidato} como representante para la 61ª Asamblea Ordinaria de Delegados, ` +
    `a realizarse el 14 de marzo de 2026.\n` +
    `Fecha y hora del registro: ${fecha}`;
}

function abrirWhatsApp(textoPlano) {
  const texto = encodeURIComponent(textoPlano);
  window.open(`https://wa.me/${WHATSAPP_DESTINO}?text=${texto}`, "_blank");
}

async function buscarAfiliado(cedula) {
  const ref = doc(db, "afiliados", cedula);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data(); // { nombre }
}

async function registrarVoto({ cedula, nombre, candidato, ticketId, fecha }) {
  const ref = doc(db, "votos", cedula);
  await setDoc(ref, {
    cedula,
    nombre,
    candidato,
    ticketId,
    fechaTexto: fecha,
    createdAt: serverTimestamp()
  });
}

function mostrarCandidatos() {
  panelIngreso.classList.add("hidden");
  panelTicket.classList.add("hidden");
  panelCandidatos.classList.remove("hidden");
}

function mostrarIngreso(reset=false) {
  panelCandidatos.classList.add("hidden");
  panelTicket.classList.add("hidden");
  panelIngreso.classList.remove("hidden");
  if (reset) {
    cedulaInput.value = "";
    msg.textContent = "";
    boxNombre.classList.add("hidden");
    nombreEncontrado.textContent = "";
    usuario = { cedula: "", nombre: "" };
  }
}

function mostrarTicket({ candidato, ticketId, fecha }) {
  tTicket.textContent = ticketId;
  tFecha.textContent = fecha;
  tTexto.textContent = `Yo ${usuario.nombre}, voté por ${candidato}.`;
  tCedulaMask.textContent = maskCedula(usuario.cedula);

  const mensaje = construirMensajeWhats(usuario.nombre, usuario.cedula, candidato, fecha);
  previewMsg.value = mensaje;

  panelIngreso.classList.add("hidden");
  panelCandidatos.classList.add("hidden");
  panelTicket.classList.remove("hidden");

  // WhatsApp automático
  abrirWhatsApp(mensaje);
}

function downloadCSV(filename, rows) {
  const csv = rows.map(r =>
    r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")
  ).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ====================
// IMPORTAR AFILIADOS XLSX (MASIVO)
// ====================
async function importarAfiliadosDesdeXlsx(file) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];

  // convierte a arrays (incluye encabezados)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Esperado: columnas tipo [#, CÉDULA, NOMBRE] o [CÉDULA, NOMBRE]
  // Tomamos cédula/nombre desde la fila 2 en adelante
  let count = 0;

  // Firestore batch: máximo 500 operaciones por batch
  let batch = writeBatch(db);
  let ops = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    // Detectar cédula y nombre:
    // Si hay 3 columnas: [idx, cedula, nombre]
    // Si hay 2 columnas: [cedula, nombre]
    let ced = row.length >= 3 ? row[1] : row[0];
    let nom = row.length >= 3 ? row[2] : row[1];

    ced = normalizarCedula(ced);
    nom = String(nom || "").trim();

    if (!ced || !nom) continue;

    const ref = doc(db, "afiliados", ced);
    batch.set(ref, { nombre: nom }, { merge: true });
    ops++;
    count++;

    if (ops === 450) { // margen seguro
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  return count;
}

// --- AFILIADO: ingresar por cédula
btnBuscar.addEventListener("click", async () => {
  const cedula = normalizarCedula(cedulaInput.value);
  if (!cedula) {
    msg.textContent = "Por favor digite su cédula.";
    msg.style.color = "#b42318";
    return;
  }

  msg.textContent = "Buscando afiliado...";
  msg.style.color = "#111";

  try {
    const data = await buscarAfiliado(cedula);
    if (!data?.nombre) {
      msg.textContent = "❌ Cédula no registrada en el listado de afiliados.";
      msg.style.color = "#b42318";
      boxNombre.classList.add("hidden");
      return;
    }

    usuario = { cedula, nombre: data.nombre };
    nombreEncontrado.textContent = data.nombre;
    boxNombre.classList.remove("hidden");

    msg.textContent = "✅ Afiliado encontrado. Ahora puede votar.";
    msg.style.color = "#067647";

    mostrarCandidatos();
  } catch (e) {
    console.error(e);
    msg.textContent = "❌ Error consultando afiliados.";
    msg.style.color = "#b42318";
  }
});

btnVolver.addEventListener("click", () => {
  mostrarIngreso(false);
});

// --- VOTAR
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
      cedula: usuario.cedula,
      nombre: usuario.nombre,
      candidato,
      ticketId,
      fecha
    });

    ticketActual = { id: ticketId, fecha, candidato };
    mostrarTicket({ candidato, ticketId, fecha });

  } catch (err) {
    console.error(err);
    msg.textContent = "❌ Esta cédula ya registró un voto. No es posible votar de nuevo.";
    msg.style.color = "#b42318";
    mostrarIngreso(false);
  } finally {
    btn.disabled = false;
    btn.textContent = "Votar";
  }
});

btnNuevo.addEventListener("click", () => {
  mostrarIngreso(true);
});

// --- ADMIN: login
btnAdminLogin.addEventListener("click", async () => {
  adminMsg.textContent = "Ingresando...";
  try {
    await signInWithEmailAndPassword(auth, adminEmail.value.trim(), adminPass.value);
    adminMsg.textContent = "✅ Sesión iniciada.";
    adminMsg.style.color = "#067647";
  } catch (e) {
    console.error(e);
    adminMsg.textContent = "❌ No se pudo iniciar sesión (revisa correo/contraseña).";
    adminMsg.style.color = "#b42318";
  }
});

btnAdminSalir.addEventListener("click", async () => {
  await signOut(auth);
});

// Admin: estado
onAuthStateChanged(auth, (user) => {
  if (user) {
    panelAdminLogin.classList.add("hidden");
    panelAdmin.classList.remove("hidden");
    adminUid.textContent = user.uid;
  } else {
    panelAdmin.classList.add("hidden");
    panelAdminLogin.classList.remove("hidden");
    adminUid.textContent = "";
    tablaVotosBody.innerHTML = "";
    votosCache = [];
    importMsg.textContent = "";
  }
});

// Admin: importar afiliados
btnImportarAfiliados.addEventListener("click", async () => {
  if (!fileAfiliados.files || !fileAfiliados.files[0]) {
    importMsg.textContent = "❌ Seleccione un archivo .xlsx primero.";
    importMsg.style.color = "#b42318";
    return;
  }

  importMsg.textContent = "Importando afiliados...";
  importMsg.style.color = "#111";

  try {
    const total = await importarAfiliadosDesdeXlsx(fileAfiliados.files[0]);
    importMsg.textContent = `✅ Importación finalizada. Afiliados procesados: ${total}`;
    importMsg.style.color = "#067647";
  } catch (e) {
    console.error(e);
    importMsg.textContent = "❌ No se pudo importar. Verifica que eres admin (admins/UID) y las Rules.";
    importMsg.style.color = "#b42318";
  }
});

// Admin: cargar votos
btnCargarVotos.addEventListener("click", async () => {
  tablaVotosBody.innerHTML = "<tr><td colspan='5'>Cargando...</td></tr>";
  votosCache = [];

  try {
    const snap = await getDocs(collection(db, "votos"));
    const rows = [];
    snap.forEach(docu => {
      const v = docu.data();
      votosCache.push(v);
      rows.push(`
        <tr>
          <td>${v.cedula || docu.id}</td>
          <td>${v.nombre || ""}</td>
          <td>${v.candidato || ""}</td>
          <td>${v.fechaTexto || ""}</td>
          <td>${v.ticketId || ""}</td>
        </tr>
      `);
    });
    tablaVotosBody.innerHTML = rows.length ? rows.join("") : "<tr><td colspan='5'>Sin votos</td></tr>";
  } catch (e) {
    console.error(e);
    tablaVotosBody.innerHTML = "<tr><td colspan='5'>❌ No autorizado. Verifica admins/UID y rules.</td></tr>";
  }
});

// Admin: descargar votos CSV (Excel)
btnDescargarVotosCSV.addEventListener("click", () => {
  const rows = [
    ["Cedula", "Nombre", "Candidato", "Fecha", "Ticket"],
    ...votosCache.map(v => [v.cedula || "", v.nombre || "", v.candidato || "", v.fechaTexto || "", v.ticketId || ""])
  ];
  downloadCSV("votos_fondeica.csv", rows);
});
