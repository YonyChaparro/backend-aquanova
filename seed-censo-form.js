const censoFormFields = [
  // Sección: Información General y Ubicación
  {
    key: "fecha",
    type: "date",
    label: "Fecha",
    required: false
  },
  {
    key: "municipio",
    type: "textarea",
    label: "Municipio",
    required: false
  },
  {
    key: "zona",
    type: "textarea",
    label: "Zona",
    required: false
  },
  {
    key: "barrio",
    type: "textarea",
    label: "Barrio",
    required: false
  },
  {
    key: "manzana",
    type: "textarea",
    label: "Manzana",
    required: false
  },
  {
    key: "plano",
    type: "textarea",
    label: "Plano",
    required: false
  },
  {
    key: "direccion",
    type: "textarea",
    label: "Dirección",
    required: false
  },
  // Sección: Identificación del Servicio
  {
    key: "id_usuario",
    type: "number",
    label: "ID Usuario",
    required: false
  },
  {
    key: "cuenta_contrato",
    type: "number",
    label: "Cuenta Contrato",
    required: false
  },
  // Sección: Datos del Propietario o Poseedor
  {
    key: "nombre_propietario",
    type: "textarea",
    label: "Nombre del propietario o poseedor",
    required: false
  },
  {
    key: "documento_identidad",
    type: "number",
    label: "Número de documento de identidad",
    required: false
  },
  {
    key: "telefono",
    type: "number",
    label: "Teléfono",
    required: false
  },
  {
    key: "email",
    type: "textarea",
    label: "Email",
    required: false
  },
  // Sección: Persona que Atendió la Visita
  {
    key: "nombre_atiende",
    type: "textarea",
    label: "Nombre de la persona que atendió la visita (Si es diferente al propietario)",
    required: false
  },
  // Firma omitida según solicitud

  // Sección: Información del Medidor
  {
    key: "marca_medidor",
    type: "textarea",
    label: "Marca",
    required: false
  },
  {
    key: "tipo_medidor",
    type: "textarea",
    label: "Tipo de medidor",
    required: false
  },
  {
    key: "no_serie_medidor",
    type: "textarea",
    label: "No de serie",
    required: false
  },
  {
    key: "lectura_medidor",
    type: "number",
    label: "Lectura",
    required: false
  },
  {
    key: "diametro_medidor",
    type: "textarea",
    label: "Diámetro",
    required: false
  },
  // Sección: Clasificación del Servicio
  {
    key: "tipo_punto",
    type: "radio",
    label: "Tipo de Punto",
    options: [
      "1.0 Und. Hab./No Hab. Única",
      "2.0 Multiusuario Medidor Colectivo",
      "12.0 Servicios Generales",
      "15.0 Multifamiliar Medidor Colectivo"
    ],
    required: false
  },
  {
    key: "clase_uso",
    type: "radio",
    label: "Clase de Uso",
    options: [
      "Residencial",
      "Industrial",
      "Comercial",
      "Multiusuario"
    ],
    required: false
  },
  // Sección: Información del Predio y Ocupación
  {
    key: "estado_predio",
    type: "radio",
    label: "Estado del Predio",
    options: [
      "Predio Demolido",
      "Predio Solo (Habitado)",
      "Predio Desocupado",
      "Predio en Obra"
    ],
    required: false
  },
  {
    key: "unidades_habitacionales",
    type: "number",
    label: "Unidades Habitacionales",
    required: false
  },
  {
    key: "unidades_no_habitacionales",
    type: "number",
    label: "Unidades No Habitacionales",
    required: false
  },
  {
    key: "numero_familias",
    type: "number",
    label: "Número de Familias",
    required: false
  },
  {
    key: "numero_habitantes",
    type: "number",
    label: "Número de Habitantes",
    required: false
  },
  {
    key: "tiene_agua",
    type: "radio",
    label: "¿Tiene agua?",
    options: ["Sí", "No"],
    required: false
  },
  {
    key: "horas_agua",
    type: "number",
    label: "¿Cuántas horas del día le llega agua?",
    min: 0,
    max: 24,
    required: false
  },
  {
    key: "tipo_actividad",
    type: "textarea",
    label: "Tipo de Actividad",
    required: false
  },
  {
    key: "tanque_reserva",
    type: "radio",
    label: "Tanque de Reserva",
    options: ["Sí", "No"],
    required: false
  },
  {
    key: "disponibilidad_cajilla",
    type: "radio",
    label: "Disponibilidad Cajilla",
    options: ["Sí", "No"],
    required: false
  },
  // Sección: Observaciones
  {
    key: "observaciones",
    type: "textarea",
    label: "Observaciones",
    required: false
  },
  // Sección: Autorización y Tratamiento de Datos Personales
  {
    key: "autorizacion_datos",
    type: "checkbox",
    label: "AVISO DE PRIVACIDAD - TRATAMIENTO DE DATOS PERSONALES... ¿Autoriza el tratamiento de sus datos personales bajo estas condiciones?",
    options: ["Sí, autorizo el tratamiento de mis datos personales"],
    required: false
  },
  // Sección: Uso Interno - Funcionario que Censó
  {
    key: "nombre_inspector",
    type: "textarea",
    label: "Nombre del inspector o funcionario que censó",
    required: false
  },
  {
    key: "cc_inspector",
    type: "number",
    label: "No. C.C. (Cédula de Ciudadanía del Inspector)",
    required: false
  },
  {
    key: "registro_inspector",
    type: "textarea",
    label: "Registro",
    required: false
  }
  // Firma omitida según solicitud
];

const censoMasivoCatastroFormSeed = {
  key: 'censo-masivo-catastro-v2',
  title: 'Censo de Usuarios',
  description: 'Formulario de censo masivo de usuarios para recoleccion de datos',
  metadata: {},
  schema: censoFormFields
};

module.exports = censoMasivoCatastroFormSeed;