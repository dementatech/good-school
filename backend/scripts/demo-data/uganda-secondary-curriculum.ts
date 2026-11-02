// Term 3 teaching content for the demo secondary school — topics and sub-topics
// modelled on the NCDC lower secondary curriculum (S1–S4) and the UACE
// syllabuses (S5–S6). Used to fill schemes of work, records of work and lesson
// plans. Illustrative, not a copy of any syllabus.

export interface Unit {
  topic: string;
  subs: string[];
}

const u = (topic: string, ...subs: string[]): Unit => ({ topic, subs });

type Band = "LOWER" | "UPPER" | "A";

export const bandOf = (stage: string): Band =>
  stage === "S1" || stage === "S2" ? "LOWER" : stage === "S3" || stage === "S4" ? "UPPER" : "A";

const O_LEVEL: Record<string, Partial<Record<Band, Unit[]>>> = {
  Eng: {
    LOWER: [
      u("Grammar in use", "Tenses in context", "Active and passive voice", "Direct and reported speech"),
      u("Reading and comprehension", "Reading for main ideas", "Vocabulary in context", "Summary writing"),
      u("Functional writing", "Friendly and official letters", "Keeping a diary", "Writing instructions"),
    ],
    UPPER: [
      u("Composition", "Narrative and descriptive writing", "Argumentative writing", "Editing one's own work"),
      u("Comprehension and summary", "Inference and tone", "Note making", "Summary under a word limit"),
      u("Formal communication", "Reports and minutes", "Applications and CVs", "Speeches and debates"),
    ],
  },
  Math: {
    LOWER: [
      u("Number bases and sets", "Number bases", "Set notation and Venn diagrams", "Word problems on sets"),
      u("Algebra", "Algebraic expressions", "Linear equations", "Inequalities"),
      u("Geometry and measures", "Angles and polygons", "Area and perimeter", "Bearings"),
    ],
    UPPER: [
      u("Functions and graphs", "Quadratic expressions", "Quadratic graphs", "Simultaneous equations"),
      u("Trigonometry", "Sine, cosine and tangent", "The sine and cosine rules", "Angles of elevation"),
      u("Statistics and probability", "Grouped data", "Cumulative frequency", "Combined events"),
    ],
  },
  Phy: {
    LOWER: [
      u("Measurement", "Length, mass and time", "Density", "Errors in measurement"),
      u("Forces", "Types of forces", "Moments", "Pressure in liquids"),
      u("Energy", "Forms of energy", "Work and power", "Simple machines"),
    ],
    UPPER: [
      u("Light and waves", "Reflection and refraction", "Lenses", "Properties of waves"),
      u("Electricity", "Current and potential difference", "Series and parallel circuits", "Domestic electricity"),
      u("Magnetism", "Magnetic fields", "Electromagnets", "Electromagnetic induction"),
    ],
  },
  Chem: {
    LOWER: [
      u("Matter", "States of matter", "Separating mixtures", "Elements and compounds"),
      u("Air and combustion", "Composition of air", "Burning and rusting", "Fire safety"),
      u("Water", "The water cycle", "Purifying water", "Hard and soft water"),
    ],
    UPPER: [
      u("Periodic table and bonding", "Atomic structure", "Groups and periods", "Ionic and covalent bonding"),
      u("Acids, bases and salts", "Strength of acids", "Preparing salts", "Titration"),
      u("Carbon and organic chemistry", "Alkanes and alkenes", "Alcohols", "Fuels and pollution"),
    ],
  },
  Bio: {
    LOWER: [
      u("Cells and classification", "Using the microscope", "Plant and animal cells", "Classifying living things"),
      u("Nutrition", "Food tests", "Balanced diet", "The human digestive system"),
      u("Plants", "Parts of a flowering plant", "Photosynthesis", "Soil and plant growth"),
    ],
    UPPER: [
      u("Transport and respiration", "The circulatory system", "Gaseous exchange", "Aerobic and anaerobic respiration"),
      u("Reproduction and genetics", "Human reproduction", "Variation", "Inheritance"),
      u("Ecology", "Ecosystems", "Food chains and webs", "Conservation in Uganda"),
    ],
  },
  Hist: {
    LOWER: [
      u("Early societies of East Africa", "Migration and settlement", "The Bantu and Nilotes", "Kingdoms of Uganda"),
      u("External contacts", "Long-distance trade", "Explorers and missionaries", "The slave trade"),
    ],
    UPPER: [
      u("Colonial rule", "Partition of East Africa", "African responses", "Colonial economies"),
      u("Road to independence", "Nationalist movements", "Independence of Uganda", "Citizenship and democracy"),
    ],
  },
  Geo: {
    LOWER: [
      u("Map work", "Scale and direction", "Reading a sketch map", "Grid references"),
      u("Physical features of East Africa", "Relief regions", "Lakes and rivers", "Climate of Uganda"),
    ],
    UPPER: [
      u("Economic activities", "Agriculture in East Africa", "Mining", "Industry and tourism"),
      u("People and environment", "Population and settlement", "Urbanisation in Kampala", "Environmental conservation"),
    ],
  },
  Ent: {
    LOWER: [
      u("Introduction to entrepreneurship", "Qualities of an entrepreneur", "Business ideas", "Identifying a market"),
      u("Keeping records", "Income and spending", "Saving", "Simple cash books"),
    ],
    UPPER: [
      u("Business planning", "Writing a business plan", "Costing and pricing", "Marketing a product"),
      u("Business finance", "Sources of capital", "Books of account", "Taxes in Uganda"),
    ],
  },
  PE: { LOWER: [u("Games and fitness", "Fitness and warm-ups", "Football and netball skills", "Athletics: track events", "Rules and fair play")] },
  CRE: {
    LOWER: [u("Christian living", "Creation and responsibility", "Family and community", "Honesty and integrity")],
    UPPER: [u("Life of Christ", "The teachings of Jesus", "Parables", "Christian response to modern issues")],
  },
  Kis: { LOWER: [u("Mawasiliano", "Salamu na utambulisho", "Nambari na wakati", "Familia yangu"), u("Sarufi", "Ngeli za nomino", "Nyakati", "Insha fupi")] },
  Agric: {
    LOWER: [u("Crop production", "Soil and land preparation", "Planting and spacing", "Weeds, pests and diseases")],
    UPPER: [u("Livestock and farm business", "Poultry management", "Dairy cattle", "Farm records and marketing")],
  },
  ICT: {
    LOWER: [u("Computer basics", "Parts of a computer", "Word processing", "Safe use of the internet")],
    UPPER: [u("Productivity tools", "Spreadsheets", "Presentations", "Databases and simple web pages")],
  },
  Art: {
    LOWER: [u("Drawing and design", "Lines, shapes and shading", "Colour theory", "Pattern making")],
    UPPER: [u("Craft and composition", "Still life", "Fabric decoration", "Ugandan craft traditions")],
  },
  Lit: {
    LOWER: [u("Reading literature", "Short stories", "Poetry: sound and imagery", "Characters and plot")],
    UPPER: [u("Studying set texts", "The novel: themes", "Drama: conflict", "Writing critical essays")],
  },
  Luganda: {
    LOWER: [u("Olulimi Oluganda", "Enjogera ey'obuntu", "Ensengeka y'ebigambo", "Okuwandiika ebbaluwa")],
    UPPER: [u("Ennono n'obuwangwa", "Engero n'ensonga", "Ebyafaayo bya Buganda", "Okuwandiika emboozi")],
  },
};

const A_LEVEL: Record<string, Unit[]> = {
  Math: [
    u("Pure mathematics", "Differentiation and its applications", "Integration", "Differential equations"),
    u("Vectors and complex numbers", "Lines and planes", "Argand diagrams", "De Moivre's theorem"),
    u("Statistics and mechanics", "Probability distributions", "Projectiles", "Hypothesis testing"),
  ],
  Phy: [
    u("Mechanics", "Circular motion", "Simple harmonic motion", "Elasticity"),
    u("Electricity and magnetism", "Capacitors", "Electromagnetic induction", "Alternating currents"),
    u("Modern physics", "Photoelectric effect", "Radioactivity", "Practical: uncertainties"),
  ],
  Chem: [
    u("Physical chemistry", "Chemical equilibria", "Reaction kinetics", "Electrochemistry"),
    u("Inorganic chemistry", "Periods 2 and 3", "Transition elements", "Qualitative analysis practical"),
    u("Organic chemistry", "Reaction mechanisms", "Carbonyl compounds", "Organic synthesis"),
  ],
  Bio: [
    u("Cell biology and genetics", "Cell division", "Protein synthesis", "Mendelian genetics"),
    u("Physiology", "Homeostasis", "Nervous coordination", "Plant hormones"),
    u("Ecology and evolution", "Population dynamics", "Natural selection", "Practical: dissection and drawing"),
  ],
  Econ: [
    u("Microeconomics", "Elasticity of demand and supply", "Costs and market structures", "Market failure"),
    u("Macroeconomics", "National income", "Inflation and unemployment", "Money and banking"),
    u("Development economics", "Economic growth in Uganda", "International trade", "Public finance"),
  ],
  Hist: [
    u("East African history", "Colonial administration", "Nationalism in Uganda", "Post-independence politics"),
    u("World history", "Causes of the First World War", "The Russian Revolution", "The rise of fascism"),
  ],
  Geo: [
    u("Physical geography", "Geomorphic processes", "Climatology", "Fieldwork techniques"),
    u("Geography of East Africa", "Agricultural systems", "Industrial development", "Urban problems"),
  ],
  Lit: [
    u("Prose and drama", "The novel: form and context", "African drama", "Shakespearean tragedy"),
    u("Poetry and criticism", "Unseen poetry", "Literary theory", "Essay technique"),
  ],
  SMath: [u("Subsidiary mathematics", "Algebra and functions", "Calculus basics", "Statistics and probability", "Financial mathematics")],
  ICT: [u("Subsidiary ICT", "Spreadsheets and data analysis", "Networks and security", "Programming basics", "Practical: database project")],
  GP: [u("General Paper", "Essay writing on current issues", "Comprehension and summary", "Uganda and regional integration", "Science, ethics and society")],
};

export function unitsFor(short: string, stage: string): Unit[] {
  const band = bandOf(stage);
  if (band === "A") return A_LEVEL[short] ?? [u("General", "Class work")];
  const subject = O_LEVEL[short];
  return subject?.[band] ?? subject?.LOWER ?? subject?.UPPER ?? [u("General", "Class work")];
}

export interface SchemeWeek {
  week: number;
  topic: string;
  subTopic: string;
}

/** A term of `weeks` weeks: the teaching weeks spread over the units, then a
 * revision week and an end-of-term exams week. */
export function termPlan(short: string, stage: string, weeks = 13): SchemeWeek[] {
  const flat = unitsFor(short, stage).flatMap((unit) => unit.subs.map((s) => ({ topic: unit.topic, subTopic: s })));
  const teaching = Math.max(1, weeks - 2);
  const out: SchemeWeek[] = [];
  for (let w = 1; w <= teaching; w++) {
    out.push({ week: w, ...flat[Math.floor(((w - 1) * flat.length) / teaching)] });
  }
  out.push({ week: teaching + 1, topic: "Revision", subTopic: "Revision of the term's work" });
  out.push({ week: teaching + 2, topic: "End of term examinations", subTopic: "Examinations and marking" });
  return out;
}

export const METHODS = [
  "Explanation, demonstration and guided discovery",
  "Question and answer, group work",
  "Discussion, pair work and practice exercises",
  "Project work, presentations and peer review",
];

const SCIENCE_MATERIALS = "Laboratory apparatus, specimens, charts, textbooks";
export const MATERIALS: Record<string, string> = {
  Eng: "Class readers, newspapers, dictionaries, charts",
  Math: "Mathematical sets, graph paper, calculators, textbooks",
  SMath: "Graph paper, calculators, textbooks",
  Phy: SCIENCE_MATERIALS,
  Chem: SCIENCE_MATERIALS,
  Bio: SCIENCE_MATERIALS,
  Hist: "Wall maps, source extracts, textbooks",
  Geo: "Atlases, topographic maps, fieldwork notes",
  Econ: "Newspapers, Bank of Uganda data, textbooks",
  Ent: "Sample business plans, cash books, local market data",
  PE: "Balls, cones, whistles, the playing field",
  CRE: "The Bible, charts, textbooks",
  Kis: "Kamusi, charts, class readers",
  Agric: "School garden, farm tools, seeds, charts",
  ICT: "Computer lab, projector, practical worksheets",
  Art: "Paper, paint, brushes, local materials",
  Lit: "Set texts, anthologies, past essay questions",
  Luganda: "Ebitabo by'okusoma, kaadi z'ebigambo",
  GP: "Newspapers, past papers, debate prompts",
};
