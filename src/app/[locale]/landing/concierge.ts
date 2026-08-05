// The landing concierge's scripted answers, behind a single interface (question in,
// answer out) so the live assistant can replace the map later without touching the UI.
// EN answers are verbatim from the approved reference; ES is translated in the same
// register (launch ships EN + ES answers; FR/IT fall back to EN per spec). The desk
// chrome (greeting, chips, placeholder, button) is translated in all four via the
// message catalogs.
//
// House-law deviation, flagged: the reference's comparison keywords named two competitor
// planning platforms. "Never name competitor planning platforms" is a hard rule, so those
// brand strings are dropped from the keyword set (they would otherwise ship in the
// bundle); the generic comparison triggers below detect the same intent, and the answer
// itself names no one.

export type ConciergeLang = "en" | "es" | "fr" | "it";
type Entry = [keywords: string[], answer: string];

const KB_EN: Entry[] = [
  [["price", "cost", "how much", "pricing", "expensive"],
   "Eighty nine dollars a month for the first account, forty nine for each additional, everything included, me on every desk. The year holds fifty weddings for the team, plus twenty five for each additional account. The full pricing page is one door away."],
  [["concierge", " ai", "assistant", "chatbot", "you do"],
   "I am the concierge. Inside the atelier I know every wedding in your studio: I draft, I summarize, I keep watch overnight, and I answer questions like this one at any hour."],
  [["language", "spanish", "french", "italian", "espanol", "idioma"],
   "forma works in English, Spanish, French and Italian. Four equals, not one original and three translations."],
  [["feature", "what is forma", "what does forma", "included", "everything"],
   "Everything from the first inquiry to the last dance: proposals, contracts and signatures, payments, vendors, budgets, the couple portal, guests and seating, and the day itself. The atelier page walks every surface."],
  [["integrat", "connect", "calendar", "stripe", "sync"],
   "forma is complete rather than stitched together. Contracts, signatures, payments, calendars and RSVP live natively inside. The dated list of what connects sits in the atelier."],
  [["city", "cities", "complex", "multi", "destination", "events"],
   "Made for exactly that. Multi city, multi event, across borders and time zones, the whole arc held in one order. The most complex weddings are why forma exists."],
  [["app", "phone", "mobile", "ipad"],
   "The atelier runs wherever you work, and the day itself travels to every pocket: the run of show for vendors, the schedule for guests, the door for your coordinator."],
  [["compare", "competitor", "others", "versus", "alternative"],
   "We keep an honest comparison with the others: dated, specific, and with our gaps admitted. You will find it in the atelier."],
  [["directory", "profile", "found", "couples find", "listing"],
   "Every studio on forma can hold a page in the planner directory, where couples come looking. Your work, your cities, your languages, presented in the same hand as everything else here."],
  [["who built", "founder", "who made", "behind"],
   "forma is built by planners. It fits the job because they do the job."],
  [["trial", "start", "sign up", "begin", "free"],
   "Your studio opens in minutes and the first fourteen days are yours, with no card to begin."],
  [["hello", "hola", "hi", "bonjour", "ciao", "hey"],
   "Welcome. Ask me about pricing, the features, the languages, or how forma carries the day itself."],
];
const FALLBACK_EN =
  "That one deserves a person, and you will have one today through the atelier page. Meanwhile, ask me about pricing, features, languages, or the wedding day itself.";

const KB_ES: Entry[] = [
  [["price", "cost", "how much", "pricing", "expensive", "precio"],
   "Ochenta y nueve dólares al mes por la primera cuenta, cuarenta y nueve por cada adicional, todo incluido, yo en cada escritorio. El año lleva cincuenta bodas para el equipo, más veinticinco por cada cuenta adicional. La página de precios completa está a una puerta."],
  [["concierge", " ai", "assistant", "chatbot", "you do"],
   "Soy el concierge. Dentro del atelier conozco cada boda de tu estudio: redacto, resumo, vigilo durante la noche y respondo preguntas como esta a cualquier hora."],
  [["language", "spanish", "french", "italian", "espanol", "idioma"],
   "forma funciona en inglés, español, francés e italiano. Cuatro iguales, no un original y tres traducciones."],
  [["feature", "what is forma", "what does forma", "included", "everything", "funcion", "incluye"],
   "Todo, desde la primera consulta hasta el último baile: propuestas, contratos y firmas, pagos, proveedores, presupuestos, el portal de la pareja, invitados y distribución, y el día mismo. La página del atelier recorre cada superficie."],
  [["integrat", "connect", "calendar", "stripe", "sync", "conecta"],
   "forma es completa, no un conjunto de piezas cosidas. Contratos, firmas, pagos, calendarios y RSVP viven de forma nativa dentro. La lista fechada de lo que se conecta está en el atelier."],
  [["city", "cities", "complex", "multi", "destination", "events", "ciudad", "boda en tres"],
   "Hecha para exactamente eso. Varias ciudades, varios eventos, a través de fronteras y husos horarios, todo el arco sostenido en un mismo orden. Las bodas más complejas son la razón por la que forma existe."],
  [["app", "phone", "mobile", "ipad", "movil", "telefono"],
   "El atelier funciona dondequiera que trabajes, y el día mismo viaja a cada bolsillo: el guión del día para los proveedores, el horario para los invitados, la puerta para tu coordinadora."],
  [["compare", "competitor", "others", "versus", "alternative", "compara"],
   "Mantenemos una comparación honesta con los demás: fechada, específica y con nuestras carencias admitidas. La encontrarás en el atelier."],
  [["directory", "profile", "found", "couples find", "listing", "directorio"],
   "Cada estudio en forma puede tener una página en el directorio de planners, donde las parejas vienen a buscar. Tu trabajo, tus ciudades, tus idiomas, presentados con la misma mano que todo lo demás aquí."],
  [["who built", "founder", "who made", "behind", "fundador", "quien"],
   "forma está hecha por planners. Encaja con el oficio porque ellas hacen el oficio."],
  [["trial", "start", "sign up", "begin", "free", "prueba", "empezar", "gratis"],
   "Tu estudio abre en minutos y los primeros catorce días son tuyos, sin tarjeta para empezar."],
  [["hello", "hola", "hi", "bonjour", "ciao", "hey"],
   "Bienvenida. Pregúntame por los precios, las funciones, los idiomas o cómo forma sostiene el día mismo."],
];
const FALLBACK_ES =
  "Esa merece a una persona, y hoy la tendrás a través de la página del atelier. Mientras tanto, pregúntame por precios, funciones, idiomas o el día de la boda.";

// The interface: a scripted keyword match now, an assistant call later. ES answers for
// an ES visitor; EN answers for everyone else (FR/IT included) until their sets land.
export function conciergeAnswer(question: string, lang: ConciergeLang): string {
  const kb = lang === "es" ? KB_ES : KB_EN;
  const fallback = lang === "es" ? FALLBACK_ES : FALLBACK_EN;
  const lq = ` ${question.toLowerCase()} `;
  const hit = kb.find(([keys]) => keys.some((k) => lq.includes(k)));
  return hit ? hit[1] : fallback;
}
