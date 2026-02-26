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

// ✅ Firebase config (tuyo)
const firebaseConfig = {
  apiKey: "AIzaSyDLSUgajTAG3aPEir4J7sBraZfLMHnDMU4",
  authDomain: "votacion-fondeica.firebaseapp.com",
  projectId: "votacion-fondeica",
  storageBucket: "votacion-fondeica.firebasestorage.app",
  messagingSenderId: "150233243736",
  appId: "1:150233243736:web:2be9dd6e4c050561c9ea2d"
};

// ✅ WhatsApp destino fijo (3116403643 con indicativo 57)
const WHATSAPP_DESTINO = "573116403643";

// ✅ Tu cédula responsable (la única que ve el panel de control)
const CEDULA_RESPONSABLE = "1087200716";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

// Panels
const panelIngreso = $("panelIngreso");
const panelCandidatos = $("panelCandidatos");
const panelTicket = $("panelTicket");
const panelResponsable = $("panelResponsable");

// Ingreso
const cedulaInput = $("cedula");
const btnBuscar = $("btnBuscar");
const msg = $("msg");

// Bienvenida
const saludoTitulo = $("saludoTitulo");
const saludoTexto = $("saludoTexto");
const btnVolver = $("btnVolver");

// Ticket
const tTicket = $("tTicket");
const tFecha = $("tFecha");
const tTexto = $("tTexto");
const tCedulaMask = $("tCedulaMask");
const previewMsg = $("previewMsg");
const btnNuevo = $("btnNuevo");

// Responsable
const fileAfiliados = $("fileAfiliados");
const btnImportarAfiliados = $("btnImportarAfiliados");
const importMsg = $("importMsg");
const btnCargarVotos = $("btnCargarVotos");
const btnDescargarVotosCSV = $("btnDescargarVotosCSV");
const tablaVotosBody = $("tablaVotos").querySelector("tbody");

let usuario = { cedula: "", nombre: "" };
let ticketActual = { id: "", fecha: "", candidato: "" };
let votosCache = [];

// ---------- Utilidades ----------
function normalizarCedula(v) {
  return String(v || "").replace(/\D/g, "").trim();
}

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

// ---------- Firestore ----------
async function buscarAfiliado(cedula) {
  const ref = doc(db, "afiliados", cedula);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data(); // { nombre }
}

// Voto: docId = cedula (para evitar votos repetidos si Rules bloquean update)
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

// Importar afiliados desde Excel: tu archivo (B=cédula, C=nombre)
async function importarAfiliadosDesdeXlsx(file) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  let count = 0;
  let batch = writeBatch(db);
  let ops = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const ced = normalizarCedula(row[1]); // Columna B
    const nom = String(row[2] || "").trim(); // Columna C
    if (!ced || !nom) continue;

    batch.set(doc(db, "afiliados", ced), { nombre: nom }, { merge: true });
    ops++;
    count++;

    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  return count;
}

// ---------- Pantallas ----------
function mostrarPanelCandidatos() {
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
    msg.style.color = "#111";
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

// ---------- Eventos ----------

// Ingresar (buscar afiliado o entrar como responsable)
btnBuscar.addEventListener("click", async () => {
  const cedula = normalizarCedula(cedulaInput.value);

  if (!cedula) {
    msg.textContent = "Por favor digite su cédula.";
    msg.style.color = "#b42318";
    return;
  }

  // ✅ Si es tu cédula, ENTRA sin depender de afiliados (para poder importar Excel)
  if (cedula === CEDULA_RESPONSABLE) {
    usuario = { cedula, nombre: "Responsable" };

    saludoTitulo.textContent = "Hola 👋";
    saludoTexto.textContent =
      "Bienvenido(a) a las elecciones para el representante de la 61ª Asamblea Ordinaria de Delegados. " +
      "Puedes votar y también usar el panel de control para importar afiliados y revisar votos.";

    panelResponsable.classList.remove("hidden");
    msg.textContent = "";
    mostrarPanelCandidatos();
    return;
  }

  // Afiliado normal: debe existir en afiliados
  msg.textContent = "Buscando afiliado...";
  msg.style.color = "#111";

  try {
    const data = await buscarAfiliado(cedula);

    if (!data?.nombre) {
      msg.textContent = "❌ Esta cédula no está registrada en el listado de afiliados. (Primero importa el Excel).";
      msg.style.color = "#b42318";
      return;
    }

    usuario = { cedula, nombre: data.nombre };

    saludoTitulo.textContent = `Hola, ${usuario.nombre} 👋`;
    saludoTexto.textContent =
      "Bienvenido(a) a las elecciones para el representante de la 61ª Asamblea Ordinaria de Delegados. " +
      "Por favor selecciona tu candidato y registra tu voto.";

    panelResponsable.classList.add("hidden");
    msg.textContent = "";
    mostrarPanelCandidatos();

  } catch (e) {
    console.error(e);
    msg.textContent = `❌ Error consultando afiliados: ${e?.code || ""} ${e?.message || e}`;
    msg.style.color = "#b42318";
  }
});

btnVolver.addEventListener("click", () => {
  mostrarIngreso(false);
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
    msg.textContent = `❌ No se pudo registrar el voto: ${err?.code || ""} ${err?.message || err}`;
    msg.style.color = "#b42318";
    mostrarIngreso(false);
  } finally {
    btn.disabled = false;
    btn.textContent = "Votar";
  }
});

// Nuevo voto
btnNuevo.addEventListener("click", () => {
  mostrarIngreso(true);
});

// Panel responsable: Importar afiliados
btnImportarAfiliados.addEventListener("click", async () => {
  if (!fileAfiliados.files || !fileAfiliados.files[0]) {
    importMsg.textContent = "❌ Selecciona el Excel (.xlsx) primero.";
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
    importMsg.textContent = `❌ No se pudo importar: ${e?.code || ""} ${e?.message || e}`;
    importMsg.style.color = "#b42318";
  }
});

// Panel responsable: Ver votos
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
    tablaVotosBody.innerHTML = `<tr><td colspan='5'>❌ Error cargando votos: ${e?.code || ""} ${e?.message || e}</td></tr>`;
  }
});

// Panel responsable: Descargar votos CSV
btnDescargarVotosCSV.addEventListener("click", () => {
  const rows = [
    ["Cedula", "Nombre", "Candidato", "Fecha", "Ticket"],
    ...votosCache.map(v => [v.cedula || "", v.nombre || "", v.candidato || "", v.fechaTexto || "", v.ticketId || ""])
  ];
  downloadCSV("votos_fondeica.csv", rows);
});
