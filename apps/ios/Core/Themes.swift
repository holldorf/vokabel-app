import Foundation

public struct ConversationTheme: Identifiable, Hashable, Sendable {
    public var id: String
    public var title: String
    public var subtitle: String
    public var symbol: String
    public var category: String
    public var situation: String
    public var colorIndex: Int
    public init(_ id: String, _ title: String, _ subtitle: String, _ symbol: String, _ category: String, _ situation: String, _ colorIndex: Int) {
        self.id = id; self.title = title; self.subtitle = subtitle; self.symbol = symbol
        self.category = category; self.situation = situation; self.colorIndex = colorIndex
    }
    public static let shared: [Self] = [
        .init("handover", "The handover", "What the next shift needs to know", "arrow.left.arrow.right", "Care work", "Role-play only, no real medical advice. You are a nurse colleague receiving the shift handover. Let the learner report a patient’s condition, care given and anything unusual. Ask short follow-up questions and keep the report structured.", 0),
        .init("admission", "Admission interview", "Getting to know a new patient", "person.text.rectangle", "Care work", "Role-play only, no real medical advice. You are a patient who has just arrived on the ward. Let the learner ask about your complaints, history, allergies and daily needs. Answer as an ordinary person would, with everyday words.", 1),
        .init("medication", "Medication round", "Explaining what and when", "pills", "Care work", "Role-play only, never give real dosage or medical advice. You are a patient receiving your medication. Let the learner explain what it is for, when to take it and ask whether you have questions. Ask one simple question back.", 2),
        .init("relatives", "Talking to relatives", "Polite, clear and discreet", "phone", "Care work", "Role-play only, no real medical advice. You are a worried relative calling or visiting. Let the learner inform you politely, stay calm and respect confidentiality by not sharing details they may not give. Stay formal.", 3),
        .init("wardround", "On the ward round", "Short, precise, to the point", "stethoscope", "Care work", "Role-play only, no real medical advice. You are a doctor on the ward round. Let the learner report briefly on a patient: observations, changes and open questions. Ask for clarification and switch between technical and plain words.", 0),
        .init("pain", "Where does it hurt?", "Assessing pain calmly", "heart.text.square", "Care work", "Role-play only, no real medical advice. You are a patient in pain. Let the learner ask where it hurts, how strong it is on a scale and what it feels like, then reassure you and explain the next step.", 1),
        .init("bodycare", "Personal care", "Step by step, with consent", "figure.walk", "Care work", "Role-play only, no real medical advice. You are a patient being helped with washing, dressing or getting out of bed. Let the learner explain each step, ask for your consent and encourage you kindly.", 2),
        .init("emergency", "Reporting an emergency", "Brief and clear under pressure", "exclamationmark.triangle", "Care work", "Role-play only, no real medical advice. You are a colleague receiving a report about a fall or sudden change in a patient. Let the learner report briefly and clearly, then ask short questions about what happened and what has been done.", 3),
        .init("phonecall", "On the phone", "Orders, questions, spelling", "phone.arrow.up.right", "Care work", "Role-play only, no real medical advice. You are a pharmacy or another ward on the phone. Let the learner place an order, ask a question or pass on information. Ask them to spell a name and confirm details.", 0),
        .init("documentation", "Writing the care report", "Short sentences, past tense", "doc.text", "Care work", "Role-play only, no real medical advice. You are a colleague helping the learner write a care report. Let them describe what they observed and did in short report sentences and suggest clearer wording.", 1),
        .init("dementia", "A gentle conversation", "Simple words, patience, warmth", "leaf", "Care work", "Role-play only, no real medical advice. You are a person living with dementia who is a little confused about the time and place. Let the learner use simple sentences, patience and a calm, validating tone.", 2),
        .init("discharge", "Going home", "Instructions and next steps", "door.left.hand.open", "Care work", "Role-play only, no real medical advice. You are a patient about to be discharged. Let the learner explain the next steps, appointments and what to watch for at home, then ask questions to check you understood.", 3),
        .init("team", "In the team", "Shifts, favours and small conflicts", "person.3", "Care work", "Role-play only, no real medical advice. You are a colleague in the team. Let the learner ask for a shift swap, decline politely or resolve a small disagreement in a friendly way.", 0),
        .init("nightshift", "Night shift", "When the ward is quiet", "moon.stars", "Care work", "Role-play only, no real medical advice. It is night on the ward. You are a patient who cannot sleep and rings the bell. Let the learner speak quietly, find out what is wrong and offer simple comfort.", 1),
        .init("meals", "Mealtime", "Help with eating and drinking", "fork.knife.circle", "Care work", "Role-play only, no real medical advice. You are an older patient at mealtime with little appetite. Let the learner offer help with eating, ask about your preferences and encourage you to drink enough.", 2),
        .init("vitals", "Checking vital signs", "Blood pressure, pulse, temperature", "waveform.path.ecg", "Care work", "Role-play only, no real medical advice. You are a patient whose vital signs are being checked. Let the learner explain each step, ask for your arm and tell you the result in plain words. Ask what the numbers mean.", 3),
        .init("palliative", "A difficult conversation", "Listening when it matters most", "heart", "Care work", "Role-play only, no real medical advice. You are the adult child of a seriously ill patient near the end of life. Let the learner listen, show empathy with simple words and say honestly what only the doctor can answer.", 0),
        .init("complaint", "A complaint", "Staying calm, finding a solution", "exclamationmark.bubble", "Care work", "Role-play only, no real medical advice. You are a patient or relative unhappy about waiting, noise or the food. Let the learner listen, apologise where fitting, stay professional and suggest a next step.", 1),
        .init("homecare", "Home care visit", "In the client's own home", "car", "Care work", "Role-play only, no real medical advice. You are an older person receiving a home care visit. Let the learner greet you at the door, ask how the night was and explain what they will help with today.", 2),
        .init("onboarding", "First day on the ward", "Questions in a new job", "person.badge.plus", "Care work", "Role-play only, no real medical advice. You are an experienced nurse showing the learner around on their first day. Let them ask where things are, how the shift works and who to ask for help.", 3),
        .init("appraisal", "Talking to the ward manager", "Feedback, wishes and goals", "person.crop.circle.badge.checkmark", "Care work", "Role-play only, no real medical advice. You are the ward manager in a staff review. Let the learner describe how they are settling in, give and receive feedback politely and name a wish or goal.", 0),
        .init("exam", "Exam practice", "Like a language exam for nurses", "checkmark.seal", "Care work", "Role-play only, no real medical advice. You are an examiner in a professional language exam for nurses. First play a patient in an admission interview, then ask the learner to hand the case over in a structured way.", 1),
        .init("hygiene", "Explaining hygiene rules", "Visitors, masks, hand disinfection", "hands.sparkles", "Care work", "Role-play only, no real medical advice. You are a visitor who wants to see a patient in isolation. Let the learner explain the hygiene rules, such as gown, mask and hand disinfection, kindly and clearly.", 2),
        .init("biography", "Life stories", "Getting to know a resident", "photo.on.rectangle", "Care work", "Role-play only, no real medical advice. You are an older care home resident. Let the learner ask about your life, family, work and favourite things, listen with interest and remember details.", 3),
        .init("refusal", "When someone says no", "Respecting and persuading gently", "hand.raised", "Care work", "Role-play only, no real medical advice. You are a patient who refuses to get up or be washed today. Let the learner find out why, respect your choice and gently suggest a small compromise.", 0),
        .init("coffee", "A coffee?", "Something warm, please", "cup.and.saucer", "Everyday", "You work in a cosy café. Help the learner order, then chat naturally.", 0),
        .init("weekend", "The weekend", "Tell me about yours", "sun.horizon", "Connection", "Ask about the learner’s weekend. Practise past events and follow their interests.", 1),
        .init("walk", "A little walk", "Out into the fresh air", "tree", "Local life", "Take an imagined forest walk together. Talk about nature, weather and daily life.", 2),
        .init("dinner", "Dinner plans", "Let’s make something", "fork.knife", "Everyday", "Plan dinner together. Ask about ingredients, preferences and the steps of cooking.", 3),
        .init("introductions", "Nice to meet you", "Start somewhere small", "hand.wave", "Connection", "Meet the learner for the first time. Learn their interests through natural introductions.", 0),
        .init("groceries", "At the market", "Find the good tomatoes", "basket", "Everyday", "Help the learner shop at a local food market. Practise quantities and questions.", 2),
        .init("travel", "Next stop", "A ticket to somewhere", "tram", "Everyday", "Plan a train trip. Discuss routes and tickets without inventing real current schedules.", 1),
        .init("home", "A place of your own", "Make yourself at home", "house", "Everyday", "Discuss a home, rooms, moving and what makes a place comfortable.", 3),
        .init("friends", "New friends", "An invitation, maybe", "person.2", "Connection", "You are a friendly new acquaintance. Arrange something to do together.", 0),
        .init("work", "Monday morning", "Around the office", "briefcase", "Everyday", "Chat as colleagues. Discuss work, meetings and a small problem to solve.", 1),
        .init("weather", "Rain again?", "Whatever the weather", "cloud.rain", "Local life", "Talk about weather, clothing and outdoor plans. Do not claim today’s forecast without sources.", 1),
        .init("cabin", "A weekend away", "A quieter kind of day", "mountain.2", "Local life", "Plan a weekend away: travel, food, walks and relaxing together.", 2),
        .init("music", "On repeat", "What are you listening to?", "music.note", "Interests", "Ask about music the learner enjoys. Explore feelings, favourites and concerts.", 0),
        .init("film", "One more episode", "Something worth watching", "film", "Interests", "Discuss films and series. Ask for opinions and avoid unwanted spoilers.", 1),
        .init("books", "Between the pages", "A story that stayed", "book", "Interests", "Chat about books, characters, stories and why they matter to the learner.", 3),
        .init("design", "Good things", "Made with a little care", "pencil.and.outline", "Interests", "Explore design, architecture and objects the learner loves. Ask for concrete opinions.", 0),
        .init("technology", "What comes next", "Ideas, tools and tomorrow", "sparkles", "Interests", "Discuss technology and how it changes daily life. Delegate claims needing current facts.", 1),
        .init("travelstories", "Somewhere else", "A place you remember", "globe.europe.africa", "Interests", "Exchange travel stories and dream destinations. Invite descriptions and comparisons.", 2),
        .init("restaurant", "A table for two", "Stay for dessert", "wineglass", "Everyday", "Role-play a restaurant meal. Practise requests, preferences and polite problem-solving.", 0),
        .init("neighbours", "Next door", "A familiar face", "building.2", "Connection", "Chat as neighbours. Discuss the neighbourhood and small requests for help.", 3),
        .init("traditions", "Everyday customs", "Small customs, big stories", "flag", "Local life", "Explore everyday customs with nuance. Avoid treating a whole culture as alike.", 2),
        .init("opinions", "What do you think?", "Room for another view", "quote.bubble", "Connection", "Choose an everyday dilemma. Invite reasons and gently explore another perspective.", 1),
        .init("future", "A year from now", "Plans worth talking about", "paperplane", "Connection", "Talk about hopes and future plans. Explore possibilities and practical next steps.", 3),
        .init("today", "The world today", "Something to talk about", "newspaper", "Interests", "Ask what current topic interests the learner, then delegate a source-backed lookup before discussing facts.", 0),
        .init("authorities", "At the town hall", "Registering a new address", "building.columns", "Life in Germany", "You work at a local citizens' office. Help the learner register a new address: ask for documents, have them spell names and explain the next step. Do not give legal advice.", 1),
        .init("doctor", "At the doctor's", "When you are the patient", "cross.case", "Life in Germany", "Role-play only, no real medical advice. You are a GP's receptionist and then the doctor. The learner is the patient: they book an appointment, describe symptoms and ask for a sick note.", 2),
        .init("flatviewing", "Viewing a flat", "Rent, rooms and the area", "key", "Life in Germany", "You are a landlord showing a flat. Let the learner ask about rent, extra costs, the deposit, the moving-in date and the area, then arrange next steps. Do not give legal advice.", 3),
        .init("landlord", "Something is broken", "Calling the landlord", "wrench.and.screwdriver", "Life in Germany", "You are a landlord or caretaker on the phone. The learner reports a problem in the flat, such as no heating or a dripping tap, and arranges an appointment for the repair.", 0),
        .init("bank", "At the bank", "Opening an account", "creditcard", "Life in Germany", "You are a bank adviser. Help the learner open a current account: ask for documents, explain the card, online banking and transfers, and answer questions. No financial advice.", 1),
        .init("school", "School and nursery", "Talking with the teacher", "backpack", "Life in Germany", "You are a nursery or school teacher. The learner is a parent: they ask how their child is doing, report an absence and arrange pick-up times or a meeting.", 2),
        .init("jobinterview", "Job interview", "Applying for a nursing job", "signature", "Life in Germany", "You interview the learner for a nursing job. Ask about experience, strengths, shift work and language skills, and answer their questions about the team, induction and pay.", 3),
        .init("recognition", "Getting qualifications recognised", "Questions for the authority", "doc.badge.gearshape", "Life in Germany", "You are a caseworker at the office that recognises foreign nursing qualifications. Let the learner ask about documents, certified translations, missing training and the language certificate. No legal advice.", 0),
        .init("pharmacy", "At the pharmacy", "Getting something for yourself", "cross.vial", "Life in Germany", "Role-play only, no real medical advice. You are a pharmacist. The learner wants something for a cold or headache for themselves, describes symptoms and asks how to take it. Never give real dosages.", 1),
        .init("post", "At the post office", "Parcels and letters", "shippingbox", "Life in Germany", "You work at a post office. The learner picks up a parcel, sends a letter abroad and asks about postage and delivery times. Do not invent exact current prices.", 2)
    ]

    /// Twists for repeated practice. Choosing a theme again picks the next twist, so a learner
    /// can practise the same situation many times without the conversation repeating itself.
    public static let variations: [String] = [
        "Speak a little faster than usual; if the learner asks, repeat more slowly.",
        "Play someone impatient or grumpy; the learner stays calm and polite.",
        "Play someone shy who gives short answers; the learner asks open questions.",
        "Build in one small misunderstanding that the learner has to clarify.",
        "Bring in one unexpected small problem halfway through.",
        "Use one or two common colloquial expressions and explain them if asked.",
        "Play an older person who hears poorly; the learner speaks clearly and repeats.",
        "Play someone chatty who drifts off topic; the learner steers back politely.",
        "Include numbers, times or dates that the learner must understand and confirm.",
        "Play someone worried or anxious; the learner reassures you.",
        "Let the learner lead: answer, but let them ask most of the questions.",
        "Near the end, ask the learner to sum up the key points in two sentences."
    ]

    /// This theme for its `round`-th repetition: round 0 is the plain situation, later rounds add a
    /// twist. Every twist is used once before any repeats; the per-theme offset keeps two themes
    /// from walking through the twists in the same order. Mirrored in Android's ThemeVariations.kt.
    public func varied(round: Int) -> ConversationTheme {
        guard round > 0, id != "current", !Self.variations.isEmpty else { return self }
        let offset = id.utf16.reduce(0) { $0 + Int($1) }
        var copy = self
        copy.situation += " This time: " + Self.variations[(round - 1 + offset) % Self.variations.count]
        return copy
    }
}
