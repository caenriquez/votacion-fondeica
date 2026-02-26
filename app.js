// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDLSUgajTAG3aPEir4J7sBraZfLMHnDMU4",
  authDomain: "votacion-fondeica.firebaseapp.com",
  projectId: "votacion-fondeica",
  storageBucket: "votacion-fondeica.firebasestorage.app",
  messagingSenderId: "150233243736",
  appId: "1:150233243736:web:2be9dd6e4c050561c9ea2d"
};

// ✅ CAMBIA AQUÍ EL WHATSAPP DESTINO (57 + número)
const WHATSAPP_DESTINO = "573116403643";

// ✅ cédula responsable
const CEDULA_RESPONSABLE = "1087200716";

// Init Firebase (compat)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const $ = (id) => document.getElementById(id);
const normalizarCedula = (v) => String(v || "").replace(/\D/g, "").trim();

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

// ✅ MENSAJE SIN FECHA (como pediste)
function construirMensajeWhats(nombre, cedula, candidato) {
  return (
    "Cordial saludo.\n" +
    `Yo ${nombre}, identificado(a) con cédula de ciudadanía ${cedula}, ` +
    `voto por ${candidato} como representante para la 61ª Asamblea Ordinaria de Delegados, ` +
    "a realizarse el 14 de marzo de 2026."
  );
}

function abrirWhatsApp(textoPlano) {
  const texto = encodeURIComponent(textoPlano);
  const url = `https://wa.me/${WHATSAPP_DESTINO}?text=${texto}`;
  const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (esMovil) window.location.href = url;
  else window.open(url, "_blank");
}

function downloadCSV(filename, rows) {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
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

// DOM
const panelIngreso = $("panelIngreso");
const panelCandidatos = $("panelCandidatos");
const panelTicket = $("panelTicket");
const panelResponsable = $("panelResponsable");

const cedulaInput = $("cedula");
const btnBuscar = $("btnBuscar");
const msg = $("msg");

const saludoTitulo = $("saludoTitulo");
const saludoTexto = $("saludoTexto");
const btnVolver = $("btnVolver");

const tTicket = $("tTicket");
const tFecha = $("tFecha");
const tTexto = $("tTexto");
const tCedulaMask = $("tCedulaMask");
const previewMsg = $("previewMsg");
const btnNuevo = $("btnNuevo");

const fileAfiliados = $("fileAfiliados");
const btnImportarAfiliados = $("btnImportarAfiliados");
const importMsg = $("importMsg");
const btnCargarVotos = $("btnCargarVotos");
const btnDescargarVotosCSV = $("btnDescargarVotosCSV");
const tablaVotosBody = $("tablaVotos").querySelector("tbody");

let usuario = { cedula: "", nombre: "" };
let votosCache = [];

// Firestore
async function buscarAfiliado(cedula) {
  const snap = await db.collection("afiliados").doc(cedula).get();
  if (!snap.exists) return null;
  return snap.data();
}

async function registrarVoto({ cedula, nombre, candidato, ticketId, fecha }) {
  await db.collection("votos").doc(cedula).set({
    cedula,
    nombre,
    candidato,
    ticketId,
    fechaTexto: fecha,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function importarAfiliadosDesdeXlsx(file) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  let count = 0;
  let batch = db.batch();
  let ops = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const ced = normalizarCedula(row[1]); // col B
    const nom = String(row[2] || "").trim(); // col C
    if (!ced || !nom) continue;

    batch.set(db.collection("afiliados").doc(ced), { nombre: nom }, { merge: true });
    ops++;
    count++;

    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return count;
}

function mostrarPanelCandidatos() {
  panelIngreso.classList.add("hidden");
  panelTicket.classList.add("hidden");
  panelCandidatos.classList.remove("hidden");
}

function mostrarIngreso(reset = false) {
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

function mostrarTicket(candidato, ticketId, fecha) {
  tTicket.textContent = ticketId;
  tFecha.textContent = fecha;
  tTexto.textContent = `Yo ${usuario.nombre}, voté por ${candidato}.`;
  tCedulaMask.textContent = maskCedula(usuario.cedula);

  const mensaje = construirMensajeWhats(usuario.nombre, usuario.cedula, candidato);
  previewMsg.value = mensaje;

  panelIngreso.classList.add("hidden");
  panelCandidatos.classList.add("hidden");
  panelTicket.classList.remove("hidden");

  abrirWhatsApp(mensaje);
}

// Ingresar
btnBuscar.addEventListener("click", async () => {
  const cedula = normalizarCedula(cedulaInput.value);

  if (!cedula) {
    msg.textContent = "Por favor digite su cédula.";
    msg.style.color = "#b42318";
    return;
  }

  if (cedula === CEDULA_RESPONSABLE) {
    usuario = { cedula, nombre: "Cristian (Responsable)" };
    saludoTitulo.textContent = "Hola, Cristian 👋";
    saludoTexto.textContent = "Bienvenido(a). Puedes importar afiliados, revisar votos y también votar.";
    panelResponsable.classList.remove("hidden");
    msg.textContent = "";
    mostrarPanelCandidatos();
    return;
  }

  msg.textContent = "Buscando afiliado...";
  msg.style.color = "#111";

  try {
    const data = await buscarAfiliado(cedula);
    if (!data?.nombre) {
      msg.textContent = "❌ Esta cédula no está registrada en afiliados. (Primero importa el Excel).";
      msg.style.color = "#b42318";
      return;
    }

    usuario = { cedula, nombre: data.nombre };
    saludoTitulo.textContent = `Hola, ${usuario.nombre} 👋`;
    saludoTexto.textContent = "Bienvenido(a). Selecciona tu candidato y registra tu voto.";
    panelResponsable.classList.add("hidden");
    msg.textContent = "";
    mostrarPanelCandidatos();
  } catch (e) {
    console.error(e);
    msg.textContent = "❌ Error consultando afiliados.";
    msg.style.color = "#b42318";
  }
});

btnVolver.addEventListener("click", () => mostrarIngreso(false));

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

    await registrarVoto({ cedula: usuario.cedula, nombre: usuario.nombre, candidato, ticketId, fecha });
    mostrarTicket(candidato, ticketId, fecha);
  } catch (err) {
    console.error(err);
    msg.textContent = "❌ No se pudo registrar el voto.";
    msg.style.color = "#b42318";
    mostrarIngreso(false);
  } finally {
    btn.disabled = false;
    btn.textContent = "Votar";
  }
});

btnNuevo.addEventListener("click", () => mostrarIngreso(true));

// Importar afiliados
btnImportarAfiliados.addEventListener("click", async () => {
  if (usuario.cedula !== CEDULA_RESPONSABLE) return;

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
    importMsg.textContent = "❌ No se pudo importar.";
    importMsg.style.color = "#b42318";
  }
});

// Ver votos
btnCargarVotos.addEventListener("click", async () => {
  if (usuario.cedula !== CEDULA_RESPONSABLE) return;

  tablaVotosBody.innerHTML = "<tr><td colspan='6'>Cargando...</td></tr>";
  votosCache = [];

  try {
    const snap = await db.collection("votos").get();
    const rowsHtml = [];

    snap.forEach((docu) => {
      const v = docu.data();
      const ced = v.cedula || docu.id;
      votosCache.push(v);

      rowsHtml.push(`
        <tr>
          <td>${ced}</td>
          <td>${v.nombre || ""}</td>
          <td>${v.candidato || ""}</td>
          <td>${v.fechaTexto || ""}</td>
          <td>${v.ticketId || ""}</td>
          <td><button class="btn btn-ghost btnDel" data-ced="${ced}">Eliminar</button></td>
        </tr>
      `);
    });

    tablaVotosBody.innerHTML = rowsHtml.length ? rowsHtml.join("") : "<tr><td colspan='6'>Sin votos</td></tr>";
  } catch (e) {
    console.error(e);
    tablaVotosBody.innerHTML = "<tr><td colspan='6'>❌ Error cargando votos</td></tr>";
  }
});

// Descargar votos CSV
btnDescargarVotosCSV.addEventListener("click", () => {
  if (usuario.cedula !== CEDULA_RESPONSABLE) return;

  const rows = [
    ["Cedula", "Nombre", "Candidato", "Fecha", "Ticket"],
    ...votosCache.map((v) => [v.cedula || "", v.nombre || "", v.candidato || "", v.fechaTexto || "", v.ticketId || ""])
  ];
  downloadCSV("votos_fondeica.csv", rows);
});

// Eliminar voto
document.addEventListener("click", async (e) => {
  const b = e.target.closest(".btnDel");
  if (!b) return;

  if (usuario.cedula !== CEDULA_RESPONSABLE) return;

  const ced = b.getAttribute("data-ced");
  if (!ced) return;

  const ok = confirm(`¿Seguro que deseas eliminar el voto de la cédula ${ced}?`);
  if (!ok) return;

  try {
    await db.collection("votos").doc(ced).delete();
    alert("✅ Voto eliminado.");
    btnCargarVotos.click();
  } catch (err) {
    console.error(err);
    alert("❌ No se pudo eliminar.");
  }
});
