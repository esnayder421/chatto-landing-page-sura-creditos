/**
 * AquaShield × SURA — Webhook Handler
 * =====================================
 * Recibe eventos de Surafinancia y activa mensajes de Chatto vía WhatsApp.
 *
 * SETUP:
 *   npm install express
 *   node webhook.js
 *
 * Configura la URL de este servidor en la plataforma SURA como endpoint del webhook.
 * Ejemplo: https://api.aquashield.co/webhook/sura
 *
 * Este servidor debe estar público (usar ngrok en desarrollo o deploy en Railway/Render).
 */

const express = require('express');
const app = express();
app.use(express.json());

// ─────────────────────────────────────────────
// CONFIGURACIÓN — reemplaza con tus valores
// ─────────────────────────────────────────────
const CONFIG = {
  PORT: process.env.PORT || 3000,

  // Número de WhatsApp de Chatto (formato internacional sin +)
  // Ejemplo: '573001234567'
  CHATTO_WA: process.env.CHATTO_WA || 'XXXXXXXXXX',

  // API Key de WhatsApp Business (Meta) o de tu proveedor (Twilio, 360dialog, etc.)
  WA_API_URL:  process.env.WA_API_URL  || 'https://graph.facebook.com/v18.0/YOUR_PHONE_ID/messages',
  WA_API_KEY:  process.env.WA_API_KEY  || 'YOUR_WA_API_TOKEN',

  // Si usas un webhook secret para verificar que el request viene de SURA
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
};

// ─────────────────────────────────────────────
// MENSAJES DE CHATTO POR EVENTO
// ─────────────────────────────────────────────
function buildMessage(event) {
  const nombre = event.fullName || 'Cliente';
  const telefono = event.phone;
  const banco = event.bankName || '';
  const estado = event.status || '';
  const sub = event.statusDetail || {};

  switch (event.eventType) {

    // ── Solicitud nueva creada ──────────────────
    case 'request_creation':
      return {
        to: telefono,
        body:
`Hola ${nombre}, soy tu asesor de AquaShield.

Tu solicitud de crédito vehicular fue recibida con éxito en la plataforma SURA.

Vehículo: ${event.vehicleBrand || ''} ${event.vehicleLine || ''} ${event.vehicleYear || ''}
Monto a financiar: $${Number(event.applyValue || 0).toLocaleString('es-CO')}
Plazo: ${event.quotas || ''} cuotas

Estoy revisando tu perfil para conseguirte la mejor tasa disponible. Te aviso en las próximas horas con novedades. ¿Tienes alguna pregunta?`
      };

    // ── Radicado en banco ───────────────────────
    case 'bank_status_update':
      if (estado === 'Radicado') {
        return {
          to: telefono,
          body:
`Hola ${nombre}, buenas noticias.

Tu solicitud fue radicada ante ${banco}. Ya está en manos del banco para evaluación.

El tiempo estimado de respuesta es de 2 a 6 horas hábiles. Te aviso en cuanto haya novedades.`
        };
      }

      // ── En proceso — requiere documentos ────────
      if (estado === 'En Proceso' && sub.subStatus === 'Requiere Documentación') {
        const docs = (sub.requiredDocs || []).join('\n• ');
        return {
          to: telefono,
          body:
`Hola ${nombre}, el banco ${banco} está revisando tu solicitud y solicita los siguientes documentos adicionales:

• ${docs}

${sub.comments ? `Nota del banco: "${sub.comments}"` : ''}

Por favor envíamelos a la mayor brevedad para no retrasar la aprobación.`
        };
      }

      // ── Aprobado ─────────────────────────────────
      if (estado === 'Aprobado') {
        return {
          to: telefono,
          body:
`¡Felicitaciones ${nombre}!

${banco} aprobó tu crédito vehicular.

Monto aprobado: $${Number(sub.approvedAmount || 0).toLocaleString('es-CO')}
Tasa: ${sub.approvedConditions || ''}
Fecha de aprobación: ${sub.approvedDate || ''}

${sub.comments ? sub.comments + '\n\n' : ''}¿Ya tienes el vehículo elegido? Si aún no, cuéntame tu presupuesto y te muestro opciones disponibles en nuestra vitrina y en TuCarro.`
        };
      }

      // ── Negado ────────────────────────────────────
      if (estado === 'Negado') {
        return {
          to: telefono,
          body:
`Hola ${nombre}, lamentablemente ${banco} negó tu solicitud.

Razón: ${sub.subStatus || 'No especificada'}
${sub.comments ? `Detalle: ${sub.comments}` : ''}

No te preocupes. Tenemos más bancos aliados y puedo intentarlo con otra entidad. También puedo orientarte para mejorar tu perfil crediticio. ¿Seguimos?`
        };
      }

      // ── Desembolsado ──────────────────────────────
      if (estado === 'Desembolsado') {
        return {
          to: telefono,
          body:
`Hola ${nombre}, tu crédito fue desembolsado.

Banco: ${banco}
Monto desembolsado: $${Number(sub.disbursementAmount || 0).toLocaleString('es-CO')}
Fecha: ${sub.disbursementDate || ''}
Tasa anual: ${sub.disbursementYearRate || ''}%
Plazo: ${sub.disbursementTermMonths || ''} meses

¡Disfruta tu vehículo! Recuerda que tienes tu tratamiento cerámico profesional incluido en AquaShield. Escríbeme para agendar tu cita.`
        };
      }

      // Fallback estado desconocido
      return {
        to: telefono,
        body: `Hola ${nombre}, hay una actualización en tu solicitud de crédito con ${banco}: *${estado}*. Me comunico contigo en breve para darte más detalles.`
      };

    default:
      return null;
  }
}

// ─────────────────────────────────────────────
// ENVIAR MENSAJE VÍA WHATSAPP BUSINESS API
// ─────────────────────────────────────────────
async function sendWhatsApp(to, body) {
  // Limpiar el número (solo dígitos, agregar código de país si falta)
  const phone = to.replace(/\D/g, '');
  const fullPhone = phone.startsWith('57') ? phone : `57${phone}`;

  const payload = {
    messaging_product: 'whatsapp',
    to: fullPhone,
    type: 'text',
    text: { body }
  };

  try {
    const res = await fetch(CONFIG.WA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.WA_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[WA] Error enviando mensaje:', JSON.stringify(data));
      return false;
    }
    console.log(`[WA] Mensaje enviado a ${fullPhone}`);
    return true;
  } catch (err) {
    console.error('[WA] Excepción:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// ENDPOINT PRINCIPAL — recibe webhook de SURA
// ─────────────────────────────────────────────
app.post('/webhook/sura', async (req, res) => {
  // SURA espera HTTP 200 inmediatamente para no reintentar
  res.status(200).json({ ok: true });

  const event = req.body;

  // Log del evento recibido
  console.log(`\n[SURA] Evento recibido: ${event.eventType}`);
  console.log(`  Cliente: ${event.fullName} (${event.document})`);
  if (event.bankName) console.log(`  Banco: ${event.bankName} · Estado: ${event.status}`);

  // Validación básica
  if (!event.phone) {
    console.warn('[SURA] Evento sin teléfono — no se puede enviar WhatsApp');
    return;
  }

  // Construir mensaje
  const msg = buildMessage(event);
  if (!msg) {
    console.log('[SURA] Evento sin mensaje configurado — omitido');
    return;
  }

  // Enviar WhatsApp
  await sendWhatsApp(msg.to, msg.body);
});

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'AquaShield Webhook' }));

app.listen(CONFIG.PORT, () => {
  console.log(`\n AquaShield Webhook Server`);
  console.log(`  Puerto: ${CONFIG.PORT}`);
  console.log(`  Endpoint SURA: POST /webhook/sura`);
  console.log(`  Configura esta URL en la plataforma SURA como webhook endpoint\n`);
});
