const OpenAI = require('openai');
const pool = require('../config/db');

const FORM_ID = '3c1aa0dc-b681-46ce-9a66-bcad1b6d56cb';

const SYSTEM_PROMPT = `Eres AquaBot, asistente inteligente del sistema AquaVisor del Acueducto de Soacha, Colombia.
Ayudas a los funcionarios a consultar y analizar los datos del censo de predios y usuarios recolectados en campo en el barrio Las Mercedes, Soacha.
Cuando el usuario haga preguntas sobre datos del censo usa las herramientas disponibles para consultar la base de datos real y dar respuestas precisas con cifras exactas.
Si no necesitas datos, responde directamente.
Responde siempre en español, de forma clara, concisa y profesional. Usa listas o tablas cuando sea útil.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'consultar_estadisticas_generales',
      description: 'Estadísticas generales del censo: total levantamientos, predios censados, por estado, tipo de persona que atendió.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_predios_por_manzana',
      description: 'Predios levantados agrupados por número de manzana.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_predios_por_estado',
      description: 'Predios agrupados por estado del predio (ocupado, desocupado, en construcción, etc.).',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_predios_por_inspector',
      description: 'Número de levantamientos realizados por cada inspector o funcionario.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_estadisticas_agua',
      description: 'Estadísticas sobre acceso al agua: cuántos tienen agua, horas promedio de servicio, predios con tanque de reserva.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_estadisticas_habitantes',
      description: 'Estadísticas de familias y habitantes: total familias, total habitantes, promedios por predio.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_clase_uso',
      description: 'Predios agrupados por clase de uso (residencial, comercial, mixto, etc.) y tipo de actividad.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buscar_predios_por_texto',
      description: 'Busca predios por dirección, observaciones u otro texto libre.',
      parameters: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Texto a buscar en dirección u observaciones' }
        },
        required: ['texto']
      }
    }
  }
];

async function runQuery(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

const BASE_SELECT = `
  SELECT s.id, s.responses
  FROM submissions s
  JOIN form_versions fv ON s.form_version_id = fv.id
  JOIN forms f ON fv.form_id = f.id
  WHERE f.id = ?
`;

async function consultar_estadisticas_generales() {
  const rows = await runQuery(BASE_SELECT, [FORM_ID]);
  const total = rows.length;
  const estados = {}, personas = {};
  let conAgua = 0;
  for (const r of rows) {
    const res = typeof r.responses === 'string' ? JSON.parse(r.responses) : r.responses;
    const estado = res['Estado del Predio'] || 'Sin dato';
    const persona = res['¿La persona encuestada es?'] || 'Sin dato';
    estados[estado] = (estados[estado] || 0) + 1;
    personas[persona] = (personas[persona] || 0) + 1;
    if (res['¿Tiene agua?'] && res['¿Tiene agua?'].toLowerCase().includes('sí')) conAgua++;
  }
  return { total_levantamientos: total, por_estado_predio: estados, persona_que_atendio: personas, predios_con_agua: conAgua };
}

async function consultar_predios_por_manzana() {
  const rows = await runQuery(BASE_SELECT, [FORM_ID]);
  const manzanas = {};
  for (const r of rows) {
    const res = typeof r.responses === 'string' ? JSON.parse(r.responses) : r.responses;
    const mz = res['Manzana'] || 'Sin dato';
    manzanas[mz] = (manzanas[mz] || 0) + 1;
  }
  return { predios_por_manzana: manzanas };
}

async function consultar_predios_por_estado() {
  const rows = await runQuery(BASE_SELECT, [FORM_ID]);
  const estados = {};
  for (const r of rows) {
    const res = typeof r.responses === 'string' ? JSON.parse(r.responses) : r.responses;
    const estado = res['Estado del Predio'] || 'Sin dato';
    estados[estado] = (estados[estado] || 0) + 1;
  }
  return { por_estado: estados };
}

async function consultar_predios_por_inspector() {
  const rows = await runQuery(BASE_SELECT, [FORM_ID]);
  const inspectores = {};
  for (const r of rows) {
    const res = typeof r.responses === 'string' ? JSON.parse(r.responses) : r.responses;
    const inspector = res['Nombre del inspector o funcionario que censó'] || 'Sin dato';
    inspectores[inspector] = (inspectores[inspector] || 0) + 1;
  }
  return { levantamientos_por_inspector: inspectores };
}

async function consultar_estadisticas_agua() {
  const rows = await runQuery(BASE_SELECT, [FORM_ID]);
  let conAgua = 0, sinAgua = 0, totalHoras = 0, contHoras = 0, conTanque = 0;
  for (const r of rows) {
    const res = typeof r.responses === 'string' ? JSON.parse(r.responses) : r.responses;
    const agua = (res['¿Tiene agua?'] || '').toLowerCase();
    if (agua.includes('sí') || agua.includes('si')) conAgua++; else sinAgua++;
    const horas = parseFloat(res['¿Cuántas horas del día le llega agua?']);
    if (!isNaN(horas)) { totalHoras += horas; contHoras++; }
    const tanque = (res['Tanque de Reserva'] || '').toLowerCase();
    if (tanque.includes('sí') || tanque.includes('si')) conTanque++;
  }
  return {
    predios_con_agua: conAgua,
    predios_sin_agua: sinAgua,
    horas_promedio_servicio: contHoras > 0 ? (totalHoras / contHoras).toFixed(1) : 'N/A',
    predios_con_tanque_reserva: conTanque
  };
}

async function consultar_estadisticas_habitantes() {
  const rows = await runQuery(BASE_SELECT, [FORM_ID]);
  let totalFamilias = 0, totalHabitantes = 0, contF = 0, contH = 0;
  for (const r of rows) {
    const res = typeof r.responses === 'string' ? JSON.parse(r.responses) : r.responses;
    const fam = parseInt(res['Número de Familias']);
    const hab = parseInt(res['Número de Habitantes']);
    if (!isNaN(fam)) { totalFamilias += fam; contF++; }
    if (!isNaN(hab)) { totalHabitantes += hab; contH++; }
  }
  return {
    total_familias: totalFamilias,
    total_habitantes: totalHabitantes,
    promedio_familias_por_predio: contF > 0 ? (totalFamilias / contF).toFixed(1) : 'N/A',
    promedio_habitantes_por_predio: contH > 0 ? (totalHabitantes / contH).toFixed(1) : 'N/A'
  };
}

async function consultar_clase_uso() {
  const rows = await runQuery(BASE_SELECT, [FORM_ID]);
  const clases = {}, tipos = {};
  for (const r of rows) {
    const res = typeof r.responses === 'string' ? JSON.parse(r.responses) : r.responses;
    const clase = res['Clase de Uso'] || 'Sin dato';
    const tipo = res['Tipo de Actividad'] || 'Sin dato';
    clases[clase] = (clases[clase] || 0) + 1;
    tipos[tipo] = (tipos[tipo] || 0) + 1;
  }
  return { por_clase_uso: clases, por_tipo_actividad: tipos };
}

async function buscar_predios_por_texto({ texto }) {
  const rows = await runQuery(BASE_SELECT, [FORM_ID]);
  const termino = texto.toLowerCase();
  const encontrados = [];
  for (const r of rows) {
    const res = typeof r.responses === 'string' ? JSON.parse(r.responses) : r.responses;
    const dir = (res['Dirección'] || '').toLowerCase();
    const obs = (res['Observaciones'] || '').toLowerCase();
    if (dir.includes(termino) || obs.includes(termino)) {
      encontrados.push({
        id: r.id,
        direccion: res['Dirección'] || '',
        manzana: res['Manzana'] || '',
        estado: res['Estado del Predio'] || '',
        observaciones: res['Observaciones'] || ''
      });
    }
  }
  return { resultados: encontrados, total: encontrados.length };
}

const TOOL_FNS = {
  consultar_estadisticas_generales,
  consultar_predios_por_manzana,
  consultar_predios_por_estado,
  consultar_predios_por_inspector,
  consultar_estadisticas_agua,
  consultar_estadisticas_habitantes,
  consultar_clase_uso,
  buscar_predios_por_texto
};

const chat = async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ ok: false, message: 'Mensaje requerido' });

    const client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1'
    });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message }
    ];

    let reply = '';
    for (let i = 0; i < 5; i++) {
      const response = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.3
      });

      const choice = response.choices[0];
      const assistantMsg = choice.message;
      messages.push(assistantMsg);

      if (choice.finish_reason === 'tool_calls' && assistantMsg.tool_calls) {
        for (const toolCall of assistantMsg.tool_calls) {
          const fnName = toolCall.function.name;
          const fnArgs = JSON.parse(toolCall.function.arguments || '{}');
          const fn = TOOL_FNS[fnName];
          let result;
          try {
            result = fn ? await fn(fnArgs) : { error: 'Función no encontrada' };
          } catch (e) {
            result = { error: e.message };
          }
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }
      } else {
        reply = assistantMsg.content || '';
        break;
      }
    }

    return res.json({ ok: true, reply });
  } catch (err) {
    console.error('Chat error:', JSON.stringify(err?.response?.data || err?.message || err));
    return res.status(500).json({ ok: false, message: 'Error al procesar la consulta con IA' });
  }
};

module.exports = { chat };
