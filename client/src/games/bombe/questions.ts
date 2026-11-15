/**
 * Fragen für «Bombe». Schweizer Rechtschreibung (ss statt ß).
 * Neue Fragen einfach in der passenden Kategorie ergänzen – die IDs werden
 * automatisch aus Kategorie und Position gebildet.
 */

export interface Category {
  id: string;
  label: string;
  emoji: string;
}

export interface Question {
  id: string;
  category: Category;
  text: string;
}

export const CATEGORIES: Category[] = [
  { id: 'alltag', label: 'Alltag', emoji: '🏠' },
  { id: 'essen', label: 'Essen & Trinken', emoji: '🍕' },
  { id: 'reisen', label: 'Reisen & Ferien', emoji: '✈️' },
  { id: 'natur', label: 'Tiere & Natur', emoji: '🦊' },
  { id: 'freizeit', label: 'Sport & Freizeit', emoji: '⚽' },
  { id: 'medien', label: 'Film, Musik & Co.', emoji: '🎬' },
  { id: 'schweiz', label: 'Schweiz', emoji: '🇨🇭' },
  { id: 'beruf', label: 'Beruf & Schule', emoji: '🎓' },
  { id: 'absurd', label: 'Kreativ & Absurd', emoji: '🤪' },
  { id: 'buchstaben', label: 'Buchstaben-Mix', emoji: '🔤' },
];

const QUESTIONS: Record<string, string[]> = {
  alltag: [
    'Was findet man in einer Handtasche?',
    'Was liegt in einer Küchenschublade?',
    'Was gehört in ein Badezimmer?',
    'Was hat Knöpfe?',
    'Was hat Räder?',
    'Was ist rund?',
    'Was ist rot?',
    'Was ist weich?',
    'Was kann man falten?',
    'Was braucht Strom?',
    'Was hat einen Deckel?',
    'Was findet man im Kühlschrank?',
    'Was macht Lärm?',
    'Was riecht gut?',
    'Was ist klebrig?',
    'Was kann man verlieren?',
    'Was muss man regelmässig aufladen?',
    'Womit kann man putzen?',
    'Was hängt an einer Wand?',
    'Was ist durchsichtig?',
    'Was hat Zähne, ist aber kein Lebewesen?',
    'Was findet man in einem Keller?',
    'Was gibt es in jedem Kinderzimmer?',
    'Was kann kaputtgehen?',
    'Was hat ein Kabel?',
  ],
  essen: [
    'Was kommt auf eine Pizza?',
    'Nenne eine Gemüsesorte.',
    'Nenne eine Frucht.',
    'Nenne eine Käsesorte.',
    'Was isst man zum Frühstück?',
    'Nenne ein Getränk.',
    'Was ist süss?',
    'Was ist scharf?',
    'Nenne eine Pastasorte.',
    'Was gehört in einen Salat?',
    'Nenne ein Gewürz oder Kraut.',
    'Was kann man grillieren?',
    'Nenne ein Dessert.',
    'Was gibt es an einem Kindergeburtstag zu essen?',
    'Was kann man backen?',
    'Nenne eine Brotsorte.',
    'Was isst man mit den Händen?',
    'Was gibt es in einer Bäckerei?',
    'Was gibt es aus Schokolade?',
    'Was gehört auf ein Sandwich?',
    'Nenne ein Gericht aus einem anderen Land.',
    'Was findet man an einem Buffet?',
    'Was kann man in einem Restaurant bestellen?',
    'Nenne etwas, das man roh essen kann.',
  ],
  reisen: [
    'Was nimmt man in die Ferien mit?',
    'Nenne ein Land in Europa.',
    'Nenne eine Hauptstadt.',
    'Was packt man für die Skiferien ein?',
    'Was macht man am Strand?',
    'Nenne ein Verkehrsmittel.',
    'Was sieht man an einem Flughafen?',
    'Nenne eine berühmte Sehenswürdigkeit.',
    'Was braucht man zum Campen?',
    'Nenne ein Land ausserhalb von Europa.',
    'Nenne eine Insel.',
    'Was kauft man als Souvenir?',
    'Was kann auf einer Reise schiefgehen?',
    'Nenne ein Meer, einen Fluss oder einen See.',
    'Was hat man im Handgepäck?',
    'Nenne eine Sprache.',
    'Was sieht man aus dem Zugfenster?',
    'Was findet man in einem Hotelzimmer?',
    'Nenne eine Stadt am Meer.',
    'Was gehört zu einem Roadtrip?',
  ],
  natur: [
    'Nenne ein Tier, das fliegen kann.',
    'Nenne ein Tier, das im Wasser lebt.',
    'Nenne ein Haustier.',
    'Nenne ein Tier auf dem Bauernhof.',
    'Nenne ein Tier, das im Zoo lebt.',
    'Nenne ein Insekt.',
    'Nenne eine Hunderasse.',
    'Nenne ein gefährliches Tier.',
    'Nenne eine Blume.',
    'Nenne einen Baum.',
    'Was wächst in einem Garten?',
    'Nenne ein Tier, das in den Alpen lebt.',
    'Was findet man im Wald?',
    'Nenne ein Wetterphänomen.',
    'Nenne einen Vogel.',
    'Nenne ein Tier mit Streifen oder Flecken.',
    'Nenne ein Tier, das kleiner ist als eine Maus.',
    'Nenne ein Tier, das Winterschlaf hält.',
    'Nenne ein Tier, das in Afrika lebt.',
    'Was gibt es am Himmel zu sehen?',
  ],
  freizeit: [
    'Nenne eine Sportart.',
    'Nenne eine Sportart mit Ball.',
    'Was braucht man zum Skifahren?',
    'Nenne ein Brett- oder Kartenspiel.',
    'Nenne ein Hobby.',
    'Was findet man in einem Fitnesscenter?',
    'Nenne eine olympische Disziplin.',
    'Nenne ein Musikinstrument.',
    'Was macht man an einem Regentag?',
    'Was gehört zu einer guten Party?',
    'Nenne eine Wintersportart.',
    'Nenne einen Fussballclub.',
    'Was gehört zu einem Geburtstag?',
    'Nenne ein Spielzeug.',
    'Was braucht man zum Wandern?',
    'Nenne einen Tanzstil.',
    'Was kann man auf einem Spielplatz machen?',
    'Was macht man in einer Badi?',
    'Nenne etwas, das man sammeln kann.',
  ],
  medien: [
    'Nenne einen Trickfilm.',
    'Nenne eine Märchenfigur.',
    'Nenne einen Superhelden oder eine Superheldin.',
    'Nenne eine Band oder einen Musiker.',
    'Nenne eine Fernsehserie.',
    'Nenne eine berühmte Person.',
    'Nenne ein Lied, das alle kennen.',
    'Nenne eine App auf deinem Handy.',
    'Nenne ein Videospiel.',
    'Nenne einen Bösewicht aus einem Film.',
    'Nenne eine Musikrichtung.',
    'Nenne eine Comicfigur.',
    'Nenne einen Weihnachtsfilm.',
    'Nenne ein Buch oder eine Buchreihe.',
    'Nenne einen Film mit einem Tier in der Hauptrolle.',
    'Nenne eine Figur aus einem Kinderbuch.',
    'Nenne einen Schauspieler oder eine Schauspielerin.',
    'Nenne ein Wort, das man in Liedern oft hört.',
  ],
  schweiz: [
    'Nenne einen Schweizer Kanton.',
    'Nenne eine Schweizer Stadt.',
    'Nenne einen Schweizer Berg.',
    'Nenne einen Schweizer See.',
    'Was ist typisch schweizerisch?',
    'Nenne ein Schweizer Gericht.',
    'Nenne eine Schweizer Marke.',
    'Nenne ein schweizerdeutsches Wort.',
    'Nenne eine berühmte Schweizerin oder einen berühmten Schweizer.',
    'Was gibt es an einer Chilbi?',
    'Was gehört zum 1. August?',
    'Nenne einen Schweizer Alpenpass.',
    'Nenne einen Schweizer Käse.',
    'Nenne einen Schweizer Fluss.',
    'Was sieht man auf einer Alp?',
    'Was sieht man an der Fasnacht?',
    'Was isst man an einem Fondue- oder Raclette-Abend?',
    'Nenne eine Schweizer Sportlerin oder einen Schweizer Sportler.',
  ],
  beruf: [
    'Nenne einen Beruf.',
    'Nenne einen Beruf mit Uniform.',
    'Was findet man in einem Schulzimmer?',
    'Nenne ein Schulfach.',
    'Was braucht eine Ärztin oder ein Arzt?',
    'Was findet man in einem Büro?',
    'Nenne einen Beruf, bei dem man draussen arbeitet.',
    'Nenne ein Werkzeug.',
    'Was liegt in einem Etui?',
    'Nenne einen Beruf, der mit Tieren zu tun hat.',
    'Was lernt man in der Schule?',
    'Was gibt es in einem Spital?',
    'Nenne einen Beruf, den es vor 100 Jahren noch nicht gab.',
    'Nenne einen Beruf, der mit Essen zu tun hat.',
    'Was sagt man in einer Sitzung?',
  ],
  absurd: [
    'Was würde ein Pirat nie sagen?',
    'Was nimmt man auf eine einsame Insel mit?',
    'Was sollte man nie in die Mikrowelle legen?',
    'Was würdest du mit einer Million Franken machen?',
    'Nenne eine schlechte Ausrede fürs Zuspätkommen.',
    'Was sagt man besser nicht beim ersten Date?',
    'Welche Superkraft hättest du gerne?',
    'Was könnte in einer Wundertüte sein?',
    'Was würde eine Katze sagen, wenn sie reden könnte?',
    'Was ist peinlich?',
    'Was macht man, wenn man unsichtbar ist?',
    'Was ist schlimmer als ein Montagmorgen?',
    'Was findet man unter dem Sofa?',
    'Was würde ein Alien auf der Erde komisch finden?',
    'Was sollte man nie zu seiner Chefin sagen?',
    'Was steht auf der Einkaufsliste eines Drachen?',
    'Was isst ein Roboter zum Zmittag?',
    'Was ist das Beste an den Ferien?',
    'Was hat ein Zauberer in seinem Hut?',
    'Wofür kann man eine Banane noch verwenden?',
    'Was würdest du nie in eine Zeitkapsel legen?',
    'Wie könnte ein neues Pizzatopping heissen?',
  ],
  buchstaben: [
    'Nenne ein Wort, das mit «Sch» beginnt.',
    'Nenne ein Wort, das auf «-ung» endet.',
    'Nenne ein Wort mit doppeltem «L».',
    'Nenne ein Wort mit «ei».',
    'Nenne ein Wort, das mit «Sp» beginnt.',
    'Nenne ein zusammengesetztes Wort mit «Haus».',
    'Nenne ein Wort, das sich auf «Maus» reimt.',
    'Nenne ein Wort, das sich auf «Bär» reimt.',
  ],
};

/** "{Thema} mit Anfangsbuchstabe" – generated combinations for more variety. */
const LETTER_THEMES: { text: string; letters: string }[] = [
  { text: 'ein Tier', letters: 'ABEFGHKLMNPRSTWZ' },
  { text: 'eine Stadt', letters: 'ABDFGHKLMNPRSTWZ' },
  { text: 'einen Vornamen', letters: 'ABCDEFGHJKLMNOPRSTW' },
  { text: 'etwas zum Essen', letters: 'ABEFGHKLMNOPRSTZ' },
  { text: 'einen Beruf', letters: 'ABDFGHKLMPRSTVWZ' },
  { text: 'ein Land', letters: 'ABCDEFGIKLMNPRST' },
  { text: 'einen Gegenstand', letters: 'BDFGHKLMPSTWZ' },
];

function buildQuestions(): Question[] {
  const all: Question[] = [];
  for (const category of CATEGORIES) {
    (QUESTIONS[category.id] ?? []).forEach((text, index) => {
      all.push({ id: `${category.id}-${index}`, category, text });
    });
  }
  const letterCategory = CATEGORIES.find((c) => c.id === 'buchstaben')!;
  LETTER_THEMES.forEach((theme, themeIndex) => {
    for (const letter of theme.letters) {
      all.push({
        id: `buchstaben-${themeIndex}-${letter}`,
        category: letterCategory,
        text: `Nenne ${theme.text} mit «${letter}».`,
      });
    }
  });
  return all;
}

export const ALL_QUESTIONS: Question[] = buildQuestions();

const RECENT_KEY = 'phonegames-bombe-recent';
const RECENT_MAX = 120;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Pick a random question from the selected categories, avoiding questions
 * that were shown recently (remembered across sessions on this device).
 * Generated letter questions are weighted down so they do not dominate.
 */
export function nextQuestion(categoryIds: string[], random: () => number = Math.random): Question {
  const selected = categoryIds.length > 0 ? categoryIds : CATEGORIES.map((c) => c.id);
  const pool = ALL_QUESTIONS.filter((q) => selected.includes(q.category.id));
  const recent = new Set(readRecent());
  let candidates = pool.filter((q) => !recent.has(q.id));
  if (candidates.length === 0) candidates = pool;

  // First choose a category uniformly, then a question – keeps the mix balanced.
  const categories = [...new Set(candidates.map((q) => q.category.id))];
  const categoryId = categories[Math.floor(random() * categories.length)]!;
  const inCategory = candidates.filter((q) => q.category.id === categoryId);
  const question = inCategory[Math.floor(random() * inCategory.length)]!;

  try {
    const updated = [...readRecent().filter((id) => id !== question.id), question.id].slice(-RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    /* storage full or blocked – not critical */
  }
  return question;
}
