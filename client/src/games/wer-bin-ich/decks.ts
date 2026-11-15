/**
 * Decks für «Wer bin ich?»: Eine Person hält das Handy an die Stirn, die anderen
 * geben Hinweise. Begriffe müssen deshalb allen in der Runde bekannt sein.
 * Schweizer Rechtschreibung (ss statt ß). Begriffe innerhalb eines Decks eindeutig.
 */

export interface Deck {
  /** kebab-case, ASCII */
  id: string;
  name: string;
  emoji: string;
  words: string[];
}

export const DECKS: Deck[] = [
  {
    id: 'tiere',
    name: 'Tiere',
    emoji: '🦁',
    words: [
      'Hund', 'Katze', 'Pferd', 'Kuh', 'Schwein', 'Schaf', 'Ziege', 'Huhn', 'Ente', 'Gans', 'Hase', 'Maus',
      'Igel', 'Eichhörnchen', 'Fuchs', 'Wolf', 'Bär', 'Reh', 'Hirsch', 'Wildschwein', 'Biber', 'Murmeltier',
      'Steinbock', 'Adler', 'Eule', 'Storch', 'Pinguin', 'Papagei', 'Flamingo', 'Strauss', 'Löwe', 'Tiger',
      'Gepard', 'Elefant', 'Giraffe', 'Zebra', 'Nashorn', 'Nilpferd', 'Affe', 'Gorilla', 'Känguru', 'Koala',
      'Panda', 'Eisbär', 'Kamel', 'Krokodil', 'Schlange', 'Schildkröte', 'Frosch', 'Delfin', 'Wal', 'Hai',
      'Tintenfisch', 'Seehund', 'Qualle', 'Seestern', 'Biene', 'Ameise', 'Schmetterling', 'Marienkäfer', 'Spinne',
      'Schnecke', 'Fledermaus', 'Faultier', 'Lama', 'Waschbär',
    ],
  },
  {
    id: 'essen',
    name: 'Essen & Trinken',
    emoji: '🍕',
    words: [
      'Pizza', 'Spaghetti', 'Lasagne', 'Hamburger', 'Pommes frites', 'Hotdog', 'Sushi', 'Döner', 'Tacos', 'Glace',
      'Schokolade', 'Popcorn', 'Gipfeli', 'Brot', 'Butter', 'Käse', 'Joghurt', 'Cornflakes', 'Konfitüre', 'Honig',
      'Spiegelei', 'Crêpes', 'Waffeln', 'Apfel', 'Banane', 'Erdbeere', 'Wassermelone', 'Ananas', 'Zitrone',
      'Orange', 'Kirsche', 'Trauben', 'Rüebli', 'Kartoffel', 'Tomate', 'Gurke', 'Salat', 'Zwiebel', 'Knoblauch',
      'Pilze', 'Mais', 'Broccoli', 'Poulet', 'Fischstäbli', 'Bratwurst', 'Suppe', 'Reis', 'Hörnli', 'Milch',
      'Heisse Schokolade', 'Orangensaft', 'Tee', 'Kaffee', 'Mineralwasser', 'Sirup', 'Lebkuchen', 'Guetzli',
      'Zuckerwatte', 'Gummibärchen', 'Lutscher', 'Geburtstagstorte', 'Kokosnuss',
    ],
  },
  {
    id: 'berufe',
    name: 'Berufe',
    emoji: '👩‍🚒',
    words: [
      'Polizist', 'Feuerwehrfrau', 'Ärztin', 'Zahnarzt', 'Lehrerin', 'Koch', 'Bäckerin', 'Metzger', 'Coiffeuse',
      'Pilot', 'Flugbegleiterin', 'Astronautin', 'Bauer', 'Gärtnerin', 'Tierärztin', 'Pöstler', 'Kaminfeger',
      'Schreiner', 'Elektrikerin', 'Maler', 'Architektin', 'Programmierer', 'Journalistin', 'Fotograf',
      'Schauspielerin', 'Sänger', 'Tänzerin', 'Zauberer', 'Clown', 'Detektiv', 'Richterin', 'Verkäuferin',
      'Kassierer', 'Kellnerin', 'Tramchauffeur', 'Lokführerin', 'Taxifahrer', 'Kapitän', 'Fischer', 'Förster',
      'Bergführerin', 'Skilehrer', 'Bademeister', 'Schiedsrichter', 'Fussballtrainerin', 'Pflegefachmann',
      'Hebamme', 'Apothekerin', 'Optiker', 'Bibliothekarin', 'Tierpfleger', 'Uhrmacherin', 'Bauarbeiter',
      'Kranführer', 'Hauswart', 'Imkerin', 'Bundesrätin', 'Dirigent', 'Mechaniker', 'Putzfrau',
    ],
  },
  {
    id: 'gegenstaende',
    name: 'Gegenstände',
    emoji: '🧲',
    words: [
      'Schere', 'Brille', 'Schlüssel', 'Uhr', 'Lampe', 'Regenschirm', 'Stuhl', 'Tisch', 'Bett', 'Sofa', 'Kerze',
      'Ballon', 'Buch', 'Bleistift', 'Radiergummi', 'Spitzer', 'Lineal', 'Rucksack', 'Handy', 'Fernseher',
      'Fernbedienung', 'Computer', 'Kopfhörer', 'Kamera', 'Taschenlampe', 'Wecker', 'Spiegel', 'Zahnbürste',
      'Zahnpasta', 'Seife', 'Handtuch', 'Föhn', 'Kamm', 'Bratpfanne', 'Kochtopf', 'Gabel', 'Löffel', 'Teller',
      'Tasse', 'Kühlschrank', 'Backofen', 'Mikrowelle', 'Waschmaschine', 'Staubsauger', 'Besen', 'Hammer',
      'Schraubenzieher', 'Leiter', 'Magnet', 'Kissen', 'Teppich', 'Abfallkübel', 'Klebeband', 'Batterie',
      'Ladekabel', 'Portemonnaie', 'Briefkasten', 'Velohelm', 'Sonnenbrille', 'Regenstiefel', 'Bügeleisen',
      'Wäscheklammer',
    ],
  },
  {
    id: 'sport',
    name: 'Sport & Freizeit',
    emoji: '⚽',
    words: [
      'Fussball', 'Tennis', 'Skifahren', 'Snowboarden', 'Schwimmen', 'Velofahren', 'Eishockey', 'Basketball',
      'Volleyball', 'Handball', 'Golf', 'Tischtennis', 'Badminton', 'Unihockey', 'Leichtathletik', 'Turnen',
      'Reiten', 'Klettern', 'Wandern', 'Joggen', 'Yoga', 'Tanzen', 'Judo', 'Karate', 'Fechten', 'Rudern',
      'Segeln', 'Surfen', 'Tauchen', 'Curling', 'Langlauf', 'Schlitteln', 'Eislaufen', 'Bowling', 'Minigolf',
      'Trampolin', 'Skateboard', 'Inlineskaten', 'Schach', 'Puzzle', 'Fischen', 'Camping', 'Gamen', 'Lesen',
      'Malen', 'Basteln', 'Stricken', 'Karaoke', 'Kino', 'Zirkus', 'Picknick', 'Grillieren', 'Gleitschirmfliegen',
      'Bobfahren', 'Skispringen', 'Marathon', 'Olympische Spiele', 'Trottinett fahren', 'Seilspringen',
      'Freizeitpark',
    ],
  },
  {
    id: 'figuren',
    name: 'Film-, Comic- & Märchenfiguren',
    emoji: '🦸',
    words: [
      'Heidi', 'Pippi Langstrumpf', 'Harry Potter', 'Hermine Granger', 'Asterix', 'Obelix', 'Spider-Man',
      'Batman', 'Superman', 'Wonder Woman', 'Hulk', 'Iron Man', 'Schneewittchen', 'Aschenputtel', 'Rotkäppchen',
      'Dornröschen', 'Rapunzel', 'Rumpelstilzchen', 'Der gestiefelte Kater', 'Frau Holle', 'Shrek', 'Pumuckl',
      'Globi', 'Micky Maus', 'Donald Duck', 'Dagobert Duck', 'Pinocchio', 'Peter Pan', 'Käpt’n Hook', 'Arielle',
      'Elsa', 'Olaf', 'Simba', 'Nemo', 'Buzz Lightyear', 'Winnie Puuh', 'Paddington', 'Biene Maja',
      'Schellen-Ursli', 'Garfield', 'Snoopy', 'Tim und Struppi', 'Lucky Luke', 'Pikachu', 'Super Mario', 'Sonic',
      'Minions', 'Barbie', 'Sherlock Holmes', 'Robin Hood', 'Zorro', 'Ronja Räubertochter', 'Wickie',
      'Bob der Baumeister', 'Peppa Wutz', 'Grinch', 'Yoda', 'Darth Vader', 'Jack Sparrow', 'Gandalf', 'Kermit',
      'Krümelmonster', 'Homer Simpson', 'SpongeBob', 'Lightning McQueen', 'Tarzan', 'Aladdin', 'Mr. Bean',
      'Stitch', 'Die Schlümpfe',
    ],
  },
  {
    id: 'promis',
    name: 'Berühmte Persönlichkeiten',
    emoji: '🌟',
    words: [
      'Albert Einstein', 'Roger Federer', 'Wolfgang Amadeus Mozart', 'Kleopatra', 'Leonardo da Vinci',
      'Elvis Presley', 'Charlie Chaplin', 'Marilyn Monroe', 'Walt Disney', 'Steve Jobs', 'Taylor Swift',
      'Beyoncé', 'Ed Sheeran', 'Lionel Messi', 'Cristiano Ronaldo', 'Usain Bolt', 'Michael Jordan',
      'Serena Williams', 'Rafael Nadal', 'Ludwig van Beethoven', 'Johann Sebastian Bach', 'Vincent van Gogh',
      'Pablo Picasso', 'Michelangelo', 'William Shakespeare', 'Johann Wolfgang von Goethe', 'Isaac Newton',
      'Galileo Galilei', 'Charles Darwin', 'Marie Curie', 'Neil Armstrong', 'Thomas Edison', 'Nikola Tesla',
      'Mahatma Gandhi', 'Nelson Mandela', 'Martin Luther King', 'Abraham Lincoln', 'Queen Elizabeth II.',
      'Prinzessin Diana', 'Tutanchamun', 'Frida Kahlo', 'Audrey Hepburn', 'Freddie Mercury', 'Elton John',
      'Madonna', 'Lady Gaga', 'Shakira', 'Adele', 'Michael Phelps', 'Muhammad Ali', 'Pelé', 'Simone Biles',
      'Leonardo DiCaprio', 'Tom Hanks', 'Emma Watson', 'Stephen Hawking', 'Brüder Grimm', 'Astrid Lindgren',
      'Hans Christian Andersen', 'Henri Dunant', 'Amelia Earhart', 'Marco Polo', 'Billie Eilish',
      'Steven Spielberg', 'Kylian Mbappé',
    ],
  },
  {
    id: 'schweiz',
    name: 'Typisch Schweiz',
    emoji: '🇨🇭',
    words: [
      'Matterhorn', 'Rösti', 'Sackmesser', 'Fasnacht', 'Alphorn', 'Ovomaltine', 'Gotthard', 'Fondue', 'Raclette',
      'Birchermüesli', 'Zopf', 'Rivella', 'Toblerone', 'Schoggi', 'Emmentaler', 'Basler Läckerli',
      'Bündner Nusstorte', 'Älplermagronen', 'Cervelat', 'Olma-Bratwurst', 'Rüeblitorte', 'Ricola',
      'Jungfraujoch', 'Eiger', 'Rheinfall', 'Kapellbrücke', 'Zytglogge', 'Bundeshaus', 'Genfersee', 'Jet d’eau',
      'Rütli', 'Aletschgletscher', 'Pilatus', 'Säntis', 'Sechseläuten', 'Räbeliechtli', 'Samichlaus', 'Schmutzli',
      '1. August', 'Alpabzug', 'Schwingfest', 'Hornussen', 'Jodeln', 'Fahnenschwingen', 'Jassen', 'Kuhglocke',
      'Edelweiss', 'Bernhardiner', 'Kuckucksuhr', 'Bahnhofsuhr', 'Postauto', 'Schweizerkreuz', 'Röstigraben',
      'Wilhelm Tell', 'Bundesrat', 'Landsgemeinde', 'Fünfliber', 'Chalet', 'Seilbahn', 'Znüni', 'Grüezi',
      'Chuchichäschtli', 'Badi', 'Guggenmusik', 'Lauberhorn',
    ],
  },
  {
    id: 'welt',
    name: 'Länder & Städte',
    emoji: '🌍',
    words: [
      'Italien', 'Frankreich', 'Deutschland', 'Österreich', 'Spanien', 'Portugal', 'England', 'Irland', 'Holland',
      'Belgien', 'Dänemark', 'Schweden', 'Norwegen', 'Finnland', 'Island', 'Griechenland', 'Türkei', 'Polen',
      'Kroatien', 'Ägypten', 'Marokko', 'Südafrika', 'Kenia', 'USA', 'Kanada', 'Mexiko', 'Brasilien',
      'Argentinien', 'Peru', 'Japan', 'China', 'Indien', 'Thailand', 'Australien', 'Neuseeland', 'Paris', 'Rom',
      'London', 'New York', 'Berlin', 'Wien', 'Venedig', 'Madrid', 'Barcelona', 'Amsterdam', 'Tokio', 'Sydney',
      'Los Angeles', 'Hawaii', 'Dubai', 'Istanbul', 'Kairo', 'Rio de Janeiro', 'Mailand', 'Prag', 'Athen',
      'Lissabon', 'München', 'Zürich', 'Bern', 'Basel', 'Genf', 'Luzern', 'Lugano', 'San Francisco', 'Hongkong',
      'Pisa',
    ],
  },
];
