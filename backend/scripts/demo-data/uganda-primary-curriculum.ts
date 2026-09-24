// Term 3 teaching content for the demo primary school — topics and sub-topics
// modelled on the NCDC Uganda primary syllabus (thematic curriculum for
// P1–P3, subject syllabus for P4–P7) and on what nursery schools commonly
// teach. Used to fill schemes of work, records of work and lesson plans.

export interface Unit {
  topic: string;
  subs: string[];
}

type ByClass = Partial<Record<string, Unit[]>>;

const u = (topic: string, ...subs: string[]): Unit => ({ topic, subs });

// ─── Primary: PLE subjects, per class ───────────────────────────────────────

const MTC: ByClass = {
  P1: [
    u("Numbers 0–100", "Counting in tens", "Place value: tens and ones", "Writing numbers in words"),
    u("Addition and subtraction", "Adding without regrouping", "Taking away", "Simple word problems"),
    u("Money", "Uganda coins and notes", "Buying and selling at the market"),
    u("Geometry", "Shapes: circle, triangle, square, rectangle", "Drawing and colouring shapes"),
  ],
  P2: [
    u("Numeration", "Numbers up to 999", "Place value and expanded form", "Comparing numbers"),
    u("Operations on numbers", "Addition with regrouping", "Subtraction with borrowing", "Multiplication tables 2, 3 and 5"),
    u("Fractions", "Halves and quarters", "Shading fractions"),
    u("Measures", "Length in metres", "Shopping with money"),
  ],
  P3: [
    u("Operations on numbers", "Multiplying by a 2-digit number", "Division with remainders", "Word problems"),
    u("Fractions", "Comparing fractions", "Adding like fractions"),
    u("Measures", "Time: hours and minutes", "Capacity: litres", "Mass: kilograms"),
    u("Geometry", "Lines and angles", "Perimeter of shapes"),
  ],
  P4: [
    u("Geometry", "Types of lines", "Types of angles", "Properties of triangles and quadrilaterals"),
    u("Measures", "Length: km, m and cm", "Mass: kg and g", "Capacity: litres and ml"),
    u("Data handling", "Pictographs", "Bar graphs", "Interpreting tables"),
    u("Algebra", "Using letters for numbers", "Simple equations"),
  ],
  P5: [
    u("Measures", "Area of rectangles and squares", "Perimeter", "Volume of cuboids"),
    u("Integers", "Integers on a number line", "Adding and subtracting integers"),
    u("Algebra", "Collecting like terms", "Substitution", "Solving simple equations"),
    u("Data handling", "Mean, mode and median", "Drawing bar graphs"),
  ],
  P6: [
    u("Ratio and proportion", "Sharing in a given ratio", "Direct proportion", "Inverse proportion"),
    u("Integers", "Multiplying and dividing integers"),
    u("Algebra", "Equations with brackets", "Inequalities"),
    u("Geometry", "Constructing angles of 60°, 90° and 45°", "Constructing triangles"),
    u("Data handling", "Pie charts"),
  ],
  P7: [
    u("Algebra", "Forming and solving equations", "Inequalities and number lines", "Substitution"),
    u("Graphs", "Line graphs", "Travel graphs", "Coordinates"),
    u("Probability", "Likely and unlikely events", "Calculating simple probability"),
    u("PLE revision", "Past paper practice: Section A", "Past paper practice: Section B"),
  ],
};

const ENG: ByClass = {
  P1: [
    u("Our home and family", "Naming family members", "Things we do at home"),
    u("Transport", "Means of transport", "Action words: drive, ride, sail"),
    u("Food", "Foods we eat", "Using 'I like' and 'I don't like'"),
    u("Safety", "Road safety words", "Simple instructions"),
  ],
  P2: [
    u("Accidents and safety", "Vocabulary: burn, cut, fall", "Using 'should' and 'should not'"),
    u("Peace and security", "People who keep us safe", "Polite language"),
    u("Food and nutrition", "Words about food", "Present continuous tense"),
    u("Messages", "Giving and receiving messages"),
  ],
  P3: [
    u("Our district", "Places in our district", "Using 'there is' and 'there are'"),
    u("Culture and gender", "Roles at home", "Comparatives"),
    u("Things we make", "Crafts in our community", "Sequencing words: first, then, finally"),
    u("Composition", "Picture composition", "Guided composition"),
  ],
  P4: [
    u("Our district", "Vocabulary: leaders and places", "Reading comprehension"),
    u("Hygiene and sanitation", "Vocabulary", "Using 'must' and 'mustn't'"),
    u("Letter writing", "Friendly letters", "Addressing an envelope"),
    u("Occupations", "Names of occupations", "Using 'who' and 'which'"),
  ],
  P5: [
    u("Electronic media", "Radio, TV and phones", "Reported speech"),
    u("Debating", "Debating vocabulary", "Holding a class debate"),
    u("Letter writing", "Formal letters", "Letter of application"),
    u("Composition", "Guided composition", "Free composition"),
  ],
  P6: [
    u("Letter writing", "Formal letters", "Invitation cards and replies"),
    u("Debating", "Motions and points of order", "Class debate"),
    u("Rights and responsibilities", "Vocabulary", "Conditional clauses"),
    u("Examinations", "Exam vocabulary", "Instructions and notices"),
  ],
  P7: [
    u("Grammar revision", "Direct and indirect speech", "Tenses", "Conditional clauses"),
    u("Letter writing", "Official letters", "Letters of complaint"),
    u("Composition", "Guided composition", "Notices and announcements"),
    u("PLE revision", "Past paper practice: Section A", "Past paper practice: Section B"),
  ],
};

const SCI: ByClass = {
  P1: [
    u("Plants in our environment", "Parts of a plant", "Uses of plants"),
    u("Animals at home", "Domestic animals", "Animal products"),
    u("Keeping our bodies clean", "Washing hands", "Brushing teeth"),
    u("Weather", "Sunny, rainy and windy days"),
  ],
  P2: [
    u("Living and non-living things", "Characteristics of living things", "Sorting things"),
    u("Animals", "Animal homes", "Young ones of animals"),
    u("Food and nutrition", "Food groups", "A balanced meal"),
    u("Sanitation at home", "Keeping the compound clean"),
  ],
  P3: [
    u("Plants", "Growing a crop", "Caring for plants"),
    u("Insects", "Parts of an insect", "Life cycle of a housefly"),
    u("Personal hygiene and diseases", "Malaria", "Diarrhoea and its prevention"),
    u("Weather", "Simple weather instruments"),
  ],
  P4: [
    u("Keeping poultry and bees", "Breeds of poultry", "Poultry housing", "Keeping bees"),
    u("Sanitation", "Latrines", "Waste disposal"),
    u("Personal hygiene", "Care of the teeth", "Care of the skin"),
    u("Immunisation", "Immunisable diseases", "Immunisation schedule"),
  ],
  P5: [
    u("The digestive system", "Parts of the alimentary canal", "Digestion of food", "Disorders of the digestive system"),
    u("Heat energy", "Sources of heat", "Transfer of heat"),
    u("Measurement", "Length and mass", "Time"),
    u("Keeping cattle", "Breeds of cattle", "Care of cattle"),
  ],
  P6: [
    u("Light energy", "Sources of light", "Reflection and refraction"),
    u("The excretory system", "The kidney", "The skin", "Care of excretory organs"),
    u("Classification of plants", "Flowering and non-flowering plants", "Monocots and dicots"),
    u("Primary Health Care", "Elements of PHC"),
  ],
  P7: [
    u("Simple machines and friction", "Levers", "Pulleys and inclined planes", "Friction"),
    u("Electricity and magnetism", "Simple circuits", "Magnets"),
    u("Energy resources", "Renewable and non-renewable energy"),
    u("PLE revision", "Past paper practice: Section A", "Past paper practice: Section B"),
  ],
};

const SST: ByClass = {
  P1: [
    u("Living together in our community", "People in our community", "Community leaders"),
    u("Transport in our community", "Means of transport", "Road users"),
    u("Accidents and safety", "Causes of accidents", "First aid"),
    u("Food in our community", "Foods grown in our community"),
  ],
  P2: [
    u("Our sub-county", "Location", "Leaders of our sub-county"),
    u("Social services", "Schools and health centres"),
    u("Occupations", "Jobs people do"),
    u("Peace and security", "Promoting peace at home and school"),
  ],
  P3: [
    u("Our district", "Location of our district", "Simple map reading"),
    u("Physical features of our district", "Hills, rivers and lakes"),
    u("Culture and gender", "Customs in our district", "Gender roles"),
    u("Livelihood in our district", "Economic activities"),
  ],
  P4: [
    u("Social services in our district", "Education and health services", "Water services"),
    u("Transport and communication", "Types of transport", "Means of communication"),
    u("Leadership in our district", "LC I to LC V", "The district council"),
    u("Economic activities", "Farming, trade and fishing"),
  ],
  P5: [
    u("The people of Uganda", "Ethnic groups", "Migration of the Bantu and Nilotics"),
    u("Foreign influence in Uganda", "Arab and European traders", "Missionaries", "Colonial rule"),
    u("The road to independence", "Nationalism", "Independence in 1962"),
    u("The government of Uganda", "Arms of government"),
  ],
  P6: [
    u("Colonisation of East Africa", "The scramble for and partition of Africa", "Methods of colonisation"),
    u("Colonial administration", "Direct and indirect rule"),
    u("Nationalism and independence", "Struggle for independence in East Africa"),
    u("Post-independence East Africa", "The East African Community"),
  ],
  P7: [
    u("Economic developments in Africa", "Agriculture", "Mining", "Industrialisation"),
    u("Major world organisations", "The United Nations", "The African Union", "COMESA and the Commonwealth"),
    u("PLE revision", "Past paper practice: Section A", "Past paper practice: Section B"),
  ],
};

// Literacy (P1–P3) — the thematic curriculum's reading/writing strand.
const LIT: ByClass = {
  P1: [
    u("Transport in our community", "Reading picture stories", "Copying words"),
    u("Living together", "Sounds and letters", "Building words"),
    u("Food and nutrition", "Reading short sentences", "Writing food names"),
  ],
  P2: [
    u("Peace and security", "Reading short stories", "Answering questions"),
    u("Measurement", "Reading number words", "Writing sentences"),
    u("Environment", "Reading aloud", "Guided writing"),
  ],
  P3: [
    u("Culture and gender", "Reading comprehension", "Writing short paragraphs"),
    u("Livelihood", "Reading for information", "Dictation"),
    u("Our district", "Reading maps and labels", "Creative writing"),
  ],
};

// ─── Primary: subjects taught the same way across a cycle ───────────────────

const BY_CYCLE: Record<string, { LOWER: Unit[]; UPPER: Unit[] }> = {
  LUG: {
    LOWER: [
      u("Ennukuta n'amaloboozi", "Ennukuta ennene n'entono", "Amaloboozi"),
      u("Okusoma ebigambo", "Ebigambo ebimpi", "Sentensi ennyimpi"),
      u("Emboozi", "Okuwuliriza emboozi", "Okuddamu ebibuuzo"),
      u("Ennyimba z'abaana", "Okuyimba", "Okuzina"),
    ],
    UPPER: [
      u("Ebisoko n'engero", "Ebisoko", "Engero n'amakulu gaazo"),
      u("Okuwandiika ebbaluwa", "Ebbaluwa ey'omukwano", "Ebbaluwa ey'ekitongole"),
      u("Obuwangwa bwa Buganda", "Ebika", "Emikolo"),
      u("Grammar", "Enkozesa y'ebigambo", "Ebigambo ebifaanagana"),
    ],
  },
  CRE: {
    LOWER: [
      u("God's creation", "God created the world", "Caring for creation"),
      u("Jesus' birth and childhood", "The birth of Jesus", "Jesus in the temple"),
      u("Christian living", "Sharing", "Helping others"),
      u("Prayer", "The Lord's Prayer"),
    ],
    UPPER: [
      u("Jesus' ministry", "The calling of the disciples", "The miracles of Jesus"),
      u("The early church", "Pentecost", "The work of the apostles"),
      u("Christian living", "Responsibility", "Christian leadership"),
      u("Christian festivals", "Christmas", "Easter"),
    ],
  },
  PE: {
    LOWER: [
      u("Locomotor skills", "Running and skipping", "Hopping and jumping"),
      u("Ball games", "Throwing and catching", "Kicking"),
      u("Traditional games", "Playing traditional games"),
      u("Athletics", "Short races"),
    ],
    UPPER: [
      u("Athletics", "Sprints", "Relays", "Long jump"),
      u("Ball games", "Football skills", "Netball skills"),
      u("Gymnastics", "Rolls and balances"),
      u("Health-related fitness", "Warm-up and cool-down"),
    ],
  },
  CA: {
    LOWER: [
      u("Drawing and colouring", "Drawing objects at home", "Colouring"),
      u("Modelling", "Modelling with clay"),
      u("Music", "Singing action songs", "Rhythm and clapping"),
      u("Craft", "Simple weaving"),
    ],
    UPPER: [
      u("Drawing and painting", "Still life drawing", "Mixing colours"),
      u("Crafts", "Basketry", "Mat weaving"),
      u("Music", "The National Anthem and school anthem", "Folk songs"),
      u("Dance and drama", "Traditional dances", "Short plays"),
    ],
  },
};

// ─── Nursery: the school's own subjects ─────────────────────────────────────

export const NURSERY_SUBJECTS = [
  { shortName: "LANG", name: "Language Development", category: "language" as const },
  { shortName: "NUM", name: "Number Work", category: "special" as const },
  { shortName: "READ", name: "Reading", category: "language" as const },
  { shortName: "WRIT", name: "Writing", category: "language" as const },
  { shortName: "SOC", name: "Social Development", category: "special" as const },
  { shortName: "HLTH", name: "Health Habits", category: "special" as const },
  { shortName: "ART", name: "Creative Arts", category: "special" as const },
  { shortName: "MDD", name: "Music, Dance & Drama", category: "special" as const },
];

const countTo: Record<string, number> = { BABY: 10, MIDDLE: 20, TOP: 50 };

function nurseryUnits(short: string, stage: string): Unit[] {
  const n = countTo[stage] ?? 10;
  switch (short) {
    case "LANG":
      return [
        u("Greetings", "Greeting people", "Introducing myself"),
        u("Naming things", "Things at home", "Things at school"),
        u("Rhymes and songs", "Nursery rhymes", "Action songs"),
        u("Story telling", "Listening to stories", "Retelling a story"),
      ];
    case "NUM":
      return [
        u(`Counting 1–${n}`, `Counting objects 1–${n}`, "Matching numbers to objects"),
        u("Sorting and matching", "Sorting by colour", "Sorting by size"),
        u("Shapes", "Circle, square and triangle"),
        u("Number writing", `Writing numbers 1–${n}`),
      ];
    case "READ":
      return [
        u("Letter sounds", "Sounds a–m", "Sounds n–z"),
        u("Picture reading", "Reading pictures", "Matching words to pictures"),
        u("Reading words", stage === "BABY" ? "Reading my name" : "Reading three-letter words"),
      ];
    case "WRIT":
      return [
        u("Pattern writing", "Straight and slanting lines", "Curves and circles"),
        u("Letter formation", "Tracing letters", "Writing letters"),
        u("Writing names", "Writing my name"),
      ];
    case "SOC":
      return [
        u("My family", "Members of my family"),
        u("My school", "People at school", "School rules"),
        u("Helping others", "Sharing and caring"),
        u("Christmas", "Why we celebrate Christmas"),
      ];
    case "HLTH":
      return [
        u("Washing hands", "When to wash hands", "How to wash hands"),
        u("Keeping clean", "Bathing", "Brushing teeth"),
        u("Good food", "Foods that make us strong"),
      ];
    case "ART":
      return [
        u("Colouring", "Colouring within lines"),
        u("Painting", "Finger painting"),
        u("Tearing and pasting", "Making a collage"),
        u("Modelling", "Modelling with plasticine"),
      ];
    default:
      return [
        u("Action songs", "Singing and actions"),
        u("Dancing", "Traditional dance steps"),
        u("Drama", "Role play: at the market"),
      ];
  }
}

const LOWER = new Set(["P1", "P2", "P3"]);
const NURSERY = new Set(["BABY", "MIDDLE", "TOP"]);

/** The term's units for a subject in a class. */
export function unitsFor(subjectShort: string, stage: string): Unit[] {
  if (NURSERY.has(stage)) return nurseryUnits(subjectShort, stage);
  const perClass = { MTC, ENG, SCI, SST, LIT }[subjectShort as "MTC"]?.[stage];
  if (perClass) return perClass;
  const cycle = BY_CYCLE[subjectShort];
  if (cycle) return LOWER.has(stage) ? cycle.LOWER : cycle.UPPER;
  return [u("General", "Class activities")];
}

export interface SchemeWeek {
  week: number;
  topic: string;
  subTopic: string;
}

/** A term of `weeks` weeks: the teaching weeks spread over the units, then a
 * revision week and an end-of-term exams week. */
export function termPlan(subjectShort: string, stage: string, weeks = 13): SchemeWeek[] {
  const flat = unitsFor(subjectShort, stage).flatMap((unit) => unit.subs.map((s) => ({ topic: unit.topic, subTopic: s })));
  const teaching = Math.max(1, weeks - 2);
  const out: SchemeWeek[] = [];
  for (let w = 1; w <= teaching; w++) {
    const item = flat[Math.floor(((w - 1) * flat.length) / teaching)];
    out.push({ week: w, ...item });
  }
  out.push({ week: teaching + 1, topic: "Revision", subTopic: "Revision of the term's work" });
  out.push({ week: teaching + 2, topic: "End of term examinations", subTopic: "Examinations and marking" });
  return out;
}

export const METHODS = [
  "Explanation, demonstration and guided discovery",
  "Question and answer, group work",
  "Discussion, pair work and practice exercises",
  "Story telling, role play and question and answer",
];

export const MATERIALS: Record<string, string> = {
  MTC: "Counters, number charts, chalkboard illustrations, pupils' exercise books",
  ENG: "Word cards, picture charts, class readers",
  SCI: "Real objects, charts, specimens from the school compound",
  SST: "Wall maps, atlases, pictures and charts",
  LIT: "Picture charts, flash cards, class readers",
  LUG: "Ebitabo by'okusoma, ebifaananyi, kaadi z'ebigambo",
  CRE: "The Bible, picture charts",
  PE: "Balls, ropes, cones and whistles",
  CA: "Crayons, clay, paper, local materials and musical instruments",
};
